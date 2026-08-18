const WHISPER_OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const API_TIMEOUT_MS = 30000;

const SUPPORTED_MIME_TYPES = new Set([
    'audio/ogg',
    'audio/ogg; codecs=opus',
    'audio/opus',
    'audio/wav',
    'audio/webm',
    'audio/mpeg',
    'audio/mp3',
    'audio/m4a',
    'audio/x-m4a',
    'audio/mp4',
]);

class VoiceHandler {
    constructor(config = {}) {
        this.openaiKey = config.whisperApiKey || process.env.OPENAI_API_KEY || '';
        this.groqKey = config.groqApiKey || process.env.GROQ_API_KEY || '';
    }

    async processVoice(audioBuffer, context = {}) {
        if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
            throw new VoiceError('Audio buffer is empty or invalid');
        }

        const mimeType = context.mimeType || this.guessMimeType(audioBuffer);
        if (mimeType && !this.isValidAudioFormat(mimeType)) {
            throw new VoiceError(`Unsupported audio format: ${mimeType}`);
        }

        if (audioBuffer.length < 200) {
            throw new VoiceError('Audio data is too small to be a valid voice message');
        }

        if (!this.isAvailable()) {
            throw new VoiceError(
                'No transcription API configured. Set OPENAI_API_KEY or GROQ_API_KEY in your environment.'
            );
        }

        let lastError = null;
        const providers = this.getTranscriptionOrder();

        for (const provider of providers) {
            try {
                const start = Date.now();
                let transcription;

                if (provider === 'whisper') {
                    transcription = await this.transcribeWithWhisper(audioBuffer);
                } else {
                    transcription = await this.transcribeWithGroq(audioBuffer);
                }

                if (!transcription || !transcription.trim()) {
                    throw new VoiceError(`${provider} returned empty transcription`);
                }

                const elapsed = Date.now() - start;
                console.log(`🎤 Transcribed with ${provider} in ${elapsed}ms`);

                return {
                    transcription: transcription.trim(),
                    provider,
                    confidence: provider === 'whisper' ? 0.95 : 0.90,
                    duration: elapsed,
                };
            } catch (error) {
                lastError = error;
                if (error instanceof VoiceError && error.code === 'UNSUPPORTED_FORMAT') {
                    throw error;
                }
                if (error instanceof VoiceError && error.code === 'RATE_LIMITED') {
                    console.warn(`⚠️ ${provider} rate limited, trying next provider...`);
                    continue;
                }
                if (error instanceof VoiceError && error.code === 'AUTH_FAILED') {
                    console.warn(`⚠️ ${provider} auth failed, trying next provider...`);
                    continue;
                }
                console.error(`❌ ${provider} transcription failed: ${error.message}`);
                continue;
            }
        }

