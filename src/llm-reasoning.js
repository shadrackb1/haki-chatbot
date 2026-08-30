import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import LLMRouter from './llm-router.js';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load legal knowledge base once (used by the rule-based fallback)
const legalKB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'legal-knowledge-base.json'), 'utf8'));

// ============================================
// LLM PROVIDER CONFIGURATION
// All configured keys stay active. Routing (llm-router.js) rotates across them.
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
    apiUrl: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    enabled: !!process.env.GROQ_API_KEY,
    format: 'openai'
  },
  google: {
    name: 'Google AI Studio',
    apiKey: process.env.GOOGLE_API_KEY || '',
    apiUrl: process.env.GOOGLE_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
    model: process.env.GOOGLE_MODEL || 'gemini-flash-latest',
    enabled: !!process.env.GOOGLE_API_KEY,
    format: 'google'
  }
};

class LLMReasoningEngine {
  constructor() {
    // Build a provider pool from every configured key. The router rotates
    // across ALL active providers (round-robin by default) with retry,
    // failure-weighting and cascade — no key sits unused.
    this.router = new LLMRouter(
      Object.entries(LLM_PROVIDERS).map(([key, p]) => ({
        key,
        name: p.name,
        model: p.model,
        enabled: p.enabled
      }))
    );
    this.enabled = this.router.any();
    this._lastProvider = null;

    if (this.enabled) {
      const active = this.router.enabled();
      console.log(`🤖 LLM Engine unlocked (${this.router.mode}): ${active.map(p => `${p.name} [${p.model}]`).join(' · ')}`);
    } else {
      console.log('⚠️ No LLM provider configured - using rule-based fallback only');
    }
  }

  getActiveProviders() {
    return this.router.enabled().map(p => ({ key: p.key, name: p.name, model: p.model }));
  }

  getRouterSnapshot() {
    return this.router.snapshot();
  }

  // ============================================
  // MAIN REASONING PIPELINE
  // 1. Reason about the message
  // 2. Understand intent and context
  // 3. Generate appropriate response
  // ============================================

  async processMessage(message, userContext = {}) {
    if (!this.enabled) {
      console.log('⚠️ No LLM available — using rule-based fallback');
      return this.fallbackProcess(message, userContext);
    }

    // Resolve the routing order ONCE per message so "reason" and "generate
    // response" use the same provider. context.llm = { provider, mode } lets a
    // caller force a specific provider or mode for any single message.
    const llmOpts = userContext.llm && typeof userContext.llm === 'object' ? userContext.llm : {};
    const order = this.router.order(llmOpts.provider, llmOpts.mode);

    try {
      const reasoning = await this.reason(message, userContext, order);
      const response = await this.generateResponseFromReasoning(message, reasoning, userContext, order);
      const provider = this._lastProvider;
      this._lastProvider = null;
      return { reasoning, response, usedLLM: true, provider };
    } catch (error) {
      this._lastProvider = null;
      console.log(`⚠️ LLM pipeline failed (${error.message}) — falling back to rules`);
      return this.fallbackProcess(message, userContext);
    }
  }

  // ============================================
  // STEP 1: REASON
  // Deep understanding of the user's message
  // ============================================

  // Models treat the reasoning schema loosely: they drop keys, return
  // pipe-chained values ("wages|contract") or answer in prose. Normalize
  // everything into the shape the rest of the pipeline expects.
  normalizeReasoning(raw = {}, fallbackUnderstanding = '') {
    if (!raw || typeof raw !== 'object') raw = {};
    const firstValue = (v, fallback) => {
      if (typeof v !== 'string' || !v.trim()) return fallback;
      return v.split('|')[0].trim().toLowerCase();
    };
    return {
      understanding: typeof raw.understanding === 'string' && raw.understanding.trim()
        ? raw.understanding
        : fallbackUnderstanding,
      intent: firstValue(raw.intent, 'question'),
      topic: firstValue(raw.topic, 'other'),
      sentiment: firstValue(raw.sentiment, 'neutral'),
      urgency: firstValue(raw.urgency, 'routine'),
      key_points: Array.isArray(raw.key_points)
        ? raw.key_points.filter(p => typeof p === 'string')
        : [],
      response_strategy: typeof raw.response_strategy === 'string' && raw.response_strategy.trim()
        ? raw.response_strategy
        : 'answer directly',
      language: firstValue(raw.language, 'en')
    };
  }

  // Build the LLM message array: system prompt, recent conversation turns,
  // then the new user message. Keeps multi-turn context without unbounded tokens.
  buildMessages(systemPrompt, message, context = {}) {
    const history = Array.isArray(context.history) ? context.history.slice(-6) : [];
    const turns = history
      .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
      .map((h) => ({ role: h.role, content: h.content }));
    return [
      { role: 'system', content: systemPrompt },
      ...turns,
      { role: 'user', content: message }
    ];
  }

