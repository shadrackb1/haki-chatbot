/**
 * Agent — grounded ReAct loop with HARD anti-hallucination enforcement.
 *
 * Three enforcement layers:
 *   1. Forced research — legal/workplace questions MUST trigger a lookup tool
 *      before any answer; premature answers are rejected and sent back.
 *   2. Grounding rules — the model may only cite statutes/cases that appeared
 *      verbatim in a tool result this run.
 *   3. Citation verification — the final answer is scanned; every citation is
 *      checked against collected tool observations. Unverified citations get
 *      stripped via a corrective pass or flagged honestly.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import KnowledgeRetriever from './skills/legal-research/retriever.js';
import { classifyViolation } from './skills/legal-research/classifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const retriever = new KnowledgeRetriever(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'legal', 'legal-corpus.json'), 'utf8')
  )
);

const MAX_STEPS = 5;
const RUN_TIMEOUT_MS = 150000;

// ── Tools ────────────────────────────────────────────────────────────

const TOOLS = {
  async legal_search({ query }) {
    const hits = retriever.search(String(query || ''), 4).filter((h) => h.score > 0);
    if (!hits.length) return 'NO RESULTS for that query in the statutory corpus.';
    return hits.map((h) => `[${h.id}] (${h.source}) ${h.text}`).join('\n---\n');
  },

  async classify_violation({ text }) {
    const v = classifyViolation(String(text || ''));
    if (!v) return 'No specific violation classified.';
    return JSON.stringify({
      id: v.id,
      description: v.data.description,
      laws: v.data.applicable_laws.map((l) => `${l.law}, ${l.section}: ${l.detail}`),
      remedies: v.data.remedy_pathways.map((p) => `${p.institution}: ${p.action} (${p.timeline})`),
    });
  },

  async case_law({ query }) {
    const q = encodeURIComponent(`("${String(query || '').replace(/"/g, '')}")`);
    const res = await fetch(`https://kenyalaw.org/search/api/documents/?page=1&search__all=${q}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
        'Referer': 'https://new.kenyalaw.org/',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return `kenyalaw.org unavailable (HTTP ${res.status}). Continue WITHOUT case law — do not invent cases.`;
    const data = await res.json();
    const results = (data.results || []).slice(0, 4);
    if (!results.length) return 'NO CASES found for that query.';
    return results
      .map((r) => {
        const title = r.title || r.name || 'Untitled';
        const cite = r.citation || r.mnc || '';
        const court = r.court || '';
        const date = r.date || r.judgment_date || '';
        const url = r.url ? (r.url.startsWith('http') ? r.url : 'https://kenyalaw.org' + r.url) : '';
        return `- ${title}${cite ? ` [${cite}]` : ''}${court ? `, ${court}` : ''}${date ? ` (${date})` : ''} ${url}`;
      })
      .join('\n');
  },

  async make_pdf({ topic }, context) {
    const mod = await import('./skills/legal-docgen/index.js');
    const result = await mod.default.execute(String(topic || ''), context);
    return { observation: result.response, file: result.file || null };
  },

  async use_skill({ name, message }, context) {
    let skill = this.registry?.getSkillByName?.(String(name || '')) || null;
    if (!skill) {
      const { default: registry } = await import('./skill-registry.js');
      const reg = new registry();
      await reg.loadSkills();
      skill = reg.getSkillByName(String(name || ''));
    }
    if (!skill) return `Unknown skill "${name}".`;
    if (!skill.isAvailable()) return `Skill "${name}" is not available.`;
    const out = await skill.execute(String(message || ''), context);
    return typeof out === 'string' ? out : out?.response ?? JSON.stringify(out).slice(0, 800);
  },
};

const TOOL_SPECS = `
1. legal_search {"query": "..."} — search Kenyan statutes (Employment Act, WIBA, OSHA, Constitution…).
2. classify_violation {"text": "..."} — classify a workplace violation; returns matching laws + remedies.
3. case_law {"query": "..."} — real Kenyan court cases from kenyalaw.org.
4. make_pdf {"topic": "..."} — generate a PDF document (user receives it as a WhatsApp file).
5. use_skill {"name": "...", "message": "..."} — delegate to an installed skill (calculator, weather, …).`;

const SYSTEM_PROMPT = `You are Pixel, a personal AI assistant on WhatsApp with research tools.

AVAILABLE TOOLS:${TOOL_SPECS}

PROTOCOL — reply with EXACTLY ONE JSON object per turn:
Tool call:                {"tool": "<name>", "args": {...}}
Final answer:             {"answer": "<reply>"}

═══ HALLUCINATION RULES — NON-NEGOTIABLE ═══
1. Any question about law, rights, wages, contracts, dismissal, safety, leave, courts or legal process REQUIRES at least one research tool call (legal_search / classify_violation / case_law) BEFORE you answer. Answering without researching is forbidden.
2. You may ONLY cite an Act name, section number, article, case name, institution name or hotline if it appears VERBATIM in a TOOL RESULT from this conversation. If it's not in a tool result, you don't know it — don't say it.
3. Never guess case outcomes, holdings, dates, amounts or penalties. Not in a tool result → not in your answer.
4. If ONE tool returns nothing, try another. Only say "I couldn't verify this" when ALL research tools came back empty. If legal_search returned passages, answer confidently from them — do NOT open with disclaimers when you have sources.
5. Never expand acronyms (e.g. what NLAS stands for) unless the full name appears in a tool result. Use the acronym as-is.
6. Small talk and general knowledge stay natural — no tools needed, but the same rule applies: no invented specifics presented as fact.`;

// ── Legal-intent detection (cheap keyword gate) ─────────────────────

const LEGAL_HINTS = [
  'right', 'rights', 'law', 'legal', 'court', 'case', 'act ', 'section',
  'wage', 'salary', 'pay', 'paid', 'dismiss', 'fired', 'fired', 'terminat',
  'contract', 'leave', 'overtime', 'harass', 'injur', 'injured', 'safety',
  'union', 'strike', 'nssf', 'nhif', 'payslip', 'notice', 'evict', 'land',
  'child labour', 'child labor', 'compensation', 'employer', 'employee',
  'mshahara', 'mkataba', 'haki', 'kazi', 'barua', 'malo',
];

function looksLegal(text) {
  const lower = String(text || '').toLowerCase();
  return LEGAL_HINTS.some((k) => lower.includes(k));
}

// ── Citation extraction + verification ──────────────────────────────

function extractCitations(answer) {
  const found = new Set();
  const add = (s) => found.add(s.trim());

  // Statutes with optional section: "Employment Act 2007, s. 26" / "…section 26"
  const statute = /\b([A-Z][A-Za-z'’&. ]{2,60}?(?:Act|Constitution)(?:\s+(?:of\s+)?\d{4})?)(?:\s*,?\s*(?:ss?\.|sections?)\s*(\d+[A-Z]?(?:\(\w+\))?))?/g;
  for (const m of answer.matchAll(statute)) add(m[0]);

  // Medium-neutral case citations: [2019] KEELRC 123 (KLR)
  for (const m of answer.matchAll(/\[\d{4}\]\s*KE[A-Z]+\s*\d+[^)\s]*(?:\s*\(KLR\))?/g)) add(m[0]);

  // Case-style party names: "Jane Wanjiku v Employer Ltd"
  for (const m of answer.matchAll(/\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z'.]+){0,4}\s+v\.?(?:s\.?)?\s+[A-Z][A-Za-z'.]+(?:\s+[A-Z][A-Za-z'.]+){0,3}/g)) {
    // Only treat as case cite when followed by nothing suggesting ordinary prose
    add(m[0]);
  }

  return [...found];
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function verifyCitations(answer, observations) {
  const hay = normalize(observations);
  const unverified = [];
  for (const cite of extractCitations(answer)) {
    const n = normalize(cite);
    if (!n) continue;
    // Direct containment of the whole citation…
    if (hay.includes(n)) continue;
    // …or act name AND section number both present somewhere
    const secMatch = n.match(/(?:ss?\.|sections?)\s*(\d+)/);
    const base = n.replace(/(?:ss?\.|sections?)\s*\d+.*/, '').trim();
    const baseOk = base.length > 6 && hay.includes(base);
    const secOk = !secMatch || new RegExp(`(?:ss?\\.\\s*|sections?\\s*)${secMatch[1]}\\b`).test(hay);
    if (baseOk && secOk) continue;
    unverified.push(cite);
  }
  return unverified;
}

