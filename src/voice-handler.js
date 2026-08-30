import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import pino from 'pino';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// VOICE MESSAGE HANDLER
// Transcribes voice notes using Whisper API
// ============================================

class VoiceHandler {
  constructor(options = {}) {
    this.fetchFn = options.fetchFn || globalThis.fetch;
    const whisperKey = options.whisperKey ?? process.env.WHISPER_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
    const groqKey = options.groqKey ?? process.env.GROQ_API_KEY ?? '';
    const googleKey = options.googleKey ?? process.env.GOOGLE_API_KEY ?? '';
    const customUrl = !!process.env.WHISPER_API_URL;

    // Provider priority:
    //   1. OpenAI Whisper (only with a real OpenAI key)
    //   2. Google Gemini audio understanding (free, multilingual — no extra key)
    //   3. Groq Whisper (same key as the LLM)
    if (whisperKey && !customUrl && /^(nvapi-|gsk_)/.test(whisperKey)) {
      console.warn(`[voice] WHISPER_API_KEY is a ${whisperKey.startsWith('nvapi-') ? 'NVIDIA' : 'Groq'} key, not valid for api.openai.com — skipping OpenAI Whisper`);
      this.openaiKey = '';
    } else {
      this.openaiKey = whisperKey;
    }

    if (this.openaiKey) {
      this.providerName = 'OpenAI Whisper';
      this.apiUrl = process.env.WHISPER_API_URL || 'https://api.openai.com/v1/audio/transcriptions';
      this.apiKey = this.openaiKey;
      this.model = 'whisper-1';
    } else if (googleKey) {
      this.providerName = 'Google Gemini (audio)';
      this.geminiKey = googleKey;
      this.geminiApiUrl = process.env.GOOGLE_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
      this.model = options.audioModel || process.env.GOOGLE_AUDIO_MODEL || 'gemini-2.0-flash';
      this.groqFallbackKey = groqKey;
      this.groqModel = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3';
      this.apiKey = '';
      this.apiUrl = '';
    } else if (groqKey) {
      this.providerName = 'Groq Whisper';
      this.apiUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';
      this.apiKey = groqKey;
      this.model = 'whisper-large-v3';
      this.groqFallbackKey = '';
    } else {
      this.providerName = '';
      this.apiUrl = '';
      this.apiKey = '';
      this.model = '';
      this.geminiKey = '';
      this.groqFallbackKey = '';
    }
    this.enabled = !!this.apiKey || !!this.geminiKey;
  }

  // Gemini understands audio inline (OGG from WhatsApp works — no ffmpeg step).
  async transcribeWithGemini(audioBuffer, mimeType = 'audio/ogg', language = '') {
    if (audioBuffer.length > 18 * 1024 * 1024) {
      return { text: '', error: 'Audio too large for inline Gemini transcription (max ~18MB). Please send a shorter voice note.' };
    }
    const hint = language && language !== 'en' ? ` The audio is in ${language}.` : '';
    const instruction = `You are the ears of Haki, a workers' rights chatbot for Kenya. Transcribe this voice note EXACTLY, word for word — do not summarize, correct, or translate. Include Swahili, Sheng and local words as spoken.${hint} Reply with only the verbatim transcription.`;

    try {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [
          {
            role: 'user',
            parts: [{ inline_data: { mime_type: mimeType, data: audioBuffer.toString('base64') } }]
          }
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } }
      });

      const res = await this.fetchFn(`${this.geminiApiUrl}/${this.model}:generateContent?key=${this.geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      if (!res.ok) {
        throw new Error(`Gemini audio ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      }

      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter(p => p.text && !p.thought)
        .map(p => p.text)
        .join(' ')
        .trim();

      if (!text) throw new Error('Gemini returned an empty transcript');
      return { text, error: null };
    } catch (error) {
      return { text: '', error: error.message };
    }
  }

  // Convert WhatsApp audio (OGG/OPUS) to MP3 for Whisper
  async convertAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-ar', '16000',
        '-ac', '1',
        '-y', outputPath
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) resolve(outputPath);
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });

      ffmpeg.on('error', reject);
    });
  }

  // Transcribe audio buffer using the selected provider.
  // Gemini path: native OGG/OPUS support, no ffmpeg conversion.
  // Empty language = let the provider auto-detect (Kenyan users mix English,
  // Swahili and Sheng; forcing 'en' garbles non-English notes).
  async transcribe(audioBuffer, language = '') {
    if (!this.enabled) {
      return { text: '', error: 'No transcription provider configured' };
    }

    if (this.providerName === 'Google Gemini (audio)') {
      const result = await this.transcribeWithGemini(audioBuffer, 'audio/ogg', language);
      if (result.text) return result;
      console.warn(`[voice] Gemini audio failed (${result.error}) — falling back to Groq Whisper if available`);
      if (!this.groqFallbackKey) return result;
      return this._transcribeWhisper(audioBuffer, language, {
        name: 'Groq Whisper',
        apiUrl: 'https://api.groq.com/openai/v1/audio/transcriptions',
        apiKey: this.groqFallbackKey,
        model: this.groqModel || 'whisper-large-v3'
      });
    }

    return this._transcribeWhisper(audioBuffer, language, this);
  }

  async _transcribeWhisper(audioBuffer, language, provider) {
    let mp3Path = null;

    try {
      // Convert to MP3 via ffmpeg (expects a file on disk)
      const tempDir = path.join(__dirname, '..', 'temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const inputPath = path.join(tempDir, `in_${Date.now()}.ogg`);
      mp3Path = path.join(tempDir, `out_${Date.now()}.mp3`);
      fs.writeFileSync(inputPath, audioBuffer);
      await this.convertAudio(inputPath, mp3Path);
      try { fs.unlinkSync(inputPath); } catch {}

      const mp3Data = fs.readFileSync(mp3Path);

      const formData = new FormData();
      formData.append('file', new Blob([mp3Data], { type: 'audio/mpeg' }), 'audio.mp3');
      formData.append('model', provider.model);
      if (language) formData.append('language', language);
      formData.append('response_format', 'text');

      const response = await this.fetchFn(provider.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`${provider.name} error ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
      }

      const text = await response.text();

      return { text: text.trim(), error: null };
    } catch (error) {
      return { text: '', error: error.message };
    } finally {
      if (mp3Path) { try { fs.unlinkSync(mp3Path); } catch {} }
    }
  }

  // Process voice message from WhatsApp
  async processVoiceMessage(msg, sock) {
    try {
      // Download the audio (Baileys 6.x: standalone export, not a socket method)
      const buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage, logger: pino({ level: 'silent' }) }
      );
      if (!buffer) return { text: '', error: 'Could not download audio' };

      // Transcribe
      const result = await this.transcribe(buffer);

      return result;
    } catch (error) {
      return { text: '', error: error.message };
    }
  }
}

export default VoiceHandler;