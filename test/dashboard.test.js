import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import CaseStore from '../src/case-store.js';
import SLAEngine from '../src/sla-engine.js';
import { createSmsGateway } from '../src/sms-gateway.js';
import Dashboard from '../src/dashboard.js';

const CLOSE = { connection: 'close' };

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrishield-dash-'));
  const caseStore = new CaseStore({ path: path.join(dir, 'cases.json') });
  const slaEngine = new SLAEngine({ caseStore });
  const smsGateway = createSmsGateway('simulator');
  const monitor = {
    counters: { reactive: 3, autonomousInfo: 1 },
    snapshot: () => ({ uptimeSeconds: 42, counters: { reactive: 3, autonomousInfo: 1 }, recentEvents: [] }),
    subscribe: (fn) => { monitor.subs = fn; return () => { monitor.subs = null; }; }
  };
  const dash = new Dashboard({ caseStore, slaEngine, monitor, smsGateway, port: 0 });
  dash.start();
  return { dash, caseStore, smsGateway, monitor };
}

async function get(base, urlPath) {
  const res = await fetch(new URL(urlPath, base), { headers: CLOSE });
  assert.ok(res.ok, `${urlPath} expected 2xx, got ${res.status}`);
  return res.json();
}

test('serves the inline dashboard page without any CDN assets', async () => {
  const { dash } = setup();
  const res = await fetch(dash.url, { headers: CLOSE });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('HRDD Dashboard'));
  assert.ok(!html.includes('cdn.jsdelivr') && !html.includes('unpkg.com'), 'no external CDN scripts');
  dash.stop();
});

test('/api/overview reports KPIs from cases, SMS and monitor', async () => {
  const s = setup();
  s.caseStore.create({ channel: 'sms', phone: '+254700000001', county: 'Kericho', category: 'wages', violation: 'WAGE_VIOLATION' });
  const o = await get(s.dash.url, '/api/overview');
  assert.equal(o.kpis['Open cases'], 1);
  assert.equal(o.kpis['Total tracked'], 1);
  assert.equal(o.kpis['SMS received'], 0);
  assert.equal(o.kpis['Reactive activity'], 3);
  assert.ok(o.uptime >= 0);
  s.dash.stop();
});

test('/api/hotspots groups anonymized risk by county, descending', async () => {
  const s = setup();
  s.caseStore.create({ channel: 'sms', phone: '+254700000001', county: 'Kericho', category: 'wages', violation: 'WAGE_VIOLATION' });
  s.caseStore.create({ channel: 'whatsapp', phone: '+254700000002', county: 'Kericho', category: 'safety', violation: 'SAFETY_VIOLATION' });
  s.caseStore.create({ channel: 'sms', phone: '+254700000003', county: 'Nyeri', category: 'land', violation: 'LAND_RIGHTS' });
  const h = await get(s.dash.url, '/api/hotspots');
  assert.equal(h.length, 2);
  assert.equal(h[0].county, 'Kericho');
  assert.equal(h[0].count, 2);
  assert.deepEqual(h[0].categories, { wages: 1, safety: 1 });
  for (const c of s.caseStore.all()) {
    const raw = c.phone;
    assert.ok(!h.some((x) => JSON.stringify(x).includes(raw)), 'counties must not leak identifiers');
  }
  s.dash.stop();
});

test('/api/sla lists overdue and upcoming cases with windows', async () => {
  const s = setup();
  const overdue = s.caseStore.create({ channel: 'sms', phone: '1', county: 'Migori', category: 'wages', violation: 'WAGE_VIOLATION' });
  s.caseStore.update(overdue.caseId, { slaDeadline: new Date(Date.now() - 5 * 3600000).toISOString() });
  const sla = await get(s.dash.url, '/api/sla');
  assert.equal(sla.windows.crisis, 2);
  assert.equal(sla.overdue.length, 1);
  assert.equal(sla.overdue[0].caseId, overdue.caseId);
  assert.ok(sla.overdue[0].overdueByH >= 5);
  s.dash.stop();
});

test('/api/sentiment aggregates case sentiment by county as a heatmap', async () => {
  const s = setup();
  s.caseStore.create({ channel: 'whatsapp', phone: '+254700000001', county: 'Kericho', category: 'wages', violation: 'WAGE_VIOLATION', sentiment: 'angry' });
  s.caseStore.create({ channel: 'whatsapp', phone: '+254700000002', county: 'Kericho', category: 'wages', violation: 'WAGE_VIOLATION', sentiment: 'fearful' });
  s.caseStore.create({ channel: 'sms', phone: '+254700000003', county: 'Nyeri', category: 'general', sentiment: 'positive' });
  const v = await get(s.dash.url, '/api/sentiment');
  assert.equal(v.totals.cases, 3);
  assert.equal(v.totals.negative, 2);
  assert.equal(v.counties.length, 2);
  // Kericho has 2 negative of 2 → heat 100, ranks first
  assert.equal(v.counties[0].county, 'Kericho');
  assert.equal(v.counties[0].heat, 100);
  assert.equal(v.counties[1].county, 'Nyeri');
  assert.equal(v.counties[1].heat, 0);
  s.dash.stop();
});

test('/api/sms exposes the simulator inbox/outbox and inject works', async () => {
  const s = setup();
  s.smsGateway.inject({ from: '+254722222222', text: 'Hujambo' });
  await s.smsGateway.send({ to: '+254722222222', text: 'Karibu' });

  const sms = await get(s.dash.url, '/api/sms');
  assert.equal(sms.kind, 'simulator');
  assert.ok(sms.inbox[0].includes('Hujambo'));
  assert.ok(sms.outbox[0].includes('Karibu'));

  const res = await fetch(new URL('/api/sms/inject', s.dash.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...CLOSE },
    body: JSON.stringify({ from: '+254733333333', text: 'Pesa yangu' })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.message.from, '+254733333333');
  s.dash.stop();
});

test('monitor subscribe bridge is registered and feeds events to socket.io', () => {
  const s = setup();
  assert.equal(typeof s.monitor.subs, 'function', 'dashboard must subscribe to monitor events');
  assert.doesNotThrow(() => s.monitor.subs({ type: 'sla-escalation', payload: { caseId: 'AGRI-1' } }));
  assert.doesNotThrow(() => s.monitor.subs({ type: 'crisis', payload: null }));
  s.dash.stop();
});