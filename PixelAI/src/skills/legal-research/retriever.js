// BM25 retrieval over the legal corpus. Zero dependencies, in-memory index.

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
    this.index = new Map();
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

  search(query, topK = 3) {
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

    const results = [];
    for (let i = 0; i < this.nDocs; i++) {
      if (scores[i] > 0) {
        results.push({ ...this.corpus[i], score: scores[i] });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}

export default KnowledgeRetriever;
