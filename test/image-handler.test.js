import { test } from 'node:test';
import assert from 'node:assert/strict';
import ImageHandler from '../src/image-handler.js';

function geminiText(text) {
  return async (url, opts) => {
    assert.ok(url.includes(':generateContent'));
    const body = JSON.parse(opts.body);
    assert.ok(body.contents[0].parts.some((p) => p.inline_data), 'must include inline image data');
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  };
}

test('describes a photo through Gemini vision', async () => {
  const h = new ImageHandler({
    googleKey: 'vision-key',
    fetchFn: geminiText('Payslip visible: 12 farmhands, no PPE; wages written as KSH 400/day.')
  });
  const r = await h.analyze(Buffer.from([1, 2, 3]), 'my payslip', 'image/jpeg');
  assert.equal(r.error, null);
  assert.equal(r.description, 'Payslip visible: 12 farmhands, no PPE; wages written as KSH 400/day.');
});

test('reports when vision is not configured', async () => {
  const h = new ImageHandler({ googleKey: '', fetchFn: async () => assert.fail('must not call API') });
  assert.equal(h.enabled, false);
  const r = await h.analyze(Buffer.from([1]));
  assert.match(r.error, /not configured/i);
});

test('surfaces Gemini API errors without throwing', async () => {
  const h = new ImageHandler({
    googleKey: 'k',
    fetchFn: async () => ({ ok: false, status: 429, text: async () => 'rate limited' })
  });
  const r = await h.analyze(Buffer.from([1]));
  assert.equal(r.description, '');
  assert.match(r.error, /429/);
});

test('retries transient failures (429/500/503) up to 3 times', async () => {
  let calls = 0;
  const h = new ImageHandler({
    googleKey: 'k',
    fetchFn: async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 503, text: async () => 'busy' };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Recovered' }] } }] }) };
    }
  });
  const r = await h.analyze(Buffer.from([1]));
  assert.equal(calls, 2);
  assert.equal(r.description, 'Recovered');
});

test('non-transient failures return immediately without retry', async () => {
  let calls = 0;
  const h = new ImageHandler({
    googleKey: 'k',
    fetchFn: async () => {
      calls += 1;
      return { ok: false, status: 401, text: async () => 'bad key' };
    }
  });
  const r = await h.analyze(Buffer.from([1]));
  assert.equal(calls, 1);
  assert.match(r.error, /401/);
});

test('analyzeVideo sends a small clip inline and produces a description', async () => {
  let parts = null;
  const h = new ImageHandler({
    googleKey: 'k',
    fetchFn: async (url, opts) => {
      parts = JSON.parse(opts.body).contents[0].parts;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Child workers carrying heavy crates.' }] } }] }) };
    }
  });
  const r = await h.analyzeVideo(Buffer.alloc(512 * 1024), 'inside the packhouse', 'video/mp4');
  assert.equal(r.error, null);
  assert.equal(r.description, 'Child workers carrying heavy crates.');
  assert.ok(parts.some((p) => p.inline_data && p.inline_data.mime_type === 'video/mp4'));
});

test('analyzeVideo falls back to frame sampling when inline fails on size limits', async () => {
  let calls = 0;
  const h = new ImageHandler({
    googleKey: 'k',
    fetchFn: async (url, opts) => {
      calls += 1;
      // Only the inline attempt should happen — no frames will be produced.
      assert.equal(calls, 1);
      return { ok: false, status: 400, text: async () => 'exception: too large, SIZE_LIMIT' };
    }
  });
  // No real ffmpeg clip to sample → friendly error, clean fallback, no crash.
  const r = await h.analyzeVideo(Buffer.alloc(512 * 1024), '', 'video/mp4');
  assert.equal(r.description, '');
  assert.match(r.error, /ffmpeg is unavailable|too large/i);
  assert.equal(calls, 1);
});