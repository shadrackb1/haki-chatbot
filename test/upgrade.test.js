import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import UserDatabase from '../src/user-db.js';
import RegistrationFlow from '../src/registration-flow.js';
import SessionManager from '../src/session-manager.js';
import Monitor from '../src/monitor.js';
import AutonomyEngine, { ORIGINS } from '../src/autonomy-engine.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'haki-upgrade-'));
}

describe('User Database (Deposit DB)', () => {
  let db;
  beforeEach(() => {
    const dir = tempDir();
    db = new UserDatabase({
      dbPath: path.join(dir, 'users.json'),
      historyDir: path.join(dir, 'history')
    });
  });

  it('creates user on ensure', () => {
    const u = db.ensureUser('+254700000001');
    assert.equal(u.phone, '+254700000001');
    assert.equal(u.registration.status, 'UNREGISTERED');
  });

  it('versions every credential change', () => {
    db.ensureUser('+254700000002');
    db.startRegistration('+254700000002');
    db.setCredential('+254700000002', 'firstName', 'Grace');
    db.setCredential('+254700000002', 'location', 'Kericho');
    db.completeRegistration('+254700000002');
    const versions = db.getVersions('+254700000002');
    assert.ok(versions.length >= 4, `expected >=4 versions, got ${versions.length}`);
    // Archived entries are snapshots of PREVIOUS states, so v0 = ensure-user
    assert.equal(versions[0].snapshot.versionReason, 'ensure-user');
    assert.equal(versions[1].snapshot.versionReason, 'registration-started');
    assert.equal(db.get('+254700000002').version, versions.length + 1);
  });

  it('tracks registration status and stats', () => {
    db.ensureUser('+254700000003');
    db.startRegistration('+254700000003');
    assert.equal(db.isRegistered('+254700000003'), false);
    db.setCredential('+254700000003', 'firstName', 'Otieno');
    db.setCredential('+254700000003', 'location', 'Kisumu');
    db.setCredential('+254700000003', 'workType', 'farm worker');
    db.completeRegistration('+254700000003');
    assert.equal(db.isRegistered('+254700000003'), true);
    const stats = db.stats();
    assert.equal(stats.registered, 1);
    assert.deepEqual(db.listRegistered().map(u => u.firstName), ['Otieno']);
  });
});

describe('Registration Workflow', () => {
  let db, flow;
  beforeEach(() => {
    const dir = tempDir();
    db = new UserDatabase({
      dbPath: path.join(dir, 'users.json'),
      historyDir: path.join(dir, 'history')
    });
    flow = new RegistrationFlow(db);
  });

  it('walks name → county → work type → complete', () => {
    db.ensureUser('+254700000010');
    flow.start('+254700000010', 'en');
    let reply = flow.handle('+254700000010', 'grace', 'en');
    assert.match(reply, /county/i);
    reply = flow.handle('+254700000010', 'kericho', 'en');
    assert.match(reply, /work/i);
    reply = flow.handle('+254700000010', 'farm worker', 'en');
    assert.match(reply, /all set/i);
    const u = db.get('+254700000010');
    assert.equal(u.credentials.firstName, 'Grace');
    assert.equal(u.credentials.location, 'Kericho');
    assert.equal(u.credentials.workType, 'farm worker');
    assert.equal(u.registration.status, 'COMPLETE');
  });

  it('supports swahili prompts', () => {
    db.ensureUser('+254700000011');
    const prompt = flow.start('+254700000011', 'sw');
    assert.match(prompt, /jina lako/i);
  });

  it('cancel abandons or completes gracefully', () => {
    db.ensureUser('+254700000012');
    flow.start('+254700000012', 'en');
    const reply = flow.handle('+254700000012', 'cancel', 'en');
    assert.match(reply, /register/i);
    assert.equal(flow.isActive('+254700000012'), false);
  });

  it('returns null when not active (hands back to pipeline)', () => {
    db.ensureUser('+254700000013');
    assert.equal(flow.handle('+254700000013', 'hello', 'en'), null);
  });
});