// ── JSON extraction ──────────────────────────────────────────────────

function extractJSON(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```(?:json)?/gi, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ── Agent ────────────────────────────────────────────────────────────

class Agent {
  constructor(llmEngine, skillRegistry = null) {
    this.llm = llmEngine;
    this.registry = skillRegistry;
    this.enabled = llmEngine.isAvailable();
  }

  async run(message, context = {}) {
    const started = Date.now();
    const userId = context.phoneNumber || context.senderId || 'agent-anon';

    const history = this.llm.getConversationHistory(userId).slice(-8);
    const userContent = looksLegal(message)
      ? `[SYSTEM REQUIREMENT: legal/workplace topic detected — you MUST call at least one research tool before answering.]\n\n${message}`
      : message;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: userContent },
    ];

    const observations = [];
    let filePayload = null;
    const toolsUsed = [];

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        if (Date.now() - started > RUN_TIMEOUT_MS) break;

        const raw = await this.llm.callLLM(messages, { task: 'reason' });
        const content = raw.choices?.[0]?.message?.content || '';
        const parsed = extractJSON(content);

        if (!parsed) {
          const final = await this.#verifyAndFix(content.trim(), observations, messages);
          return this.#finish(final, filePayload, toolsUsed, userId, message);
        }

        // Premature answer on a forced-lookup question → reject ONCE
        if (parsed.answer !== undefined && !parsed.tool) {
          if (looksLegal(message) && toolsUsed.length === 0 && step === 0) {
            console.log('🚫 agent: rejected answer without research — forcing lookup');
            messages.push({ role: 'assistant', content });
            messages.push({
              role: 'user',
              content: 'REJECTED: you answered a legal question without researching. Call legal_search / classify_violation / case_law first. Tool call JSON now.',
            });
            continue;
          }
          const final = await this.#verifyAndFix(String(parsed.answer), observations, messages);
          return this.#finish(final, filePayload, toolsUsed, userId, message);
        }

        if (parsed.tool && TOOLS[parsed.tool]) {
          const toolName = parsed.tool;
          const args = parsed.args || {};
          console.log(`🛠️ agent[${step + 1}]: ${toolName}(${JSON.stringify(args).slice(0, 120)})`);
          toolsUsed.push(toolName);

          let observation;
          try {
            const result = await TOOLS[toolName].call(this, args, context);
            if (result && typeof result === 'object' && result.observation !== undefined) {
              observation = result.observation;
              if (result.file) filePayload = result.file;
            } else {
              observation = typeof result === 'string' ? result : JSON.stringify(result);
            }
          } catch (err) {
            observation = `Tool error: ${err.message}`;
          }
          observations.push(`[${toolName}] ${observation}`);

          messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
          messages.push({
            role: 'user',
            content: `[TOOL RESULT — ${toolName}]\n${String(observation).slice(0, 4000)}\n\nContinue: another tool call, or your final {"answer": ...}. Remember: cite ONLY what appears above.`,
          });
          continue;
        }

        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: 'Invalid command. Reply {"tool": ..., "args": {...}} or {"answer": ...}' });
      }

      // Steps exhausted — force closure with the deepest model
      messages.push({ role: 'user', content: 'Wrap up now. Final {"answer": "..."} — citing only what tool results showed.' });
      const raw = await this.llm.callLLM(messages, { task: 'deep' });
      const parsed = extractJSON(raw.choices?.[0]?.message?.content);
      const draft = String(parsed?.answer || raw.choices?.[0]?.message?.content || '');
      const final = await this.#verifyAndFix(draft, observations, messages);
      return this.#finish(final, filePayload, toolsUsed, userId, message);
    } catch (err) {
      console.error('❌ agent failed:', err.message);
      throw err;
    }
  }

  // Scan the draft for citations not present in tool observations; ask the
  // model to strip/fix them. If verification still fails, append an honesty flag.
  async #verifyAndFix(draft, observations, messages) {
    if (!draft) return draft;
    const obsBlob = observations.join('\n');
    if (!obsBlob) return draft; // no research happened (small talk) — nothing to verify against

    const unverified = verifyCitations(draft, obsBlob);
    if (!unverified.length) return draft;

    console.log(`🔍 citation check: ${unverified.length} unverified → ${unverified.join(' | ').slice(0, 160)}`);
    try {
      const fixPrompt = [
        ...messages,
        { role: 'assistant', content: draft },
        {
          role: 'user',
          content: `These citations do NOT appear in any tool result: ${unverified.map((u) => `"${u}"`).join(', ')}. Rewrite the answer removing or clearly marking them as unverified. Keep everything that IS supported by the tool results word-for-word accurate. Return plain text only.`,
        },
      ];
      const fixed = await this.llm.callLLM(fixPrompt, { task: 'verify' });
      let out = fixed.choices?.[0]?.message?.content?.trim() || '';
      // Strip protocol wrapper if the model answered in JSON anyway
      const p = extractJSON(out);
      if (p?.answer) out = String(p.answer);
      const stillBad = verifyCitations(out, obsBlob);
      if (stillBad.length < unverified.length && out) {
        return stillBad.length
          ? out + `\n\n⚠️ Note: I couldn't fully verify: ${stillBad.join(', ')}.`
          : out;
      }
      return draft + `\n\n⚠️ Note: I couldn't independently verify some details above — confirm with NLAS (free): 0800 723 255.`;
    } catch {
      return draft + `\n\n⚠️ Note: I couldn't independently verify some details above — confirm with NLAS (free): 0800 723 255.`;
    }
  }

  #finish(answer, file, toolsUsed, userId, message) {
    if (answer) {
      this.llm.addToHistory(userId, 'user', message);
      this.llm.addToHistory(userId, 'assistant', answer);
    }
    return {
      response: answer,
      file: file || undefined,
      metadata: { type: 'agent', toolsUsed },
    };
  }

  isAvailable() {
    return this.enabled;
  }
}

export default Agent;
