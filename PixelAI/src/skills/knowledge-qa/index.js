/**
 * Knowledge Q&A Skill — Simple RAG over local documents.
 *
 * Triggers: from my docs, in my notes, based on, according to my,
 *           what do my docs say, search my files, in my documents, from my knowledge
 * Loads .txt, .md, .json, .csv files from data/knowledge-base/ and answers
 * questions grounded in those documents via NVIDIA NIM.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_API_URL =
  process.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'meta/llama-3.1-8b-instruct';

const KB_DIR = join(__dirname, '..', '..', 'data', 'knowledge-base');

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv']);

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;
const TOP_K = 3;

const LIST_PATTERNS = [
  /^(?:what|which)\s+(?:docs?|documents?|files?|notes?)\s+(?:do\s+)?(?:i|we)\s+have/i,
  /^(?:list|show)\s+(?:my\s+)?(?:docs?|documents?|files?|notes?)/i,
  /^(?:what)\s+(?:docs?|documents?|files?|notes?)\s+(?:are|is)\s+(?:there|available)/i,
];

const TRIGGER_PHRASES = [
  'from my docs',
  'in my notes',
  'based on',
  'according to my',
  'what do my docs say',
  'search my files',
  'in my documents',
  'from my knowledge',
];

// ── File I/O ──────────────────────────────────────────────────────────────────

async function listKnowledgeFiles() {
  try {
    const entries = await readdir(KB_DIR);
    const files = [];

    for (const entry of entries) {
      const ext = extname(entry).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        const filePath = join(KB_DIR, entry);
        const info = await stat(filePath);
        if (info.isFile()) {
          files.push({ name: entry, size: info.size, ext });
        }
      }
    }

    return files;
  } catch {
    return [];
  }
}

async function readKnowledgeFile(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const ext = extname(filePath).toLowerCase();

    if (ext === '.json') {
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
      } catch {
        return raw;
      }
    }

    return raw;
  } catch {
    return '';
  }
}

async function loadAllDocuments() {
  const files = await listKnowledgeFiles();
  const documents = [];

  for (const file of files) {
    const content = await readKnowledgeFile(join(KB_DIR, file.name));
    if (content.trim()) {
      documents.push({ name: file.name, content });
    }
  }

  return documents;
}

// ── Chunking ──────────────────────────────────────────────────────────────────

function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (cleaned.length <= size) {
    return [cleaned];
  }

  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + size, cleaned.length);
    let chunk = cleaned.slice(start, end);

    if (end < cleaned.length) {
      const lastNewline = chunk.lastIndexOf('\n');
      if (lastNewline > size * 0.3) {
        chunk = chunk.slice(0, lastNewline);
      }
    }

    if (chunk.trim()) {
      chunks.push(chunk.trim());
    }

    start += size - overlap;
  }

  return chunks;
}

function buildDocumentChunks(documents) {
  const allChunks = [];

  for (const doc of documents) {
    const chunks = chunkText(doc.content);
    for (let i = 0; i < chunks.length; i++) {
      allChunks.push({
        source: doc.name,
        index: i,
        text: chunks[i],
      });
    }
  }

  return allChunks;
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

function extractKeywords(query) {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'what',
    'how', 'when', 'where', 'who', 'which', 'why', 'this', 'that',
    'these', 'those', 'it', 'its', 'my', 'your', 'our', 'their',
    'and', 'or', 'but', 'not', 'no', 'nor', 'so', 'if', 'then',
    'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'only', 'own', 'same', 'do', 'say', 'get',
    'make', 'go', 'know', 'take', 'come', 'think', 'look', 'want',
    'give', 'use', 'find', 'tell', 'ask', 'work', 'seem', 'feel',
    'try', 'leave', 'call', 'need', 'become', 'keep', 'let', 'begin',
    'help', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe',
    'bring', 'happen', 'write', 'provide', 'sit', 'stand', 'lose',
    'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change',
    'lead', 'understand', 'watch', 'follow', 'stop', 'create', 'speak',
    'read', 'allow', 'add', 'spend', 'grow', 'open', 'walk', 'win',
    'offer', 'remember', 'love', 'consider', 'appear', 'buy', 'wait',
    'serve', 'die', 'send', 'expect', 'build', 'stay', 'fall', 'cut',
    'reach', 'kill', 'remain', 'suggest', 'raise', 'pass', 'sell',
    'require', 'report', 'decide', 'pull', 'develop', 'from', 'docs',
    'doc', 'notes', 'documents', 'files', 'knowledge', 'based',
    'according', 'search', 'say', 'say about', 'tell me',
  ]);

  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)];
}

function scoreChunk(chunk, keywords) {
  const lower = chunk.text.toLowerCase();
  const words = lower.split(/\s+/);
  const totalWords = words.length || 1;

  let matches = 0;
  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const count = (lower.match(regex) || []).length;
    matches += count;
  }

  return matches / totalWords;
}

function retrieveRelevantChunks(documents, query, topK = TOP_K) {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const chunks = buildDocumentChunks(documents);
  if (chunks.length === 0) return [];

  const scored = chunks.map((chunk) => ({
    ...chunk,
    score: scoreChunk(chunk, keywords),
  }));

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ── Query extraction ──────────────────────────────────────────────────────────

function extractQuery(message) {
  let query = message.trim();

  for (const phrase of TRIGGER_PHRASES) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    query = query.replace(regex, '');
  }

  query = query
    .replace(/^(can you|please|could you|would you|help me)\s*/i, '')
    .replace(/[?.!]+$/g, '')
    .trim();

  return query;
}

