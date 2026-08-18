import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const ESCALATION_LOG_PATH = path.join(DATA_DIR, 'escalation-log.json');
const MAX_LOG_ENTRIES = 100;

class EscalationSystem {
    constructor() {
        this.escalationKeywords = [
            'urgent',
            'emergency',
            'important',
            'asap',
            'right now',
            'immediately',
            'critical',
            'help',
            'urgent matter',
            'time sensitive'
        ];

        this.notificationMethods = {
            console: true,
            whatsapp: false,
            sms: false,
            email: false,
            push: false
        };

        this.notificationHistory = [];
        this.escalationLog = [];

        this.loadEscalationLog();
    }

    loadEscalationLog() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }
            if (fs.existsSync(ESCALATION_LOG_PATH)) {
                const raw = fs.readFileSync(ESCALATION_LOG_PATH, 'utf-8');
                const parsed = JSON.parse(raw);
                this.escalationLog = Array.isArray(parsed) ? parsed.slice(-MAX_LOG_ENTRIES) : [];
            }
        } catch {
            this.escalationLog = [];
        }
    }

    saveEscalationLog() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }
            const trimmed = this.escalationLog.slice(-MAX_LOG_ENTRIES);
            fs.writeFileSync(ESCALATION_LOG_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');
        } catch {
            // persistence failure should not crash the bot
        }
    }

    appendToLog(entry) {
        this.escalationLog.push(entry);
        if (this.escalationLog.length > MAX_LOG_ENTRIES) {
            this.escalationLog = this.escalationLog.slice(-MAX_LOG_ENTRIES);
        }
        this.saveEscalationLog();
    }

    getSeverityLevel(score) {
        if (score <= 15) return 'low';
        if (score <= 30) return 'medium';
        return 'high';
    }

    checkForEscalation(message, userContext) {
        const lowerMessage = message.toLowerCase().trim();

        let shouldEscalate = false;
        let urgencyScore = 0;
        const matchedKeywords = [];

        this.escalationKeywords.forEach(keyword => {
            if (lowerMessage.includes(keyword)) {
                shouldEscalate = true;
                urgencyScore += 10;
                matchedKeywords.push(keyword);
            }
        });

        const exclamationCount = (lowerMessage.match(/!/g) || []).length;
        const questionCount = (lowerMessage.match(/\?/g) || []).length;

        if (exclamationCount >= 3 || questionCount >= 3) {
            shouldEscalate = true;
            urgencyScore += Math.min(exclamationCount, questionCount) * 5;
        }

        const words = lowerMessage.split(/\s+/);
        const allCapsWords = words.filter(word =>
            word.length >= 3 &&
            word === word.toUpperCase() &&
            !/^\d+$/.test(word)
        );

        if (allCapsWords.length >= 2) {
            shouldEscalate = true;
            urgencyScore += allCapsWords.length * 3;
        }

        return {
            shouldEscalate,
            urgencyScore,
            matchedKeywords,
            message,
            timestamp: new Date().toISOString(),
            userContext: userContext || {}
        };
    }

    buildOwnerAlert(userPhone, escalationCheck) {
        const preview = escalationCheck.message.length > 200
            ? escalationCheck.message.substring(0, 200) + '...'
            : escalationCheck.message;

        return [
            '🚨 *ESCALATION ALERT*',
            '',
            `From: ${userPhone}`,
            `Urgency: ${escalationCheck.urgencyScore}/50`,
            `Severity: ${this.getSeverityLevel(escalationCheck.urgencyScore).toUpperCase()}`,
            `Keywords: ${escalationCheck.matchedKeywords.join(', ') || 'none'}`,
            '',
            `Message: ${preview}`,
            '',
            `Time: ${escalationCheck.timestamp}`
        ].join('\n');
    }

    async notifyOwner(sock, ownerNumber, userPhone, escalationCheck) {
        if (!sock || !ownerNumber) return;

        const text = this.buildOwnerAlert(userPhone, escalationCheck);

        try {
            await sock.sendMessage(ownerNumber + '@s.whatsapp.net', { text });
        } catch {
            // owner notification failure should not crash the bot
        }
    }

    async notifyUser(escalationCheck, userPhone, sock, ownerNumber) {
        const severity = this.getSeverityLevel(escalationCheck.urgencyScore);

        // Console notification
        if (this.notificationMethods.console) {
            console.log(`🚨 ESCALATION [${severity.toUpperCase()}] from ${userPhone}`);
            console.log(`   Content: ${escalationCheck.message.substring(0, 100)}...`);
            console.log(`   Urgency Score: ${escalationCheck.urgencyScore}`);
            console.log(`   Keywords: ${escalationCheck.matchedKeywords.join(', ')}`);
        }

        // Persist to log
        const logEntry = {
            ...escalationCheck,
            userPhone,
            severity,
            notifiedAt: new Date().toISOString()
        };
        this.notificationHistory.push(logEntry);
        this.appendToLog(logEntry);

        // High severity → WhatsApp alert to owner
        if (severity === 'high' && this.notificationMethods.whatsapp) {
            await this.notifyOwner(sock, ownerNumber, userPhone, escalationCheck);
        }
    }

    getEscalationSummary(hours = 24) {
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        const recent = this.escalationLog.filter(e => new Date(e.timestamp).getTime() >= cutoff);

        return {
            hours,
            total: recent.length,
            low: recent.filter(e => e.severity === 'low').length,
            medium: recent.filter(e => e.severity === 'medium').length,
            high: recent.filter(e => e.severity === 'high').length
        };
    }

    getTopEscalatedUsers(limit = 5) {
        const counts = {};
        for (const entry of this.escalationLog) {
            const phone = entry.userPhone || 'unknown';
            counts[phone] = (counts[phone] || 0) + 1;
        }

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([phone, count]) => ({ phone, count }));
    }

    getNotificationHistory(limit = 10) {
        return this.notificationHistory.slice(-limit).reverse();
    }

    clearNotificationHistory() {
        this.notificationHistory = [];
    }

    addEscalationKeyword(keyword) {
        if (!this.escalationKeywords.includes(keyword.toLowerCase())) {
            this.escalationKeywords.push(keyword.toLowerCase());
        }
    }

    removeEscalationKeyword(keyword) {
        const index = this.escalationKeywords.indexOf(keyword.toLowerCase());
        if (index > -1) {
            this.escalationKeywords.splice(index, 1);
        }
    }

    setNotificationMethod(method, enabled) {
        if (this.notificationMethods.hasOwnProperty(method)) {
            this.notificationMethods[method] = enabled;
        }
    }

    getNotificationMethods() {
        return { ...this.notificationMethods };
    }
}

export default EscalationSystem;
