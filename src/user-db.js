import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB = path.join(__dirname, '..', 'data', 'users.json');
const DEFAULT_HISTORY = path.join(__dirname, '..', 'data', 'user-history');

class UserDatabase {
  constructor({ dbPath = DEFAULT_DB, historyDir = DEFAULT_HISTORY } = {}) {
    this.dbPath = dbPath;
    this.historyDir = historyDir;
    if (!fs.existsSync(this.historyDir)) fs.mkdirSync(this.historyDir, { recursive: true });
    this.db = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
    } catch {
      return {};
    }
  }

  _save() {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2));
  }

  exists(phone) {
    return Boolean(this.db[phone]);
  }

  isRegistered(phone) {
    const u = this.db[phone];
    return Boolean(u && u.registration && u.registration.status === 'COMPLETE');
  }

  get(phone) {
    return this.db[phone] || null;
  }

  _historyPath(phone) {
    const safe = phone.replace(/[^a-zA-Z0-9]/g, '_');
    return path.join(this.historyDir, `${safe}.json`);
  }

  _archiveVersion(phone, record) {
    const hp = this._historyPath(phone);
    let history = { phone, versions: [] };
    try {
      history = JSON.parse(fs.readFileSync(hp, 'utf8'));
    } catch {}
    history.versions.push({
      version: record.version,
      savedAt: record.lastUpdated,
      reason: record.versionReason || 'update',
      snapshot: JSON.parse(JSON.stringify(record))
    });
    if (history.versions.length > 200) history.versions = history.versions.slice(-200);
    fs.writeFileSync(hp, JSON.stringify(history, null, 2));
  }

  _write(phone, mutator, reason) {
    const prev = this.db[phone];
    if (prev) this._archiveVersion(phone, prev);
    const next = mutator(prev ? JSON.parse(JSON.stringify(prev)) : null);
    next.version = (prev?.version || 0) + 1;
    next.versionReason = reason;
    next.lastUpdated = new Date().toISOString();
    this.db[phone] = next;
    this._save();
    return next;
  }

  ensureUser(phone) {
    if (this.db[phone]) return this.db[phone];
    return this._write(phone, () => ({
      phone,
      isNewUser: true,
      firstName: null,
      language: 'en',
      location: null,
      workType: null,
      conversationCount: 0,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      registration: { status: 'UNREGISTERED', startedAt: null, completedAt: null },
      credentials: {},
      preferences: { receiveUpdates: true, shareLocation: false, autonomousAlerts: true },
      context: { lastIntent: null, lastViolation: null, pendingAction: null }
    }), 'ensure-user');
  }

  startRegistration(phone) {
    return this._write(phone, (u) => {
      u.isNewUser = false;
      u.registration = { status: 'IN_PROGRESS', step: 'ASK_NAME', startedAt: new Date().toISOString(), completedAt: null };
      return u;
    }, 'registration-started');
  }

  setRegistrationStep(phone, step) {
    return this._write(phone, (u) => {
      if (!u.registration) u.registration = { status: 'IN_PROGRESS' };
      u.registration.step = step;
      return u;
    }, 'registration-step');
  }

  setCredential(phone, field, value) {
    return this._write(phone, (u) => {
      u.credentials[field] = value;
      if (field === 'firstName') u.firstName = value;
      if (field === 'location') u.location = value;
      if (field === 'workType') u.workType = value;
      if (field === 'language') u.language = value;
      return u;
    }, `credential:${field}`);
  }

  completeRegistration(phone) {
    return this._write(phone, (u) => {
      u.registration.status = 'COMPLETE';
      u.registration.completedAt = new Date().toISOString();
      delete u.registration.step;
      return u;
    }, 'registration-complete');
  }

  touch(phone) {
    if (!this.db[phone]) return this.ensureUser(phone);
    this.db[phone].lastSeen = new Date().toISOString();
    this.db[phone].conversationCount = (this.db[phone].conversationCount || 0) + 1;
    this._save();
    return this.db[phone];
  }

  setPreference(phone, key, value) {
    return this._write(phone, (u) => {
      u.preferences[key] = value;
      return u;
    }, `preference:${key}`);
  }

  getVersions(phone) {
    try {
      return JSON.parse(fs.readFileSync(this._historyPath(phone), 'utf8')).versions;
    } catch {
      return [];
    }
  }

  getVersion(phone, version) {
    return this.getVersions(phone).find(v => v.version === version) || null;
  }

  listRegistered() {
    return Object.values(this.db).filter(u => u.registration && u.registration.status === 'COMPLETE');
  }

  listAll() {
    return Object.values(this.db);
  }

  stats() {
    const all = this.listAll();
    return {
      totalUsers: all.length,
      registered: all.filter(u => this.isRegistered(u.phone)).length,
      pendingRegistration: all.filter(u => u.registration && u.registration.status === 'IN_PROGRESS').length,
      activeToday: all.filter(u => {
        const d = new Date(u.lastSeen);
        return (Date.now() - d.getTime()) < 24 * 60 * 60 * 1000;
      }).length
    };
  }
}

export default UserDatabase;
