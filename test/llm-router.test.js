import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import LLMRouter, { MODES } from '../src/llm-router.js';

const PROVIDERS = () => [
  { key: 'nvidia', name: 'NVIDIA NIM', model: 'llama-3.1-8b', enabled: true },
  { key: 'groq', name: 'Groq', model: 'gpt-oss-120b', enabled: true },
  { key: 'google', name: 'Google AI Studio', model: 'gemini-flash', enabled: true }
];

describe('LLMRouter', () => {
  beforeEach(() => {
    delete process.env.LLM_ROUTING;
    delete process.env.LLM_FAVORITE_PROVIDER;
  });

  it('round-robins across all active providers', () => {
    const router = new LLMRouter(PROVIDERS());
    const picked = [router.next(), router.next(), router.next(), router.next()];
    assert.deepEqual(picked, ['nvidia', 'groq', 'google', 'nvidia']);
  });

  it('skips disabled providers', () => {
    const providers = PROVIDERS();
    providers[1].enabled = false;
    const router = new LLMRouter(providers);
    assert.deepEqual(router.enabled().map(p => p.key), ['nvidia', 'google']);
    assert.deepEqual([router.next(), router.next(), router.next()], ['nvidia', 'google', 'nvidia']);
  });

  it('honours an explicit preferred provider', () => {
    const router = new LLMRouter(PROVIDERS());
    assert.equal(router.next('google'), 'google');
  });

  it('priority mode always returns the first enabled provider', () => {
    const router = new LLMRouter(PROVIDERS(), { mode: MODES.PRIORITY });
    assert.deepEqual([router.next(), router.next()], ['nvidia', 'nvidia']);
    assert.deepEqual(router.order('google'), ['nvidia', 'groq', 'google']);
  });

  it('favorite mode prefers the favourite while it stays healthy', () => {
    const router = new LLMRouter(PROVIDERS(), { mode: MODES.FAVORITE, favorite: 'groq' });
    assert.deepEqual([router.next(), router.next()], ['groq', 'groq']);
  });

  it('deprioritizes a provider with consecutive failures in round-robin', () => {
    const router = new LLMRouter(PROVIDERS());
    router.record('nvidia', false);
    router.record('nvidia', false);
    // nvidia now has 2 consecutive failures → skipped by rotation
    const picked = [router.next(), router.next(), router.next()];
    assert.ok(!picked.includes('nvidia'), `nvidia should be skipped, got ${picked}`);
    assert.deepEqual(picked, ['groq', 'google', 'groq']);
  });

  it('records success and resets the failure streak', () => {
    const router = new LLMRouter(PROVIDERS());
    router.record('nvidia', false);
    router.record('nvidia', false);
    router.record('nvidia', true);
    assert.equal(router.stats.nvidia.consecutiveFail, 0);
    assert.equal(router.stats.nvidia.calls, 3);
    assert.equal(router.stats.nvidia.ok, 1);
    assert.equal(router.stats.nvidia.fail, 2);
  });

  it('order() returns the rotation from the starting provider onward', () => {
    const router = new LLMRouter(PROVIDERS());
    assert.deepEqual(router.order('google'), ['google', 'nvidia', 'groq']);
  });

  it('returns empty when nothing is enabled', () => {
    const providers = PROVIDERS().map(p => ({ ...p, enabled: false }));
    const router = new LLMRouter(providers);
    assert.equal(router.any(), false);
    assert.equal(router.next(), null);
    assert.deepEqual(router.order(), []);
  });

  it('snapshot exposes mode, enabled pool and per-provider stats', () => {
    const router = new LLMRouter(PROVIDERS(), { mode: MODES.ROUND_ROBIN });
    router.record('groq', true);
    const snap = router.snapshot();
    assert.equal(snap.mode, 'round-robin');
    assert.equal(snap.enabled.length, 3);
    assert.equal(snap.stats.groq.ok, 1);
  });
});