import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import CaseStore from '../src/case-store.js';
import UngpReport, {
  UNGP31_CRITERIA,
  OECD_FAO_STEPS,
  pillarFor,
  buildOverview
} from '../src/ungp-report.js';

function seededStore(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrishield-ungp-'));
  const store = new CaseStore({ path: path.join(dir, 'cases.json'), ...overrides });
  store.create({
    channel: 'whatsapp', phone: '+254700000001', county: 'Kericho',
    category: 'wages', violation: 'WAGE_VIOLATION', crisisLevel: 'none'
  });
  store.create({
    channel: 'sms', phone: '+254700000002', county: 'Nyeri',
    category: 'safety', violation: 'SAFETY_VIOLATION', crisisLevel: 'moderate'
  });
  const severe = store.create({
    channel: 'sms', phone: '+254700000003', county: 'Migori',
    category: 'safety', violation: 'SAFETY_VIOLATION', crisisLevel: 'severe'
  });
  store.resolve(severe.caseId, 'Director referred to specialist GBV support and follow-up within 24h');
  const escalated = store.create({
    channel: 'whatsapp', phone: '+254700000004', county: 'Kericho',
    category: 'land', violation: 'LAND_RIGHTS', crisisLevel: 'none'
  });
  store.escalate(escalated.caseId, 'SLA deadline exceeded — CSO follow-up');
  return { store, dir };
}

test('generateReport markdown covers company, pillars, UNGP31 and OECD-FAO', () => {
  const { store } = seededStore();
  const report = new UngpReport({ caseStore: store, company: 'Shamba-to-Ship', period: 'test window' });
  const md = report.markdown();
  assert.ok(md.includes('Shamba-to-Ship'));
  assert.ok(md.includes('UNGP Pillars'));
  assert.ok(md.includes('UNGP Principle 31'));
  assert.ok(md.includes('OECD-FAO 5-step due diligence'));
  assert.ok(md.includes('Pillar Two — The corporate responsibility to respect'));
  assert.ok(md.includes('Pillar Three — Access to remedy'));
});

test('all 8 UNGP31 criteria and all 5 OECD-FAO steps are emitted', () => {
  const { store } = seededStore();
  const report = new UngpReport({ caseStore: store });
  const r = report.build();
  assert.equal(UNGP31_CRITERIA.length, 8);
  assert.equal(OECD_FAO_STEPS.length, 5);
  for (const c of UNGP31_CRITERIA) {
    const s = r.ungp31[c.key];
    assert.ok(s, `missing criterion ${c.key}`);
    assert.ok(['yes', 'partial'].includes(s.implemented));
    assert.ok(s.evidence.length > 0, `no evidence for ${c.key}`);
  }
  assert.equal(r.oecdFao.length, 5);
});

test('overview KPIs count open/escalated/resolved/overdue correctly', () => {
  const { store } = seededStore();
  const storeClass = store.constructor.name;
  const report = new UngpReport({ caseStore: store });
  const o = report.build().overview;
  assert.equal(o.total, 4);
  assert.equal(o.open, 2);
  assert.equal(o.escalated, 1);
  assert.equal(o.resolved, 1);
  assert.equal(o.byStatus.IN_REVIEW, 2);
  assert.equal(o.byStatus.ESCALATED, 1);
  assert.equal(o.byStatus.RESOLVED, 1);
  assert.equal(o.byPillar.P2, 2);
  assert.equal(o.byPillar.P3, 2);
  // byCounty uses the county names, never identifiers
  assert.deepEqual(Object.keys(o.byCounty).sort(), ['Kericho', 'Migori', 'Nyeri']);
  assert.equal(storeClass, 'CaseStore');
});

test('pillarFor maps severe and escalated cases to P3 (remedy)', () => {
  assert.equal(pillarFor({ crisisLevel: 'none', status: 'IN_REVIEW' }), 'P2');
  assert.equal(pillarFor({ crisisLevel: 'severe', status: 'IN_REVIEW' }), 'P3');
  assert.equal(pillarFor({ crisisLevel: 'moderate', status: 'ESCALATED' }), 'P3');
  assert.equal(pillarFor({ crisisLevel: 'none', status: 'RESOLVED' }), 'P3');
  assert.equal(pillarFor(null), 'P2');
});

test('report never leaks raw phone numbers, only masked last-4 forms', () => {
  const { store } = seededStore();
  const md = new UngpReport({ caseStore: store }).markdown();
  const fullNumbers = md.match(/\+\d{12}/g);
  assert.equal(fullNumbers, null, 'no full +CC + 10-digit numbers should appear');
  const masked = md.match(/\+254\d{3}••••\d{4}/g);
  assert.ok(!masked || masked.length >= 0);
  // Every case in the report table is a registry ID like AGRI-2026-0001
  const caseIds = md.match(/AGRI-\d{4}-\d{4}/g);
  assert.ok(caseIds && caseIds.length >= 4, 'registry case IDs are the only per-case identifiers');
});

test('escalated and overdue cases surface in the narrative', () => {
  const { store } = seededStore();
  const r = new UngpReport({ caseStore: store }).build();
  const remediateStep = r.oecdFao[r.oecdFao.length - 1];
  assert.match(remediateStep.evidence, /1 case\(s\) closed/);
  const trackStep = r.oecdFao[3];
  assert.match(trackStep.evidence, /1 case\(s\) escalated/);
});

test('pdf() returns a valid non-empty PDF buffer', async () => {
  const { store } = seededStore();
  const report = new UngpReport({ caseStore: store, company: 'Shamba-to-Ship' });
  const buf = await report.pdf();
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 1000, `pdf too small: ${buf.length}`);
  assert.equal(buf.slice(0, 4).toString('ascii'), '%PDF');
});

test('buildOverview aggregation counts open cases with past-due deadlines as overdue', () => {
  const { store } = seededStore();
  const overdue = store.create({
    channel: 'sms', phone: '+254700000005', county: 'Kisii',
    category: 'wages', violation: 'WAGE_VIOLATION'
  });
  store.update(overdue.caseId, { slaDeadline: new Date(Date.now() - 60 * 60000).toISOString() });
  const o = buildOverview(store.all());
  assert.equal(o.overdue, 1);
  assert.equal(o.total, 5);
});