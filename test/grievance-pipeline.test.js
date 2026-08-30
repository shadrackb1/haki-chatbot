import { test } from 'node:test';
import assert from 'node:assert/strict';
import GrievancePipeline from '../src/grievance-pipeline.js';

function makeStubs(overrides = {}) {
  const translation = {
    enabled: true,
    calls: [],
    async translate(text, target, source) {
      this.calls.push({ text, target, source });
      return { text: `T[${target}]:${text}`, ok: true, cached: false, translated: true };
    }
  };

  const empathy = {
    setCulturalContext: (id, lang) => { empathy.lastCtx = { id, lang }; },
    processSentiment: (id, message) => ({ sentiment: message.includes('tense') ? 'frustrated' : 'sad' })
  };

  const iq = { processMessage: (id, text, lang, history) => ({ intents: ['wage_pay'], text }) };

  const crisisSupport = {
    triage: (text, lang) => {
      if (/kujitoa|kill myself|end my life/i.test(text)) {
        return { needsCare: true, level: 'severe', escalate: true, triggers: [{ phrase: 'kujitoa' }], response: 'Please call Kenya Red Cross on 1199.' };
      }
      return { needsCare: false, level: 'none', escalate: false, triggers: [] };
    }
  };

  const langLib = { detectLanguage: (t) => ({ language: /\b(siwezi|nakuja|nimesota|hakuna)\b/i.test(t) ? 'sw' : 'en' }) };

  const retriever = {
    hybridCalls: [],
    search: (q, k) => [{ id: 'law1', text: q, score: 1 }],
    hybridSearch: async (q, opts) => {
      retriever.hybridCalls.push({ q, topK: opts.topK, embedder: opts.embedder });
      return [{ id: 'law1', text: 'A legal passage about wages', score: 0.9, bm25Score: 1, semanticScore: 0.8 }];
    }
  };

  const llmEngine = {
    ctx: null,
    tierUsed: null,
    processMessage: async (message, ctx) => {
      llmEngine.ctx = { message, ...ctx };
      llmEngine.tierUsed = ctx.llm?.tier || null;
      return {
        reasoning: { intent: 'request', topic: 'wages', urgency: 'soon' },
        response: 'English legal reply about your rights.',
        usedLLM: true,
        provider: 'groq',
        tier: ctx.llm?.tier || null
      };
    }
  };

  return { translation, empathy, iq, crisisSupport, langLib, retriever, llmEngine, ...overrides };
}

function makePipeline(stubs, extra = {}) {
  return new GrievancePipeline({
    llmEngine: stubs.llmEngine,
    retriever: stubs.retriever,
    embedder: { isAvailable: () => true },
    empathy: stubs.empathy,
    iq: stubs.iq,
    crisisSupport: stubs.crisisSupport,
    langLib: stubs.langLib,
    translation: stubs.translation,
    ...extra
  });
}

test('translates Swahili, analyzes in English, translates the reply back', async () => {
  const s = makeStubs();
  const pipe = makePipeline(s);

  const result = await pipe.process({ text: 'Siwezi kulipwa mshahara wangu', callerId: '+254700000001' });

  assert.equal(result.kind, 'normal');
  assert.equal(result.lang, 'sw');
  assert.equal(result.analysisTranslated, true);
  assert.ok(s.llmEngine.ctx.message.startsWith('T[en]:'));
  assert.equal(s.llmEngine.ctx.language, 'en');
  assert.equal(result.reply, 'T[sw]:English legal reply about your rights.');
  assert.equal(result.replyTranslated, true);
  assert.equal(result.provider, 'groq');
});

test('short-circuits to the crisis response before any legal analysis', async () => {
  const s = makeStubs();
  const pipe = makePipeline(s);

  const result = await pipe.process({ text: 'Siwezi tena, nataka kujitoa', callerId: '+2547' });

  assert.equal(result.kind, 'crisis');
  assert.equal(result.reply, 'Please call Kenya Red Cross on 1199.');
  assert.equal(result.usedLLM, false);
  assert.equal(s.llmEngine.ctx, null, 'LLM must not be called for a crisis');
  assert.equal(result.crisisResult.level, 'severe');
  assert.equal(result.crisisResult.escalate, true);
});

test('routes critical violations to the research tier (Gemini deep reasoning)', async () => {
  const s = makeStubs();
  const pipe = makePipeline(s, {
    classifier: () => ({ id: 'SAFETY_VIOLATION', data: { description: 'No PPE provided', applicable_laws: [], remedy_pathways: [] } })
  });

  const result = await pipe.process({ text: 'No helmets or masks at work', callerId: '+2547' });

  assert.equal(s.llmEngine.tierUsed, 'research');
  assert.equal(result.tier, 'research');
  assert.equal(result.violation.id, 'SAFETY_VIOLATION');
  assert.equal(s.retriever.hybridCalls.length, 1);
  assert.ok(s.retriever.hybridCalls[0].embedder, 'hybrid search should receive the embedder');
});

test('routes routine wage violations to the analysis tier', async () => {
  const s = makeStubs();
  const pipe = makePipeline(s, {
    classifier: () => ({ id: 'WAGE_VIOLATION', data: { description: 'Underpaid', applicable_laws: [], remedy_pathways: [] } })
  });

  const result = await pipe.process({ text: 'They paid me below the minimum wage', callerId: '+2547' });

  assert.equal(s.llmEngine.tierUsed, 'analysis');
  assert.equal(result.tier, 'analysis');
});

test('no violation detected → no tier forced', async () => {
  const s = makeStubs();
  const pipe = makePipeline(s, { classifier: () => null });

  const result = await pipe.process({ text: 'What rights do farm workers have?', callerId: '+2547' });

  assert.equal(result.kind, 'normal');
  assert.equal(result.tier, null);
  assert.equal(s.llmEngine.tierUsed, null);
  assert.equal(result.violation, null);
});

test('an explicit caller tier overrides the automatic decision', async () => {
  const s = makeStubs();
  const pipe = makePipeline(s, {
    classifier: () => ({ id: 'SAFETY_VIOLATION', data: {} })
  });

  await pipe.process({ text: 'No helmets at work', callerId: '+2547', llm: { tier: 'fast' } });
  assert.equal(s.llmEngine.tierUsed, 'fast');
});

test('returns an error marker for empty messages', async () => {
  const s = makeStubs();
  const pipe = makePipeline(s);
  const result = await pipe.process({ text: '   ', callerId: '+2547' });
  assert.equal(result.kind, 'normal');
  assert.ok(result.error);
});

test('works without the LLM engine (rule-based pipeline)', async () => {
  const s = makeStubs();
  const pipe = makePipeline({ ...s, llmEngine: { processMessage: async () => ({ reasoning: {}, response: '', usedLLM: false, provider: null }) } });
  const result = await pipe.process({ text: 'my pay is short', callerId: '+2547' });
  assert.equal(result.kind, 'normal');
  assert.equal(result.usedLLM, false);
});