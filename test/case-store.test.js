import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import CaseStore, { maskPhone } from '../src/case-store.js';
import SLAEngine, { severityFor, WINDOW_HOURS, CRITICAL_VIOLATIONS, STANDARD_VIOLATIONS } from '../src/sla-engine.js';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrishield-cases-'));
  return new CaseStore({ path: path.join(dir, 'cases.json') });
}

test('maskPhone keeps only country prefix and last 4 digits', () => {
  assert.equal(maskPhone('+254700000001'), '+2547••••0001');
  assert.equal(maskPhone('0700000002'), '070••••0002');
  assert.equal(maskPhone(''), '');
});

test('creates a case with anonymous phone, IN_REVIEW status and audit events', () => {
  const store = tempStore();
  const c = store.create({ channel: 'whatsapp', phone: '+254700000001', county: 'Kericho', category: 'wages', violation: 'WAGE_VIOLATION' });
  assert.match(c.caseId, /^AGRI-\d{4}-\d{4}$/);
  assert.equal(c.phone, '+2547••••0001');
  assert.equal(c.status, 'IN_REVIEW');
  assert.equal(c.category, 'wages');
  assert.equal(c.events[0].type, 'created');
  assert.equal(store.stats().total, 1);
});

test('survives a persist→reload roundtrip and keeps id sequence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrishield-cases-'));
  const p = path.join(dir, 'cases.json');
  const a = new CaseStore({ path: p });
  a.create({ channel: 'sms', phone: '+254722222222', county: 'Nakuru', category: 'safety', violation: 'SAFETY_VIOLATION' });
  const b = new CaseStore({ path: p });
  assert.equal(b.stats().total, 1);
  const c = b.create({ channel: 'whatsapp', phone: '+254733333333', county: 'Bungoma', category: 'general' });
  assert.match(c.caseId, /-0002$/);
  assert.equal(b.stats().total, 2);
});

test('escalate and resolve transition status with event trails', () => {
  const store = tempStore();
  const c = store.create({ channel: 'whatsapp', phone: '+254700000009', county: 'Kisii', category: 'general' });
  store.escalate(c.caseId, 'Worker unreachable');
  assert.equal(store.get(c.caseId).status, 'ESCALATED');
  store.resolve(c.caseId, 'Paid arrears');
  assert.equal(store.get(c.caseId).status, 'RESOLVED');
  assert.equal(store.stats().resolved, 1);
  assert.ok(store.get(c.caseId).events.some((e) => e.type === 'resolved'));
});

test('stats aggregate by status, category and county', () => {
  const store = tempStore();
  store.create({ channel: 'sms', phone: '1', county: 'Kericho', category: 'wages', violation: 'WAGE_VIOLATION' });
  store.create({ channel: 'sms', phone: '2', county: 'Kericho', category: 'wages', violation: 'WAGE_VIOLATION' });
  store.create({ channel: 'whatsapp', phone: '3', county: 'Nyeri', category: 'safety', violation: 'SAFETY_VIOLATION' });
  const s = store.stats();
  assert.equal(s.total, 3);
  assert.equal(s.byCounty.Kericho, 2);
  assert.equal(s.byCategory.wages, 2);
  assert.equal(s.open, 3);
});

test('severityFor maps crisis/violation to SLA tiers', () => {
  assert.equal(severityFor({ crisisLevel: 'severe' }), 'crisis');
  assert.equal(severityFor({ crisisLevel: 'moderate' }), 'info');
  assert.equal(severityFor({ violation: 'SAFETY_VIOLATION' }), 'critical');
  assert.equal(severityFor({ violation: 'GENDER_VIOLENCE' }), 'critical');
  assert.equal(severityFor({ violation: 'CHILD_LABOR' }), 'standard');
  assert.equal(severityFor({ violation: 'NO_CONTRACT' }), 'standard');
  assert.equal(severityFor({ violation: 'ENVIRONMENTAL_HARM' }), 'standard');
  assert.equal(severityFor({}), 'info');
  assert.ok(CRITICAL_VIOLATIONS.length >= 2);
  assert.ok(STANDARD_VIOLATIONS.length >= 5);
});

