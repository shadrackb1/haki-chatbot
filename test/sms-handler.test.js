import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SmsHandler } from '../src/sms-handler.js';
import { createSmsGateway } from '../src/sms-gateway.js';
import CaseStore from '../src/case-store.js';
import SLAEngine from '../src/sla-engine.js';

function stubPipeline(result) {
  return {
    process: async (ctx) => {
      stubPipeline.lastCtx = ctx;
      return result;
    }
  };
}

function stubConversation() {
  const states = new Map();
  return {
    getUser: (id) => {
      if (!states.has(id)) states.set(id, { isNewUser: false, conversationCount: 0, location: undefined, workType: undefined });
      return states.get(id);
    },
    getConversationHistory: () => [],
    addToHistory: (id, role, text) => states.get(id)[`last${role}`] = text,
    updateContext: (id, ctx) => states.get(id).context = ctx
  };
}

test('handles an inbound SMS end-to-end and replies via the gateway', async () => {
  const gateway = createSmsGateway('simulator');
  const convo = stubConversation();
  const handler = new SmsHandler({
    pipeline: stubPipeline({ kind: 'normal', reply: 'Habari!', reasoning: { intent: 'request', topic: 'wages' }, violation: null }),
    gateway,
    conversationManager: convo
  });

  const result = await handler.handle({ from: '0712345678', text: 'Siwezi kulipwa' });
  assert.equal(result.ok, true);
  assert.equal(result.sent, 1);
  assert.equal(gateway.outbox[0].to, '+254712345678');
  assert.equal(gateway.outbox[0].text, 'Habari!');
  assert.ok(stubPipeline.lastCtx.callerId, '+254712345678');
  assert.equal(stubPipeline.lastCtx.text, 'Siwezi kulipwa');
});

test('crisis messages report escalation without dropping the SMS', async () => {
  const gateway = createSmsGateway('simulator');
  const handler = new SmsHandler({
    pipeline: stubPipeline({
      kind: 'crisis',
      reply: 'Please call Kenya Red Cross on 1199.',
      crisisResult: { level: 'severe', escalate: true },
      reasoning: { intent: 'crisis', topic: 'emotional-support' }
    }),
    gateway,
    conversationManager: stubConversation()
  });

  const result = await handler.handle({ from: '+254700000000', text: 'nataka kujitoa' });
  assert.equal(result.kind, 'crisis');
  assert.equal(result.escalate, true);
  assert.equal(gateway.outbox.length, 1);
});

test('splits long replies into multiple SMS segments', async () => {
  const gateway = createSmsGateway('simulator');
  const handler = new SmsHandler({
    pipeline: stubPipeline({ kind: 'normal', reply: 'word '.repeat(200), reasoning: {}, violation: null }),
    gateway,
    conversationManager: stubConversation()
  });

  const result = await handler.handle({ from: '0712345678', text: 'hi' });
  assert.ok(result.sent > 1, `expected multiple segments, got ${result.sent}`);
  assert.equal(gateway.outbox.length, result.sent);
  for (const sms of gateway.outbox) assert.ok(sms.text.length <= 480);
});

test('chunk() never exceeds the length limit and keeps single words intact', () => {
  const handler = new SmsHandler({ gateway: createSmsGateway('simulator'), pipeline: stubPipeline({}), conversationManager: stubConversation() });
  const chunks = handler.chunk('a'.repeat(1000), 160);
  assert.ok(chunks.length >= 3);
  for (const c of chunks) assert.ok(c.length <= 160);
  const single = handler.chunk('supercalifragilisticexpialidocious'.repeat(20), 10);
  for (const c of single) assert.ok(c.length > 0);
});

test('rejects empty messages and missing caller numbers', async () => {
  const gateway = createSmsGateway('simulator');
  const handler = new SmsHandler({ gateway, pipeline: stubPipeline({}), conversationManager: stubConversation() });
  const r1 = await handler.handle({ from: '', text: 'x' });
  assert.equal(r1.ok, false);
  const r2 = await handler.handle({ from: '0712345678', text: '   ' });
  assert.equal(r2.ok, false);
  assert.equal(gateway.outbox.length, 0);
});

test('gateway start() routes inbound messages into the handler', async () => {
  const gateway = createSmsGateway('simulator');
  const handler = new SmsHandler({
    pipeline: stubPipeline({ kind: 'normal', reply: 'OK', reasoning: {}, violation: null }),
    gateway,
    conversationManager: stubConversation()
  });
  handler.start();

  gateway.inject({ from: '+254722222222', text: 'Hujambo' });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(gateway.outbox.length, 1, 'bot should reply to the injected SMS');
  handler.stop();
});

test('opens a tracked case with an SLA deadline for violations', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haki-sms-cases-'));
  const caseStore = new CaseStore({ path: path.join(dir, 'cases.json') });
  const slaEngine = new SLAEngine({ caseStore });
  const gateway = createSmsGateway('simulator');
  const handler = new SmsHandler({
    pipeline: stubPipeline({
      kind: 'normal',
      reply: 'Let us check.',
      reasoning: { intent: 'request', topic: 'safety' },
      violation: { id: 'SAFETY_VIOLATION', data: {} }
    }),
    gateway,
    conversationManager: stubConversation(),
    caseStore,
    slaEngine
  });

  await handler.handle({ from: '0712345678', text: 'Hakuna PPE!' });
  assert.equal(caseStore.stats().total, 1);
  const c = caseStore.all()[0];
  assert.equal(c.channel, 'sms');
  assert.equal(c.violation, 'SAFETY_VIOLATION');
  assert.match(c.caseId, /^HAKI-/);
  assert.ok(c.slaDeadline, 'must carry a computed SLA deadline');
  assert.ok(new Date(c.slaDeadline) > new Date());
});

test('does not open a case for casual chatter', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haki-sms-cases-'));
  const caseStore = new CaseStore({ path: path.join(dir, 'cases.json') });
  const gateway = createSmsGateway('simulator');
  const handler = new SmsHandler({
    pipeline: stubPipeline({ kind: 'normal', reply: 'Karibu', reasoning: {}, violation: null }),
    gateway,
    conversationManager: stubConversation(),
    caseStore,
    slaEngine: new SLAEngine({ caseStore })
  });

  await handler.handle({ from: '0712345678', text: 'Asante' });
  assert.equal(caseStore.stats().total, 0);
});