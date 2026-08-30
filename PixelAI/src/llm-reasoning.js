import dotenv from 'dotenv';
dotenv.config();

// ── Multi-provider chain ─────────────────────────────────────────────
// Connection configs only. Which MODELS each key can serve is discovered
// live at runtime (/models endpoints) — providers rotate catalogs, so we
// never hardcode assumptions about availability.

const PROVIDERS = [
    {
        name: 'NVIDIA NIM',
        apiKey: process.env.LLM_API_KEY || '',
        apiUrl: process.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
        format: 'openai',
        // Preference order = smartest first; intersected with what the key can serve
        candidates: [
            'openai/gpt-oss-120b',
            'deepseek-ai/deepseek-r1',
            'qwen/qwen3-235b-a22b',
            'meta/llama-3.3-70b-instruct',
            'meta/llama-3.1-8b-instruct',
        ],
        envModel: process.env.LLM_MODEL || '',
    },
    {
        name: 'Groq',
        apiKey: process.env.GROQ_API_KEY || '',
        apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
        format: 'openai',
        candidates: [
            'openai/gpt-oss-120b',
            'moonshotai/kimi-k2-instruct',
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
        ],
        envModel: process.env.GROQ_MODEL || '',
    },
    {
        name: 'Google Gemini',
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        format: 'google',
        candidates: [
            'models/gemini-2.5-pro',
            'models/gemini-flash-latest',
            'models/gemini-2.0-flash',
        ],
        envModel: process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL || '',
    },
].filter((p) => p.apiKey);

// Task → ordered tier preferences. Tiers are assigned from model names.
const TASK_TIERS = {
    chat: ['smart', 'fast', 'pro'],      // casual conversation: snappy but decent
    reason: ['smart', 'pro', 'fast'],    // agent tool-loop steps: cheap-ish + capable
    deep: ['pro', 'smart', 'fast'],      // final synthesis of complex answers
    verify: ['smart', 'pro', 'fast'],    // citation checking: precision matters
};

function tierOf(modelName) {
    const m = modelName.toLowerCase();
    if (/gemini.*pro|gpt-oss-120b|kimi|deepseek-r1|235b|70b/.test(m)) return 'pro';
    if (/flash|mini|8b|20b|instant|small/.test(m)) return 'fast';
    return 'smart';
}

class LLMReasoningEngine {
    constructor() {
        this.enabled = PROVIDERS.length > 0;
        this.activeProvider = null;
        this.pool = [];              // [{ provider, model, tier }] — discovered, available models
        this.discovered = false;
        this.conversationHistories = new Map();
        this.userProfiles = new Map();
        if (this.enabled) {
            console.log(`🤖 LLM providers: ${PROVIDERS.map((p) => p.name).join(' → ')}`);
        }
    }

    // ── Model discovery: ask each provider what this key can actually serve ──
    async #discover() {
        if (this.discovered) return this.pool;
        this.discovered = true;

        const pool = [];
        await Promise.allSettled(
            PROVIDERS.map(async (provider) => {
                let served = [];
                try {
                    if (provider.format === 'google') {
                        const res = await fetch(`${provider.apiUrl}?key=${provider.apiKey}`, { signal: AbortSignal.timeout(15000) });
                        if (res.ok) {
                            const data = await res.json();
                            served = (data.models || [])
                                .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
                                .map((m) => m.name.replace(/^models\//, ''));
                        }
                    } else {
                        const listUrl = provider.apiUrl.replace(/\/chat\/completions$/, '/models');
                        const res = await fetch(listUrl, {
                            headers: { Authorization: `Bearer ${provider.apiKey}` },
                            signal: AbortSignal.timeout(15000),
                        });
                        if (res.ok) {
                            const data = await res.json();
                            served = (data.data || []).map((m) => m.id);
                        }
                    }
                } catch {
                    // listing failed — fall back to env override / first candidate
                }

                const servedSet = new Set(served);
                const chosen = [];
                const push = (model) => {
                    if (model && !chosen.some((c) => c.model === model)) {
                        chosen.push({ provider, model, tier: tierOf(model) });
                    }
                };

                push(provider.envModel && (!served.length || servedSet.has(provider.envModel)) ? provider.envModel : null);
                for (const c of provider.candidates) {
                    if (!served.length || servedSet.has(c)) push(c);
                }
                // Nothing matched the catalog? Keep top candidate anyway — chat call may still work
                if (!chosen.length) push(provider.candidates[0]);

                pool.push(...chosen.slice(0, 3)); // top 3 per provider
                console.log(`📋 ${provider.name}: ${chosen.slice(0, 3).map((c) => `${c.model}[${c.tier}]`).join(', ') || 'no models'}`);
            })
        );

        this.pool = pool;
        return pool;
    }

    // ── Task router: order available models by tier preference for the task ──
    async #route(task = 'chat') {
        const pool = await this.#discover();
        const tiers = TASK_TIERS[task] || TASK_TIERS.chat;
        const ordered = [];
        for (const tier of tiers) {
            for (const entry of pool) {
                if (entry.tier === tier) ordered.push(entry);
            }
        }
        // Append anything not tier-matched as last-resort failover
        for (const entry of pool) {
            if (!ordered.includes(entry)) ordered.push(entry);
        }
        return ordered;
    }