test('SLA tier lists use real KB violation ids (no stale HARASSMENT/CONTRACT_VIOLATION)', () => {
  const real = {
    critical: ['SAFETY_VIOLATION', 'GENDER_VIOLENCE'],
    standard: ['WAGE_VIOLATION', 'NO_CONTRACT', 'CHILD_LABOR', 'ENVIRONMENTAL_HARM', 'LAND_RIGHTS']
  };
  for (const v of [...real.critical, ...real.standard]) {
    assert.ok(!v.includes('HARASSMENT'), `${v} must not reference stale HARASSMENT`);
    assert.ok(!v.includes('CONTRACT_VIOLATION'), `${v} must not reference stale CONTRACT_VIOLATION`);
  }
  for (const v of real.critical) assert.equal(severityFor({ violation: v }), 'critical', `${v} → critical`);
  for (const v of real.standard) assert.equal(severityFor({ violation: v }), 'standard', `${v} → standard`);
  // Stale ids must not be treated as critical/standard anymore.
  assert.equal(severityFor({ violation: 'HARASSMENT' }), 'info');
  assert.equal(severityFor({ violation: 'CONTRACT_VIOLATION' }), 'info');
});

test('deadlineFor applies per-severity windows', () => {
  const sla = new SLAEngine({ caseStore: tempStore() });
  const severe = sla.deadlineFor({ crisisLevel: 'severe', createdAt: new Date('2026-08-30T00:00:00Z') });
  const info = sla.deadlineFor({ createdAt: new Date('2026-08-30T00:00:00Z') });
  assert.equal((severe - new Date('2026-08-30T00:00:00Z')) / 3600000, WINDOW_HOURS.crisis);
  assert.equal((info - new Date('2026-08-30T00:00:00Z')) / 3600000, WINDOW_HOURS.info);
});

test('tick escalates only overdue IN_REVIEW cases, once, and notifies', () => {
  const store = tempStore();
  const now0 = new Date('2026-08-30T12:00:00Z');
  const sla = new SLAEngine({
    caseStore: store,
    now: () => now0,
    csoContacts: ['+254700000000'],
    monitor: { push: (kind, ev) => pushes.push({ kind, ev }) }
  });
  const pushes = [];

  const overdue = store.create({ channel: 'sms', phone: '1', county: 'Nakuru', category: 'wages', violation: 'WAGE_VIOLATION' });
  store.update(overdue.caseId, { slaDeadline: new Date(now0.getTime() - 3600000).toISOString() });
  const notDue = store.create({ channel: 'whatsapp', phone: '2', county: 'Migori', category: 'safety', violation: 'SAFETY_VIOLATION' });
  store.update(notDue.caseId, { slaDeadline: new Date(now0.getTime() + 3600000).toISOString() });

  let onEscalateCalls = 0;
  sla.onEscalate = () => { onEscalateCalls += 1; };

  const first = sla.tick();
  assert.equal(first.length, 1);
  assert.equal(first[0].caseId, overdue.caseId);
  assert.equal(store.get(overdue.caseId).status, 'ESCALATED');
  assert.equal(store.get(notDue.caseId).status, 'IN_REVIEW');
  assert.equal(onEscalateCalls, 1);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].kind, 'sla-escalation');

  // Second tick: idempotent — overdue is now ESCALATED, no dupes.
  assert.equal(sla.tick().length, 0);
  assert.equal(onEscalateCalls, 1);
});

test('tick avoids mutant timestamp bugs on resolved cases', () => {
  const store = tempStore();
  const now0 = new Date('2026-08-30T12:00:00Z');
  const sla = new SLAEngine({ caseStore: store, now: () => now0 });
  const c = store.create({ channel: 'sms', phone: '1', county: 'Kiambu', category: 'general' });
  store.update(c.caseId, { slaDeadline: new Date(now0.getTime() - 1000).toISOString() });
  store.resolve(c.caseId);
  assert.equal(sla.tick().length, 0, 'resolved cases must never be escalated');
});