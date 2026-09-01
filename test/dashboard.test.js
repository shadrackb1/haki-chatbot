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
    subscribe: (fn) => { monitor.subs = fn; return () => { monitor.subs = null; }; },
    push: (type, payload, origin = 'KNOWN_TRIGGER') => {
      const evt = { type, payload: payload || {}, origin, at: new Date().toISOString() };
      if (origin === 'AUTONOMOUS_IMPORTANT_INFO' || origin === 'AUTONOMOUS_FOLLOW_UP') monitor.counters.autonomousInfo += 1;
      if (origin === 'KNOWN_TRIGGER') monitor.counters.reactive += 1;
      if (monitor.subs) monitor.subs(evt);
      return evt;
    }
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

test('dashboard exposes a socket.io server and forwards monitor events as monitor:event', () => {
  const s = setup();
  assert.ok(s.dash.io, 'dashboard must expose a socket.io server instance');
  assert.equal(typeof s.dash.io.emit, 'function');
  const emitted = [];
  const origEmit = s.dash.io.emit.bind(s.dash.io);
  s.dash.io.emit = (evt, data) => { emitted.push([evt, data]); return origEmit(evt, data); };
  s.monitor.push('activity', { intent: 'question' });
  assert.ok(emitted.some(([evt]) => evt === 'monitor:event'), 'monitor push must emit monitor:event');
  assert.equal(emitted[emitted.length - 1][0], 'monitor:event');
  s.monitor.push('crisis', { level: 'severe' });
  assert.equal(emitted[emitted.length - 1][0], 'monitor:event');
  s.dash.stop();
});

test('serves the socket.io client script for browsers (air-gapped, no CDN)', async () => {
  const s = setup();
  const res = await fetch(new URL('/socket.io/socket.io.js', s.dash.url), { headers: CLOSE });
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.length > 0);
  assert.ok(!body.includes('cdn.'), 'must self-serve the client, not pull from a CDN');
  s.dash.stop();
});

test('/api/feed returns a valid bucketed timeseries for a seeded window', async () => {
  const s = setup();
  for (let i = 0; i < 5; i++) s.monitor.push('activity', { intent: 'question' });
  const feed = await get(s.dash.url, '/api/feed?window=1h&bucket=60s');
  assert.ok(Array.isArray(feed.buckets), 'feed must expose a buckets array');
  assert.ok(feed.buckets.length >= 1, 'seeded window must produce at least one bucket');
  assert.equal(typeof feed.buckets[0].t, 'number');
  assert.equal(typeof feed.buckets[0].reactive, 'number');
  assert.equal(typeof feed.buckets[0].autonomous, 'number');
  assert.ok(feed.totalReactive >= 5, 'total reactive must reflect seeded events');
  assert.ok(Array.isArray(feed.events), 'feed must expose the raw recent events for the ticker');
  s.dash.stop();
});

test('/api/feed returns a valid empty shape when there is no history', async () => {
  const s = setup();
  const feed = await get(s.dash.url, '/api/feed?window=1h&bucket=60s');
  assert.ok(Array.isArray(feed.buckets));
  assert.ok(feed.buckets.length >= 1);
  assert.equal(feed.totalReactive, 0);
  assert.equal(feed.totalAutonomous, 0);
  s.dash.stop();
});

test('/api/feed bucket count roughly equals window/bucket', async () => {
  const s = setup();
  s.monitor.push('activity', { intent: 'question' });
  const feed = await get(s.dash.url, '/api/feed?window=30m&bucket=60s');
  const expected = Math.ceil((30 * 60) / 60);
  assert.ok(Math.abs(feed.buckets.length - expected) <= 1, `expected ~${expected} buckets, got ${feed.buckets.length}`);
  s.dash.stop();
});

test('POST /api/simulate pushes synthetic monitor events reflected in the feed', async () => {
  const s = setup();
  const res = await fetch(new URL('/api/simulate?count=4', s.dash.url), {
    method: 'POST',
    headers: { ...CLOSE }
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.pushed, 4);
  const feed = await get(s.dash.url, '/api/feed?window=1h&bucket=60s');
  assert.ok(feed.totalReactive >= 4, 'simulated events must appear in reactive totals');
  s.dash.stop();
});