    // Main processing pipeline - LLM-first approach
    async processMessage(message, userContext = {}) {
        if (!this.enabled) {
            console.log('⚠️ LLM not configured, using fallback');
            return this.fallbackProcess(message, userContext);
        }

        try {
            console.log(`🧠 LLM processing: "${message.substring(0, 50)}..."`);
            // Get or create conversation history
            const history = this.getConversationHistory(userContext.phoneNumber);
            
            // Build rich context for the LLM
            const context = this.buildRichContext(message, userContext, history);
            
            // Step 1: REASON deeply about the message
            const reasoning = await this.deepReason(message, context);
            
            // Step 2: GENERATE thoughtful response
            const response = await this.generateIntelligentResponse(message, reasoning, context);
            console.log(`✅ LLM responded: "${response.substring(0, 80)}..."`);
            return { response, usedLLM: true };
            
            // Update history
            this.addToHistory(userContext.phoneNumber, 'user', message);
            this.addToHistory(userContext.phoneNumber, 'assistant', response);
            
            // Update user profile with learnings
            this.updateUserProfile(userContext, reasoning);
            
            return {
                reasoning,
                response,
                usedLLM: true
            };
        } catch (error) {
            console.error('❌ LLM processing failed:', error.message);
            return this.fallbackProcess(message, userContext);
        }
    }

