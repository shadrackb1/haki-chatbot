import { test } from 'node:test';
import assert from 'node:assert/strict';
import LLMReasoningEngine from '../src/llm-reasoning.js';

function engineWith(stubs) {
  const eng = new LLMReasoningEngine();
  eng.tiers = stubs.tiers || eng.tiers;
  eng.router = {
    has: stubs.has || (() => true),
    order: stubs.order || ((prefer) => [{ key: prefer, name: prefer, model: null }]),
    any: () => true
  };
  return eng;
}

test('resolveTier returns the tier plan for research/analysis/fast', () => {
  const eng = engineWith({});
  const research = eng.resolveTier('research');
  assert.equal(research.provider, 'google');
  assert.equal(research.structured, true);
  assert.equal(research.temperature, 0.3);
  assert.ok(research.model);

  const analysis = eng.resolveTier('analysis');
  assert.equal(analysis.structured, false);
  assert.ok(analysis.model);
});

test('resolveTier returns null for unknown or missing tiers', () => {
  const eng = engineWith({});
  assert.equal(eng.resolveTier('nope'), null);
  assert.equal(eng.resolveTier(null), null);
  assert.equal(eng.resolveTier(''), null);
});

test('resolveTier falls back to plain routing when the tier provider is not configured', () => {
  const eng = engineWith({ has: (key) => key !== 'google' });
  assert.equal(eng.resolveTier('research'), null);
  assert.ok(eng.resolveTier('analysis'), 'analysis maps to groq/nvidia which are "configured" in this stub');
});

test('_resolveCallOptions applies tier model/temperature/structured defaults', () => {
  const eng = engineWith({});
  const opts = eng._resolveCallOptions({ llm: { tier: 'analysis' } });
  assert.equal(opts.tierName, 'analysis');
  assert.equal(opts.model, eng.tiers.analysis.model);
  assert.equal(opts.temperature, 0.5);
  assert.equal(opts.structured, false);
  // The provider order starts with the tier's preferred provider.
  assert.equal(opts.order[0].key, eng.tiers.analysis.provider);
});

test('_resolveCallOptions honours explicit structured flag on fast tier', () => {
  const eng = engineWith({});
  const opts = eng._resolveCallOptions({ llm: { tier: 'fast', structured: true } });
  assert.equal(opts.tierName, 'fast');
  assert.equal(opts.structured, true);
  assert.equal(opts.model, eng.tiers.fast.model);
});

test('_resolveCallOptions with provider only (no tier) keeps lightweight defaults', () => {
  const eng = engineWith({});
  const opts = eng._resolveCallOptions({ llm: { provider: 'nvidia' } });
  assert.equal(opts.tierName, null);
  assert.equal(opts.model, null);
  assert.equal(opts.temperature, null);
  assert.equal(opts.structured, false);
  assert.equal(opts.order[0].key, 'nvidia');
});

test('_resolveCallOptions ignores malformed llm context', () => {
  const eng = engineWith({});
  const opts = eng._resolveCallOptions({});
  assert.equal(opts.tierName, null);
  assert.equal(opts.structured, false);
});