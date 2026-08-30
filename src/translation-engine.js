// ============================================
// GEMINI TRANSLATION ENGINE
// Uses the GOOGLE_API_KEY (already in use for vision + text) to translate
// between any of the bot's ~26 languages and English. Rule-based fallback:
// if the call fails, the original text passes through untouched.
// ============================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLanguageNames() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'local-languages.json'), 'utf8'));
    const names = { en: 'English' };
    for (const [code, lang] of Object.entries(data.languages || {})) {
      names[code] = lang.name || lang.native_name || code;
    }
    return names;
  } catch {
    return { en: 'English' };
  }
}

const LANGUAGE_NAMES = loadLanguageNames();

const isMostlyEnglish = (text) => /^[\x00-\x7F\s]+$/.test(text) && /\b(the|and|is|are|my|i|you|we|to|of|a|in|on|for)\b/i.test(text);

class TranslationEngine {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_API_KEY || '';
    this.apiUrl = options.apiUrl || process.env.GOOGLE_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
    this.model = options.model || process.env.GOOGLE_TRANSLATE_MODEL || process.env.GOOGLE_MODEL || 'gemini-flash-latest';
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.cache = new Map();
    this.maxCache = options.maxCache || 500;
    this.maxChars = options.maxChars || 3000;
    this.enabled = !!this.apiKey;
    this.stats = { calls: 0, ok: 0, cached: 0, fail: 0 };
  }

  languageName(code) {
    return LANGUAGE_NAMES[code] || code || 'English';
  }

  _cacheKey(text, target, source) {
    return `${target}:${source || 'auto'}:${String(text).slice(0, 160).toLowerCase()}`;
  }

  clearCache() {
    this.cache.clear();
    this.stats.cached = 0;
  }

  // Translate `text` into `targetLang`. Returns { text, ok, cached, translated }.
  // `ok:false` means the caller should keep using the original text.
  async translate(text, targetLang = 'en', sourceLang = 'auto') {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { text: '', ok: true, cached: false, translated: false };

    if (targetLang === 'en') {
      if (sourceLang === 'en' || isMostlyEnglish(trimmed)) {
        return { text: trimmed, ok: true, cached: false, translated: false };
      }
    } else if (sourceLang === targetLang) {
      return { text: trimmed, ok: true, cached: false, translated: false };
    }

    if (!this.enabled) {
      this.stats.fail += 1;
      return { text: trimmed, ok: false, cached: false, translated: false };
    }

    if (trimmed.length > this.maxChars) {
      return { text: trimmed, ok: false, cached: false, translated: false };
    }

    const key = this._cacheKey(trimmed, targetLang, sourceLang);
    if (this.cache.has(key)) {
      this.stats.cached += 1;
      return { text: this.cache.get(key), ok: true, cached: true, translated: true };
    }

    const targetName = this.languageName(targetLang);
    const instruction = [
      `You are the translator inside AgriShield, a workers' rights chatbot for Kenya's agribusiness.`,
      `Translate the user's message into ${targetName}.`,
      'Reply with ONLY the translation. No quotes, no explanations.',
      'Keep names, numbers, dates, phone numbers and legal terms exactly as written.',
      sourceLang && sourceLang !== 'auto' && sourceLang !== 'en'
        ? `The source language is ${this.languageName(sourceLang)}.`
        : ''
    ].filter(Boolean).join(' ');

    this.stats.calls += 1;
    try {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: 'user', parts: [{ text: trimmed }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } }
      });

      const res = await this.fetchFn(`${this.apiUrl}/${this.model}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      if (!res.ok) {
        throw new Error(`Gemini translation ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      }

      const data = await res.json();
      const out = (data.candidates?.[0]?.content?.parts || [])
        .filter(p => p.text && !p.thought)
        .map(p => p.text)
        .join(' ')
        .replace(/^["'\u201c\u2018]|["'\u201d\u2019]$/g, '')
        .trim();

      if (!out) throw new Error('Gemini returned an empty translation');

      this.stats.ok += 1;
      if (this.cache.size >= this.maxCache) {
        const oldest = this.cache.keys().next().value;
        this.cache.delete(oldest);
      }
      this.cache.set(key, out);
      return { text: out, ok: true, cached: false, translated: true };
    } catch (error) {
      this.stats.fail += 1;
      return { text: trimmed, ok: false, cached: false, translated: false };
    }
  }
}

export default TranslationEngine;