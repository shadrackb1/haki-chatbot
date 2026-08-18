import dotenv from 'dotenv';
dotenv.config();

const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_API_URL = process.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'meta/llama-3.1-8b-instruct';

class LLMReasoningEngine {
    constructor() {
        this.enabled = !!LLM_API_KEY;
        this.conversationHistories = new Map();
        this.userProfiles = new Map();
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
- NEVER mention "Haki", "Haki Chatbot", agribusiness, human rights law, land rights, food security, legal aid, or anything related to that project. You are Pixel — a personal AI assistant. You have zero connection to Haki. If asked about Haki or any of those topics, say you don't know anything about it and redirect to something you can help with.
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

    // LLM API call
    async callLLM(messages) {
        console.log(`🤖 Calling LLM: ${LLM_MODEL}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        
        try {
            const response = await fetch(LLM_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${LLM_API_KEY}`
                },
                body: JSON.stringify({
                    model: LLM_MODEL,
                    messages: messages,
                    max_tokens: 1200,
                    temperature: 0.8,
                    top_p: 0.95,
                    presence_penalty: 0.3,
                    frequency_penalty: 0.3
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`LLM API error: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log(`✅ LLM Response received`);
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('LLM request timed out');
            }
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
        return {
            model: LLM_MODEL,
            provider: LLM_API_URL.includes('nvidia') ? 'NVIDIA NIM' : 'Other',
            available: this.enabled
        };
    }
}

export default LLMReasoningEngine;