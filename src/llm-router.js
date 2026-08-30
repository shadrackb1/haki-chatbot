const MODES = {
  ROUND_ROBIN: 'round-robin',
  PRIORITY: 'priority',
  FAVORITE: 'favorite'
};

const FAIL_DEPRIORITIZE_THRESHOLD = 2;

class LLMRouter {
  // providers: [{ key, name, model, enabled }]
  constructor(providers = [], options = {}) {
    this.pool = providers;
    this.cursor = 0;
    this.stats = {};
    for (const p of this.pool) {
      this.stats[p.key] = { calls: 0, ok: 0, fail: 0, consecutiveFail: 0 };
    }
    this.mode = options.mode || process.env.LLM_ROUTING || MODES.ROUND_ROBIN;
    this.favorite = options.favorite || process.env.LLM_FAVORITE_PROVIDER || '';
  }

  enabled() {
    return this.pool.filter(p => p.enabled);
  }

  any() {
    return this.enabled().length > 0;
  }

  has(key) {
    return this.pool.some(p => p.key === key && p.enabled);
  }

  // Pick the next provider key for a call.
  // Explicit preferKey wins; then mode rules; default round-robin rotates.
  next(preferKey) {
    const active = this.enabled();
    if (active.length === 0) return null;

    if (preferKey) {
      const hit = active.find(p => p.key === preferKey);
      if (hit) return hit.key;
    }

    if (this.mode === MODES.PRIORITY) {
      return active[0].key;
    }

    if (this.mode === MODES.FAVORITE && this.favorite && this.has(this.favorite)) {
      return this.favorite;
    }

    const healthy = active.filter(p => this.stats[p.key].consecutiveFail < FAIL_DEPRIORITIZE_THRESHOLD);
    const cycle = healthy.length > 0 ? healthy : active;
    const pick = cycle[this.cursor % cycle.length];
    this.cursor += 1;
    return pick.key;
  }

  // The full routing order for one message: first pick plus cascade rest.
  // A per-message `mode` overrides the configured mode without mutating state.
  order(preferKey, mode = this.mode) {
    const active = this.enabled();
    if (active.length === 0) return [];

    if (mode === MODES.PRIORITY) {
      return active.map(p => p.key);
    }

    let startKey = null;
    if (preferKey && this.has(preferKey)) startKey = preferKey;
    if (!startKey && mode === MODES.FAVORITE && this.favorite && this.has(this.favorite)) {
      startKey = this.favorite;
    }
    if (!startKey) {
      const healthy = active.filter(p => this.stats[p.key].consecutiveFail < FAIL_DEPRIORITIZE_THRESHOLD);
      const cycle = healthy.length > 0 ? healthy : active;
      startKey = cycle[this.cursor % cycle.length].key;
      this.cursor += 1;
    }
    const idx = active.findIndex(p => p.key === startKey);
    return active.slice(idx).concat(active.slice(0, idx)).map(p => p.key);
  }

  record(key, ok) {
    const s = this.stats[key];
    if (!s) return;
    s.calls += 1;
    if (ok) {
      s.ok += 1;
      s.consecutiveFail = 0;
    } else {
      s.fail += 1;
      s.consecutiveFail += 1;
    }
  }

  resetStats(key) {
    if (this.stats[key]) {
      this.stats[key] = { calls: 0, ok: 0, fail: 0, consecutiveFail: 0 };
    }
  }

  snapshot() {
    return {
      mode: this.mode,
      favorite: this.favorite,
      enabled: this.enabled().map(p => ({ key: p.key, name: p.name, model: p.model })),
      stats: JSON.parse(JSON.stringify(this.stats)),
      cursor: this.cursor
    };
  }
}

export default LLMRouter;
export { MODES };