/**
 * Legal Research Skill — Kenyan labour law research from WhatsApp.
 *
 * Self-contained: bundles its own legal data (data/legal/), BM25 retriever
 * and violation classifier. Uses PixelAI's LLM engine via processWithPromptAndHistory
 * so responses get a legal-grounded system prompt plus conversation memory.
 *
 * Pipeline: classify violation → retrieve passages (BM25) → grounded LLM answer
 * → markdown→WhatsApp formatting. Bot-level humanizer adds the signature after.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import KnowledgeRetriever from './retriever.js';
import { classifyViolation } from './classifier.js';
import LLMReasoningEngine from '../../llm-reasoning.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const legalKB = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'legal', 'legal-knowledge-base.json'), 'utf8')
);

const retriever = new KnowledgeRetriever(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'legal', 'legal-corpus.json'), 'utf8')
  )
);

const llm = new LLMReasoningEngine();

// Convert common LLM markdown to WhatsApp-friendly formatting.
// WhatsApp only understands *bold*, _italic_, ~strike~, ```code```.
function toWhatsApp(text = '') {
  if (!text || typeof text !== 'string') return text;

  let inCode = false;
  const lines = text.split('\n').map((line) => {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      return line;
    }
    if (inCode) return line;

    return line
      .replace(/\*\*(.+?)\*\*/g, '*$1*')
      .replace(/__(.+?)__/g, '_$1_')
      .replace(/^#{1,6}\s+(.*)$/, '*$1*')
      .replace(/^(\s*)[-*]\s+/, '$1• ');
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildLegalSystemPrompt(violation, knowledge) {
  const violationBlock = violation
    ? `
CLASSIFIED VIOLATION:
- ID: ${violation.id}
- Description: ${violation.data.description}
- Applicable Laws: ${JSON.stringify(violation.data.applicable_laws)}
- Remedy Pathways: ${JSON.stringify(violation.data.remedy_pathways)}`
    : '';

  const passages = knowledge.length
    ? knowledge.map((k) => `- [${k.id}] ${k.text}`).join('\n')
    : 'None retrieved.';

  return `You are a Kenyan employment-law research assistant helping workers and students understand their rights under Kenyan law.

RETRIEVED LEGAL PASSAGES (ground every legal claim in these — quote exact wording where it matters):
${passages}
${violationBlock}

RESPONSE RULES:
1. Write like a knowledgeable friend texting on WhatsApp — not an essay.
2. Cite the specific Act and section when you state a legal position (e.g. Employment Act 2007, s. 26).
3. If a remedy pathway exists in the classified violation info, lay out the steps in order with the institution and timeline.
4. If the retrieved passages don't cover the question, say what you do know and flag uncertainty — never invent section numbers or case names.
5. Be empathetic but practical: acknowledge the situation, then give a concrete next step.
6. Keep it under 200 words unless detailed legal steps are genuinely needed.
7. Use markdown bold (**like this**) for key laws and deadlines — it gets converted for WhatsApp.`;
}

export default {
  name: 'legal-research',
  description:
    'Kenyan labour law research: classifies violations, retrieves statutory passages, and gives grounded advice with remedy pathways',

  triggers: [
    'haki',
    'my rights',
    'what are my rights',
    'workers rights',
    'worker rights',
    'labour law',
    'labor law',
    'employment act',
    'minimum wage',
    'violation',
    'unfair dismissal',
    'wrongful dismissal',
    'termination',
    'notice period',
    'mshahara',
    'haki zangu',
    'mkataba',
    'barakoa',
    'wiba',
    'nssf',
    'nhif',
    'payslip',
    'overtime pay',
    'maternity leave',
    'sexual harassment at work',
    'child labour',
    'child labor',
    'evicted',
    'eviction notice',
  ],

  async execute(message, context = {}) {
    const raw = (message || '').trim();
    if (!raw) {
      return {
        response:
          'Ask me about Kenyan workers\' rights — wages, contracts, safety, termination, leave. Or describe what happened at work.',
      };
    }

    // 1. Classify violation (TF-IDF against KB categories)
    let violation = null;
    try {
      violation = classifyViolation(raw);
    } catch (err) {
      console.error('[legal-research] classification error:', err.message);
    }

    // 2. Retrieve grounded statutory passages (BM25)
    let knowledge = [];
    try {
      knowledge = retriever.search(raw, 3).filter((k) => k.score > 0);
    } catch (err) {
      console.error('[legal-research] retrieval error:', err.message);
    }

    // 3. Grounded LLM answer with conversation memory
    const userId = context.phoneNumber || context.senderId || 'legal-anon';
    let responseText = null;

    if (llm.enabled) {
      const systemPrompt = buildLegalSystemPrompt(violation, knowledge);
      responseText = await llm.processWithPromptAndHistory(raw, systemPrompt, userId);
    }

    // 4. Fallback: KB instant response / structured summary — no LLM needed
    if (!responseText) {
      if (violation) {
        const v = violation.data;
        let out = `🚨 *${v.description}*\n\n*The law that applies:*\n`;
        for (const law of v.applicable_laws) {
          out += `📜 ${law.law} (${law.section}) — ${law.detail}\n`;
        }
        out += `\n*What you can do:*\n`;
        for (const p of v.remedy_pathways) {
          out += `🏛️ ${p.institution}: ${p.action}\n`;
          for (const step of p.process) out += `   • ${step}\n`;
          out += `   ⏰ Timeline: ${p.timeline}\n`;
        }
        out += `\n📞 NLAS (free legal aid): 0800 723 255`;
        responseText = out;
      } else {
        responseText =
          'I can help with Kenyan workplace rights — wages, contracts, safety, termination, leave, harassment. Tell me what happened at work, or ask something like "what\'s the minimum wage?"';
      }
    }

    return {
      response: toWhatsApp(responseText),
      metadata: {
        type: 'legal-research',
        violation: violation ? violation.id : null,
        passagesUsed: knowledge.map((k) => k.id),
        usedLLM: !!responseText && llm.enabled,
      },
    };
  },

  isAvailable() {
    return true;
  },
};
