import { test } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddingEngine from '../src/embedding-engine.js';

function openAIEmbedding(texts, vectors) {
  return {
    ok: true,
    json: async () => ({ data: vectors.map((v, i) => ({ index: i, embedding: v })) })
  };
}

test('uses NVIDIA NV-Embed backend (OpenAI-compatible) and normalizes vectors', async () => {
  const urls = [];
  const engine = new EmbeddingEngine({
    nvidiaKey: 'nvapi-test',
    googleKey: '',
    fetchFn: async (url, opts) => {
      urls.push(url);
      const body = JSON.parse(opts.body);
      assert.equal(body.model, 'nvidia/nv-embed-v1');
      assert.deepEqual(body.input, ['first', 'second']);
      return openAIEmbedding(body.input, [[0, 3, 0, 4], [1, 1, 0, 0]]);
    }
  });

  const r = await engine.embed(['first', 'second']);
  assert.equal(r.error, null);
  assert.equal(r.provider, 'nvidia');
  assert.equal(r.vectors.length, 2);
  // [0,3,0,4] normalized → [0, 0.6, 0, 0.8]
  assert.deepEqual(r.vectors[0], [0, 0.6, 0, 0.8]);
  assert.equal(engine.dim, 4);
  assert.ok(urls[0].includes('/v1/embeddings'));
});

test('uses Google text-embedding backend (single and batch)', async () => {
  const urls = [];
  let calls = 0;
  const engine = new EmbeddingEngine({
    nvidiaKey: '',
    googleKey: 'google-test',
    fetchFn: async (url, opts) => {
      urls.push(url);
      calls += 1;
      const body = JSON.parse(opts.body);
      if (url.includes(':embedContent')) {
        assert.equal(body.content.parts[0].text, 'single');
        return { ok: true, json: async () => ({ embedding: { values: [3, 4] } }) };
      }
      if (url.includes(':batchEmbedContents')) {
        assert.equal(body.requests.length, 2);
        return { ok: true, json: async () => ({ embeddings: [{ values: [1, 0] }, { values: [0, 1] }] }) };
      }
      return { ok: false, text: async () => 'bad url' };
    }
  });

  const single = await engine.embed(['single']);
  assert.equal(single.provider, 'google');
  assert.deepEqual(single.vectors[0], [0.6, 0.8]);

  const batch = await engine.embed(['a', 'b']);
  assert.equal(batch.vectors.length, 2);
  assert.deepEqual(batch.vectors[0], [1, 0]);
  assert.ok(urls.some((u) => u.includes('text-embedding-004:batchEmbedContents')));
  assert.equal(calls, 2);
});

test('falls through to the next provider when the first fails', async () => {
  const engine = new EmbeddingEngine({
    nvidiaKey: 'nv',
    googleKey: 'gg',
    fetchFn: async (url) => {
      if (url.startsWith('https://integrate.api.nvidia.com')) {
        return { ok: false, text: async () => '402 quota exceeded' };
      }
      return { ok: true, json: async () => ({ embedding: { values: [0, 1] } }) };
    }
  });
  const r = await engine.embed(['hit']);
  assert.equal(r.provider, 'google');
  assert.deepEqual(r.vectors[0], [0, 1]);
  assert.equal(engine.stats.fail, 1);
});

test('reports unavailable when no keys are configured', async () => {
  const engine = new EmbeddingEngine({ nvidiaKey: '', googleKey: '' });
  assert.equal(engine.isAvailable(), false);
  const r = await engine.embed(['x']);
  assert.equal(r.error, 'all embedding providers failed');
  assert.deepEqual(r.vectors, []);
});

test('cosine similarity behaves correctly', () => {
  const engine = new EmbeddingEngine({ nvidiaKey: 'k', googleKey: '' });
  assert.equal(engine.cosine([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(engine.cosine([1, 0], [0, 1]), 0);
  assert.equal(engine.cosine([1, 1], [-1, -1]), -2);
  assert.equal(engine.cosine(null, [1]), 0);
  assert.equal(engine.cosine([1], null), 0);
});

test('caches embeddings per text and fixes its dimension', async () => {
  let calls = 0;
  const engine = new EmbeddingEngine({
    nvidiaKey: 'k',
    googleKey: '',
    fetchFn: async () => {
      calls += 1;
      return openAIEmbedding([], [[1, 0, 0]]);
    }
  });
  await engine.embed(['again']);
  await engine.embed(['again']);
  assert.equal(calls, 1);
  assert.equal(engine.stats.cached, 1);
});