import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import CrisisSupport, { detectCrisis } from '../src/crisis-support.js';

const support = new CrisisSupport();

describe('CrisisDetector', () => {
  it('flags severe distress in English', () => {
    const r = detectCrisis('my boss hates me and I want to kill myself tonight');
    assert.equal(r.level, 'severe');
    assert.ok(r.triggers.some(t => t.level === 'severe'));
  });

  it('flags severe distress in Swahili', () => {
    const r = detectCrisis('maisha yamenimaliza, nataka kufa');
    assert.equal(r.level, 'severe');
  });

  it('flags moderate distress signals', () => {
    const r = detectCrisis('I have lost all hope. I feel like such a burden to everyone');
    assert.equal(r.level, 'moderate');
  });

  it('does NOT false-positive on plain legal queries', () => {
    const r = detectCrisis("my employer hasn't paid my wages for three months, what do I do?");
    assert.equal(r.level, 'none');
    assert.deepEqual(r.triggers, []);
  });

  it('severe outranks moderate when both are present', () => {
    const r = detectCrisis('I am totally hopeless and I think I should kill myself');
    assert.equal(r.level, 'severe');
  });

  it('is safe on empty or non-string input', () => {
    assert.equal(detectCrisis('').level, 'none');
    assert.equal(detectCrisis(null).level, 'none');
    assert.equal(detectCrisis(undefined).level, 'none');
  });
});

describe('CrisisSupport', () => {
  it('loads the Kenyan support network', () => {
    const orgs = support.crisisOrganizations();
    assert.ok(orgs.length >= 5, `expected >=5 crisis orgs, got ${orgs.length}`);
    assert.ok(orgs.some(o => o.phone.includes('1199'))); // Kenya Red Cross
    assert.ok(orgs.some(o => /befrienders/i.test(o.name)));
  });

  it('formats support lines with phones', () => {
    const lines = support.supportLines('en');
    assert.match(lines, /Kenya Red Cross: 1199/);
    assert.match(lines, /999 \/ 112/);
  });

  it('builds a severe response containing helplines', () => {
    const msg = support.buildMessage('severe', 'en');
    assert.match(msg, /1199/);
    assert.match(msg, /1190/);
    assert.match(msg, /worried about you/i);
  });

  it('builds a Swahili moderate response', () => {
    const msg = support.buildMessage('moderate', 'sw');
    assert.match(msg, /mzigo/);
    assert.match(msg, /1199/);
  });

  it('triage escalates severe crises (warm handoff) but not moderate', () => {
    const severe = support.triage('I am going to kill myself now');
    assert.equal(severe.level, 'severe');
    assert.equal(severe.escalate, true);
    assert.equal(severe.needsCare, true);
    assert.ok(severe.response.length > 0);

    const moderate = support.triage('nisikilize, nimekata tamaa kabisa', 'sw');
    assert.equal(moderate.level, 'moderate');
    assert.equal(moderate.escalate, false);
    assert.equal(moderate.needsCare, true);
  });

  it('triage returns an empty response when there is no crisis', () => {
    const r = support.triage('good morning, what are my rights on overtime pay?');
    assert.equal(r.level, 'none');
    assert.equal(r.response, '');
    assert.equal(r.escalate, false);
  });
});