describe('Session Manager (Login Always True)', () => {
  let sm, dir;
  beforeEach(() => {
    dir = tempDir();
    sm = new SessionManager({ baseDir: path.join(dir, 'sessions') });
  });

  it('login always succeeds — persistent session', () => {
    const s = sm.login('+254700000020');
    assert.equal(s.loggedIn, true);
    assert.equal(sm.isLoggedIn(), true);
    assert.match(s.sessionId, /^SES-/);
  });

  it('reuses the same sessionId across logins', () => {
    const s1 = sm.getSession('+254700000021');
    const s2 = sm.getSession('+254700000021');
    assert.equal(s1.sessionId, s2.sessionId);
  });

  it('saves every transaction as a versioned record', () => {
    sm.login('+254700000022');
    const t1 = sm.recordTransaction('+254700000022', { kind: 'qa' });
    const t2 = sm.recordTransaction('+254700000022', { kind: 'report' });
    assert.equal(t1.version, 1);
    assert.equal(t2.version, 2);
    const all = sm.getTransactions('+254700000022');
    assert.equal(all.length, 2);
    assert.equal(sm.getTransactionVersion('+254700000022', 2).kind, 'report');
  });

  it('describes users for graph interconnect', () => {
    sm.login('+254700000023');
    const g = sm.describeForGraph();
    assert.ok(g.nodes.some(n => n.id === 'sessions_root'));
    assert.ok(g.nodes.some(n => n.id.startsWith('user_')));
    assert.ok(g.edges.length > 2);
  });
});

describe('Dashboard Monitor', () => {
  it('pushes events with redaction', () => {
    const m = new Monitor({ port: 0 });
    m.pushCredentials({ phone: '+254700999999', version: 3, registration: { status: 'COMPLETE' }, credentials: { firstName: 'Grace' }, language: 'sw' });
    m.push('activity', { phone: '+254700999999', password: 'hunter2', intent: 'question' });
    const snap = m.snapshot();
    const credEvent = snap.recentEvents.find(e => e.type === 'credentials');
    assert.ok(credEvent.payload.phone.includes('***'));
    const actEvent = snap.recentEvents.find(e => e.type === 'activity');
    assert.equal(actEvent.payload.password, undefined);
  });

  it('compares reactive bot activity vs autonomous notifications', () => {
    const m = new Monitor({ port: 0 });
    m.push('activity', {}, 'KNOWN_TRIGGER');
    m.push('activity', {}, 'KNOWN_TRIGGER');
    m.push('autonomous-notification', {}, 'AUTONOMOUS_IMPORTANT_INFO');
    const c = m.comparison();
    assert.equal(c.botActivityReactive, 2);
    assert.equal(c.autonomousWithoutTrigger, 1);
    assert.equal(c.breakdown.knownTrigger, 2);
    assert.equal(c.breakdown.importantInfo, 1);
    assert.equal(parseFloat(c.ratio), 0.333);
  });
});

describe('Autonomy Engine', () => {
  let ae;
  beforeEach(() => {
    ae = new AutonomyEngine();
  });

  it('classifies origins correctly', () => {
    assert.equal(ae.classify('KNOWN_TRIGGER'), ORIGINS.KNOWN_TRIGGER);
    assert.equal(ae.classify('garbage'), ORIGINS.KNOWN_TRIGGER);
    assert.equal(ae.isAutonomous(ORIGINS.AUTONOMOUS_FOLLOW_UP), true);
    assert.equal(ae.isAutonomous(ORIGINS.KNOWN_TRIGGER), false);
  });

  it('schedules and fires follow-ups autonomously on tick', () => {
    const sent = [];
    ae.onDispatch((phone, text) => sent.push(text));
    ae.scheduleFollowUp('+254700000031', 'your wage report', -1);
    const r = ae.tick();
    assert.equal(r.followUpsFired, 1);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /Following up/);
    assert.equal(ae.comparisonSnapshot().autonomousFollowUp, 1);
  });

  it('broadcasts important info to all subscribers', () => {
    const sent = [];
    ae.onDispatch((phone, text) => sent.push(text));
    ae.setSubscribers(['+254700000032', '+254700000033']);
    const n = ae.broadcastImportantInfo(['+254700000032', '+254700000033'], 'New labour office opens in Kericho.');
    assert.equal(n, 2);
    assert.match(sent[0], /Important update/);
  });
});