        throw lastError || new VoiceError('All transcription providers failed');
    }

    async transcribeWithWhisper(audioBuffer) {
        if (!this.openaiKey) {
            throw new VoiceError('OpenAI API key not configured', 'AUTH_FAILED');
        }

        const filename = `voice-${Date.now()}.ogg`;
        const form = new FormData();
        form.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), filename);
        form.append('model', 'whisper-1');
        form.append('response_format', 'text');

        return this.fetchTranscription(WHISPER_OPENAI_URL, this.openaiKey, form, 'OpenAI Whisper');
    }

    async transcribeWithGroq(audioBuffer) {
        if (!this.groqKey) {
            throw new VoiceError('Groq API key not configured', 'AUTH_FAILED');
        }

        const filename = `voice-${Date.now()}.ogg`;
        const form = new FormData();
        form.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), filename);
        form.append('model', 'whisper-large-v3');
        form.append('response_format', 'text');

        return this.fetchTranscription(WHISPER_GROQ_URL, this.groqKey, form, 'Groq Whisper');
    }

    async detectLanguage(audioBuffer) {
        if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
            throw new VoiceError('Audio buffer is empty or invalid');
        }

        if (!this.isAvailable()) {
            throw new VoiceError('No transcription API configured for language detection');
        }

        const providers = this.getTranscriptionOrder();

        for (const provider of providers) {
            try {
                const url = provider === 'whisper' ? WHISPER_OPENAI_URL : WHISPER_GROQ_URL;
                const key = provider === 'whisper' ? this.openaiKey : this.groqKey;
                const model = provider === 'whisper' ? 'whisper-1' : 'whisper-large-v3';

                if (!key) continue;

                const filename = `lang-detect-${Date.now()}.ogg`;
                const form = new FormData();
                form.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), filename);
                form.append('model', model);
                form.append('response_format', 'verbose_json');

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${key}` },
                        body: form,
                        signal: controller.signal,
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorBody = await response.text().catch(() => '');
                        throw this.parseApiError(response.status, errorBody, provider);
                    }

                    const data = await response.json();
                    return {
                        language: data.language || 'unknown',
                        languageProbability: data.language_probability || null,
                        duration: data.duration || null,
                        provider,
                    };
                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            } catch (error) {
                if (error instanceof VoiceError) throw error;
                console.error(`❌ ${provider} language detection failed: ${error.message}`);
                continue;
            }
        }

        throw new VoiceError('Language detection failed on all providers');
    }

    isAvailable() {
        return !!(this.openaiKey || this.groqKey);
    }

    getProviderStatus() {
        return {
            whisper: { configured: !!this.openaiKey, name: 'OpenAI Whisper' },
            groq: { configured: !!this.groqKey, name: 'Groq Whisper' },
        };
    }

    // --- internal helpers ---

    getTranscriptionOrder() {
        const order = [];
        if (this.openaiKey) order.push('whisper');
        if (this.groqKey) order.push('groq');
        return order;
    }

    async fetchTranscription(url, apiKey, formData, label) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}` },
                body: formData,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                throw this.parseApiError(response.status, errorBody, label);
            }

            const text = await response.text();
            return text.trim();
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof VoiceError) throw error;

            if (error.name === 'AbortError') {
                throw new VoiceError(`${label} request timed out after ${API_TIMEOUT_MS / 1000}s`, 'TIMEOUT');
            }

            throw new VoiceError(`${label} request failed: ${error.message}`, 'NETWORK_ERROR');
        }
    }

    parseApiError(status, body, label) {
        if (status === 401 || status === 403) {
            return new VoiceError(`${label} authentication failed (HTTP ${status})`, 'AUTH_FAILED');
        }
        if (status === 429) {
            return new VoiceError(`${label} rate limited (HTTP 429)`, 'RATE_LIMITED');
        }
        if (status === 413) {
            return new VoiceError(`${label}: audio file too large (HTTP 413)`, 'FILE_TOO_LARGE');
        }

        let message = `${label} API error (HTTP ${status})`;
        try {
            const parsed = JSON.parse(body);
            if (parsed.error?.message) {
                message = `${label}: ${parsed.error.message}`;
            }
        } catch {
            if (body) {
                message = `${label} API error (HTTP ${status}): ${body.substring(0, 200)}`;
            }
        }

        const code = status >= 500 ? 'SERVER_ERROR' : 'API_ERROR';
        return new VoiceError(message, code);
    }

    guessMimeType(buffer) {
        if (buffer.length < 4) return null;

        if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
            return 'audio/ogg';
        }
        if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
            return 'audio/mpeg';
        }
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
            return 'audio/wav';
        }

        return null;
    }

    isValidAudioFormat(mimeType) {
        return SUPPORTED_MIME_TYPES.has(mimeType);
    }
}

class VoiceError extends Error {
    constructor(message, code = 'UNKNOWN') {
        super(message);
        this.name = 'VoiceError';
        this.code = code;
    }
}

export { VoiceHandler, VoiceError };
export default VoiceHandler;
