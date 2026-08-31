import { test } from 'node:test';
import assert from 'node:assert/strict';
import RateLimiter from '../src/rate-limiter.js';

test('allows messages up to the window budget', () => {
  let t = 0;
  const rl = new RateLimiter({ windowMs: 60000, max: 3, now: () => t });
  assert.equal(rl.hit('+2547'), true);
  assert.equal(rl.hit('+2547'), true);
  assert.equal(rl.hit('+2547'), true);
  assert.equal(rl.hit('+2547'), false); // 4th in window → blocked
  assert.ok(rl.retryAfterMs('+2547') > 0);
});

test('window slides: old hits expire and the budget frees back up', () => {
  let t = 0;
  const rl = new RateLimiter({ windowMs: 60000, max: 2, now: () => t });
  rl.hit('+2547');
  rl.hit('+2547');
  assert.equal(rl.hit('+2547'), false);
  t = 61000; // advance past the window
  assert.equal(rl.hit('+2547'), true);
  assert.equal(rl.retryAfterMs('+2547'), 0);
});

test('phones are throttled independently', () => {
  let t = 0;
  const rl = new RateLimiter({ windowMs: 60000, max: 1, now: () => t });
  assert.equal(rl.hit('+254700000001'), true);
  assert.equal(rl.hit('+254700000001'), false); // blocked
  assert.equal(rl.hit('+254700000002'), true); // different phone allowed
});

test('reset clears a specific phone', () => {
  let t = 0;
  const rl = new RateLimiter({ windowMs: 60000, max: 1, now: () => t });
  rl.hit('+2547');
  assert.equal(rl.hit('+2547'), false);
  rl.reset('+2547');
  assert.equal(rl.hit('+2547'), true);
});

test('clear empties all counters', () => {
  let t = 0;
  const rl = new RateLimiter({ windowMs: 60000, max: 1, now: () => t });
  rl.hit('a');
  rl.hit('b');
  assert.equal(Object.keys(rl.counts()).length, 2);
  rl.clear();
  assert.equal(Object.keys(rl.counts()).length, 0);
});
