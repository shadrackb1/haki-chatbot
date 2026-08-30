import { test } from 'node:test';
import assert from 'node:assert/strict';
import TranslationEngine from '../src/translation-engine.js';

function geminiOk(text) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] })
  };
}

test('translates a message to the target language using Gemini', async () => {
  let called = 0;
  const engine = new TranslationEngine({
    apiKey: 'test-key',
    fetchFn: async () => {
      called += 1;
      return geminiOk('Hello friend');
    }
  });

  const r = await engine.translate('Habari rafiki', 'en', 'sw');
  assert.equal(r.ok, true);
  assert.equal(r.translated, true);
  assert.equal(r.text, 'Hello friend');
  assert.equal(called, 1);
  assert.equal(engine.stats.ok, 1);
});

test('caches repeated translations', async () => {
  let called = 0;
  const engine = new TranslationEngine({
    apiKey: 'k',
    fetchFn: async () => {
      called += 1;
      return geminiOk('Translated');
    }
  });
  await engine.translate('same input text', 'fr');
  await engine.translate('same input text', 'fr');
  assert.equal(called, 1);
  assert.equal(engine.stats.cached, 1);
});

test('passthrough when no API key is configured', async () => {
  const engine = new TranslationEngine({ apiKey: '' });
  const r = await engine.translate('Hakuna matata', 'en', 'sw');
  assert.equal(r.ok, false);
  assert.equal(r.text, 'Hakuna matata');
  assert.equal(r.translated, false);
});

test('falls back to the original text when the API errors', async () => {
  const engine = new TranslationEngine({
    apiKey: 'k',
    fetchFn: async () => { throw new Error('network down'); }
  });
  const r = await engine.translate('Siwezi kulipwa', 'en', 'sw');
  assert.equal(r.ok, false);
  assert.equal(r.text, 'Siwezi kulipwa');
  assert.equal(engine.stats.fail, 1);
});

test('skips translation of empty text and mostly-English input', async () => {
  const engine = new TranslationEngine({ apiKey: 'k', fetchFn: async () => { assert.fail('should not call'); } });
  assert.equal((await engine.translate('', 'en', 'auto')).text, '');
  const en = await engine.translate('The boss will pay us next week', 'en', 'auto');
  assert.equal(en.text, 'The boss will pay us next week');
  assert.equal(en.translated, false);
});

test('clears the translation cache', async () => {
  let called = 0;
  const engine = new TranslationEngine({
    apiKey: 'k',
    fetchFn: async () => { called += 1; return geminiOk('X'); }
  });
  await engine.translate('uno', 'es');
  engine.clearCache();
  await engine.translate('uno', 'es');
  assert.equal(called, 2);
});

test('languageName resolves from local-languages data or code', async () => {
  const engine = new TranslationEngine({ apiKey: 'k' });
  assert.equal(engine.languageName('en'), 'English');
  assert.ok(engine.languageName('sw').toLowerCase().includes('swahili'));
  assert.equal(engine.languageName('xx'), 'xx');
});