function isListRequest(message) {
  return LIST_PATTERNS.some((p) => p.test(message.trim()));
}

// ── LLM call ─────────────────────────────────────────────────────────────────

async function callLLM(systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1000,
        temperature: 0.3,
        top_p: 0.9,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown error');
      throw new Error(`LLM API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from LLM API');
    return content.trim();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('LLM request timed out');
    throw err;
  }
}

// ── Response formatting ───────────────────────────────────────────────────────

function formatDocsList(files) {
  if (files.length === 0) {
    return '📁 Your knowledge base is empty. Add `.txt`, `.md`, `.json`, or `.csv` files to the `data/knowledge-base/` folder to get started.';
  }

  let msg = `📚 *Your documents (${files.length}):*\n\n`;

  for (let i = 0; i < files.length; i++) {
    const sizeKB = (files[i].size / 1024).toFixed(1);
    msg += `${i + 1}. *${files[i].name}* — ${sizeKB} KB\n`;
  }

  msg += '\nAsk me anything about these documents!';
  return msg;
}

function formatRAGResponse(answer, chunks) {
  const sources = [...new Set(chunks.map((c) => c.source))];
  let msg = answer;

  if (sources.length > 0) {
    msg += `\n\n📄 _Sources: ${sources.join(', ')}_`;
  }

  return msg;
}

// ── Skill export ──────────────────────────────────────────────────────────────

export default {
  name: 'knowledge-qa',
  description: 'Answer questions from your uploaded documents and notes using RAG',
  triggers: [
    'from my docs',
    'in my notes',
    'based on',
    'according to my',
    'what do my docs say',
    'search my files',
    'in my documents',
    'from my knowledge',
  ],

  async execute(message, context) {
    if (isListRequest(message)) {
      const files = await listKnowledgeFiles();
      return { response: formatDocsList(files) };
    }

    const query = extractQuery(message);
    if (!query) {
      const files = await listKnowledgeFiles();
      if (files.length === 0) {
        return {
          response: '📁 Your knowledge base is empty. Add `.txt`, `.md`, `.json`, or `.csv` files to the `data/knowledge-base/` folder, then ask me about them.',
        };
      }
      return {
        response: 'What would you like to know from your documents? Try asking something like "What do my docs say about project deadlines?"',
      };
    }

    const documents = await loadAllDocuments();
    if (documents.length === 0) {
      return {
        response: '📁 I couldn\'t find any documents in the `data/knowledge-base/` folder. Add `.txt`, `.md`, `.json`, or `.csv` files there and try again.',
      };
    }

    const relevantChunks = retrieveRelevantChunks(documents, query);
    if (relevantChunks.length === 0) {
      return {
        response: '🔍 I couldn\'t find relevant information in your documents for this question. Try rephrasing or check if your documents contain the information you\'re looking for.',
      };
    }

    if (!LLM_API_KEY) {
      const excerpts = relevantChunks
        .map((c, i) => `--- Excerpt ${i + 1} (${c.source}) ---\n${c.text}`)
        .join('\n\n');
      return {
        response: `📄 *Relevant excerpts from your documents:*\n\n${excerpts}\n\n_LLM not configured — showing raw excerpts. Set LLM_API_KEY for AI-powered answers._`,
      };
    }

    const contextBlock = relevantChunks
      .map((c, i) => `[Document: ${c.source}, Excerpt ${i + 1}]\n${c.text}`)
      .join('\n\n');

    const systemPrompt = `You are a helpful document assistant. Answer the user's question using ONLY the provided document excerpts. Rules:
- Base your answer strictly on the provided excerpts
- If the excerpts don't contain enough information to answer, say so clearly
- Quote or reference the source document when possible
- Be concise and direct
- If the excerpts are partially relevant, answer what you can and note what's missing`;

    const userPrompt = `DOCUMENT EXCERPTS:\n${contextBlock}\n\nQUESTION: ${query}`;

    try {
      const answer = await callLLM(systemPrompt, userPrompt);
      return { response: formatRAGResponse(answer, relevantChunks) };
    } catch (err) {
      console.error('Knowledge QA LLM error:', err.message);
      const excerpts = relevantChunks
        .map((c, i) => `--- Excerpt ${i + 1} (${c.source}) ---\n${c.text}`)
        .join('\n\n');
      return {
        response: `📄 *Here are the most relevant excerpts from your documents:*\n\n${excerpts}\n\n_Full answer unavailable (LLM error). Showing raw excerpts instead._`,
      };
    }
  },

  isAvailable() {
    return true;
  },
};
