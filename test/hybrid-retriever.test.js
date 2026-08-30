import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeRetriever } from '../src/knowledge-retriever.js';

const CORPUS = [
  { id: 'min-wage', title: 'Minimum wage', category: 'wages', text: 'Every worker is entitled to the statutory minimum wage under the Labour Institutions Act. Overtime is payable at 1.5x the hourly rate.' },
  { id: 'safe-ppe', title: 'Safety equipment', category: 'safety', text: 'Employers must provide and maintain appropriate personal protective equipment (PPE). Workers exposed to chemicals need training and supervision.' },
  { id: 'land-housing', title: 'Worker housing & land', category: 'land', text: 'Unlawful evictions from employer-provided housing are prohibited. A worker cannot be displaced informally without due process under the Land Act.' }
];

function fakeEmbedder(dispatcher) {
  return {
    isAvailable: () => true,
    embed: async (texts) => {
      const vectors = texts.map(dispatcher);
      return { vectors, provider: 'fake', error: null };
    },
    cosine(a, b) {
      if (!a || !b || a.length !== b.length) return 0;
      let dot = 0;
      for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
      return dot;
    }
  };
}

// Document signature: [wages, safety, land]
const docVec = (id) =>
  id === 'min-wage' ? [1, 0, 0] :
  id === 'safe-ppe' ? [0, 1, 0] : [0, 0, 1];

test('hybrid search surfaces semantic matches that pure BM25 misses', async () => {
  const retriever = new KnowledgeRetriever(CORPUS);
  // Cross-language query: Swahili text shares no English lexical tokens with the corpus.
  const query = 'walitupilia mbali na tukapoteza nyumba yetu';
  const bm = retriever.search(query, 3);
  assert.equal(bm.length, 0, 'BM25 alone should miss this query (no lexical overlap)');

  const embedder = fakeEmbedder((t) => {
    if (t === query) return [0, 0, 1];
    return docVec(CORPUS.find((d) => t.includes(d.text.slice(0, 20)) || d.text === t)?.id || 'min-wage');
  });

  const hits = await retriever.hybridSearch(query, { topK: 3, embedder });
  assert.ok(hits.length > 0);
  assert.equal(hits[0].id, 'land-housing');
  assert.ok('bm25Score' in hits[0]);
  assert.ok('semanticScore' in hits[0]);
});

test('hybrid search honors topK and returns the best fused docs', async () => {
  const retriever = new KnowledgeRetriever(CORPUS);
  // Always mark min-wage as nearest semantic match regardless of query.
  const embedder = fakeEmbedder((t) => [1, 0, 0]);
  const hits = await retriever.hybridSearch('wages unpaid salary', { topK: 1, embedder });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'min-wage');
});

test('hybrid search falls back to BM25 when the embedder is unavailable', async () => {
  const retriever = new KnowledgeRetriever(CORPUS);
  const hits = await retriever.hybridSearch('minimum wage overtime', { topK: 2, embedder: null });
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].id, 'min-wage');
});

test('hybrid search degrades to BM25 when the embedder errors', async () => {
  const retriever = new KnowledgeRetriever(CORPUS);
  const broken = {
    isAvailable: () => true,
    embed: async () => { throw new Error('embedding down'); }
  };
  const hits = await retriever.hybridSearch('personal protective equipment', { topK: 2, embedder: broken });
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].id, 'safe-ppe');
});

test('lexical search still works exactly as before', () => {
  const retriever = new KnowledgeRetriever(CORPUS);
  const hits = retriever.search('chemicals ppe training', 2);
  assert.equal(hits[0].id, 'safe-ppe');
  assert.equal(hits.length, 1);
});