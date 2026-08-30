import { test } from 'node:test';
import assert from 'node:assert/strict';
import VoiceHandler from '../src/voice-handler.js';

function geminiFetch(text) {
  return async (url, opts) => {
    assert.ok(url.includes(':generateContent'));
    const body = JSON.parse(opts.body);
    const hasAudio = body.contents[0].parts.some((p) => p.inline_data);
    assert.ok(hasAudio, 'must send the audio inline');
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  };
}

test('picks Google Gemini audio when only the Google key is set', () => {
  const h = new VoiceHandler({ whisperKey: '', groqKey: '', googleKey: 'google-key' });
  assert.equal(h.enabled, true);
  assert.equal(h.providerName, 'Google Gemini (audio)');
  assert.equal(h.groqFallbackKey, '');
});

test('keeps Groq Whisper as a fallback when Gemini is the primary', () => {
  const h = new VoiceHandler({ whisperKey: '', groqKey: 'gsk-key', googleKey: 'google-key' });
  assert.equal(h.providerName, 'Google Gemini (audio)');
  assert.equal(h.groqFallbackKey, 'gsk-key');
});

test('prefers OpenAI Whisper when a real Whisper key is set', () => {
  const h = new VoiceHandler({ whisperKey: 'sk-real-openai', groqKey: 'gsk', googleKey: 'gg' });
  assert.equal(h.providerName, 'OpenAI Whisper');
});

test('transcribes via Gemini without needing ffmpeg', async () => {
  const h = new VoiceHandler({
    whisperKey: '',
    groqKey: 'gsk',
    googleKey: 'gg',
    fetchFn: geminiFetch('Hallo ndugu, sijalipwa mshahara')
  });

  const r = await h.transcribe(Buffer.from([1, 2, 3]), '');
  assert.equal(r.error, null);
  assert.equal(r.text, 'Hallo ndugu, sijalipwa mshahara');
});

test('rejects oversized audio politely', async () => {
  const h = new VoiceHandler({
    whisperKey: '',
    groqKey: '',
    googleKey: 'gg',
    fetchFn: async () => assert.fail('should not call the API')
  });
  const big = Buffer.alloc(19 * 1024 * 1024);
  const r = await h.transcribe(big, '');
  assert.equal(r.text, '');
  assert.match(r.error, /shorter voice note/i);
});

test('reports an empty transcript as an error and can fall back to whisper', async () => {
  const h = new VoiceHandler({
    whisperKey: '',
    groqKey: '',
    googleKey: 'gg',
    fetchFn: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '  ' }] } }] }) })
  });
  const r = await h.transcribe(Buffer.from([9]), '');
  // No groq fallback configured → surface the Gemini error cleanly.
  assert.equal(r.text, '');
  assert.ok(r.error);
});

test('disabled when no transcription provider keys exist', () => {
  const h = new VoiceHandler({ whisperKey: '', groqKey: '', googleKey: '' });
  assert.equal(h.enabled, false);
  assert.equal(h.providerName, '');
});