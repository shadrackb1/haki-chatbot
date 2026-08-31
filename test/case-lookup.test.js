import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import CaseStore from '../src/case-store.js';
import { extractCaseRef, isCaseStatusRequest, resolveCaseRef, formatCaseStatus } from '../src/case-lookup.js';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrishield-lookup-'));
  return new CaseStore({ path: path.join(dir, 'cases.json') });
}

test('extractCaseRef pulls AGRI-YYYY-NNNN from text', () => {
  assert.equal(extractCaseRef('my case is AGRI-2026-0001'), 'AGRI-2026-0001');
  assert.equal(extractCaseRef('AGRI-2026-0042 thanks'), 'AGRI-2026-0042');
  assert.equal(extractCaseRef('no reference here'), null);
  assert.equal(extractCaseRef(''), null);
  assert.equal(extractCaseRef(null), null);
  assert.equal(extractCaseRef('AGRI-26-001'), null); // needs 4-digit parts
});

test('isCaseStatusRequest recognizes refs and status queries', () => {
  assert.equal(isCaseStatusRequest('whats the status of AGRI-2026-0001'), true);
  assert.equal(isCaseStatusRequest('AGRI-2026-0001'), true);
  assert.equal(isCaseStatusRequest('check 0001 status'), true);
  assert.equal(isCaseStatusRequest('0001'), true);
  assert.equal(isCaseStatusRequest('AGRI00012026'), true);
  assert.equal(isCaseStatusRequest('status of my case'), false); // no number
  assert.equal(isCaseStatusRequest('hello'), false);
  assert.equal(isCaseStatusRequest(''), false);
  assert.equal(isCaseStatusRequest(null), false);
});

test('resolveCaseRef matches full reference', () => {
  const store = tempStore();
  const c = store.create({ channel: 'whatsapp', phone: '+254700000001', county: 'Nyeri', category: 'wages', violation: 'WAGE_VIOLATION' });
  const r = resolveCaseRef(c.caseId, store);
  assert.equal(r.caseId, c.caseId);
  assert.equal(r.case.status, 'IN_REVIEW');
});

test('resolveCaseRef matches bare numeric code', () => {
  const store = tempStore();
  const c = store.create({ channel: 'sms', phone: '2', county: 'Kericho', category: 'safety', violation: 'SAFETY_VIOLATION' });
  // Full numeric: AGRI-2026-0001 → "20260001"
  const digits = c.caseId.replace(/\D/g, '');
  const r = resolveCaseRef(digits, store, { now: new Date(`${c.caseId.slice(5, 9)}-01-01T00:00:00Z`) });
  assert.equal(r.caseId, c.caseId);
});

test('resolveCaseRef returns null for unknown refs', () => {
  const store = tempStore();
  const r = resolveCaseRef('AGRI-2099-9999', store);
  assert.equal(r.caseId, null);
  assert.equal(r.case, null);
});

test('formatCaseStatus renders IN_REVIEW and unknown', () => {
  const store = tempStore();
  const c = store.create({ channel: 'whatsapp', phone: '+254700000003', county: 'Kisumu', category: 'wages', violation: 'WAGE_VIOLATION' });
  const en = formatCaseStatus(c.caseId, store, 'en');
  assert.ok(en.includes(c.caseId));
  assert.ok(en.includes('in review'));
  assert.ok(en.includes('Kisumu'));

  const sw = formatCaseStatus(c.caseId, store, 'sw');
  assert.ok(sw.includes(c.caseId));
  assert.ok(sw.includes('in review'));

  const missing = formatCaseStatus('AGRI-2099-0001', store, 'en');
  assert.ok(missing.includes('couldn\'t find'));
  const missingSw = formatCaseStatus('AGRI-2099-0001', store, 'sw');
  assert.ok(missingSw.includes('Sikuweza'));
});

test('formatCaseStatus reflects escalated status after escalation', () => {
  const store = tempStore();
  const c = store.create({ channel: 'whatsapp', phone: '4', county: 'Mombasa', category: 'safety', violation: 'SAFETY_VIOLATION' });
  store.escalate(c.caseId, 'SLA exceeded');
  const en = formatCaseStatus(c.caseId, store, 'en');
  assert.ok(en.includes('escalated'));
});