  async reason(message, context = {}, order = null) {
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

    const knowledgePassages = Array.isArray(context.knowledge) && context.knowledge.length > 0
      ? context.knowledge
          .map((k) => `- [${k.id || k.title}] ${k.text}`)
          .join('\n')
      : 'None retrieved.';

    const userProfile = JSON.stringify({
      language: context.language,
      location: context.location,
      workType: context.workType,
      conversationCount: context.conversationCount
    });

    const systemPrompt = `You are Haki, a WhatsApp rights-assistant for Kenyan agribusiness and farm workers. You protect workplace rights under Kenyan law: wages, contracts, working conditions, safety, child labour, harassment, environmental harm and land issues. You must think step by step before responding.

REASONING PROCESS:
1. **Understand**: What is the user really asking or saying?
2. **Classify**: Is this a question, a request for help, a greeting, or something else?
3. **Analyze**: If it's about a problem, what type of problem? (wage, safety, contract, child labor, environment, gender, land)
4. **Contextualize**: Consider the user's profile: ${userProfile}. Earlier conversation turns are included above — use them for follow-ups, pronouns like "it/that", and references to past messages.${violationContext}
5. **Determine**: What is the best way to help?

RECALLED LEGAL PASSAGES (ground your analysis in these):
${knowledgePassages}

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

    const { response, provider } = await this.callLLM(this.buildMessages(systemPrompt, message, context), { order });
    this._lastProvider = provider;

    const content = response.choices[0].message.content;

    // Strip markdown fences before hunting for the JSON object
    const cleaned = content.replace(/```(?:json)?/gi, '');
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        return this.normalizeReasoning(JSON.parse(jsonMatch[0]), message);
      } catch (err) {
        console.log(`⚠️ Reasoning JSON unparseable (${err.message}). Raw: ${content.slice(0, 300)}`);
      }
    } else {
      console.log(`⚠️ Reasoning returned no JSON. Raw: ${content.slice(0, 300)}`);
    }

    // Prose fallback: LLM answered in free text instead of JSON.
    // Try to extract intent/topic from keywords in the response.
    const lc = content.toLowerCase();
    const proseFallback = {
      understanding: content.slice(0, 200),
      intent: /greet|hello|welcome/i.test(lc) ? 'greeting'
        : /thank|appreciate/i.test(lc) ? 'thanks'
        : /wage|pay|salary|mshahara/i.test(lc) ? 'request'
        : /violation|illegal|unlawful|breach/i.test(lc) ? 'request'
        : 'question',
      topic: /wage|pay|salary|mshahara/i.test(lc) ? 'wages'
        : /safety|hazard|ppe|barakoa/i.test(lc) ? 'safety'
        : /contract|mkataba/i.test(lc) ? 'contract'
        : /child|minor|mtoto/i.test(lc) ? 'child_labor'
        : /harass|abuse|nyanyasaji/i.test(lc) ? 'gender'
        : 'other',
      sentiment: /urgent|emergency|scared|afraid/i.test(lc) ? 'urgent'
        : /frustrated|angry|upset/i.test(lc) ? 'frustrated'
        : 'neutral',
      urgency: /urgent|emergency|immediate/i.test(lc) ? 'immediate' : 'routine',
      key_points: [],
      response_strategy: 'answer directly',
      language: 'en'
    };
    return this.normalizeReasoning(proseFallback, message);
  }

  // ============================================
  // STEP 2: GENERATE RESPONSE FROM REASONING
  // ============================================

  async generateResponseFromReasoning(message, reasoning, context = {}, order = null) {
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

    const knowledgePassages = Array.isArray(context.knowledge) && context.knowledge.length > 0
       ? context.knowledge
           .map((k) => `- [${k.id || k.title}] ${k.text}`)
           .join('\n')
       : 'None retrieved.';

     const systemPrompt = `You are Haki, a WhatsApp rights-assistant for Kenyan agribusiness and farm workers, protecting workplace rights under Kenyan law.

Based on your reasoning, generate a response:

REASONING SUMMARY:
- Understanding: ${reasoning.understanding}
- Intent: ${reasoning.intent}
- Topic: ${reasoning.topic}
- Sentiment: ${reasoning.sentiment}
- Urgency: ${reasoning.urgency}
- Strategy: ${reasoning.response_strategy}${violationContext}

SUPPORTING LEGAL PASSAGES (cite these when relevant — use exact wording so the worker knows their rights):
${knowledgePassages}

RESPONSE RULES:
1. **Write like a WhatsApp text from a knowledgeable friend** - not like an essay or a customer service bot
2. **Be empathetic** - acknowledge their situation in your own words
3. **Be clear** - use simple language, no legal jargon
4. **Be actionable** - always give a concrete next step
5. **Never use chatbot filler** - banned phrases: "Certainly!", "Of course!", "Great question!", "I hope this helps", "Is there anything else I can help you with?", "As an AI", "I'm here to help"
6. **Always English** - respond in English by default. Only switch languages if the user explicitly requests it (e.g. "reply in Swahili")
7. **Sound human** - contractions, uneven sentence lengths, don't start every message the same way, don't end every message with an offer of more help${violationInstructions}

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

    const { response, provider } = await this.callLLM(this.buildMessages(systemPrompt, message, context), { order });
    this._lastProvider = provider;

    return response.choices[0].message.content;
  }

  // ============================================
  // MULTI-PROVIDER LLM API CALL
  // Rotates across every active key (router), retries transient errors up to
  // twice per provider, then cascades to the next provider in the order.
  // ============================================

  async callLLM(messages, options = {}) {
    const active = this.router.enabled();
    if (active.length === 0) throw new Error('No LLM provider configured');

    const order = Array.isArray(options.order) && options.order.length > 0
      ? options.order
      : this.router.order(options.provider, options.mode);

    let lastError = null;

    for (const key of order) {
      const provider = LLM_PROVIDERS[key];
      if (!provider || !provider.enabled) continue;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`🤖 ${provider.name} attempt ${attempt}`);
          const result = await this.callProvider(provider, messages);
          console.log(`✅ ${provider.name} OK`);
          this.router.record(key, true);
          return { response: result, provider: key };
        } catch (error) {
          lastError = error;
          this.router.record(key, false);
          const isTransient = /429|500|503|ECONNRESET|ETIMEDOUT/i.test(error.message);
          console.log(`❌ ${provider.name} attempt ${attempt}: ${error.message}`);
          if (isTransient && attempt < 2) {
            await new Promise(r => setTimeout(r, attempt * 2000));
            continue;
          }
          break; // non-transient or last attempt → next provider
        }
      }
    }

    throw lastError || new Error('All LLM providers failed');
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
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            generationConfig: {
              temperature: 0.7,
              topP: 0.9,
              maxOutputTokens: 800,
              thinkingConfig: { thinkingBudget: 0 }
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
      const text = (data.candidates[0].content?.parts || [])
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join(' ')
        .trim();
      if (!text) throw new Error('Google returned empty response');
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

    return { reasoning, response, usedLLM: false, provider: null };
  }

  generateSimpleResponse(message, reasoning, context) {
    const lang = reasoning.language;
    const violations = reasoning.key_points;

    if (reasoning.intent === 'greeting') {
      return lang === 'sw'
        ? 'Habari! Karibu Haki. Nasaidia na haki za kazi — mshahara, mkataba, usalama, ajira ya watoto, unyanyasaji na ardhi. Ni nini kinakusumbua?'
        : 'Hello! Welcome to Haki. I help with workplace rights — wages, contracts, safety, child labour, harassment and land. What can I do for you?';
    }

    if (reasoning.intent === 'thanks') {
      return lang === 'sw'
        ? 'Asante pia! Haki yako ina thamani — ukiahitaji tena uko hapa.'
        : 'Any time! Your rights are worth following up on. Come back if you need more.';
    }

    if (violations.length > 0) {
      // Use rule-based legal response
      return this.getRuleBasedLegalResponse(violations[0], lang);
    }

    // Default response
    return lang === 'sw'
      ? 'Sijaelewa vizuri. Eleza zaidi tatizo lako, kwa mfano malipo au usalama kazini. Au andika "haki zangu".'
      : 'I didn\'t quite catch that. Tell me a bit more about what happened at work — pay, safety, contract, anything. Or type "rights" to see what you\'re entitled to.';
  }

  getRuleBasedLegalResponse(violationType, lang) {
    const category = legalKB.violation_categories.find(v => v.id === violationType);
    
    if (!category) {
      return lang === 'sw'
        ? 'Nimegundua kuwa una tatizo. Hii ni kinyume na sheria. Wasiliana na ofisi ya kazi kwa msaada.'
        : 'I can see you have a problem. This is against the law. Contact the labour office for help.';
    }

    // Build response
    let response = lang === 'sw' ? '🚨 *Haki zako zimebana hapa*\n\n' : '🚨 *Your rights are being violated here*\n\n';
    response += lang === 'sw' ? `*Tatizo:* ${category.description}\n\n` : `*The problem:* ${category.description}\n\n`;
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
}

export default LLMReasoningEngine;