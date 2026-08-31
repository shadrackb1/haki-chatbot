// ============================================
// EMBEDDING ENGINE
// Unlocks semantic (hybrid) retrieval over the legal corpus using the keys
// we already have:
//   NVIDIA  → nvidia/nv-embed-v1 (OpenAI-compatible embeddings endpoint)
//   Google  → text-embedding-004 (Gemini API embedContent/batchEmbedContents)
// Pure fallback: any provider failure degrades gracefully to BM25-only search.
// ============================================

class EmbeddingEngine {
  constructor(options = {}) {
    this.fetchFn = options.fetchFn || globalThis.fetch;

    const nvidiaKey = options.nvidiaKey ?? process.env.LLM_API_KEY ?? '';
    const googleKey = options.googleKey ?? process.env.GOOGLE_API_KEY ?? '';

    this.providers = [
      {
        key: 'google',
        name: 'Google text-embedding',
        apiKey: googleKey,
        apiUrl: options.googleUrl || process.env.GOOGLE_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
        model: options.googleModel || process.env.GOOGLE_EMBED_MODEL || 'text-embedding-004',
        format: 'google',
        enabled: !!googleKey
      },
      {
        key: 'nvidia',
        name: 'NVIDIA NV-Embed',
        apiKey: nvidiaKey,
        apiUrl: options.nvidiaUrl || process.env.NVIDIA_EMBED_URL || 'https://integrate.api.nvidia.com/v1/embeddings',
        model: options.nvidiaModel || process.env.NVIDIA_EMBED_MODEL || 'nvidia/nv-embed-v1',
        format: 'openai',
        enabled: !!nvidiaKey
      }
    ];

    this.textCache = new Map();   // normalized text -> vector
    this.maxCache = options.maxCache || 2000;
    this.dim = null;
    this.stats = { calls: 0, ok: 0, fail: 0, cached: 0, provider: null };
  }

  enabled() {
    return this.providers.filter(p => p.enabled);
  }

  isAvailable() {
    return this.enabled().length > 0;
  }

  _cacheGet(text) {
    return this.textCache.get(text) || null;
  }

  _cacheSet(text, vec) {
    if (this.textCache.size >= this.maxCache) {
      const oldest = this.textCache.keys().next().value;
      this.textCache.delete(oldest);
    }
    this.textCache.set(text, vec);
  }

  // Embed an array of strings, returning vectors aligned with the input.
  // Tries each enabled provider until one succeeds.
  async embed(texts = []) {
    const clean = texts.map(t => String(t || '').trim().slice(0, 5000));
    const missing = clean.filter(Boolean);
    if (missing.length === 0) return { vectors: [], provider: null, error: 'empty input' };

    for (const provider of this.enabled()) {
      try {
        const vectors = await this._embedBatch(provider, missing);
        this.stats.calls += missing.length;
        this.stats.ok += missing.length;
        this.stats.provider = provider.key;
        this.dim = vectors[0] ? vectors[0].length : this.dim;
        return { vectors, provider: provider.key, error: null };
      } catch (error) {
        this.stats.fail += 1;
        console.warn(`[embedding] ${provider.name} failed (${error.message}) — trying next provider`);
      }
    }
    return { vectors: [], provider: null, error: 'all embedding providers failed' };
  }

  async _embedBatch(provider, texts) {
    const uncached = [];
    const cacheHits = new Map();
    for (const t of texts) {
      const hit = this._cacheGet(t);
      if (hit) cacheHits.set(t, hit);
      else uncached.push(t);
    }
    this.stats.cached += cacheHits.size;

    const out = new Map();
    for (const [t, v] of cacheHits) out.set(t, v);

    if (uncached.length > 0) {
      const vectors = provider.format === 'openai'
        ? await this._embedOpenAI(provider, uncached)
        : await this._embedGoogle(provider, uncached);
      for (let i = 0; i < uncached.length; i++) {
        const v = vectors[i];
        if (!v) continue;
        const normalized = this.normalizeVector(v);
        if (normalized) {
          out.set(uncached[i], normalized);
          this._cacheSet(uncached[i], normalized);
        }
      }
    }

    return texts.map(t => out.get(t)).filter(Boolean);
  }

  async _embedOpenAI(provider, texts) {
    const res = await this.fetchFn(provider.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        input: texts,
        encoding_format: 'float'
      })
    });
    if (!res.ok) {
      throw new Error(`NVIDIA embeddings ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    }
    const data = await res.json();
    const byIndex = new Map((data.data || []).map((d) => [d.index, d.embedding]));
    return texts.map((_, i) => byIndex.get(i));
  }

  async _embedGoogle(provider, texts) {
    const headers = { 'Content-Type': 'application/json' };
    if (texts.length === 1) {
      const res = await this.fetchFn(`${provider.apiUrl}/${provider.model}:embedContent?key=${provider.apiKey}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: `models/${provider.model}`, content: { parts: [{ text: texts[0] }] } })
      });
      if (!res.ok) {
        throw new Error(`Google embeddings ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      }
      const data = await res.json();
      const values = data.embedding?.values;
      return [Array.isArray(values) ? values : null];
    }

    // Google batchEmbedContents caps at 100 requests per call — chunk larger batches.
    const BATCH = 100;
    const allResults = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const chunk = texts.slice(i, i + BATCH);
      const res = await this.fetchFn(`${provider.apiUrl}/${provider.model}:batchEmbedContents?key=${provider.apiKey}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          requests: chunk.map((t) => ({ model: `models/${provider.model}`, content: { parts: [{ text: t }] } }))
        })
      });
      if (!res.ok) {
        throw new Error(`Google embeddings ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      }
      const data = await res.json();
      allResults.push(...(data.embeddings || []).map((e) => e?.values));
    }
    return allResults;
  }

  // L2-normalize a vector (best cosine performance + fair dot-product scoring).
  normalizeVector(v) {
    if (!Array.isArray(v) || v.length === 0) return null;
    let sumSq = 0;
    for (const x of v) sumSq += x * x;
    if (!sumSq) return null;
    const norm = Math.sqrt(sumSq);
    return v.map((x) => x / norm);
  }

  cosine(a, b) {
    if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  statsSnapshot() {
    return { ...this.stats, dim: this.dim, cacheSize: this.textCache.size };
  }
}

export default EmbeddingEngine;