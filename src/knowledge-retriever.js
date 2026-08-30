// BM25 retrieval over a JSONL/JSON legal corpus.
// Pure-JS, zero dependencies, runs in-memory at startup.

import fs from 'fs';

const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;

function tokenise(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export class KnowledgeRetriever {
  constructor(corpus, opts = {}) {
    this.corpus = corpus;
    this.k1 = opts.k1 ?? DEFAULT_K1;
    this.b = opts.b ?? DEFAULT_B;
    this.index = new Map();      // term -> [{ docIdx, tf }]
    this.docLengths = [];
    this.avgDocLength = 0;
    this.nDocs = 0;
    this._buildIndex();
  }

  _buildIndex() {
    const docs = this.corpus.map((d) => {
      const text = [
        d.title || '',
        d.text || '',
        d.category || '',
        (d.tags || []).join(' '),
      ].join(' ');
      return tokenise(text);
    });

    this.nDocs = docs.length;
    this.docLengths = docs.map((t) => t.length);
    this.avgDocLength =
      this.docLengths.reduce((s, l) => s + l, 0) / (this.nDocs || 1) || 1;

    for (let i = 0; i < docs.length; i++) {
      const seen = new Map();
      for (const t of docs[i]) {
        seen.set(t, (seen.get(t) || 0) + 1);
      }
      for (const [term, tf] of seen) {
        if (!this.index.has(term)) this.index.set(term, []);
        this.index.get(term).push({ docIdx: i, tf });
      }
    }
  }

  // Rank all documents by BM25, returning [{ docIdx, score }] sorted desc.
  _rankBM25(query) {
    const terms = tokenise(query);
    if (!terms.length || !this.nDocs) return [];

    const scores = new Array(this.nDocs).fill(0);

    for (const term of terms) {
      const postings = this.index.get(term);
      const df = postings ? postings.length : 0;
      const idf = Math.log(1 + (this.nDocs - df + 0.5) / (df + 0.5) + 1);
      if (!postings) continue;

      for (const { docIdx, tf } of postings) {
        const dl = this.docLengths[docIdx];
        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (dl / this.avgDocLength)));
        scores[docIdx] += idf * tfNorm;
      }
    }

    return scores
      .map((score, docIdx) => ({ docIdx, score }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  search(query, topK = 3) {
    return this._rankBM25(query)
      .slice(0, topK)
      .map((r) => ({ ...this.corpus[r.docIdx], score: r.score }));
  }

  _docText(doc) {
    return [
      doc.title || '',
      doc.text || '',
      doc.category || '',
      (doc.tags || []).join(' '),
    ].join(' ');
  }

  // Hybrid retrieval: BM25 + dense-vector cosine fused with Reciprocal Rank
  // Fusion. Deals gracefully with language drift (a worker describing
  // "unpaid wages" hits passages about "remuneration") that pure BM25 misses.
  // Drops to BM25-only whenever the embedder is absent or errors.
  async hybridSearch(query, opts = {}) {
    const topK = opts.topK ?? 3;
    const embedder = opts.embedder || null;
    const bm25Hits = this._rankBM25(query).slice(0, Math.max(topK * 4, 12));

    if (!embedder || !embedder.isAvailable || !embedder.isAvailable()) {
      return bm25Hits.slice(0, topK).map((r) => ({ ...this.corpus[r.docIdx], score: r.score }));
    }

    try {
      const vectors = await this._ensureDocEmbeddings(embedder);
      const q = await embedder.embed([query]);
      const qv = q.vectors?.[0];
      if (!qv) return this.search(query, topK);

      const cosRanks = [];
      for (let i = 0; i < this.nDocs; i++) {
        cosRanks.push({ docIdx: i, score: embedder.cosine(qv, vectors[i] || null) });
      }
      const cosineHits = cosRanks.sort((a, b) => b.score - a.score).slice(0, Math.max(topK * 4, 12));

      const RRF_K = 60;
      const fused = new Map(); // docIdx -> { rrf, bm25, cosine }
      const addRankList = (list) => {
        list.forEach((r, rank) => {
          const key = r.docIdx;
          const cur = fused.get(key) || { rrf: 0, bm25: 0, cosine: 0 };
          cur.rrf += 1 / (RRF_K + rank + 1);
          cur.bm25 = Math.max(cur.bm25, r.score || 0);
          cur.cosine = Math.max(cur.cosine, r.score || 0);
          fused.set(key, cur);
        });
      };
      addRankList(bm25Hits);
      addRankList(cosineHits);

      const ranked = Array.from(fused.entries())
        .sort((a, b) => b[1].rrf - a[1].rrf)
        .slice(0, topK);

      return ranked.map(([docIdx, s]) => ({
        ...this.corpus[docIdx],
        score: s.rrf,
        bm25Score: s.bm25,
        semanticScore: s.cosine
      }));
    } catch (error) {
      console.warn(`[retriever] hybrid search fell back to BM25: ${error.message}`);
      return this.search(query, topK);
    }
  }

  async _ensureDocEmbeddings(embedder) {
    const texts = this.corpus.map((d) => this._docText(d));
    if (!this._docEmbeddingCache || this._docEmbeddingCache.textsHash !== texts.join('~~')) {
      const res = await embedder.embed(texts);
      if (!res.vectors || res.vectors.length !== texts.length) {
        throw new Error('embedder returned incomplete vectors');
      }
      this._docEmbeddingCache = { textsHash: texts.join('~~'), vectors: res.vectors };
    }
    return this._docEmbeddingCache.vectors;
  }
}

export function loadCorpus(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

export function buildRetriever(path, opts) {
  const corpus = loadCorpus(path);
  return new KnowledgeRetriever(corpus, opts);
}