/**
 * Voice Transcription Skill — Transcribe voice messages to text via Whisper APIs.
 *
 * Triggered by the media-handler when a user sends a voice message.
 * Transcribes audio using OpenAI Whisper or Groq Whisper, then passes
 * the transcribed text to the LLM for a contextual response.
 *
 * Requires: OPENAI_API_KEY or GROQ_API_KEY environment variable
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

const LLM_API_URL = process.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'meta/llama-3.1-8b-instruct';

/**
 * Transcribe audio using the OpenAI Whisper API.
 * Accepts OGG/Opus (WhatsApp format) and other common audio formats.
 */
async function transcribeWithOpenAI(audioBuffer, filename) {
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), filename);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'text');

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`OpenAI transcription error ${response.status}: ${errorBody}`);
    }

    return (await response.text()).trim();
}

/**
 * Transcribe audio using the Groq Whisper API.
 * Groq supports the same OpenAI-compatible audio transcription endpoint.
 */
async function transcribeWithGroq(audioBuffer, filename) {
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), filename);
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'text');

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`Groq transcription error ${response.status}: ${errorBody}`);
    }

    return (await response.text()).trim();
}

/**
 * Transcribe audio using the best available provider.
 * Priority: OpenAI > Groq.
 */
async function transcribe(audioBuffer) {
    const filename = `voice-message-${Date.now()}.ogg`;

    if (process.env.OPENAI_API_KEY) {
        return transcribeWithOpenAI(audioBuffer, filename);
    }

    if (process.env.GROQ_API_KEY) {
        return transcribeWithGroq(audioBuffer, filename);
    }

    return null;
}

/**
 * Send transcribed text to the LLM for a contextual response.
 */
async function getLLMResponse(transcribedText) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(LLM_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LLM_API_KEY}`,
            },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a helpful WhatsApp assistant. The user sent a voice message that was transcribed. ' +
                            'Respond naturally to what they said. Keep responses concise and conversational. ' +
                            'If the transcription seems incomplete or unclear, respond to what you understood and ask for clarification if needed.',
                    },
                    { role: 'user', content: transcribedText },
                ],
                max_tokens: 500,
                temperature: 0.7,
                top_p: 0.9,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLM API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('LLM request timed out');
        }
        throw error;
    }
}

export default {
    name: 'voice-transcribe',
    description: 'Transcribe voice messages to text and respond',
    triggers: [],

    async execute(message, context) {
        const audioBuffer = context?.audioBuffer;

        if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
            return {
                response: '🎤 Please send a voice message to transcribe.',
            };
        }

        const transcription = await transcribe(audioBuffer);

        if (!transcription) {
            return {
                response:
                    '🎤 Voice transcription requires an API key. Please add one of the following to your .env file:\n\n' +
                    '• `OPENAI_API_KEY` — for OpenAI Whisper\n' +
                    '• `GROQ_API_KEY` — for Groq Whisper (free tier available)',
            };
        }

        if (!transcription.trim()) {
            return {
                response: '🎤 The voice message was empty or could not be understood. Please try recording again.',
                metadata: { transcription: '' },
            };
        }

        try {
            const llmResponse = await getLLMResponse(transcription);

            const responseText = llmResponse
                ? `\u{1F3A4} *Transcribed:* ${transcription}\n\n${llmResponse}`
                : `\u{1F3A4} *Transcribed:* ${transcription}`;

            return {
                response: responseText,
                metadata: { transcription },
            };
        } catch (error) {
            console.error('[voice-transcribe] LLM call failed:', error.message);

            return {
                response: `\u{1F3A4} *Transcribed:* ${transcription}\n\n_I couldn't generate a response, but here's what you said._`,
                metadata: { transcription },
            };
        }
    },

    isAvailable() {
        return !!(process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
    },
};
