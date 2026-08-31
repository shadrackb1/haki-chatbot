// ============================================
// RATE LIMITER — per-phone sliding-window throttle
// Guards the LLM/cost path against inbound abuse and runaway loops.
// A phone that exceeds the window budget is temporarily blocked and the
// caller is told to wait/slow down rather than triggering more model calls.
// ============================================

class RateLimiter {
  // options: { windowMs, max, now }  — now injectable for tests
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000;
    this.max = options.max || 12; // max messages per window per phone
    this._now = options.now || (() => Date.now());
    this.hits = new Map(); // phone -> [timestamps]
  }

  now() {
    return this._now();
  }

  _prune(phone) {
    const arr = this.hits.get(phone);
    if (!arr) return;
    const cutoff = this.now() - this.windowMs;
    const kept = arr.filter((t) => t > cutoff);
    if (kept.length === 0) this.hits.delete(phone);
    else this.hits.set(phone, kept);
  }

  // Record a hit. Returns true if the caller is within budget (allowed),
  // false if blocked (over the limit in the current window).
  hit(phone) {
    const key = String(phone || 'anon');
    this._prune(key);
    const arr = this.hits.get(key) || [];
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(this.now());
    this.hits.set(key, arr);
    return true;
  }

  // Milliseconds until the phone can send again (0 if not blocked).
  retryAfterMs(phone) {
    const key = String(phone || 'anon');
    this._prune(key);
    const arr = this.hits.get(key) || [];
    if (arr.length < this.max) return 0;
    const oldest = arr[0];
    return Math.max(0, this.windowMs - (this.now() - oldest));
  }

  reset(phone) {
    this.hits.delete(String(phone || 'anon'));
  }

  clear() {
    this.hits.clear();
  }

  counts() {
    const out = {};
    for (const [k, v] of this.hits.entries()) out[k] = v.length;
    return out;
  }
}

export default RateLimiter;
