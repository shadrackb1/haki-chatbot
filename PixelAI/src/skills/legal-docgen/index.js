/**
 * Legal Document Generation Skill — creates PDF documents from WhatsApp.
 *
 * Handles: case summaries, demand letters, advice letters, rights guides,
 * legal assignment-style write-ups. Grounds content in the same legal
 * corpus as the legal-research skill, renders a real PDF via pdfkit, and
 * returns it as a file payload the bot sends as a WhatsApp document.
 *
 * Reuses classifier + retriever from ../legal-research/ (single source of truth).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

import { classifyViolation } from '../legal-research/classifier.js';
import KnowledgeRetriever from '../legal-research/retriever.js';
import LLMReasoningEngine from '../../llm-reasoning.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.join(__dirname, '..', '..', '..', 'data', 'media');

const retriever = new KnowledgeRetriever(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'legal', 'legal-corpus.json'), 'utf8')
  )
);

const llm = new LLMReasoningEngine();

// ── Helpers ──────────────────────────────────────────────────────────

function slugify(text) {
  return (text || 'document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'document';
}

function detectDocType(message) {
  const lower = message.toLowerCase();
  if (/demand letter/.test(lower)) return 'demand letter';
  if (/advice letter|letter of advice/.test(lower)) return 'advice letter';
  if (/case summary|case note/.test(lower)) return 'case summary';
  if (/assignment|essay|research paper/.test(lower)) return 'assignment';
  if (/rights guide|know your rights|guide/.test(lower)) return 'rights guide';
  return 'legal brief';
}

function buildDocSystemPrompt(topic, docType, violation, knowledge) {
  const passages = knowledge.length
    ? knowledge.map((k) => `- [${k.id}] ${k.text}`).join('\n')
    : 'None retrieved.';

  const violationBlock = violation
    ? `\nCLASSIFIED VIOLATION:\n${JSON.stringify(
        {
          id: violation.id,
          description: violation.data.description,
          laws: violation.data.applicable_laws,
          remedies: violation.data.remedy_pathways,
        },
        null,
        1
      )}`
    : '';

  return `You are a Kenyan legal research assistant drafting a ${docType} about: "${topic}".

RETRIEVED LEGAL PASSAGES (ground every legal claim in these — cite Act + section):
${passages}
${violationBlock}

DOCUMENT FORMAT RULES:
1. Start with a '# ' title line, then use '## ' section headings.
2. Use **bold** for key statutes, sections, deadlines and amounts.
3. Use '- ' for bullet points where listing steps or elements.
4. Cite specific legislation inline, e.g. Employment Act 2007, s. 26.
5. If passages don't cover something, omit it — never invent sections or cases.
6. Length: 400-800 words. Structured, formal but plain English.
7. End with a '## Next Steps' section with concrete actions and the NLAS free legal aid line: 0800 723 255.

Return ONLY the document text.`;
}

// Render structured text (with # / ## / **bold** / - bullets) into a PDF buffer.
async function renderPdf(title, bodyText) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 64, right: 64 } });
    const chunks = [];

    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header block
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#888888')
      .text('PixelAI — Legal Research', { align: 'left' });
    doc.font('Helvetica').fontSize(9).fillColor('#888888')
      .text(new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }), { align: 'left' });
    doc.moveDown(1);
    doc.fillColor('#000000');

    let firstH1Seen = false;

    const writeInline = (text, size) => {
      // Split on **bold** spans; continued:true keeps one flowing line.
      const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== '');
      parts.forEach((part, i) => {
        const isLast = i === parts.length - 1;
        const boldSpan = /^\*\*[^*]+\*\*$/.test(part);
        doc.font(boldSpan ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
          .text(boldSpan ? part.slice(2, -2) : part, { continued: !isLast });
      });
      if (parts.length === 0) doc.text('', { continued: false });
    };

    for (const rawLine of bodyText.split('\n')) {
      const line = rawLine.trimEnd();

      if (!line.trim()) {
        doc.moveDown(0.5);
        continue;
      }
      if (/^#{1,6}\s+/.test(line)) {
        const level = line.match(/^#+/)[0].length;
        const text = line.replace(/^#{1,6}\s+/, '');
        doc.moveDown(level === 1 && firstH1Seen ? 0.8 : 0.4);
        doc.font('Helvetica-Bold').fontSize(level === 1 ? 17 : 13).fillColor('#111111')
          .text(text, { characterSpacing: 0.2 });
        doc.moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .lineWidth(level === 1 ? 1.2 : 0.6).strokeColor('#cccccc').stroke();
        doc.moveDown(0.4);
        doc.fillColor('#000000');
        if (level === 1) firstH1Seen = true;
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        const bullet = line.replace(/^[-*]\s+/, '');
        doc.font('Helvetica').fontSize(11).text('•  ', { continued: true });
        writeInline(bullet, 11);
        doc.moveDown(0.15);
        continue;
      }

      writeInline(line, 11);
      doc.moveDown(0.25);
    }

    // Footer disclaimer
    doc.moveDown(1.2);
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#777777')
      .text(
        'Generated by PixelAI from Kenyan statutory sources. General information, not legal advice. Free legal aid: NLAS 0800 723 255.',
        { align: 'center' }
      );

    doc.end();
  });
}

// Fallback document built straight from the KB when the LLM is unavailable.
function buildFallbackBody(violation, knowledge, topic) {
  let body = `# ${topic}\n\n`;
  if (knowledge.length) {
    body += '## Relevant Law\n';
    for (const k of knowledge) {
      body += `- **${k.title}** (${k.source}): ${k.text}\n\n`;
    }
  }
  if (violation) {
    const v = violation.data;
    body += `## Applicable Legislation\n`;
    for (const law of v.applicable_laws) {
      body += `- **${law.law}**, ${law.section} — ${law.detail}\n`;
    }
    body += '\n## Remedy Pathways\n';
    for (const p of v.remedy_pathways) {
      body += `- **${p.institution}**: ${p.action}. Timeline: ${p.timeline}.\n`;
    }
  }
  body += '\n## Next Steps\n- Visit the nearest County Labour Office with your national ID.\n- Keep records: payslips, M-Pesa statements, contracts, photos.\n- Call NLAS (free): 0800 723 255.\n';
  return body;
}

// ── Skill export ─────────────────────────────────────────────────────

export default {
  name: 'legal-docgen',
  description:
    'Generates PDF legal documents on WhatsApp: case summaries, demand letters, advice letters, rights guides, assignment write-ups',

  // Document requests carry explicit intent ("generate a case summary…") —
  // boost so they outrank topic-only matches from legal-research.
  priorityBoost: 1,

  triggers: [
    'generate a pdf',
    'create a pdf',
    'make a pdf',
    'generate pdf',
    'create pdf',
    'generate document',
    'create document',
    'make me a document',
    'draft a letter',
    'demand letter',
    'case summary',
    'case note',
    'assignment',
    'essay',
    'rights guide',
    'know your rights pdf',
  ],

  async execute(message, context = {}) {
    const raw = (message || '').trim();
    if (!raw) {
      return {
        response:
          'Tell me what document to draft — e.g. "generate a case summary about unfair dismissal" or "draft a demand letter for unpaid wages".',
      };
    }

    const docType = detectDocType(raw);

    // Strip the command phrasing so the topic reads naturally
    const topic = raw
      .replace(/^(please\s+)?(can you\s+)?(generate|create|make|draft|write)\s+(me\s+)?(a|an)?\s*(pdf|document|letter|summary|report|assignment|essay)?\s*(about|on|for|of)?\s*/i, '')
      .replace(/^(a|an)\s+/i, '')
      .trim() || raw;

    // Same grounding pipeline as legal-research
    let violation = null;
    try {
      violation = classifyViolation(topic);
    } catch (err) {
      console.error('[legal-docgen] classification error:', err.message);
    }

    let knowledge = [];
    try {
      knowledge = retriever.search(topic, 5).filter((k) => k.score > 0);
    } catch (err) {
      console.error('[legal-docgen] retrieval error:', err.message);
    }

    // Generate document body
    let bodyText = null;
    if (llm.enabled) {
      const systemPrompt = buildDocSystemPrompt(topic, docType, violation, knowledge);
      const userId = context.phoneNumber || context.senderId || 'legal-anon';
      bodyText = await llm.processWithPromptAndHistory(raw, systemPrompt, userId);
    }
    if (!bodyText) {
      bodyText = buildFallbackBody(violation, knowledge, topic);
    }

    // Ensure a title exists even if the LLM skipped the H1
    if (!/^#{1,6}\s+/m.test(bodyText)) {
      bodyText = `# ${topic.replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${bodyText}`;
    }

    // Render PDF
    if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const fileName = `${slugify(topic)}.pdf`;
    const filePath = path.join(MEDIA_DIR, `${Date.now()}_${fileName}`);

    const buffer = await renderPdf(topic, bodyText);
    fs.writeFileSync(filePath, buffer);

    console.log(`[legal-docgen] PDF generated: ${filePath} (${buffer.length} bytes)`);

    return {
      response: `📄 *${docType}* ready — "${topic.slice(0, 80)}"${violation ? ` (classified: ${violation.id})` : ''}`,
      file: {
        buffer,
        fileName,
        mimetype: 'application/pdf',
      },
      metadata: {
        type: 'legal-docgen',
        docType,
        violation: violation ? violation.id : null,
        passagesUsed: knowledge.map((k) => k.id),
        usedLLM: llm.enabled,
        bytes: buffer.length,
      },
    };
  },

  isAvailable() {
    return true;
  },
};
