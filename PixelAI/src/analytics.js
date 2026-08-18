import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

function hourKey() {
    return new Date().getHours();
}

class Analytics {
    constructor() {
        this.store = this.load();
        this.activeUsers = new Set();
        this.autoSaveTimer = null;
        this.startAutoSave();
    }

    // ── persistence ────────────────────────────────────────────

    load() {
        try {
            if (fs.existsSync(ANALYTICS_FILE)) {
                const raw = fs.readFileSync(ANALYTICS_FILE, 'utf8');
                return JSON.parse(raw);
            }
        } catch {
            console.log('⚠️  Could not load analytics, starting fresh');
        }
        return this.blankStore();
    }

    save() {
        try {
            fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(this.store, null, 2), 'utf8');
        } catch (e) {
            console.log('⚠️  Could not save analytics:', e.message);
        }
    }

    blankStore() {
        return {
            days: {},
            users: {}
        };
    }

    blankDay() {
        return {
            messages: { incoming: 0, outgoing: 0, byHour: Array(24).fill(0) },
            uniqueUsers: [],
            newUsers: 0,
            skills: {},
            llm: { calls: 0, tokensUsed: 0, totalResponseTime: 0, successes: 0, failures: 0 },
            errors: [],
            errorCounts: {}
        };
    }

    // ── helpers ────────────────────────────────────────────────

    ensureDay(dateKey) {
        if (!this.store.days[dateKey]) {
            this.store.days[dateKey] = this.blankDay();
        }
        return this.store.days[dateKey];
    }

    ensureUser(userId) {
        if (!this.store.users[userId]) {
            this.store.users[userId] = {
                firstSeen: new Date().toISOString(),
                lastSeen: null,
                messages: { incoming: 0, outgoing: 0 },
                skills: {},
                llm: { calls: 0, tokensUsed: 0, totalResponseTime: 0 },
                errors: 0
            };
        }
        return this.store.users[userId];
    }

    startAutoSave() {
        this.autoSaveTimer = setInterval(() => this.save(), 5 * 60 * 1000);
        if (this.autoSaveTimer.unref) this.autoSaveTimer.unref();
    }

    // ── tracking ───────────────────────────────────────────────

    trackMessage(userId, direction, metadata = {}) {
        const dk = todayKey();
        const day = this.ensureDay(dk);
        const user = this.ensureUser(userId);
        const h = hourKey();

        if (!day.uniqueUsers.includes(userId)) {
            day.uniqueUsers.push(userId);
            day.newUsers++;
        }

        if (direction === 'incoming') {
            day.messages.incoming++;
            user.messages.incoming++;
        } else {
            day.messages.outgoing++;
            user.messages.outgoing++;
        }
        day.messages.byHour[h]++;

        user.lastSeen = new Date().toISOString();
    }

    trackSkillUsage(skillName, userId, success, responseTimeMs) {
        const dk = todayKey();
        const day = this.ensureDay(dk);
        const user = this.ensureUser(userId);

        const bucket = (target, name) => {
            if (!target[name]) {
                target[name] = { uses: 0, successes: 0, totalResponseTime: 0 };
            }
            const s = target[name];
            s.uses++;
            if (success) s.successes++;
            s.totalResponseTime += responseTimeMs;
        };

        bucket(day.skills, skillName);
        bucket(user.skills, skillName);
    }

    trackLLMCall(provider, model, tokensUsed, responseTimeMs, success) {
        const dk = todayKey();
        const day = this.ensureDay(dk);

        day.llm.calls++;
        day.llm.tokensUsed += tokensUsed;
        day.llm.totalResponseTime += responseTimeMs;
        if (success) day.llm.successes++;
        else day.llm.failures++;
    }

    trackError(errorType, message, context = {}) {
        const dk = todayKey();
        const day = this.ensureDay(dk);

        day.errors.push({
            type: errorType,
            message,
            context,
            timestamp: new Date().toISOString()
        });
        day.errorCounts[errorType] = (day.errorCounts[errorType] || 0) + 1;
    }

    // ── queries ────────────────────────────────────────────────

    getDailyStats() {
        const dk = todayKey();
        const day = this.ensureDay(dk);

        const totalMessages = day.messages.incoming + day.messages.outgoing;

        const topSkills = Object.entries(day.skills)
            .map(([name, s]) => ({
                name,
                uses: s.uses,
                avgResponseTime: s.uses ? Math.round(s.totalResponseTime / s.uses) : 0,
                successRate: s.uses ? Math.round((s.successes / s.uses) * 100) : 0
            }))
            .sort((a, b) => b.uses - a.uses);

        const topErrors = Object.entries(day.errorCounts)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count);

        return {
            totalMessages,
            incomingMessages: day.messages.incoming,
            outgoingMessages: day.messages.outgoing,
            uniqueUsers: day.uniqueUsers.length,
            newUsers: day.newUsers,
            topSkills,
            llmCalls: day.llm.calls,
            totalTokensUsed: day.llm.tokensUsed,
            avgResponseTime: day.llm.calls
                ? Math.round(day.llm.totalResponseTime / day.llm.calls)
                : 0,
            errorCount: day.errors.length,
            topErrors
        };
    }

    getUserStats(userId) {
        const user = this.store.users[userId];
        if (!user) return null;

        const skillStats = Object.entries(user.skills)
            .map(([name, s]) => ({
                name,
                uses: s.uses,
                avgResponseTime: s.uses ? Math.round(s.totalResponseTime / s.uses) : 0,
                successRate: s.uses ? Math.round((s.successes / s.uses) * 100) : 0
            }))
            .sort((a, b) => b.uses - a.uses);

        return {
            firstSeen: user.firstSeen,
            lastSeen: user.lastSeen,
            totalMessages: user.messages.incoming + user.messages.outgoing,
            incomingMessages: user.messages.incoming,
            outgoingMessages: user.messages.outgoing,
            topSkills: skillStats,
            llmCalls: user.llm.calls,
            totalTokensUsed: user.llm.tokensUsed,
            avgResponseTime: user.llm.calls
                ? Math.round(user.llm.totalResponseTime / user.llm.calls)
                : 0,
            errorCount: user.errors
        };
    }

    getHourlyBreakdown() {
        const dk = todayKey();
        const day = this.ensureDay(dk);
        return day.messages.byHour.slice();
    }

    // ── console dashboard ──────────────────────────────────────

    formatConsoleDashboard() {
        const s = this.getDailyStats();
        const hours = this.getHourlyBreakdown();
        const maxH = Math.max(...hours, 1);
        const barWidth = 20;

        const pad = (str, len) => String(str).padEnd(len);
        const padL = (str, len) => String(str).padStart(len);

        let out = '';
        const line = '─'.repeat(58);

        out += `\n╔══════════════════════════════════════════════════════════╗\n`;
        out += `║            📊  ANALYTICS DASHBOARD  —  ${todayKey()}            ║\n`;
        out += `╚══════════════════════════════════════════════════════════╝\n\n`;

        out += `  MESSAGES\n`;
        out += `  ${line}\n`;
        out += `  Total        ${padL(s.totalMessages, 6)}   │  Incoming   ${padL(s.incomingMessages, 6)}\n`;
        out += `  Outgoing     ${padL(s.outgoingMessages, 6)}   │  Users      ${padL(s.uniqueUsers, 6)}\n`;
        out += `  New Users    ${padL(s.newUsers, 6)}\n\n`;

        out += `  LLM CALLS\n`;
        out += `  ${line}\n`;
        out += `  Calls        ${padL(s.llmCalls, 6)}   │  Tokens     ${padL(s.totalTokensUsed, 6)}\n`;
        out += `  Avg RT       ${padL(s.avgResponseTime + 'ms', 10)}\n\n`;

        out += `  ERRORS       ${padL(s.errorCount, 6)}\n\n`;

        if (s.topErrors.length) {
            out += `  TOP ERRORS\n`;
            out += `  ${line}\n`;
            s.topErrors.slice(0, 5).forEach(e => {
                out += `  ${pad(e.type, 28)} ${padL(e.count, 4)}\n`;
            });
            out += '\n';
        }

        if (s.topSkills.length) {
            out += `  TOP SKILLS\n`;
            out += `  ${line}\n`;
            s.topSkills.slice(0, 8).forEach(sk => {
                out += `  ${pad(sk.name, 20)} uses:${padL(sk.uses, 4)}  avg:${padL(sk.avgResponseTime + 'ms', 8)}  ok:${padL(sk.successRate + '%', 4)}\n`;
            });
            out += '\n';
        }

        out += `  HOURLY BREAKDOWN\n`;
        out += `  ${line}\n`;
        for (let h = 0; h < 24; h++) {
            const bar = '█'.repeat(Math.round((hours[h] / maxH) * barWidth));
            out += `  ${padL(h, 2)}:00  ${pad(bar, barWidth)}  ${padL(hours[h], 4)}\n`;
        }

        out += `\n${line}\n`;
        out += `  Generated: ${new Date().toLocaleTimeString()}\n\n`;

        return out;
    }

    // ── maintenance ────────────────────────────────────────────

    resetDaily() {
        const dk = todayKey();
        this.ensureDay(dk);
        this.store.days[dk] = this.blankDay();
        this.activeUsers.clear();
        this.save();
    }

    destroy() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
        this.save();
    }
}

export default Analytics;
