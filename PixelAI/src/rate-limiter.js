import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const PERSIST_FILE = path.join(DATA_DIR, 'rate-limiter.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_CONFIG = {
    perUserPerMinute: 20,
    perUserPerDay: 200,
    globalConcurrent: 100,
    skillCooldowns: {
        'web-search': 5000,
        'image-gen': 30000,
        'voice-transcribe': 10000
    }
};

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const PERSIST_INTERVAL_MS = 60 * 1000;
const MINUTE_WINDOW_MS = 60 * 1000;

class RateLimiter {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        if (config.skillCooldowns) {
            this.config.skillCooldowns = { ...DEFAULT_CONFIG.skillCooldowns, ...config.skillCooldowns };
        }

        this.minuteWindows = new Map();
        this.dayCounts = new Map();
        this.skillTimestamps = new Map();
        this.concurrentCount = 0;
        this.concurrentByUser = new Map();

        this._lockQueue = [];
        this._locked = false;

        this._cleanupTimer = null;
        this._persistTimer = null;

        this._loadFromDisk();
        this._startTimers();
    }

    // --- Locking primitives ---

    async _acquireLock() {
        return new Promise((resolve) => {
            const tryAcquire = () => {
                if (!this._locked) {
                    this._locked = true;
                    resolve();
                } else {
                    this._lockQueue.push(tryAcquire);
                }
            };
            tryAcquire();
        });
    }

    _releaseLock() {
        if (this._lockQueue.length > 0) {
            const next = this._lockQueue.shift();
            next();
        } else {
            this._locked = false;
        }
    }

    async _withLock(fn) {
        await this._acquireLock();
        try {
            return await fn();
        } finally {
            this._releaseLock();
        }
    }

    // --- Core rate limit checks ---

    async checkLimit(userId, skillName = null) {
        return this._withLock(() => this._checkLimitSync(userId, skillName));
    }

    _checkLimitSync(userId, skillName) {
        const now = Date.now();

        if (!this.minuteWindows.has(userId)) {
            this.minuteWindows.set(userId, []);
        }
        const timestamps = this.minuteWindows.get(userId);
        this._pruneWindow(timestamps, now);

        if (timestamps.length >= this.config.perUserPerMinute) {
            const oldestInWindow = timestamps[0];
            const retryAfter = oldestInWindow + MINUTE_WINDOW_MS - now;
            return {
                allowed: false,
                reason: 'per-user-per-minute limit exceeded',
                retryAfter: Math.ceil(retryAfter)
            };
        }

        const dayCount = this.dayCounts.get(userId) || 0;
        if (dayCount >= this.config.perUserPerDay) {
            return {
                allowed: false,
                reason: 'per-user-per-day limit exceeded',
                retryAfter: this._msUntilMidnight()
            };
        }

        if (this.concurrentCount >= this.config.globalConcurrent) {
            return {
                allowed: false,
                reason: 'global concurrent limit reached',
                retryAfter: 1000
            };
        }

        if (skillName) {
            const cooldownMs = this.config.skillCooldowns[skillName];
            if (cooldownMs !== undefined) {
                const userSkillKey = `${userId}:${skillName}`;
                const lastUsed = this.skillTimestamps.get(userSkillKey) || 0;
                const elapsed = now - lastUsed;
                if (elapsed < cooldownMs) {
                    return {
                        allowed: false,
                        reason: `skill "${skillName}" cooldown active`,
                        retryAfter: Math.ceil(cooldownMs - elapsed)
                    };
                }
            }
        }

        return { allowed: true };
    }

    // --- Recording and releasing ---

    async recordRequest(userId, skillName = null) {
        return this._withLock(() => {
            const now = Date.now();

            if (!this.minuteWindows.has(userId)) {
                this.minuteWindows.set(userId, []);
            }
            this.minuteWindows.get(userId).push(now);

            const dayCount = (this.dayCounts.get(userId) || 0) + 1;
            this.dayCounts.set(userId, dayCount);

            if (skillName) {
                const userSkillKey = `${userId}:${skillName}`;
                this.skillTimestamps.set(userSkillKey, now);
            }

            this.concurrentCount++;
            const userConcurrent = (this.concurrentByUser.get(userId) || 0) + 1;
            this.concurrentByUser.set(userId, userConcurrent);
        });
    }

    async releaseRequest(userId) {
        return this._withLock(() => {
            if (this.concurrentCount > 0) {
                this.concurrentCount--;
            }
            const userConcurrent = this.concurrentByUser.get(userId) || 0;
            if (userConcurrent > 0) {
                this.concurrentByUser.set(userId, userConcurrent - 1);
            } else {
                this.concurrentByUser.delete(userId);
            }
        });
    }

    // --- Stats and management ---

    async getUserStats(userId) {
        return this._withLock(() => {
            const now = Date.now();
            const timestamps = this.minuteWindows.get(userId) || [];
            this._pruneWindow(timestamps, now);

            const dayCount = this.dayCounts.get(userId) || 0;
            const lastRequest = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

            return {
                minuteCount: timestamps.length,
                dayCount,
                lastRequest
            };
        });
    }

    async resetDaily() {
        return this._withLock(() => {
            this.dayCounts.clear();
            this._persistToDisk();
        });
    }

    async resetAll() {
        return this._withLock(() => {
            this.minuteWindows.clear();
            this.dayCounts.clear();
            this.skillTimestamps.clear();
            this.concurrentCount = 0;
            this.concurrentByUser.clear();
            this._persistToDisk();
        });
    }

    // --- Cleanup and persistence ---

    _pruneWindow(timestamps, now) {
        const cutoff = now - MINUTE_WINDOW_MS;
        while (timestamps.length > 0 && timestamps[0] <= cutoff) {
            timestamps.shift();
        }
    }

    _cleanup() {
        const now = Date.now();
        const cutoff = now - MINUTE_WINDOW_MS;

        for (const [userId, timestamps] of this.minuteWindows) {
            this._pruneWindow(timestamps, now);
            if (timestamps.length === 0) {
                this.minuteWindows.delete(userId);
                const dayCount = this.dayCounts.get(userId) || 0;
                if (dayCount === 0) {
                    this.concurrentByUser.delete(userId);
                }
            }
        }

        for (const [userId, dayCount] of this.dayCounts) {
            if (dayCount === 0 && !this.minuteWindows.has(userId)) {
                this.dayCounts.delete(userId);
            }
        }

        for (const [key, ts] of this.skillTimestamps) {
            const skillName = key.split(':')[1];
            const cooldownMs = this.config.skillCooldowns[skillName] || 0;
            if (ts < cutoff - cooldownMs) {
                this.skillTimestamps.delete(key);
            }
        }
    }

    _msUntilMidnight() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        return midnight.getTime() - now.getTime();
    }

    _persistToDisk() {
        try {
            const data = {
                version: 1,
                savedAt: new Date().toISOString(),
                dayCounts: Object.fromEntries(this.dayCounts),
                concurrentCount: this.concurrentCount,
                concurrentByUser: Object.fromEntries(this.concurrentByUser)
            };
            fs.writeFileSync(PERSIST_FILE, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.log('⚠️ Could not persist rate limiter state:', e.message);
        }
    }

    _loadFromDisk() {
        try {
            if (fs.existsSync(PERSIST_FILE)) {
                const raw = fs.readFileSync(PERSIST_FILE, 'utf8');
                const data = JSON.parse(raw);
                if (data.version === 1) {
                    if (data.dayCounts) {
                        for (const [k, v] of Object.entries(data.dayCounts)) {
                            this.dayCounts.set(k, v);
                        }
                    }
                    this.concurrentCount = data.concurrentCount || 0;
                    if (data.concurrentByUser) {
                        for (const [k, v] of Object.entries(data.concurrentByUser)) {
                            this.concurrentByUser.set(k, v);
                        }
                    }
                }
            }
        } catch (e) {
            console.log('⚠️ Could not load rate limiter state:', e.message);
        }
    }

    _startTimers() {
        this._cleanupTimer = setInterval(() => {
            this._withLock(() => this._cleanup()).catch(() => {});
        }, CLEANUP_INTERVAL_MS);

        this._persistTimer = setInterval(() => {
            this._withLock(() => this._persistToDisk()).catch(() => {});
        }, PERSIST_INTERVAL_MS);

        if (this._cleanupTimer.unref) this._cleanupTimer.unref();
        if (this._persistTimer.unref) this._persistTimer.unref();
    }

    destroy() {
        if (this._cleanupTimer) {
            clearInterval(this._cleanupTimer);
            this._cleanupTimer = null;
        }
        if (this._persistTimer) {
            clearInterval(this._persistTimer);
            this._persistTimer = null;
        }
        this._withLock(() => this._persistToDisk()).catch(() => {});
    }
}

export default RateLimiter;
