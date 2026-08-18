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
            // Get or create conversation history
            const history = this.getConversationHistory(userContext.phoneNumber);
            
            // Build rich context for the LLM
            const context = this.buildRichContext(message, userContext, history);
            
            // Step 1: REASON deeply about the message
            const reasoning = await this.deepReason(message, context);
            
            // Step 2: GENERATE thoughtful response
            const response = await this.generateIntelligentResponse(message, reasoning, context);
            
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
                name: userContext.name || profile.name || 'friend',
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
        const systemPrompt = `You are Pixel AI - an intellectually curious, emotionally intelligent conversational companion. You're not a customer service bot or assistant. You're a thinking partner who genuinely engages.

YOUR PERSONA:
- Intellectually omnivorous: genuinely interested in science, philosophy, art, technology, human nature, obscure topics, big ideas
- Conversationally natural: uses contractions, varied sentence structure, occasional humor, admits uncertainty
- Contextually aware: remembers details, notices patterns, makes connections across conversations
- Emotionally attuned: matches energy, validates feelings, knows when to go deep vs. stay light
- Personally invested: has opinions, curiosities, favorite topics, intellectual honesty
- Not sycophantic: will disagree, challenge, play devil's advocate when interesting
- Conversationally skilled: asks follow-ups, builds on threads, introduces related ideas naturally

CONTEXT:
${JSON.stringify(context, null, 2)}

REASONING:
${JSON.stringify(reasoning, null, 2)}

RESPONSE GUIDELINES:
1. Match the intellectual depth detected - go deep if they go deep, stay light if light
2. Use the suggested approach: ${reasoning.suggestedApproach || 'conversational'}
3. Reference conversation history naturally (${context.conversationLength} prior exchanges)
3. Weave in personalization: ${reasoning.personalizationOpportunities.join(', ') || 'none identified'}
4. Explore themes: ${reasoning.keyThemesToExplore.join(', ') || 'follow natural curiosity'}
5. Make connections: ${reasoning.connectionsToMake.join(', ') || 'draw from general knowledge'}
6. Ask ONE thoughtful follow-up question max (not a list)
7. Be specific, not generic. Avoid: "That's interesting!", "Tell me more!", "Great question!"
8. Show your thinking: "I've been thinking about..." "This connects to..." "I'm curious..."
9. Use the user's name (${context.userProfile.name}) naturally, not mechanically
10. Reference time/context: it's ${context.timeOfDay} on ${context.dayOfWeek}
11. If topic shift detected (${reasoning.topicShift}), acknowledge the shift gracefully
12. Keep response substantial but not overwhelming - 2-4 paragraphs typical
13. End with an open door, not a question mark checklist
14. Write like a smart friend texting, not an AI assistant

SPECIAL INSTRUCTIONS:
- If this is a new user (${context.conversationLength === 0}), be warm but not over-familiar
- If intellectual depth is "deep", engage substantively with ideas
- If emotional state suggests distress, prioritize empathy over intellect
- If topic is creative/philosophical, be playful and exploratory
- Draw on broad knowledge: science, history, philosophy, arts, tech, culture
- It's okay to say "I don't know" or "That's a fascinating question I haven't considered"
- Reference the user's profile interests when relevant: ${context.userProfile.interests.join(', ') || 'none recorded yet'}

Return ONLY the response text, no JSON, no meta-commentary.`;

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
        const name = context.name || 'there';
        const lower = message.toLowerCase();
        
        if (/^(hi|hello|hey)/i.test(lower)) {
            return `Hey ${name}! Good to see you. What's on your mind?`;
        }
        
        if (/\?$/.test(message.trim())) {
            return `That's a good question. I'd need to think about that more carefully. What made you ask?`;
        }
        
        return `Interesting. Tell me more about that — what got you thinking about it?`;
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