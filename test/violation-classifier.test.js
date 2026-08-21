import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeText, tokenVariants, calculateRelevanceScore, classifyViolation } from '../src/violation-classifier.js';

test('tokenizeText lowercases and splits on non-alphanumerics', () => {
  assert.deepEqual(tokenizeText('They owe me WAGES!'), ['they', 'owe', 'me', 'wages']);
  assert.deepEqual(tokenizeText('no-pay, no contract'), ['no', 'pay', 'no', 'contract']);
});

test('tokenizeText returns empty array for empty or symbol-only input', () => {
  assert.deepEqual(tokenizeText(''), []);
  assert.deepEqual(tokenizeText('!!! ... ???'), []);
});

test('tokenVariants generates morphological variants', () => {
  assert.ok(tokenVariants('wages').includes('wage'));
  assert.ok(tokenVariants('injured').includes('injure'));
  assert.ok(tokenVariants('working').includes('work'));
  assert.ok(tokenVariants('evicted').includes('evict'));
  // short tokens are left alone
  assert.deepEqual(tokenVariants('pay'), ['pay']);
});

test('tokenVariants always includes the original token', () => {
  for (const token of ['wages', 'children', 'certification']) {
    assert.ok(tokenVariants(token).includes(token));
  }
});

const category = {
  keywords_sw: [],
  keywords_en: ['wage', 'minimum wage'],
  keywords_local: {}
};

test('calculateRelevanceScore matches inflected keywords', () => {
  assert.ok(calculateRelevanceScore('my wages are late', category) > 0);
});

test('calculateRelevanceScore is zero when nothing matches', () => {
  assert.equal(calculateRelevanceScore('the river is polluted', category), 0);
  assert.equal(calculateRelevanceScore('', category), 0);
});

test('calculateRelevanceScore gives phrase-match bonus', () => {
  const single = calculateRelevanceScore('wage something', category);
  const phrase = calculateRelevanceScore('minimum wage something', category);
  assert.ok(phrase > single, `phrase ${phrase} should beat single ${single}`);
});

test('classifyViolation detects wage violations from real KB', () => {
  const result = classifyViolation('the farm is not paying my salary for three weeks');
  assert.ok(result, 'expected a violation match');
  assert.equal(result.id, 'WAGE_VIOLATION');
});

test('classifyViolation returns null for unrelated text', () => {
  assert.equal(classifyViolation('hello there friend how are you'), null);
  assert.equal(classifyViolation('xyzzy qwerty asdf'), null);
});
