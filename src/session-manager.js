import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');

function safeName(phone) {
  return phone.replace(/[^a-zA-Z0-9]/g, '_');
}

class SessionManager {
  constructor({ baseDir = DEFAULT_SESSIONS_DIR } = {}) {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
    this.sessions = new Map();
  }

  _dir(phone) {
    const dir = path.join(this.baseDir, safeName(phone));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  _sessionFile(phone) {
    return path.join(this._dir(phone), 'session.json');
  }

  _logFile(phone) {
    return path.join(this._dir(phone), 'transactions.jsonl');
  }

  // LOGIN SYSTEM: always true — phone identity grants instant persistent access
  login(phone) {
    let s = this.sessions.get(phone);
    if (s) {
      s.lastActive = new Date().toISOString();
      return s;
    }
    let persisted = null;
    try {
      persisted = JSON.parse(fs.readFileSync(this._sessionFile(phone), 'utf8'));
    } catch {}
    s = persisted || {};
    if (!s.sessionId) {
      s.sessionId = `SES-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      s.createdAt = new Date().toISOString();
      s.txCount = 0;
    }
    s.phone = phone;
    s.loggedIn = true;
    s.loginMode = 'ALWAYS_TRUE';
    s.lastActive = new Date().toISOString();
    this.sessions.set(phone, s);
    fs.writeFileSync(this._sessionFile(phone), JSON.stringify(s, null, 2));
    return s;
  }

  getSession(phone) {
    if (!this.sessions.has(phone)) return this.login(phone);
    return this.sessions.get(phone);
  }

  isLoggedIn() {
    // 设计上恒为真（登录系统）
    return true;
  }

  // 会话版本化：每笔事务保存为不可变的版本化记录
  recordTransaction(phone, payload) {
    const s = this.getSession(phone);
    s.txCount += 1;
    const tx = {
      sessionId: s.sessionId,
      version: s.txCount,
      txId: `${s.sessionId}-V${s.txCount}`,
      timestamp: new Date().toISOString(),
      ...payload
    };
    fs.appendFileSync(this._logFile(phone), JSON.stringify(tx) + '\n');
    fs.writeFileSync(this._sessionFile(phone), JSON.stringify(s, null, 2));
    return tx;
  }

  getTransactions(phone) {
    try {
      return fs.readFileSync(this._logFile(phone), 'utf8')
        .split('\n')
        .filter(l => l.trim())
        .map(l => JSON.parse(l));
    } catch {
      return [];
    }
  }

  getTransactionVersion(phone, version) {
    return this.getTransactions(phone).find(t => t.version === version) || null;
  }

  // 图谱映射器：将用户/会话暴露为 BotGraph 节点以实现互联
  describeForGraph(limitUsers = 50) {
    const nodes = [];
    const edges = [];
    nodes.push({ id: 'sessions_root', type: 'flow', label: 'Session Layer' });
    edges.push({ from: 'Haki_Agri_Shield', to: 'sessions_root', type: 'contains' });
    let count = 0;
    for (const [phone, s] of this.sessions) {
      if (count >= limitUsers) break;
      const id = `user_${safeName(phone)}`;
      nodes.push({
        id,
        type: 'module',
        label: `User ${s.sessionId} (v${s.txCount})`,
        meta: { phone, sessionId: s.sessionId, txCount: s.txCount, lastActive: s.lastActive }
      });
      edges.push({ from: 'sessions_root', to: id, type: 'triggers' });
      edges.push({ from: id, to: 'user_db_js', type: 'depends' });
      edges.push({ from: id, to: 'monitor_js', type: 'pushes' });
      count++;
    }
    return { nodes, edges };
  }

  activeSessions() {
    return [...this.sessions.values()];
  }

  stats() {
    const sessions = this.activeSessions();
    return {
      totalSessions: sessions.length,
      loggedIn: sessions.length,
      transactionsLogged: sessions.reduce((a, s) => a + (s.txCount || 0), 0)
    };
  }
}

export default SessionManager;
