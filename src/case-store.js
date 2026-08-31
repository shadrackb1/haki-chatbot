import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// CASE STORE — auditable grievance register
// Append-only JSON file (data/cases.json) that maps every serious
// grievance to a case with SLA deadlines and an event trail, so CSOs,
// auditors and the board can see exactly what was done and when.
// Phone numbers are anonymized at rest (only the last 4 digits remain).
// ============================================

// +254700000001 → +2547•••••0001
export function maskPhone(phone) {
  const raw = String(phone || '');
  if (!raw) return '';
  if (raw.length <= 4) return raw;
  const head = raw.startsWith('+') ? raw.slice(0, 5) : raw.slice(0, 3);
  return `${head}${'•'.repeat(Math.max(4, raw.length - head.length - 4))}${raw.slice(-4)}`;
}

class CaseStore {
  constructor(options = {}) {
    this.filePath = options.path || process.env.CASE_DB_PATH || path.join(__dirname, '..', 'data', 'cases.json');
    this.cases = [];
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      this.cases = Array.isArray(data) ? data : [];
    } catch {
      this.cases = [];
    }
  }

  _persist() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.cases, null, 2));
    } catch (error) {
      console.error('[case-store] could not persist cases:', error.message);
    }
  }

  _commit(record, event) {
    record.events.push({ at: new Date().toISOString(), ...event });
    this._persist();
  }

  _nextCaseId() {
    const year = new Date().getFullYear();
    let max = 0;
    for (const c of this.cases) {
      const m = /AGRI-\d+-(\d+)$/.exec(c.caseId || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `AGRI-${year}-${String(max + 1).padStart(4, '0')}`;
  }

  // Open a case. `slaDeadline` is computed by the SLA engine and attached
  // here so the audit trail carries the expected turnaround at creation.
  create({ channel, phone, county, category = 'general', violation = null, crisisLevel = 'none', slaDeadline = null, ref = '', sentiment = null, workType = null }) {
    const record = {
      caseId: this._nextCaseId(),
      channel,
      phone: maskPhone(phone),
      county: county || 'unknown',
      category,
      violation,
      crisisLevel,
      sentiment,
      workType,
      status: 'IN_REVIEW',
      createdAt: new Date().toISOString(),
      slaDeadline: slaDeadline ? new Date(slaDeadline).toISOString() : null,
      ref: ref || null,
      events: []
    };
    this.cases.push(record);
    this._commit(record, { type: 'created', text: 'Case opened for review' });
    return record;
  }

  update(caseId, patch = {}, text = 'Case updated') {
    const record = this.get(caseId);
    if (!record) return null;
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined && record[k] !== v) {
        record[k] = v;
        changed = true;
      }
    }
    if (changed) this._commit(record, { type: 'updated', text });
    return record;
  }

  escalate(caseId, reason = 'SLA deadline exceeded') {
    const record = this.get(caseId);
    if (!record) return null;
    if (record.status === 'RESOLVED') return record;
    if (record.status !== 'ESCALATED') {
      record.status = 'ESCALATED';
      this._commit(record, { type: 'escalated', text: reason });
    }
    return record;
  }

  resolve(caseId, resolution = 'Grievance resolved') {
    const record = this.get(caseId);
    if (!record) return null;
    if (record.status !== 'RESOLVED') {
      record.status = 'RESOLVED';
      this._commit(record, { type: 'resolved', text: resolution, resolvedAt: record.events[record.events.length - 1]?.at });
    }
    return record;
  }

  addEvent(caseId, type, text) {
    const record = this.get(caseId);
    if (!record) return null;
    this._commit(record, { type, text });
    return record;
  }

  get(caseId) {
    return this.cases.find((c) => c.caseId === caseId) || null;
  }

  all() {
    return [...this.cases];
  }

  byStatus(status) {
    return this.cases.filter((c) => c.status === status);
  }

  byCounty(county) {
    return this.cases.filter((c) => c.county === county);
  }

  stats() {
    const byStatus = {};
    const byCategory = {};
    const byCounty = {};
    for (const c of this.cases) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
      byCounty[c.county] = (byCounty[c.county] || 0) + 1;
    }
    return {
      total: this.cases.length,
      open: this.byStatus('IN_REVIEW').length,
      escalated: this.byStatus('ESCALATED').length,
      resolved: this.byStatus('RESOLVED').length,
      byStatus,
      byCategory,
      byCounty
    };
  }
}

export default CaseStore;