/**
 * Summarizer Skill — condense text, URLs, and documents into concise summaries.
 *
 * Detects URLs and fetches page content via cheerio, then calls the
 * NVIDIA NIM chat completions endpoint to produce WhatsApp-friendly summaries.
 */

import * as cheerio from 'cheerio';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LLM_API_URL = process.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'meta/llama-3.1-8b-instruct';

const FETCH_TIMEOUT_MS = 15000;
const LLM_TIMEOUT_MS = 30000;
const SHORT_TEXT_THRESHOLD = 200;
const MAX_URL_CONTENT_CHARS = 12000;

const SYSTEM_PROMPT_BASE =
    'Summarize the following text concisely. Keep the key points, main arguments, and important details. Format for WhatsApp readability (use bullet points for lists).';

const SYSTEM_PROMPT_BRIEF = SYSTEM_PROMPT_BASE + ' Keep the summary to 2-3 sentences.';
const SYSTEM_PROMPT_DETAILED = SYSTEM_PROMPT_BASE + ' Provide a detailed summary with sections and bullet points.';

const URL_REGEX = /https?:\/\/[^\s]+/i;

// ---------------------------------------------------------------------------
// LLM caller
// ---------------------------------------------------------------------------

async function callLLM(messages, maxTokens = 600, temperature = 0.3) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
        const response = await fetch(LLM_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LLM_API_KEY}`,
            },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages,
                max_tokens: maxTokens,
                temperature,
                top_p: 0.95,
            }),
            signal: controller.signal,
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
            throw new Error('Summarization request timed out');
        }
        throw error;
    }
}

// ---------------------------------------------------------------------------
// URL content extraction
// ---------------------------------------------------------------------------

async function fetchUrlContent(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: controller.signal,
            redirect: 'follow',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Remove non-content elements
        $('script, style, nav, header, footer, aside, iframe, noscript').remove();

        // Try <article> first, fall back to <body>
        let text = $('article').text() || $('main').text() || $('body').text();

        // Collapse whitespace
        text = text.replace(/\s+/g, ' ').trim();

        // Truncate to max chars to stay within LLM context limits
        if (text.length > MAX_URL_CONTENT_CHARS) {
            text = text.slice(0, MAX_URL_CONTENT_CHARS);
        }

        return text;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('URL fetch timed out');
        }
        throw error;
    }
}

// ---------------------------------------------------------------------------
// Input detection helpers
// ---------------------------------------------------------------------------

function extractUrl(message) {
    const match = message.match(URL_REGEX);
    return match ? match[0] : null;
}

/**
 * Detect the preferred summary length from the message.
 * Returns 'brief', 'detailed', or null (default balanced).
 */
function detectLengthPreference(message) {
    const lower = message.toLowerCase();
    if (/\b(brief|short|quick|tldr?|short version|quick version|gist)\b/.test(lower)) {
        return 'brief';
    }
    if (/\b(detailed|full|comprehensive|in depth|in-depth|thorough|long)\b/.test(lower)) {
        return 'detailed';
    }
    return null;
}

/**
 * Strip trigger words and length modifiers from the message to get the
 * raw content to summarise.
 */
function stripTriggers(message) {
    return message
        .replace(/\b(summarize|summarise|summary|tldr?|short version|brief|gist|condense|quick version|sum up)\b/gi, '')
        .replace(/\b(please|can you|could you|would you)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// ---------------------------------------------------------------------------
// Main skill export
// ---------------------------------------------------------------------------

export default {
    name: 'summarizer',
    description: 'Summarize text, URLs, and documents into concise summaries',
    triggers: [
        'summarize', 'summary', 'tldr', 'short version', 'brief', 'gist',
        'condense', 'quick version', 'sum up',
    ],

    /**
     * @param {string} message — incoming WhatsApp message text
     * @param {object} context — chat context
     * @returns {Promise<{ response: string, metadata?: object }>}
     */
    async execute(message, context) {
        const raw = (message || '').trim();
        if (!raw) {
            return { response: 'Please send me some text or a URL to summarize.' };
        }

        if (!LLM_API_KEY) {
            return { response: 'Summarization is temporarily unavailable (missing API key).' };
        }

        const lengthPreference = detectLengthPreference(raw);
        const systemPrompt = lengthPreference === 'brief'
            ? SYSTEM_PROMPT_BRIEF
            : lengthPreference === 'detailed'
                ? SYSTEM_PROMPT_DETAILED
                : SYSTEM_PROMPT_BASE;

        // --- 1. URL detected → fetch and summarize ---
        const url = extractUrl(raw);
        if (url) {
            try {
                const pageContent = await fetchUrlContent(url);
                if (!pageContent || pageContent.length < 20) {
                    return { response: `I couldn't extract meaningful content from that URL. The page may require JavaScript or be behind a login.` };
                }

                const summary = await callLLM([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: pageContent },
                ]);

                return {
                    response: `📝 *Summary:*\n\n${summary}`,
                    metadata: { type: 'url', url, lengthPreference },
                };
            } catch (error) {
                console.error('[Summarizer] URL fetch/summarize failed:', error.message);
                return { response: `I couldn't fetch or summarize that URL. Please check the link and try again.` };
            }
        }

        // --- 2. Long text (200+ chars) → summarize directly ---
        const cleaned = stripTriggers(raw);
        if (cleaned.length >= SHORT_TEXT_THRESHOLD) {
            try {
                const summary = await callLLM([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: cleaned },
                ]);

                return {
                    response: `📝 *Summary:*\n\n${summary}`,
                    metadata: { type: 'text', inputLength: cleaned.length, lengthPreference },
                };
            } catch (error) {
                console.error('[Summarizer] LLM call failed:', error.message);
                return { response: 'Summarization failed — the service is temporarily unavailable. Please try again in a moment.' };
            }
        }

        // --- 3. Short text → ask for context or do a best-effort summary ---
        if (cleaned.length > 0) {
            try {
                const summary = await callLLM([
                    {
                        role: 'system',
                        content:
                            'The user sent a short piece of text to summarize. Summarize it as best you can with the available context. If more context is needed, mention that briefly after the summary.',
                    },
                    { role: 'user', content: cleaned },
                ]);

                return {
                    response: `📝 *Summary:*\n\n${summary}`,
                    metadata: { type: 'short-text', inputLength: cleaned.length, lengthPreference },
                };
            } catch (error) {
                console.error('[Summarizer] LLM call failed:', error.message);
                return { response: 'Summarization failed — the service is temporarily unavailable. Please try again in a moment.' };
            }
        }

        // --- 4. Nothing useful in the message ---
        return { response: 'Please send me some text or a URL to summarize.' };
    },

    isAvailable() {
        return !!LLM_API_KEY;
    },
};
