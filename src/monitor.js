import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FEED_PATH = path.join(__dirname, '..', 'data', 'dashboard-feed.jsonl');

const RING_SIZE = 500;
const ring = [];

function appendFeed(event) {
  try {
    fs.appendFileSync(FEED_PATH, JSON.stringify(event) + '\n');
  } catch {}
}

class Monitor {
  constructor({ port = 3002 } = {}) {
    this.port = port;
    this.server = null;
    this.sources = {};
    this.subscribers = new Set();
    this.counters = {
      registrations: 0,
      credentialPushes: 0,
      reactive: 0,
      autonomousInfo: 0,
      autonomousFollowUp: 0
    };
    this.startedAt = new Date().toISOString();
  }

  attachSource(name, ref) {
    this.sources[name] = ref;
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  // 自动推送：任何系统事件即时进入数据流与仪表盘
  push(type, payload, origin = 'KNOWN_TRIGGER') {
    const event = {
      type,
      origin,
      payload: Monitor.redact(payload),
      at: new Date().toISOString()
    };
    ring.push(event);
    if (ring.length > RING_SIZE) ring.shift();
    appendFeed(event);

    if (type === 'registration') this.counters.registrations += 1;
    if (type === 'credentials') this.counters.credentialPushes += 1;
    if (origin === 'AUTONOMOUS_IMPORTANT_INFO' || origin === 'AUTONOMOUS_FOLLOW_UP') this.counters.autonomousInfo += 1;
    if (origin === 'KNOWN_TRIGGER') this.counters.reactive += 1;

    for (const fn of this.subscribers) {
      try { fn(event); } catch {}
    }

    return event;
  }

  pushCredentials(user) {
    return this.push('credentials', {
      phone: user.phone,
      version: user.version,
      registration: user.registration?.status,
      fields: Object.keys(user.credentials || {}),
      language: user.language
    });
  }

  // 对比是关键：被动机器人活动 vs 自主推送
  comparison() {
    const totalAutonomous = this.counters.autonomousInfo;
    return {
      botActivityReactive: this.counters.reactive,
      autonomousWithoutTrigger: totalAutonomous,
      breakdown: {
        knownTrigger: this.counters.reactive,
        importantInfo: this.counters.autonomousInfo
      },
      ratio: this.counters.reactive > 0
        ? (totalAutonomous / (totalAutonomous + this.counters.reactive)).toFixed(3)
        : null
    };
  }

  static redact(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const clone = JSON.parse(JSON.stringify(payload));
    if (clone.phone) clone.phone = String(clone.phone).slice(0, 4) + '***';
    for (const k of ['password', 'pin', 'idNumber']) delete clone[k];
    return clone;
  }

  snapshot() {
    return {
      service: 'haki-agri-shield-monitor',
      startedAt: this.startedAt,
      uptimeSeconds: Math.floor((Date.now() - new Date(this.startedAt).getTime()) / 1000),
      counters: this.counters,
      comparison: this.comparison(),
      sources: Object.keys(this.sources),
      userStats: this.sources.userDb ? this.sources.userDb.stats() : null,
      sessionStats: this.sources.sessions ? this.sources.sessions.stats() : null,
      recentEvents: ring.slice(-25)
    };
  }

  start() {
    if (this.server) return this.port;
    this.server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(this.snapshot(), null, 2));
    });
    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ 端口 ${this.port} 被占用 — 仪表盘监控切换至端口 ${this.port + 1}`);
        this.port += 1;
        this.server = null;
        return this.start();
      }
      console.log(`⚠️ 仪表盘监控错误: ${err.message}`);
      this.server = null;
    });
    this.server.listen(this.port, () => {
      console.log(`📊 仪表盘监控: http://localhost:${this.port}/monitor`);
    });
    return this.port;
  }
}

export default Monitor;
