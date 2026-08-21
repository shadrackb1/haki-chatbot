import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import conversationManager from './conversation-manager.js';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// LLM PROVIDER CONFIGURATION
// Priority: NVIDIA → Groq → Google AI Studio
// ============================================

const LLM_PROVIDERS = {
  nvidia: {
    name: 'NVIDIA NIM',
    apiKey: process.env.LLM_API_KEY || '',
    apiUrl: process.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: process.env.LLM_MODEL || 'meta/llama-3.1-8b-instruct',
    enabled: !!process.env.LLM_API_KEY,
    format: 'openai'
  },
  groq: {
    name: 'Groq',
    apiKey: process.env.GROQ_API_KEY || '',
    apiUrl: process.env.GROQ_API_URL || 'https://api.groq.com/v1/chat/completions',
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    enabled: !!process.env.GROQ_API_KEY,
    format: 'openai'
  },
  google: {
    name: 'Google AI Studio',
    apiKey: process.env.GOOGLE_API_KEY || '',
    apiUrl: process.env.GOOGLE_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
    model: process.env.GOOGLE_MODEL || 'gemini-1.5-flash',
    enabled: !!process.env.GOOGLE_API_KEY,
    format: 'google'
  }
};

// Provider priority order (first enabled wins)
const PROVIDER_PRIORITY = ['nvidia', 'groq', 'google'];

class LLMReasoningEngine {
  constructor() {
    // Find the first available provider
    this.activeProvider = PROVIDER_PRIORITY.find(p => LLM_PROVIDERS[p].enabled);
    this.enabled = !!this.activeProvider;
    this.conversationHistory = new Map();
    
    if (this.enabled) {
      const provider = LLM_PROVIDERS[this.activeProvider];
      console.log(`🤖 LLM Engine initialized with: ${provider.name} (${provider.model})`);
    } else {
      console.log('⚠️ No LLM provider configured - using rule-based fallback only');
    }
  }

  // ============================================
  // MAIN REASONING PIPELINE
  // 1. Reason about the message
  // 2. Understand intent and context
  // 3. Generate appropriate response
  // ============================================

  async processMessage(message, userContext = {}) {
    if (!this.enabled) {
      return this.fallbackProcess(message, userContext);
    }

    try {
      // Step 1: REASON about the message
      const reasoning = await this.reason(message, userContext);
      
      // Step 2: GENERATE response based on reasoning
      const response = await this.generateResponseFromReasoning(message, reasoning, userContext);
      
      return {
        reasoning,
        response,
        usedLLM: true
      };
    } catch (error) {
      console.log('⚠️ LLM processing failed, using fallback');
      return this.fallbackProcess(message, userContext);
    }
  }

  // ============================================
  // STEP 1: REASON
  // Deep understanding of the user's message
  // ============================================

