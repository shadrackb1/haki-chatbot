const MEDIA_TYPES = ['imageMessage', 'audioMessage', 'videoMessage', 'documentMessage', 'stickerMessage'];
const LOCATION_TYPE = 'locationMessage';
const COMMAND_PATTERN = /^[!/](\w+)\s*(.*)$/s;

class MessageRouter {
    constructor(skillRegistry, llmEngine, rateLimiter, analytics) {
        this.skillRegistry = skillRegistry;
        this.llmEngine = llmEngine;
        this.rateLimiter = rateLimiter;
        this.analytics = analytics;
        this.adminHandlers = new Map();
        this.mediaHandlers = new Map();
        this.routingHistory = [];
    }

    async route(message, context = {}) {
        const startTime = Date.now();
        const { chatId = null, senderId = null } = context;

        if (this.rateLimiter) {
            const rateKey = senderId || chatId || 'unknown';
                const allowed = await this.rateLimiter.checkLimit(rateKey);
            if (!allowed) {
                this.recordAnalytics({
                    decision: 'rate_limited',
                    source: 'rate_limiter',
                    chatId,
                    senderId,
                    duration: Date.now() - startTime
                });
                throw new RateLimitError('Rate limit exceeded. Please try again later.');
            }
        }

        if (this.isMediaMessage(message)) {
            return this.handleMedia(message, context, startTime);
        }

        if (this.isCommand(message)) {
            return this.handleCommand(message, context, startTime);
        }

        try {
            // getSkillForMessage returns matches sorted by trigger specificity
            const matches = await this.skillRegistry.getSkillForMessage(message);
            const skill = Array.isArray(matches) ? matches[0] : matches;
            if (skill && typeof skill.execute === 'function') {
                const result = await skill.execute(message, context);
                this.recordAnalytics({
                    decision: 'skill',
                    source: 'skill',
                    skillName: skill.name || skill.constructor?.name || 'unknown',
                    chatId,
                    senderId,
                    duration: Date.now() - startTime
                });
                return {
                    response: typeof result === 'string' ? result : result?.response ?? null,
                    file: result?.file ?? null,
                    source: 'skill',
                    skillName: skill.name || skill.constructor?.name,
                    metadata: { duration: Date.now() - startTime }
                };
            }
        } catch (skillError) {
            console.error('Skill execution failed, falling back to LLM:', skillError.message);
            this.recordAnalytics({
                decision: 'skill_failed_fallback',
                source: 'skill',
                error: skillError.message,
                chatId,
                senderId,
                duration: Date.now() - startTime
            });
        }

        return this.handleLLM(message, context, startTime, 'llm');
    }

    isMediaMessage(message) {
        if (!message) return false;

        if (message.message) {
            for (const type of MEDIA_TYPES) {
                if (message.message[type]) return true;
            }
            if (message.message[LOCATION_TYPE]) return true;
            if (message.message?.viewOnceMessageV2?.message) {
                const inner = message.message.viewOnceMessageV2.message;
                for (const type of MEDIA_TYPES) {
                    if (inner[type]) return true;
                }
            }
        }

        return false;
    }

    getMediaType(message) {
        if (!message?.message) return null;

        for (const type of MEDIA_TYPES) {
            if (message.message[type]) return type.replace('Message', '');
        }
        if (message.message[LOCATION_TYPE]) return 'location';

        if (message.message?.viewOnceMessageV2?.message) {
            const inner = message.message.viewOnceMessageV2.message;
            for (const type of MEDIA_TYPES) {
                if (inner[type]) return type.replace('Message', '');
            }
        }

        return null;
    }

    isCommand(message) {
        const text = this.extractText(message);
        if (!text) return false;
        return COMMAND_PATTERN.test(text.trim());
    }

    parseCommand(message) {
        const text = this.extractText(message);
        if (!text) return { command: null, args: [], raw: '' };

        const match = text.trim().match(COMMAND_PATTERN);
        if (!match) return { command: null, args: [], raw: text.trim() };

        const command = match[1].toLowerCase();
        const argsString = match[2].trim();
        const args = argsString ? argsString.split(/\s+/) : [];

        return { command, args, raw: text.trim() };
    }

    extractText(message) {
        if (typeof message === 'string') return message;
        if (!message) return null;

        return message.message?.conversation
            || message.message?.extendedTextMessage?.text
            || null;
    }

