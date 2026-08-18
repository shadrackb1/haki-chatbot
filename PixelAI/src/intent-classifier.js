class IntentClassifier {
    constructor() {
        this.intentPatterns = {
            greeting: [
                /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)/i
            ],
            help: [
                /^(help|what can you do|how do i use you|commands)/i
            ],
            question: [
                /^(what|why|how|when|where|who|which|can you explain|tell me about|do you know)/i
            ],
            request: [
                /^(please|can you|could you|i need you to|i want you to|help me|do this)/i
            ],
            sharing: [
                /^(i think|i feel|i believe|in my opinion|btw|by the way|just so you know)/i
            ],
            venting: [
                /^(i'm so frustrated|i'm tired of|this is annoying|i hate|i can't stand|ugh)/i
            ],
            planning: [
                /^(let's plan|i'm planning|we should|how about we|i want to start|my goal is)/i
            ],
            joke: [
                /^(tell me a joke|make me laugh|something funny|joke|pun)/i
            ],
            philosophical: [
                /^(what is the meaning|do you think|is it possible that|why do we|the nature of)/i
            ],
            creative: [
                /^(write me a|create a story|poem|compose|make up|imagine a)/i
            ],
            code: [
                /^(write code|implement|function|class|debug|refactor|program|script|api|endpoint)/i
            ],
            math: [
                /^(calculate|math|solve|equation|convert|compute|what's \d|how much is)/i
            ],
            translation: [
                /^(translate|in swahili|in french|in spanish|in german|in chinese|in japanese|in arabic)/i
            ],
            weather: [
                /^(weather|forecast|temperature|is it raining|how hot|how cold)/i
            ],
            reminder: [
                /^(remind me|set reminder|don't let me forget|remember to|schedule a reminder)/i
            ],
            search: [
                /^(search for|look up|google|find me|research|look into)/i
            ],
            image: [
                /^(generate image|create picture|draw|make an image|design a|create a visual)/i
            ],
            voice: [
                /^(play audio|read aloud|voice message|send voice|audio message)/i
            ],
            document: [
                /^(summarize|tldr|tl;dr|from my docs|summarize this document|extract|key points)/i
            ],
            admin_command: [
                /^(admin|configure|settings|change config|update settings|system)/i
            ],
            profile_query: [
                /^(who are you|tell me about yourself|what do you do|bio|about you|your background)/i
            ],
            schedule: [
                /^(schedule|calendar|available|free|busy|meeting|appointment|when are you)/i
            ],
            contact: [
                /^(contact|reach|email|phone|call|get in touch)/i
            ],
            status: [
                /^(how are you|how's it going|what's up|status|how are you doing)/i
            ],
            learning: [
                /^(remember|learn|next time|prefer|please|could you|would you)/i
            ],
            escalation: [
                /^(urgent|emergency|important|asap|right now|immediately)/i
            ],
            location: [
                /^(near me|nearby|directions|how do i get to|where is|map|location)/i
            ],
        };

        this.validIntents = [
            'greeting', 'help', 'question', 'request', 'sharing', 'venting',
            'planning', 'joke', 'philosophical', 'creative', 'code', 'math',
            'translation', 'weather', 'reminder', 'search', 'image', 'voice',
            'document', 'admin_command', 'profile_query', 'schedule', 'contact',
            'status', 'learning', 'escalation', 'location', 'general_chat'
        ];

        this.llmClassificationPrompt = `Classify this message into one intent category. Return ONLY the category name.
Categories: greeting, help, question, request, sharing, venting, planning,
joke, philosophical, creative, code, math, translation, weather, reminder,
search, image, voice, document, admin_command, profile_query, schedule,
contact, status, learning, escalation, general_chat`;
    }

    classify(message) {
        const lower = message.toLowerCase().trim();

        for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(lower)) {
                    return intent;
                }
            }
        }

        return 'general_chat';
    }

    async classifyWithLLM(message, llmEngine) {
        if (!llmEngine || typeof llmEngine.chat !== 'function') {
            return this.classify(message);
        }

        try {
            const response = await llmEngine.chat({
                system: this.llmClassificationPrompt,
                message: message,
                maxTokens: 30
            });

            const intent = response.trim().toLowerCase().replace(/[^a-z_]/g, '');

            if (this.validIntents.includes(intent)) {
                return intent;
            }

            for (const valid of this.validIntents) {
                if (intent.includes(valid) || valid.includes(intent)) {
                    return valid;
                }
            }

            return this.classify(message);
        } catch {
            return this.classify(message);
        }
    }

    classifyWithConfidence(message) {
        const lower = message.toLowerCase().trim();

        for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(lower)) {
                    return { intent, confidence: 'high' };
                }
            }
        }

        const partialMatch = this._partialMatch(lower);
        if (partialMatch) {
            return { intent: partialMatch, confidence: 'medium' };
        }

        return { intent: 'general_chat', confidence: 'low' };
    }

    async classifyWithConfidenceAndLLM(message, llmEngine) {
        const lower = message.toLowerCase().trim();

        for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(lower)) {
                    return { intent, confidence: 'high' };
                }
            }
        }

        if (llmEngine && typeof llmEngine.chat === 'function') {
            try {
                const response = await llmEngine.chat({
                    system: this.llmClassificationPrompt,
                    message: message,
                    maxTokens: 30
                });

                const intent = response.trim().toLowerCase().replace(/[^a-z_]/g, '');

                if (this.validIntents.includes(intent)) {
                    return { intent, confidence: 'medium' };
                }

                for (const valid of this.validIntents) {
                    if (intent.includes(valid) || valid.includes(intent)) {
                        return { intent: valid, confidence: 'medium' };
                    }
                }
            } catch {
                // fall through to default
            }
        }

        return { intent: 'general_chat', confidence: 'low' };
    }

    _partialMatch(lower) {
        const keywords = {
            greeting: ['hi', 'hello', 'hey'],
            help: ['help', 'commands'],
            question: ['what', 'why', 'how', 'when', 'where', 'who'],
            request: ['please', 'help me'],
            code: ['code', 'program', 'debug', 'function'],
            math: ['calculate', 'math', 'solve', 'equation'],
            translation: ['translate'],
            weather: ['weather', 'forecast'],
            reminder: ['remind', 'reminder'],
            search: ['search', 'look up', 'google'],
            image: ['image', 'picture', 'draw'],
            document: ['summarize', 'tldr'],
            location: ['nearby', 'near me', 'directions']
        };

        for (const [intent, triggers] of Object.entries(keywords)) {
            for (const trigger of triggers) {
                if (lower.includes(trigger)) {
                    return intent;
                }
            }
        }

        return null;
    }

    getAllIntents() {
        return Object.keys(this.intentPatterns);
    }

    addIntentPattern(intent, pattern) {
        if (!this.intentPatterns[intent]) {
            this.intentPatterns[intent] = [];
        }
        this.intentPatterns[intent].push(pattern);
    }

    removeIntentPattern(intent, patternIndex) {
        if (this.intentPatterns[intent] && this.intentPatterns[intent][patternIndex]) {
            this.intentPatterns[intent].splice(patternIndex, 1);
        }
    }
}

export default IntentClassifier;