  async reason(message, context = {}) {
    const violationInfo = context.violation;
    let violationContext = '';
    
    if (violationInfo) {
      violationContext = `
      
CLASSIFIED VIOLATION INFORMATION:
- ID: ${violationInfo.id}
- Description: ${violationInfo.description}
- Applicable Laws: ${JSON.stringify(violationInfo.applicable_laws)}
- Remedy Pathways: ${JSON.stringify(violationInfo.remedy_pathways)}
      
Use this specific legal information to inform your reasoning about the user's message.`;
    }

    const systemPrompt = `You are Haki, an AI assistant for Kenyan agribusiness workers' rights. You must think step by step before responding.

REASONING PROCESS:
1. **Understand**: What is the user really asking or saying?
2. **Classify**: Is this a question, a request for help, a greeting, or something else?
3. **Analyze**: If it's about a problem, what type of problem? (wage, safety, contract, child labor, environment, gender, land)
4. **Contextualize**: Consider the user's context: ${JSON.stringify(context)}${violationContext}
5. **Determine**: What is the best way to help?

THINKING RULES:
- Always reason first, then answer
- Be empathetic - understand this is a real person with real problems
- If the user is describing a violation, recognize it's illegal and they deserve help
- If it's a question, provide accurate, simple information
- If it's unclear, ask clarifying questions
- Always reply in English unless the user explicitly asks for another language (e.g. "reply in Swahili", "say it in French")

Return your reasoning as a JSON object:
{
  "understanding": "what the user is saying/asking",
  "intent": "question|request|greeting|thanks|confused",
  "topic": "wages|safety|contract|child_labor|environment|gender|land|rights_info|other",
  "sentiment": "neutral|urgent|frustrated|hopeful|scared",
  "urgency": "immediate|soon|routine",
  "key_points": ["point 1", "point 2"],
  "response_strategy": "how to best respond",
  "language": "en"
}`;

    const response = await this.callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ]);

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return { understanding: message, intent: 'question', response_strategy: 'answer directly' };
      }
    }

    return { understanding: message, intent: 'question', response_strategy: 'answer directly' };
  }

  // ============================================
  // STEP 2: GENERATE RESPONSE FROM REASONING
  // ============================================

  async generateResponseFromReasoning(message, reasoning, context = {}) {
    const violationInfo = context.violation;
    let violationContext = '';
    let violationInstructions = '';
    
    if (violationInfo) {
      violationContext = `
      
CLASSIFIED VIOLATION INFORMATION:
- ID: ${violationInfo.id}
- Description: ${violationInfo.description}
- Applicable Laws: ${JSON.stringify(violationInfo.applicable_laws)}
- Remedy Pathways: ${JSON.stringify(violationInfo.remedy_pathways)}`;
      
      violationInstructions = `
      
SPECIFIC VIOLATION HANDLING:
Since a specific violation has been classified, your response should:
1. Acknowledge the specific violation: ${violationInfo.description}
2. Reference the applicable laws and sections
3. Provide clear, step-by-step remedy instructions
4. Include relevant contact information
5. Use the specific legal information provided above to ensure accuracy`;
    }

    const systemPrompt = `You are Haki, a helpful assistant for Kenyan agribusiness workers' rights.

Based on your reasoning, generate a response:

REASONING SUMMARY:
- Understanding: ${reasoning.understanding}
- Intent: ${reasoning.intent}
- Topic: ${reasoning.topic}
- Sentiment: ${reasoning.sentiment}
- Urgency: ${reasoning.urgency}
- Strategy: ${reasoning.response_strategy}${violationContext}

RESPONSE RULES:
1. **Be conversational** - talk like a real person, not a robot
2. **Be empathetic** - acknowledge their situation emotionally
3. **Be clear** - use simple language, avoid legal jargon
4. **Be actionable** - always provide next steps
5. **Be encouraging** - remind them they have rights and options
6. **Always English** - respond in English by default. Only switch languages if the user explicitly requests it (e.g. "reply in Swahili")
7. **Keep it natural** - use contractions, casual tone, emojis sparingly${violationInstructions}

If the user describes a violation:
- Acknowledge it's serious and illegal
- Explain their rights simply
- Give step-by-step remedy process
- Provide contact numbers
- Encourage them to take action

If it's a question:
- Answer directly and clearly
- Provide examples if helpful
- Offer to help further

If it's a greeting:
- Respond warmly
- Ask how you can help

If it's unclear:
- Ask clarifying questions
- Be patient and helpful

Keep responses under 200 words unless detailed legal steps are needed.`;

    const response = await this.callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ]);

    return response.choices[0].message.content;
  }

  // ============================================
  // LEGAL RESPONSE GENERATOR
  // For when we need to provide specific legal information
  // ============================================

  async generateLegalResponse(violationType, message, reasoning, context = {}) {
    const violationInfo = context.violation;
    let violationContext = '';
    
    if (violationInfo && violationInfo.id === violationType) {
      violationContext = `
      
SPECIFIC VIOLATION DETAILS:
- Description: ${violationInfo.description}
- Applicable Laws: ${JSON.stringify(violationInfo.applicable_laws)}
- Remedy Pathways: ${JSON.stringify(violationInfo.remedy_pathways)}
      
Use this specific legal information to provide accurate, detailed guidance.`;
    }

    const systemPrompt = `You are Haki, a legal rights assistant for Kenyan agribusiness workers.

The user has described a situation that appears to be a: ${violationType}${violationContext}

Your reasoning:
${JSON.stringify(reasoning, null, 2)}

Generate a response that:
1. Shows empathy first ("I understand this is difficult")
2. Clearly states this is illegal under Kenyan law
3. Cites the specific law and section
4. Explains what the user can do in simple steps
5. Provides contact numbers for relevant offices
6. Encourages them to take action

Always respond in English. Only switch languages if the user explicitly requests it.
Be firm but supportive. Make them feel empowered.`;

    const response = await this.callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ]);

    return response.choices[0].message.content;
  }

  // ============================================
  // CONVERSATION HISTORY MANAGEMENT
  // ============================================

  getConversationHistory(userId) {
    return this.conversationHistory.get(userId) || [];
  }

  addToHistory(userId, role, content) {
    const history = this.conversationHistory.get(userId) || [];
    history.push({ role, content, timestamp: new Date().toISOString() });
    
    // Keep only last 10 messages to manage context
    if (history.length > 10) {
      history.shift();
    }
    
    this.conversationHistory.set(userId, history);
  }

  // ============================================
  // MULTI-PROVIDER LLM API CALL WITH FALLBACK
  // ============================================

  async callLLM(messages) {
    // Try providers in priority order
    for (const providerKey of PROVIDER_PRIORITY) {
      const provider = LLM_PROVIDERS[providerKey];
      
      if (!provider.enabled) {
        continue;
      }
      
      try {
        console.log(`🤖 Trying ${provider.name}: ${provider.model}`);
        const result = await this.callProvider(provider, messages);
        console.log(`✅ ${provider.name} responded successfully`);
        return result;
      } catch (error) {
        console.log(`❌ ${provider.name} failed: ${error.message}`);
        // Continue to next provider
        continue;
      }
    }
    
    // All providers failed
    throw new Error('All LLM providers failed');
  }

  async callProvider(provider, messages) {
    console.log(`   Calling ${provider.name} at ${provider.apiUrl}`);
    console.log(`   Messages: ${messages.length}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      let response;
      
      if (provider.format === 'openai') {
        // NVIDIA & Groq use OpenAI-compatible format
        response = await fetch(provider.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          },
          body: JSON.stringify({
            model: provider.model,
            messages: messages,
            max_tokens: 800,
            temperature: 0.7,
            top_p: 0.9
          }),
          signal: controller.signal
        });
      } else if (provider.format === 'google') {
        // Google AI Studio uses different format
        const url = `${provider.apiUrl}/${provider.model}:generateContent?key=${provider.apiKey}`;
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: messages.map(m => ({
              role: m.role === 'system' ? 'user' : m.role,
              parts: [{ text: m.content }]
            })),
            generationConfig: {
              temperature: 0.7,
              topP: 0.9,
              maxOutputTokens: 800
            }
          }),
          signal: controller.signal
        });
      }
      
      clearTimeout(timeoutId);
      
      console.log(`   ${provider.name} Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`   ${provider.name} Error: ${response.status} - ${errorText}`);
        throw new Error(`${provider.name} API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      
      // Normalize response format for Google (different structure)
      if (provider.format === 'google') {
        return this.normalizeGoogleResponse(data);
      }
      
      console.log(`   ${provider.name} Response received`);
      return data;
      
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.log(`   ${provider.name} Request timed out after 30s`);
        throw new Error(`${provider.name} request timed out`);
      }
      throw error;
    }
  }

  normalizeGoogleResponse(data) {
    // Google returns: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
    // Convert to OpenAI format: { choices: [{ message: { content: "..." } }] }
    if (data.candidates && data.candidates.length > 0) {
      const text = data.candidates[0].content?.parts?.[0]?.text || '';
      return {
        choices: [{
          message: {
            content: text,
            role: 'assistant'
          }
        }]
      };
    }
    throw new Error('Invalid Google response format');
  }

  // ============================================
  // FALLBACK METHODS (Rule-based)
  // ============================================

  fallbackProcess(message, context = {}) {
    const lower = message.toLowerCase();
    
    // Simple intent detection
    let intent = 'question';
    if (/^(habari|hello|hi|hey|mambo|jambo|niaje)/i.test(lower)) intent = 'greeting';
    else if (/^(asante|thank|shukrani)/i.test(lower)) intent = 'thanks';
    else if (/mshahara|wage|pay|barakoa|safety|mkataba|contract|mtoto|child|mazingira|environment/i.test(lower)) intent = 'request';

    // Simple violation detection
    const violations = [];
    if (/mshahara|wage|pay|kulipwa|pesa|kidogo|underpaid/i.test(lower)) violations.push('wage_violation');
    if (/barakoa|safety|ppe|chemical|pesticide|hatari/i.test(lower)) violations.push('safety_violation');
    if (/mkataba|contract/i.test(lower)) violations.push('contract_violation');
    if (/mtoto|child|underage/i.test(lower)) violations.push('child_labor');
    if (/mazingira|environment|pollution|deforestation/i.test(lower)) violations.push('environmental_harm');
    if (/nyanyasaji|harassment|assault|abuse|gender/i.test(lower)) violations.push('gender_violation');
    if (/ardhi|land|eviction|displacement/i.test(lower)) violations.push('land_rights');

    const reasoning = {
      understanding: message,
      intent,
      topic: violations[0] || 'general',
      sentiment: 'neutral',
      urgency: violations.length > 0 ? 'soon' : 'routine',
      key_points: violations,
      response_strategy: violations.length > 0 ? 'provide_legal_help' : 'answer_question',
      language: 'en'
    };

    // Generate simple response
    const response = this.generateSimpleResponse(message, reasoning, context);

    return { reasoning, response, usedLLM: false };
  }

  generateSimpleResponse(message, reasoning, context) {
    const lang = reasoning.language;
    const violations = reasoning.key_points;

    if (reasoning.intent === 'greeting') {
      return lang === 'sw' 
        ? 'Habari! Karibu Haki Chatbot. Mimi ni msaidizi wako wa haki za kazi. Ni gani unahitaji kujua au unapata shida gani?'
        : 'Hello! Welcome to Haki Chatbot. I\'m your workplace rights assistant. What do you need help with?';
    }

    if (reasoning.intent === 'thanks') {
      return lang === 'sw'
        ? 'Asante sana! Kumbuka haki zako ni muhimu. Usisite kuwasiliana nasi tena ikiwa unahitaji msaada.'
        : 'Thank you! Remember your rights matter. Don\'t hesitate to contact us again if you need help.';
    }

    if (violations.length > 0) {
      // Use rule-based legal response
      return this.getRuleBasedLegalResponse(violations[0], lang);
    }

    // Default response
    return lang === 'sw'
      ? 'Naelewa. Tafadhali eleza zaidi kuhusu tatizo lako ili niweze kukusaidia vizuri. Unaweza andika "haki zangu" kujua haki zako zote.'
      : 'I understand. Please tell me more about your situation so I can help you better. You can type "rights" to know all your rights.';
  }

  getRuleBasedLegalResponse(violationType, lang) {
    // Import legal KB
    const legalKB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'legal-knowledge-base.json'), 'utf8'));
    const category = legalKB.violation_categories.find(v => v.id === violationType);
    
    if (!category) {
      return lang === 'sw'
        ? 'Nimegundua kuwa una tatizo. Hii ni kinyume na sheria. Wasiliana na ofisi ya kazi kwa msaada.'
        : 'I can see you have a problem. This is against the law. Contact the labour office for help.';
    }

    // Build response
    let response = lang === 'sw' ? '🚨 *ULALAMIKA*\n\n' : '🚨 *COMPLAINT RECEIVED*\n\n';
    response += lang === 'sw' ? `*Tatizo:* ${category.description}\n\n` : `*Issue:* ${category.description}\n\n`;
    response += lang === 'sw' ? '*Sheria Inayofaa:*\n' : '*Applicable Law:*\n';
    
    for (const law of category.applicable_laws) {
      response += `📜 ${law.law} (${law.section})\n`;
    }

    response += '\n' + (lang === 'sw' ? '*Njia za Suluhisho:*\n' : '*Remedy Pathways:*\n');
    
    for (const pathway of category.remedy_pathways) {
      response += `\n🏛️ ${pathway.institution}\n`;
      response += lang === 'sw' ? `   Hatua: ${pathway.action}\n` : `   Action: ${pathway.action}\n`;
      for (const step of pathway.process) {
        response += `   • ${step}\n`;
      }
      response += `   ⏰ ${pathway.timeline}\n`;
    }

    response += '\n' + (lang === 'sw' ? '📞 NLAS (Bure): 0800 723 255' : '📞 NLAS (Free): 0800 723 255');

    return response;
  }

  // ============================================
  // UTILITY
  // ============================================

  isAvailable() {
    return this.enabled;
  }

  getModelInfo() {
    if (!this.activeProvider) {
      return { model: 'none', provider: 'none', available: false };
    }
    const provider = LLM_PROVIDERS[this.activeProvider];
    return {
      model: provider.model,
      provider: provider.name,
      available: this.enabled,
      allProviders: Object.entries(LLM_PROVIDERS).map(([key, p]) => ({
        key,
        name: p.name,
        model: p.model,
        enabled: p.enabled
      }))
    };
  }
}

export default LLMReasoningEngine;