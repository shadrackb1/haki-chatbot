const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_API_URL = process.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'meta/llama-3.1-8b-instruct';

const SYSTEM_PROMPT = `You are an expert programmer. Help the user with their coding request.

Rules:
- Return code in \`\`\`language blocks when applicable
- Explain your approach briefly before/after the code
- For debugging: identify the bug, explain why it fails, show the fix
- For explanations: be clear and concise, use examples
- For refactoring: show before/after with explanations
- Support all major languages: JavaScript, Python, Java, Rust, TypeScript, Go, C++, SQL, HTML/CSS
- If the language isn't specified, ask or infer from context
- Format code blocks with language tags for clarity
- Keep explanations concise and WhatsApp-friendly
- Do not hallucinate APIs or libraries — only suggest well-known, real packages`;

const CODE_BLOCK_REGEX = /```[\s\S]*?```/g;
const CODE_PATTERNS = [
  /```[\s\S]*?```/,
  /\bfunction\b\s+\w+/,
  /\bclass\b\s+\w+/,
  /\bdef\b\s+\w+/,
  /\bconst\b\s+\w+\s*=/,
  /\blet\b\s+\w+\s*=/,
  /\bvar\b\s+\w+\s*=/,
  /\bimport\b\s+.*\bfrom\b/,
  /\b(require|module\.exports)\b/,
  /\breturn\b\s/,
  /=>\s*\{/,
  /\w+\s*\([^)]*\)\s*\{/,
  /\bif\s*\(/,
  /\bfor\s*\(/,
  /\bwhile\s*\(/,
  /\w+\.\w+\([^)]*\)/,
  /[=!<>]=?\s*\w+/,
  /;\s*$/m,
];

function detectIntent(message) {
  const lower = message.toLowerCase();

  if (/\b(debug|fix|error|issue|bug|problem|failing|broken|not work|doesn't work|won't work|crash|exception|traceback|undefined is not|cannot read|type error)\b/.test(lower)) {
    return 'debug';
  }
  if (/\b(explain|what does|how does|how do|what is|what are|how does .* work|what does .* do|walkthrough|walk me through)\b/.test(lower)) {
    return 'explain';
  }
  if (/\b(refactor|clean up|simplify|optimize|improve|rewrite|restructure|make (it |the )?(better|cleaner|faster|readable))\b/.test(lower)) {
    return 'refactor';
  }
  if (/\b(convert|translate|port|rewrite in|change to|switch to)\b/.test(lower)) {
    return 'convert';
  }
  if (/\b(review|check|look at|evaluate|assess|audit)\b/.test(lower)) {
    return 'review';
  }
  return 'write';
}

function containsCode(message) {
  if (CODE_PATTERNS.some((p) => p.test(message))) return true;
  if (CODE_BLOCK_REGEX.test(message)) return true;
  return false;
}

function extractCodeFromMessage(message) {
  const codeBlocks = [];
  const regex = /```(\w+)?\n?([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(message)) !== null) {
    codeBlocks.push({
      language: match[1] || 'unknown',
      code: match[2].trim(),
    });
  }

  return codeBlocks;
}

function detectLanguage(message) {
  const lower = message.toLowerCase();
  const langMap = [
    ['javascript', ['javascript', 'js ', ' node', 'nodejs', ' express', 'react ', ' next', 'nextjs']],
    ['python', ['python', 'py ', ' django', 'flask', ' fastapi', 'pandas', 'numpy']],
    ['typescript', ['typescript', 'ts ', ' next', 'nextjs']],
    ['java', ['java ', ' java', ' spring', 'android']],
    ['rust', ['rust', 'cargo', 'rs ']],
    ['go', [' golang', 'go ', ' go ']],
    ['c++', ['c++', 'cpp', ' c ']],
    ['sql', ['sql', 'mysql', 'postgres', 'sqlite', 'query']],
    ['html', ['html', '<div', '<span', '<!DOCTYPE']],
    ['css', ['css', 'style', 'flexbox', 'grid']],
    ['php', ['php', 'laravel']],
    ['ruby', ['ruby', 'rails']],
    ['swift', ['swift', 'ios ']],
    ['kotlin', ['kotlin']],
  ];

  for (const [lang, keywords] of langMap) {
    if (keywords.some((kw) => lower.includes(kw))) return lang;
  }
  return null;
}

function buildUserPrompt(message, intent) {
  const codeBlocks = extractCodeFromMessage(message);
  const detectedLang = detectLanguage(message);

  if (codeBlocks.length > 0) {
    const primary = codeBlocks[0];
    const langInfo = primary.language !== 'unknown' ? primary.language : detectedLang || 'not specified';

    switch (intent) {
      case 'debug':
        return `Debug this ${langInfo} code and explain the issue:\n\n\`\`\`${langInfo}\n${primary.code}\n\`\`\`\n\nUser message: ${message}`;
      case 'explain':
        return `Explain this ${langInfo} code in detail:\n\n\`\`\`${langInfo}\n${primary.code}\n\`\`\`\n\nUser message: ${message}`;
      case 'refactor':
        return `Refactor this ${langInfo} code to improve it. Show before/after:\n\n\`\`\`${langInfo}\n${primary.code}\n\`\`\`\n\nUser message: ${message}`;
      case 'review':
        return `Review this ${langInfo} code for issues, bugs, and improvements:\n\n\`\`\`${langInfo}\n${primary.code}\n\`\`\`\n\nUser message: ${message}`;
      default:
        return message;
    }
  }

  if (intent === 'convert' && detectedLang) {
    return `${message}\n\nDetected source language: ${detectedLang}. Provide the conversion with both versions clearly labeled.`;
  }

  return message;
}

async function callLLM(systemPrompt, userPrompt) {
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
      max_tokens: 1500,
      temperature: 0.4,
      top_p: 0.9,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) throw new Error('Empty response from LLM API');
  return content.trim();
}

function formatResponse(response) {
  let formatted = response;

  // Clean up double-backtick code fences that some models produce
  formatted = formatted.replace(/````(\w+)/g, '```$1');

  // Ensure code blocks have language tags for WhatsApp readability
  formatted = formatted.replace(/```\n/g, '```\n');
  formatted = formatted.replace(/```(\w+)\n/g, '```$1\n');

  return formatted;
}

export default {
  name: 'code-helper',
  description: 'Generate, explain, debug, and refactor code in any programming language',
  triggers: [
    'write code',
    'code for',
    'write a function',
    'write a class',
    'implement',
    'code example',
    'programming',
    'javascript',
    'python',
    'java',
    'rust',
    'typescript',
    'code snippet',
    'script',
  ],

  async execute(message, context) {
    if (!LLM_API_KEY) {
      return {
        response:
          'Code helper is not available — the LLM API key is not configured. Please set LLM_API_KEY in your environment.',
      };
    }

    const intent = detectIntent(message);
    const hasCode = containsCode(message);

    // Treat messages with embedded code as debug/review requests if intent is generic
    let effectiveIntent = intent;
    if (hasCode && intent === 'write') {
      effectiveIntent = 'debug';
    }

    const userPrompt = buildUserPrompt(message, effectiveIntent);

    try {
      const raw = await callLLM(SYSTEM_PROMPT, userPrompt);
      const response = formatResponse(raw);
      return { response };
    } catch (err) {
      console.error('Code helper LLM error:', err.message);
      return {
        response:
          'Sorry, I hit an error while processing your code request. Please try again.',
      };
    }
  },

  isAvailable() {
    return !!LLM_API_KEY;
  },
};
