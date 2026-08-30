import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  normalizeMsisdn,
  isMsisdn,
  createSmsGateway,
  SimulatorProvider,
  TextBeeProvider,
  GammuProvider
} from '../src/sms-gateway.js';

test('normalizeMsisdn handles Kenyan and international formats', () => {
  assert.equal(normalizeMsisdn('+254700000001'), '+254700000001');
  assert.equal(normalizeMsisdn('0700000001'), '+254700000001');
  assert.equal(normalizeMsisdn('700000001'), '+254700000001'); // 9-digit starting with 7 → local mobile
  assert.equal(normalizeMsisdn('254700000001'), '254700000001');
  assert.equal(normalizeMsisdn('22141'), '22141'); // shortcode
  assert.equal(normalizeMsisdn(''), '');
});

test('isMsisdn validates plausible phone numbers', () => {
  assert.equal(isMsisdn('+254700000001'), true);
  assert.equal(isMsisdn('0700000001'), true);
  assert.equal(isMsisdn('12345'), false);
  assert.equal(isMsisdn(null), false);
  assert.equal(isMsisdn('22141'), false);
});

test('SimulatorProvider injects inbound and routes to its handler', async () => {
  const g = createSmsGateway('simulator', { shortcode: '22141' });
  assert.ok(g instanceof SimulatorProvider);
  let handled = null;
  g.start((m) => { handled = m; return Promise.resolve(); });

  const message = g.inject({ from: '0712345678', text: 'Siwezi kulipwa' });
  assert.equal(message.from, '+254712345678');
  assert.equal(g.inbound.length, 1);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(handled.from, '+254712345678');
  assert.equal(handled.text, 'Siwezi kulipwa');

  const out = await g.send({ to: '0712345678', text: 'Hello' });
  assert.equal(out.ok, true);
  assert.equal(g.outbox.length, 1);
  assert.equal(g.outbox[0].text, 'Hello');
  const snap = g.snapshot();
  assert.equal(snap.sent, 1);
  assert.equal(snap.received, 1);
});

test('SimulatorProvider.inject requires from and text', () => {
  const g = createSmsGateway('simulator');
  assert.throws(() => g.inject({ from: '', text: 'x' }), /requires \{ from, text \}/);
});

test('TextBeeProvider sends via REST with API key header', async () => {
  let captured = null;
  const g = new TextBeeProvider({
    url: 'http://textbee.test',
    apiKey: 'secret',
    channel: 'main',
    fetchFn: async (url, opts) => {
      captured = { url, opts };
      return { ok: true, text: async () => '' };
    }
  });
  const out = await g.send({ to: '0712345678', text: 'Mambo' });
  assert.equal(out.providerId, 'textbee');
  assert.equal(captured.url, 'http://textbee.test/api/v1/message');
  const body = JSON.parse(captured.opts.body);
  assert.deepEqual(body.numbers, ['+254712345678']);
  assert.equal(captured.opts.headers['X-TEXTBEE-API-KEY'], 'secret');
});

test('TextBeeProvider surfaces downstream failures', async () => {
  const g = new TextBeeProvider({
    fetchFn: async () => ({ ok: false, status: 500, text: async () => 'boom' })
  });
  await assert.rejects(() => g.send({ to: '0712', text: 'x' }), /TextBee send failed: 500 boom/);
});

test('TextBeeProvider.ingestInbound routes to handler', async () => {
  const g = new TextBeeProvider({});
  const got = [];
  g.start((m) => { got.push(m); return Promise.resolve(); });
  g.ingestInbound({ from: '0711111111', text: 'Pesa' });
  assert.equal(got.length, 1);
  assert.equal(got[0].from, '+254711111111');
});

test('GammuProvider uses the injected send function', async () => {
  const g = new GammuProvider({
    sendFn: async () => ({ ok: true, providerId: 'gammu-injected' })
  });
  const out = await g.send({ to: '+254700000009', text: 'Sana' });
  assert.equal(out.ok, true);
});

test('GammuProvider scans SMSD inbox files once and normalizes senders', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gammu-inbox-'));
  fs.writeFileSync(path.join(dir, 'INBOX_001.txt'), 'Sender: 0722222222\nText: Hujambo');
  fs.writeFileSync(path.join(dir, 'INBOX_002.txt'), 'Sender: +254733333333\nText: Mshahara yangu');

  const g = new GammuProvider({ inboxDir: dir, pollMs: 50 });
  const got = [];
  g.start((m) => { got.push(m); return Promise.resolve(); });
  g.scanInbox();
  g.scanInbox();
  assert.equal(got.length, 2);
  assert.deepEqual(
    got.map((m) => m.from).sort(),
    ['+254722222222', '+254733333333']
  );
  assert.equal(g.scanInbox(), 0, 'already-processed files are skipped');
  g.stop();
});

test('createSmsGateway rejects unknown providers', () => {
  assert.throws(() => createSmsGateway('twilio'), /Unknown SMS provider: twilio/);
});