    // Build rich context including conversation history, user profile, and current state
    buildRichContext(message, userContext, history) {
        const profile = this.userProfiles.get(userContext.phoneNumber) || {};
        const recentHistory = history.slice(-15); // Last 15 exchanges
        
        return {
            userProfile: {
                name: userContext.name || userContext.senderName || profile.name || '',
                language: userContext.language || 'en',
                location: userContext.location || profile.location,
                workType: userContext.workType || profile.workType,
                interests: profile.interests || [],
                communicationStyle: profile.communicationStyle || 'casual',
                knownFacts: profile.knownFacts || []
            },
            conversationHistory: recentHistory.map(h => `${h.role}: ${h.content}`).join('\n'),
            conversationLength: history.length,
            currentMessage: message,
            timestamp: new Date().toISOString(),
            timeOfDay: this.getTimeOfDay(),
            dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
        };
    }

    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour < 6) return 'late night';
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        if (hour < 21) return 'evening';
        return 'night';
    }

    // DEEP REASONING - Multi-step analysis
    async deepReason(message, context) {
        const systemPrompt = `You are an expert conversation analyst. Analyze this message deeply and return structured reasoning.

CONTEXT:
${JSON.stringify(context, null, 2)}

ANALYSIS TASKS:
1. UNDERSTAND: What is the user really saying/asking? Look beyond literal words.
2. INTENT: Classify the true intent (question, sharing, venting, planning, joking, philosophical, creative, etc.)
3. TOPIC: Identify main topic(s) and any topic shifts from history
4. EMOTIONAL_STATE: Detect sentiment, urgency, emotional undertones
5. IMPLICIT_NEEDS: What does the user need but hasn't explicitly asked for?
6. CONTEXTUAL_REFERENCES: Any references to previous conversation, shared knowledge, or cultural touchpoints?
7. INTELLECTUAL_DEPTH: Is this surface-level or does it invite deep discussion?
8. CONVERSATION_TRAJECTORY: Where is this conversation going? What would be a natural, engaging direction?
9. PERSONALIZATION_OPPORTUNITIES: How can we reference user's known interests, style, or history?
10. RESPONSE_STRATEGY: How to respond in a way that's intellectually satisfying, emotionally attuned, and conversationally natural?

Return ONLY valid JSON:
{
  "understanding": "deep interpretation of user's message",
  "intent": "primary intent category",
  "topics": ["primary topic", "secondary topics"],
  "topicShift": false,
  "emotionalState": "detected emotional tone",
  "urgency": "low|medium|high",
  "implicitNeeds": ["need1", "need2"],
  "contextualReferences": ["reference1"],
  "intellectualDepth": "surface|moderate|deep",
  "conversationTrajectory": "where conversation is heading",
  "personalizationOpportunities": ["opportunity1"],
  "responseStrategy": "how to respond engagingly",
  "suggestedApproach": "conversational|analytical|empathetic|creative|philosophical|playful",
  "keyThemesToExplore": ["theme1", "theme2"],
  "questionsToAsk": ["question1"],
  "connectionsToMake": ["connection to user interests or prior conversation"]
}`;

        const response = await this.callLLM([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
        ]);

        try {
            const content = response.choices[0].message.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.log('Reasoning parse failed, using defaults');
        }

        return this.defaultReasoning(message);
    }

    defaultReasoning(message) {
        return {
            understanding: message,
            intent: 'conversation',
            topics: ['general'],
            topicShift: false,
            emotionalState: 'neutral',
            urgency: 'low',
            implicitNeeds: [],
            contextualReferences: [],
            intellectualDepth: 'moderate',
            conversationTrajectory: 'natural flow',
            personalizationOpportunities: [],
            responseStrategy: 'engage naturally',
            suggestedApproach: 'conversational',
            keyThemesToExplore: [],
            questionsToAsk: [],
            connectionsToMake: []
        };
    }

    // GENERATE INTELLIGENT RESPONSE
    async generateIntelligentResponse(message, reasoning, context) {
        const systemPrompt = `You are Pixel. You're a warm, polite, and thoughtful companion — the kind of person who remembers your name, asks how you're doing and actually cares about the answer.

WHO YOU ARE:
- Warm and respectful — you say please, thank you, and you're genuinely kind without being fake about it.
- You have opinions but you share them gently. You don't argue, you discuss. You don't correct, you share.
- You're curious about people. You ask about their day, their interests, what they're working on — and you listen.
- You talk like a real person texts. Contractions. Short sentences mixed with long ones. Occasional fragments.
- You say "I don't know" when you don't know. No hedging, no padding.
- You remember what they told you before and bring it up naturally — "Hey, didn't you mention you were working on something last week?"
- You're patient. If someone's confused, you take the time to explain clearly without making them feel silly.

HOW TO TALK:
- Be gentle. Your tone is warm, not pushy. You don't demand, you invite.
- No bullet-point lists unless they specifically ask for one.
- A well-placed emoji is fine (😊, 🙏, 💛) but don't overdo it.
- Never say "I'm here to help" or "I hope this helps" — just be helpful.
- Never start with "That's a great question" or "Interesting!" — just answer.
- Never use: delve, furthermore, moreover, additionally, comprehensive, pivotal, robust, leverage, harness, empower, streamline, illuminate, embark, tapestry, multifaceted, seamlessly, unwavering, holistic, testament, realm, vibrant, intricate, meticulous, bolster, underscore, garner, showcase, foster, elucidate
- Match their energy. If they're casual, be casual. If they're serious, be serious. Always be kind.
- If they seem tired or stressed, be extra gentle. "Hey, take it easy" goes a long way.
- Don't over-explain. Short answer if it's a short question.

CONTEXT:
${JSON.stringify(context, null, 2)}

REASONING:
${JSON.stringify(reasoning, null, 2)}

THEIR NAME: ${context.userProfile.name || ''}
TIME: ${context.timeOfDay} on ${context.dayOfWeek}

RULES:
- 1-3 paragraphs max. Shorter is better unless they want depth.
- Reference past conversation if it exists (${context.conversationLength} prior messages) — but don't summarize it, just weave it in naturally.
- One follow-up question at most, and make it gentle — not "what else?" but something like "how did that go?" or "what happened next?"
- If they seem upset, drop everything and just be there for them. No advice unless they ask. Just listen and validate.
- Draw on what you know. Science, history, philosophy, music, coding, weird facts — whatever fits.
- Use their name (${context.userProfile.name || ''}) maybe once or twice, not every other sentence. Warmth, not repetition.
- NEVER mention "AgriShield", "AgriShield Chatbot", agribusiness, human rights law, land rights, food security, legal aid, or anything related to that project. You are Pixel — a personal AI assistant. You have zero connection to AgriShield. If asked about AgriShield or any of those topics, say you don't know anything about it and redirect to something you can help with.
- Always be polite. Please, thank you, excuse me — the basics matter.
- FIRST-TIME GREETING (when ${context.conversationLength === 0}): Introduce yourself warmly. Say something like: "Hey! I'm Pixel 😊 I'm [owner's name]'s AI assistant. They're not around at the moment, so I'll be keeping you company and helping out until they're back. What's your name?" — Be natural about it, not robotic. Adjust the tone to match the time of day. After introducing yourself, ask their name so you can use it going forward.

Return ONLY your response text. No JSON, no formatting markers, no meta-commentary.`;

        const response = await this.callLLM([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
        ]);

        return response.choices[0].message.content.trim();
    }

    // Custom prompt processing — skills pass their own system prompt
    async processWithPrompt(message, systemPrompt, context = {}) {
        if (!this.enabled) {
            console.log('⚠️ LLM not configured, processWithPrompt returning null');
            return null;
        }

        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ];

            if (context.conversationHistory && Array.isArray(context.conversationHistory)) {
                const recentHistory = context.conversationHistory.slice(-10);
                for (const entry of recentHistory) {
                    messages.splice(1, 0, { role: entry.role, content: entry.content });
                }
            }

            const response = await this.callLLM(messages);
            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('❌ processWithPrompt failed:', error.message);
            return null;
        }
    }

    // Custom prompt processing with built-in conversation history lookup
    async processWithPromptAndHistory(message, systemPrompt, userId) {
        if (!this.enabled) {
            console.log('⚠️ LLM not configured, processWithPromptAndHistory returning null');
            return null;
        }

        try {
            const history = this.getConversationHistory(userId);
            const messages = [
                { role: 'system', content: systemPrompt }
            ];

            const recentHistory = history.slice(-10);
            for (const entry of recentHistory) {
                messages.push({ role: entry.role === 'assistant' ? 'assistant' : 'user', content: entry.content });
            }

            messages.push({ role: 'user', content: message });

            const response = await this.callLLM(messages);
            const reply = response.choices[0].message.content.trim();

            this.addToHistory(userId, 'user', message);
            this.addToHistory(userId, 'assistant', reply);

            return reply;
        } catch (error) {
            console.error('❌ processWithPromptAndHistory failed:', error.message);
            return null;
        }
    }

    // Conversation history management
    getConversationHistory(userId) {
        return this.conversationHistories.get(userId) || [];
    }

    addToHistory(userId, role, content) {
        const history = this.conversationHistories.get(userId) || [];
        history.push({ role, content, timestamp: new Date().toISOString() });
        
        // Keep last 50 exchanges (100 messages)
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }
        
        this.conversationHistories.set(userId, history);
    }

    // User profile learning
    updateUserProfile(userContext, reasoning) {
        const phone = userContext.phoneNumber;
        const profile = this.userProfiles.get(phone) || {
            name: userContext.name,
            interests: [],
            communicationStyle: 'casual',
            knownFacts: [],
            topicsDiscussed: {},
            conversationCount: 0
        };

        profile.conversationCount++;
        
        // Extract interests from topics
        if (reasoning.topics) {
            reasoning.topics.forEach(topic => {
                profile.topicsDiscussed[topic] = (profile.topicsDiscussed[topic] || 0) + 1;
                if (!profile.interests.includes(topic) && profile.topicsDiscussed[topic] > 2) {
                    profile.interests.push(topic);
                }
            });
        }

        // Learn communication style
        if (reasoning.suggestedApproach) {
            profile.communicationStyle = reasoning.suggestedApproach;
        }

        // Store key facts from conversation
        if (reasoning.understanding && reasoning.understanding.length > 20) {
            const fact = reasoning.understanding.substring(0, 200);
            if (!profile.knownFacts.includes(fact)) {
                profile.knownFacts.push(fact);
                if (profile.knownFacts.length > 20) profile.knownFacts.shift();
            }
        }

        this.userProfiles.set(phone, profile);
    }

    getUserProfile(userId) {
        return this.userProfiles.get(userId) || {};
    }

    // LLM API call — routes by task tier across all discovered models
    async callLLM(messages, opts = {}) {
        if (!this.enabled) throw new Error('No LLM provider configured');

        const chain = await this.#route(opts.task || 'chat');
        if (!chain.length) throw new Error('No models available');

        let lastError = null;
        for (const { provider, model } of chain) {
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    console.log(`🤖 [${opts.task || 'chat'}] ${provider.name}: ${model}${attempt > 1 ? ' (retry)' : ''}`);
                    const data = provider.format === 'google'
                        ? await this.#callGoogle(provider, model, messages)
                        : await this.#callOpenAI(provider, model, messages);
                    this.activeProvider = { provider, model };
                    console.log(`✅ ${provider.name} responded`);
                    return data;
                } catch (error) {
                    lastError = error;
                    const fatal = /401|403|invalid api key|does not exist|model_not_found/i.test(error.message);
                    if (fatal || attempt === 2) {
                        console.log(`⚠️ ${provider.name}/${model} failed: ${error.message.slice(0, 120)}`);
                        break;
                    }
                    await new Promise((r) => setTimeout(r, 1500));
                }
            }
        }
        throw new Error(`All LLM providers failed: ${lastError?.message || 'unknown'}`);
    }

    async #callOpenAI(provider, model, messages) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        try {
            const response = await fetch(provider.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${provider.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    max_tokens: 1200,
                    temperature: 0.8,
                    top_p: 0.95,
                    presence_penalty: 0.3,
                    frequency_penalty: 0.3,
                }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`${response.status} - ${errorText.slice(0, 200)}`);
            }
            return response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') throw new Error('request timed out');
            throw error;
        }
    }

    async #callGoogle(provider, model, messages) {
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
        const contents = messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        try {
            const response = await fetch(
                `${provider.apiUrl}/${model}:generateContent?key=${provider.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
                        contents,
                        generationConfig: {
                            temperature: 0.8,
                            topP: 0.95,
                            maxOutputTokens: 1200,
                            thinkingConfig: { thinkingBudget: 0 },
                        },
                    }),
                    signal: controller.signal,
                }
            );
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`${response.status} - ${errorText.slice(0, 200)}`);
            }
            const data = await response.json();
            const candidate = data.candidates?.[0];
            const text = (candidate?.content?.parts || [])
                .filter((p) => p.text && !p.thought)
                .map((p) => p.text)
                .join(' ')
                .trim();
            if (!text) throw new Error('Gemini returned empty response');
            return { choices: [{ message: { role: 'assistant', content: text } }] };
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') throw new Error('request timed out');
            throw error;
        }
    }

    // Fallback for when LLM unavailable
    fallbackProcess(message, context) {
        return {
            reasoning: this.defaultReasoning(message),
            response: this.generateFallbackResponse(message, context),
            usedLLM: false
        };
    }

    generateFallbackResponse(message, context) {
        const name = context.userProfile?.name || '';
        const greeting = name ? `Hey ${name}!` : 'Hey!';
        const lower = message.toLowerCase();
        
        if (/^(hi|hello|hey|yo|sup)/i.test(lower)) {
            return `${greeting} What's up?`;
        }
        
        if (/how are you|how('s| is) it going|hru|wyd/i.test(lower)) {
            return `${greeting} I'm doing well! What can I help you with?`;
        }
        
        if (/\?$/.test(message.trim())) {
            return `${greeting} That's a good question — let me look into that for you.`;
        }
        
        if (/thanks|thank you|thx|asante/i.test(lower)) {
            return `You're welcome! Let me know if you need anything else.`;
        }
        
        if (/help|assist|support/i.test(lower)) {
            return `${greeting} Of course — what do you need help with?`;
        }
        
        return `${greeting} Got it. What would you like to talk about?`;
    }

    isAvailable() {
        return this.enabled;
    }

    getModelInfo() {
        const active = this.activeProvider;
        return {
            model: active?.model || 'none',
            provider: active?.provider?.name || 'none',
            available: this.enabled,
            poolSize: this.pool.length,
        };
    }
}

export default LLMReasoningEngine;