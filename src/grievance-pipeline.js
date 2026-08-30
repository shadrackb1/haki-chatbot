// ============================================
// GRIEVANCE PIPELINE (shared WhatsApp + SMS core)
// One pipeline for any channel: detect language → translate to English for
// accurate analysis → sentiment → crisis gate → violation classification →
// hybrid semantic RAG → tiered multi-provider LLM → translate the reply back
// into the worker's own language.
// ============================================

import { classifyViolation } from './violation-classifier.js';

const CRITICAL_VIOLATIONS = ['SAFETY_VIOLATION', 'HARASSMENT'];
const ANALYSIS_VIOLATIONS = ['WAGE_VIOLATION', 'CONTRACT_VIOLATION', 'CHILD_LABOR', 'ENVIRONMENTAL_HARM', 'LAND_RIGHTS'];

const noopTranslation = {
  enabled: false,
  translate: async (text) => ({ text, ok: false, cached: false, translated: false })
};

class GrievancePipeline {
  constructor(deps = {}) {
    this.llmEngine = deps.llmEngine;
    this.retriever = deps.retriever;
    this.embedder = deps.embedder || null;
    this.empathy = deps.empathy;
    this.iq = deps.iq;
    this.crisisSupport = deps.crisisSupport;
    this.langLib = deps.langLib;
    this.translation = deps.translation || noopTranslation;
    this.classifier = deps.classifier || classifyViolation;
  }

  _detectLanguage(text) {
    try {
      const r = this.langLib.detectLanguage(text);
      return r.language || r.detected || 'en';
    } catch {
      return 'en';
    }
  }

  // Decide which LLM tier to use for a message (overridable per message).
  _decideTier(violation, requestedTier) {
    if (requestedTier) return requestedTier;
    if (!violation) return null;
    if (CRITICAL_VIOLATIONS.includes(violation.id)) return 'research';
    if (ANALYSIS_VIOLATIONS.includes(violation.id)) return 'analysis';
    return null;
  }

  async process(input = {}) {
    const text = String(input.text || '').trim();
    const callerId = input.callerId || 'anonymous';
    const history = Array.isArray(input.history) ? input.history : [];
    const user = input.user || {};
    const llmOverride = input.llm && typeof input.llm === 'object' ? input.llm : {};

    if (!text) {
      return { kind: 'normal', reply: '', lang: 'en', error: 'empty message' };
    }

    const lang = this._detectLanguage(text);

    if (this.empathy && typeof this.empathy.setCulturalContext === 'function') {
      this.empathy.setCulturalContext(callerId, lang);
    }

    // STEP A: translate to English for accurate legal analysis (Gemini).
    let analysisText = text;
    let analysisTranslated = false;
    if (lang !== 'en' && this.translation && this.translation.enabled) {
      const tr = await this.translation.translate(text, 'en', lang);
      if (tr.ok && tr.translated && tr.text) {
        analysisText = tr.text;
        analysisTranslated = true;
      }
    }

    // STEP B: emotional + conversational intelligence on the original text.
    const sentiment = this.empathy ? this.empathy.processSentiment(callerId, text, null) : { sentiment: 'neutral' };
    const iqResult = this.iq ? this.iq.processMessage(callerId, analysisText, 'en', history) : { intents: [] };

    // STEP C: crisis gate runs BEFORE legal analysis (EN + SW patterns both).
    const crisisResult = this.crisisSupport ? this.crisisSupport.triage(`${text}\n${analysisText}`, lang)
      : { needsCare: false, level: 'none', escalate: false, triggers: [] };
    if (crisisResult.needsCare) {
      return {
        kind: 'crisis',
        reply: crisisResult.response,
        lang,
        analysisText,
        analysisTranslated,
        sentiment,
        iqResult,
        crisisResult,
        usedLLM: false,
        provider: null
      };
    }

    // STEP D: classify the suspected violation on the (english) analysis copy.
    const violation = this.classifier(analysisText) || null;

    // STEP E: hybrid RAG — BM25 + dense vectors, falls back to BM25 alone.
    const knowledge = this.retriever && typeof this.retriever.hybridSearch === 'function'
      ? await this.retriever.hybridSearch(analysisText, { topK: 3, embedder: this.embedder })
      : this.retriever
        ? this.retriever.search(analysisText, 3)
        : [];

    // STEP F: tiered multi-provider LLM reasoning.
    const tier = this._decideTier(violation, llmOverride.tier);
    const llmContext = {
      language: 'en',
      location: user.location,
      workType: user.workType,
      isNewUser: user.isNewUser,
      conversationCount: user.conversationCount,
      violation: violation ? {
        id: violation.id,
        description: violation.data?.description || '',
        applicable_laws: violation.data?.applicable_laws || [],
        remedy_pathways: violation.data?.remedy_pathways || []
      } : null,
      history,
      knowledge
    };
    const llmOpts = { llm: tier ? { tier } : llmOverride };
    const llmResult = this.llmEngine
      ? await this.llmEngine.processMessage(analysisText, { ...llmContext, ...llmOpts })
      : { reasoning: { intent: 'question', topic: 'other' }, response: '', usedLLM: false, provider: null };

    let reply = llmResult.response || '';
    let replyTranslated = false;

    // STEP G: translate the reply back into the worker's language (Gemini).
    if (reply && lang !== 'en' && this.translation && this.translation.enabled) {
      const back = await this.translation.translate(reply, lang, 'en');
      if (back.ok && back.translated && back.text) {
        reply = back.text;
        replyTranslated = true;
      }
    }

    return {
      kind: 'normal',
      reply,
      lang,
      analysisText,
      analysisTranslated,
      replyTranslated,
      sentiment,
      iqResult,
      crisisResult,
      violation,
      knowledge,
      reasoning: llmResult.reasoning || {},
      usedLLM: !!llmResult.usedLLM,
      provider: llmResult.provider || null,
      tier: llmResult.tier || tier
    };
  }
}

export default GrievancePipeline;