    async handleMedia(message, context, startTime) {
        const mediaType = this.getMediaType(message);
        const handler = this.mediaHandlers.get(mediaType);

        if (handler) {
            try {
                const response = await handler(message, context);
                this.recordAnalytics({
                    decision: 'media_handled',
                    source: 'media',
                    mediaType,
                    chatId: context.chatId,
                    senderId: context.senderId,
                    duration: Date.now() - startTime
                });
                return {
                    response,
                    source: 'media',
                    metadata: { mediaType, duration: Date.now() - startTime }
                };
            } catch (error) {
                console.error(`Media handler for '${mediaType}' failed:`, error.message);
            }
        }

        const mediaResponses = {
            image: 'I received an image. I can analyze visual content — what would you like to know about it?',
            audio: 'I received a voice message. Let me process that for you.',
            video: 'I received a video. Unfortunately I can\'t play videos yet, but I can help if you describe what you need.',
            document: 'I received a document. Let me know if you\'d like me to summarize or analyze it.',
            sticker: '',
            location: 'I see you shared a location. How can I help with that?'
        };

        const fallback = mediaResponses[mediaType] || `I received a ${mediaType || 'media'} message.`;

        this.recordAnalytics({
            decision: 'media_fallback',
            source: 'media',
            mediaType,
            chatId: context.chatId,
            senderId: context.senderId,
            duration: Date.now() - startTime
        });

        return {
            response: fallback,
            source: 'media',
            metadata: { mediaType, duration: Date.now() - startTime }
        };
    }

    async handleCommand(message, context, startTime) {
        const { command, args } = this.parseCommand(message);

        const handler = this.adminHandlers.get(command);
        if (handler) {
            try {
                const response = await handler({ command, args, message, context });
                this.recordAnalytics({
                    decision: 'admin_command',
                    source: 'admin',
                    command,
                    argCount: args.length,
                    chatId: context.chatId,
                    senderId: context.senderId,
                    duration: Date.now() - startTime
                });
                return {
                    response,
                    source: 'admin',
                    metadata: { command, args, duration: Date.now() - startTime }
                };
            } catch (error) {
                console.error(`Admin handler for '!${command}' failed:`, error.message);
                this.recordAnalytics({
                    decision: 'admin_command_failed',
                    source: 'admin',
                    command,
                    error: error.message,
                    chatId: context.chatId,
                    senderId: context.senderId,
                    duration: Date.now() - startTime
                });
                return {
                    response: `Command \`!${command}\` encountered an error. Please try again.`,
                    source: 'admin',
                    metadata: { command, error: error.message, duration: Date.now() - startTime }
                };
            }
        }

        return this.handleLLM(message, context, startTime, 'admin');
    }

    async handleLLM(message, context, startTime, source = 'llm') {
        try {
            const result = await this.llmEngine.processMessage(message, context);
            const response = typeof result === 'string' ? result : result?.response || result?.text || '';

            this.recordAnalytics({
                decision: 'llm',
                source: 'llm',
                chatId: context.chatId,
                senderId: context.senderId,
                usedLLM: result?.usedLLM ?? true,
                duration: Date.now() - startTime
            });

            return {
                response,
                source: 'llm',
                metadata: { duration: Date.now() - startTime, usedLLM: result?.usedLLM }
            };
        } catch (error) {
            console.error('LLM processing failed:', error.message);
            this.recordAnalytics({
                decision: 'llm_failed',
                source: 'llm',
                error: error.message,
                chatId: context.chatId,
                senderId: context.senderId,
                duration: Date.now() - startTime
            });
            return {
                response: "I'm having trouble processing that right now. Could you try rephrasing?",
                source: 'llm',
                metadata: { duration: Date.now() - startTime, error: error.message }
            };
        }
    }

    registerAdminHandler(command, handler) {
        const name = command.toLowerCase().replace(/^[/!]/, '');
        this.adminHandlers.set(name, handler);
        return this;
    }

    removeAdminHandler(command) {
        return this.adminHandlers.delete(command.toLowerCase().replace(/^[/!]/, ''));
    }

    registerMediaHandler(mediaType, handler) {
        this.mediaHandlers.set(mediaType, handler);
        return this;
    }

    removeMediaHandler(mediaType) {
        return this.mediaHandlers.delete(mediaType);
    }

    recordAnalytics(data) {
        const record = {
            timestamp: new Date().toISOString(),
            ...data
        };

        this.routingHistory.push(record);
        if (this.routingHistory.length > 500) {
            this.routingHistory.shift();
        }

        if (this.analytics && typeof this.analytics.record === 'function') {
            this.analytics.record('routing_decision', record);
        }
    }

    getRoutingHistory(limit = 50) {
        return this.routingHistory.slice(-limit).reverse();
    }

    getRoutingStats() {
        const stats = { skill: 0, llm: 0, admin: 0, media: 0, rate_limited: 0, errors: 0 };
        for (const entry of this.routingHistory) {
            const source = entry.source;
            if (source in stats) {
                stats[source]++;
            }
            if (entry.decision?.includes('failed')) {
                stats.errors++;
            }
        }
        stats.total = this.routingHistory.length;
        return stats;
    }

    clearHistory() {
        this.routingHistory = [];
    }
}

class RateLimitError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RateLimitError';
    }
}

export default MessageRouter;
export { RateLimitError };
