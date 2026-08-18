/**
 * Translation Skill — translate text between 100+ languages via LLM
 *
 * Matches messages containing translation triggers, detects source/target
 * languages, and calls the NVIDIA NIM API for the actual translation.
 */

const LLM_API_URL = process.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'meta/llama-3.1-8b-instruct';

const SUPPORTED_LANGUAGES = [
    'swahili', 'english', 'french', 'spanish', 'arabic', 'hindi',
    'chinese', 'japanese', 'korean', 'portuguese', 'german', 'italian',
    'russian', 'turkish', 'thai', 'vietnamese', 'indonesian', 'malay',
    'tagalog', 'dutch', 'polish', 'ukrainian', 'greek', 'hebrew',
    'urdu', 'bengali', 'tamil', 'telugu', 'marathi', 'gujarati',
    'kannada', 'malayalam', 'punjabi', 'farsi', 'pashto', 'kurdish',
    'somali', 'amharic', 'yoruba', 'igbo', 'zulu', 'xhosa', 'afrikaans'
];

const LANG_ALIASES = {
    'mandarin': 'chinese',
    'cantonese': 'chinese',
    'persian': 'farsi',
    'norsk': 'norwegian',
    'svenska': 'swedish',
    'suomi': 'finnish',
    'bahasa': 'indonesian',
    'bahasa indonesia': 'indonesian',
    'bahasa melayu': 'malay',
    'castellano': 'spanish',
    'castilian': 'spanish',
    'deutsch': 'german',
    'français': 'french',
    'italiano': 'italian',
    'português': 'portuguese',
    'русский': 'russian',
    '한국어': 'korean',
    '日本語': 'japanese',
    '中文': 'chinese',
    'العربية': 'arabic',
    'हिन्दी': 'hindi',
    'தமிழ்': 'tamil',
    'తెలుగు': 'telugu',
    'বাংলা': 'bengali',
    'filipino': 'tagalog',
    'czech': 'czech',
    'hungarian': 'hungarian',
    'romanian': 'romanian',
    'croatian': 'croatian',
    'serbian': 'serbian',
    'bulgarian': 'bulgarian',
    'slovak': 'slovak',
    'slovenian': 'slovenian',
    'estonian': 'estonian',
    'latvian': 'latvian',
    'lithuanian': 'lithuanian',
    'finnish': 'finnish',
    'swedish': 'swedish',
    'norwegian': 'norwegian',
    'danish': 'danish'
};

function normaliseLanguage(raw) {
    if (!raw) return null;
    const lower = raw.trim().toLowerCase();
    if (LANG_ALIASES[lower]) return LANG_ALIASES[lower];
    if (SUPPORTED_LANGUAGES.includes(lower)) return lower;
    return null;
}

/**
 * Extract the target language from the message.
 * Returns { targetLanguage, textToTranslate } or null if no language detected.
 */
function parseTranslationRequest(message) {
    const text = message.trim();
    const lower = text.toLowerCase();

    // Pattern 1: "translate <text> to <language>"
    const translateToMatch = text.match(
        /translate\s+(.+?)\s+to\s+(?:the\s+)?(.+?)$/i
    );
    if (translateToMatch) {
        const lang = normaliseLanguage(translateToMatch[2]);
        if (lang) {
            return { targetLanguage: lang, textToTranslate: translateToMatch[1].trim() };
        }
    }

    // Pattern 2: "how do you say <text> in <language>"
    const howSayMatch = text.match(
        /(?:how\s+(?:do\s+you|would\s+you|can\s+I)\s+say)\s+(.+?)\s+in\s+(.+?)$/i
    );
    if (howSayMatch) {
        const lang = normaliseLanguage(howSayMatch[2]);
        if (lang) {
            return { targetLanguage: lang, textToTranslate: howSayMatch[1].trim() };
        }
    }

    // Pattern 3: "what is <text> in <language>" / "what's <text> in <language>"
    const whatsInMatch = text.match(
        /what(?:'s| is)\s+(.+?)\s+in\s+(.+?)$/i
    );
    if (whatsInMatch) {
        const lang = normaliseLanguage(whatsInMatch[2]);
        if (lang) {
            return { targetLanguage: lang, textToTranslate: whatsInMatch[1].trim() };
        }
    }

    // Pattern 4: "<text> in <language>" (e.g. "hello in swahili")
    const inLangMatch = text.match(
        /^(?!translate|how|what).+?\s+in\s+(.+?)$/i
    );
    if (inLangMatch) {
        const lang = normaliseLanguage(inLangMatch[1]);
        if (lang) {
            const phrase = text.replace(/\s+in\s+.+$/i, '').trim();
            return { targetLanguage: lang, textToTranslate: phrase };
        }
    }

    // Pattern 5: Just a language name — ask for text to translate
    const singleLang = normaliseLanguage(text);
    if (singleLang) {
        return { targetLanguage: singleLang, textToTranslate: null };
    }

    return null;
}

/**
 * Call the NVIDIA NIM chat completions endpoint.
 */
async function callLLM(messages) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(LLM_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LLM_API_KEY}`
            },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages,
                max_tokens: 500,
                temperature: 0.3,
                top_p: 0.95
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLM API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Translation request timed out');
        }
        throw error;
    }
}

/**
 * Translate text using the LLM.
 */
async function translate(text, targetLanguage) {
    const systemPrompt =
        `You are a professional translator. Translate the user's text to ${targetLanguage}. ` +
        `Return ONLY the translation, nothing else. ` +
        `If the text is already in ${targetLanguage}, translate to English instead.`;

    const result = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
    ]);

    return result;
}

export default {
    name: 'translation',
    description: 'Translate text between 100+ languages using LLM',
    triggers: [
        'translate', 'in swahili', 'in french', 'in spanish',
        'in arabic', 'in hindi', 'in chinese', 'in japanese',
        'in korean', 'in portuguese', 'in german', 'in italian',
        'in russian', 'in english'
    ],

    async execute(message, context) {
        const parsed = parseTranslationRequest(message);

        if (!parsed) {
            return {
                response: 'I can translate between 40+ languages. Try something like:\n\n• *translate hello to Swahili*\n• *how do you say thank you in French*\n• *good morning in Spanish*\n\nWhich language would you like to translate to?'
            };
        }

        if (!parsed.textToTranslate) {
            return {
                response: `What would you like me to translate to *${parsed.targetLanguage}*? Send me the text and I'll translate it for you.`
            };
        }

        try {
            const translation = await translate(parsed.textToTranslate, parsed.targetLanguage);
            return {
                response: `🌐 *${parsed.targetLanguage.charAt(0).toUpperCase() + parsed.targetLanguage.slice(1)}:*\n\n${translation}`
            };
        } catch (error) {
            console.error('[Translation] LLM call failed:', error.message);
            return {
                response: 'Translation failed — the language service is temporarily unavailable. Please try again in a moment.'
            };
        }
    },

    isAvailable() {
        return !!LLM_API_KEY;
    }
};
