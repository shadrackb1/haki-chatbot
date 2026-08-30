import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// ============================================
// FREE / OPEN-SOURCE SMS GATEWAYS
// One uniform interface, three providers:
//   simulator — zero-cost demo (no SIM/hardware)
//   textbee   — free OSS self-hosted gateway (Android phone as modem,
//               REST API). github.com/textbee/textbee
//   gammu     — free OSS NMS daemon (GSM modem / old phone, GPL),
//               gammu-smsd + gammu-smsd-inject
// Selected via SMS_PROVIDER env (default: simulator).
// ============================================

export function normalizeMsisdn(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[\s\-()]/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return '+' + s.slice(2);
  if (s.startsWith('0')) return '+254' + s.slice(1);
  if (/^7\d{8}$/.test(s)) return '+254' + s;
  if (/^1\d{2,4}$/.test(s)) return s; // shortcodes / service numbers
  return s;
}

export function isMsisdn(value) {
  return /^\+?\d{9,15}$/.test(String(value || ''));
}

class SimulatorProvider {
  kind = 'simulator';

  constructor(options = {}) {
    this.shortcode = options.shortcode || process.env.SMS_SHORTCODE || '22141';
    this.outbox = [];
    this.inbound = [];
    this.handler = null;
    this.receivedMessages = [];
  }

  // Inbound SMS from a (pretend) number — what the dashboard console fires.
  inject({ from, text }) {
    if (!from || !text) throw new Error('SMS inject requires { from, text }');
    const fromNorm = normalizeMsisdn(from);
    const message = { from: fromNorm, text: String(text), at: new Date().toISOString() };
    this.inbound.push(message);
    if (this.handler) {
      this.handler(message).catch(e => console.error('[SimulatorProvider] handler error:', e.message));
    }
    return message;
  }

  async send({ to, text }) {
    if (!to || !text) throw new Error('SMS send requires { to, text }');
    const record = { to: normalizeMsisdn(to), from: this.shortcode, text, at: new Date().toISOString() };
    this.outbox.push(record);
    return { ok: true, providerId: 'simulator', messageId: `SIM-${this.outbox.length}` };
  }

  start(handler) {
    this.handler = handler;
    return this;
  }

  stop() {
    this.handler = null;
  }

  snapshot() {
    return {
      kind: this.kind,
      shortcode: this.shortcode,
      sent: this.outbox.length,
      received: this.inbound.length
    };
  }
}

class TextBeeProvider {
  kind = 'textbee';

  constructor(options = {}) {
    this.baseUrl = (options.url || process.env.TEXTBEE_URL || 'http://localhost:8080').replace(/\/$/, '');
    this.apiKey = options.apiKey || process.env.TEXTBEE_API_KEY || '';
    this.channel = options.channel || process.env.TEXTBEE_CHANNEL || 'gateway';
    this.simulator = options.simulator !== undefined ? options.simulator : (process.env.TEXTBEE_SIMULATOR || 'false') === 'true';
    this.handler = null;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.history = [];
  }

  async send({ to, text }) {
    const body = {
      numbers: [normalizeMsisdn(to)],
      text: String(text),
      channel: this.channel,
      simulator: this.simulator
    };
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-TEXTBEE-API-KEY'] = this.apiKey;

    const res = await this.fetchFn(`${this.baseUrl}/api/v1/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(`TextBee send failed: ${res.status} ${await res.text()}`);
    }
    this.history.push({ to, text, ok: true });
    return { ok: true, providerId: 'textbee', messageId: `TB-${this.history.length}` };
  }

  // Inbound arrives via the dashboard webhook → route it here.
  ingestInbound({ from, text }) {
    return this.handler ? this.handler({ from: normalizeMsisdn(from), text: String(text), at: new Date().toISOString() }) : null;
  }

  start(handler) {
    this.handler = handler;
    return this;
  }

  stop() {
    this.handler = null;
  }
}

class GammuProvider {
  kind = 'gammu';

  constructor(options = {}) {
    this.sendFn = options.sendFn || null; // injectable for tests
    this.bin = options.bin || process.env.GAMMU_BIN || 'gammu-smsd-inject';
    this.inboxDir = options.inboxDir || process.env.GAMMU_INBOX_DIR || '';
    this.handler = null;
    this.timer = null;
    this.pollMs = parseInt(options.pollMs || process.env.GAMMU_POLL_MS || '2000', 10);
    this.processed = new Set();
  }

  async send({ to, text }) {
    if (this.sendFn) {
      return this.sendFn({ to, text });
    }
    await new Promise((resolve, reject) => {
      const child = spawn(this.bin, ['smsd', '-', String(text)], { stdio: ['pipe', 'ignore', 'pipe'] });
      child.stdin.end(text);
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`gammu-smsd-inject exited ${code}`))));
    });
    return { ok: true, providerId: 'gammu' };
  }

  // filesystem back-end: SMSD writes inbound as INBOX*.txt with
  // "Sender:" / "Text:" lines. New files are handed to the handler once.
  scanInbox() {
    let read = 0;
    if (!this.inboxDir || !fs.existsSync(this.inboxDir)) return read;
    let entries = [];
    try { entries = fs.readdirSync(this.inboxDir).filter(f => f.endsWith('.txt')).sort(); } catch { return read; }
    for (const file of entries) {
      if (this.processed.has(file)) continue;
      const p = path.join(this.inboxDir, file);
      let content = '';
      try { content = fs.readFileSync(p, 'utf8'); } catch { continue; }
      const sender = (content.match(/^Sender:\s*(.+)$/m) || [])[1] || '';
      const text = (content.match(/^Text:\s*([\s\S]+)$/m) || [])[1] || content.trim();
      if (sender && text && this.handler) {
        const message = { from: normalizeMsisdn(sender.trim()), text: text.trim(), at: new Date().toISOString() };
        this.handler(message).catch(e => console.error('[GammuProvider] handler error:', e.message));
      }
      this.processed.add(file);
      read += 1;
    }
    // keep the processed set bounded
    if (this.processed.size > 500) {
      const oldest = [...this.processed].slice(0, this.processed.size - 500);
      oldest.forEach(f => this.processed.delete(f));
    }
    return read;
  }

  start(handler) {
    this.handler = handler;
    if (this.inboxDir && !this.timer) {
      this.timer = setInterval(() => this.scanInbox(), this.pollMs);
      if (this.timer.unref) this.timer.unref();
    }
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.handler = null;
  }
}

export function createSmsGateway(providerName = process.env.SMS_PROVIDER || 'simulator', options = {}) {
  switch (providerName) {
    case 'simulator':
      return new SimulatorProvider(options);
    case 'textbee':
      return new TextBeeProvider(options);
    case 'gammu':
      return new GammuProvider(options);
    default:
      throw new Error(`Unknown SMS provider: ${providerName}`);
  }
}

export { SimulatorProvider, TextBeeProvider, GammuProvider };