import { test } from 'node:test';
import assert from 'node:assert/strict';
import LLMReasoningEngine from '../src/llm-reasoning.js';

const engine = new LLMReasoningEngine();

test('normalizeReasoning keeps a well-formed reasoning object', () => {
  const result = engine.normalizeReasoning({
    understanding: 'user is underpaid',
    intent: 'request',
    topic: 'wages',
    sentiment: 'frustrated',
    urgency: 'soon',
    key_points: ['no pay for 3 weeks'],
    response_strategy: 'give remedy steps',
    language: 'en'
  }, 'fallback');

  assert.deepEqual(result, {
    understanding: 'user is underpaid',
    intent: 'request',
    topic: 'wages',
    sentiment: 'frustrated',
    urgency: 'soon',
    key_points: ['no pay for 3 weeks'],
    response_strategy: 'give remedy steps',
    language: 'en'
  });
});

test('normalizeReasoning splits pipe-chained values and lowercases', () => {
  const result = engine.normalizeReasoning({ intent: 'Wages|Contract', topic: 'SAFETY|other' });
  assert.equal(result.intent, 'wages');
  assert.equal(result.topic, 'safety');
});

test('normalizeReasoning fills defaults for missing or empty fields', () => {
  const result = engine.normalizeReasoning({});
  assert.equal(result.understanding, '');
  assert.equal(result.intent, 'question');
  assert.equal(result.topic, 'other');
  assert.equal(result.sentiment, 'neutral');
  assert.equal(result.urgency, 'routine');
  assert.equal(result.language, 'en');
  assert.deepEqual(result.key_points, []);

  // with a fallbackUnderstanding (the pipeline passes the raw message), it wins
  assert.equal(engine.normalizeReasoning({}, 'raw message').understanding, 'raw message');

  const blank = engine.normalizeReasoning({ understanding: '   ', intent: '' }, 'real message');
  assert.equal(blank.understanding, 'real message');
  assert.equal(blank.intent, 'question');
});

test('normalizeReasoning filters non-string key_points and handles null input', () => {
  const result = engine.normalizeReasoning({ key_points: ['ok', 42, null, 'fine'] });
  assert.deepEqual(result.key_points, ['ok', 'fine']);
  assert.equal(engine.normalizeReasoning(null).intent, 'question');
});

test('buildMessages puts system prompt first, history in the middle, user message last', () => {
  const messages = engine.buildMessages(
    'SYSTEM',
    'new question',
    { history: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'system', content: 'should be dropped' },
      { role: 'user', content: '   ' },
      { role: 'user', content: 'my boss refused to pay' }
    ] }
  );

  assert.deepEqual(messages, [
    { role: 'system', content: 'SYSTEM' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
    { role: 'user', content: 'my boss refused to pay' },
    { role: 'user', content: 'new question' }
  ]);
});

test('buildMessages keeps only the last six history turns', () => {
  const history = Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `msg ${i}` }));
  const messages = engine.buildMessages('S', 'latest', { history });
  // system + last 6 history + new message
  assert.equal(messages.length, 8);
  assert.equal(messages[1].content, 'msg 4');
  assert.equal(messages.at(-1).content, 'latest');
});

test('buildMessages tolerates missing or invalid history', () => {
  assert.equal(engine.buildMessages('S', 'm', {}).length, 2);
  assert.equal(engine.buildMessages('S', 'm', { history: 'junk' }).length, 2);
});

test('fallbackProcess classifies greetings without an LLM', () => {
  const { reasoning, usedLLM } = engine.fallbackProcess('habari', {});
  assert.equal(usedLLM, false);
  assert.equal(reasoning.intent, 'greeting');
});

test('fallbackProcess detects wage violations by keyword', () => {
  const { reasoning } = engine.fallbackProcess('they are not paying us, we are underpaid', {});
  assert.ok(reasoning.key_points.includes('wage_violation'));
  assert.equal(reasoning.urgency, 'soon');
});
