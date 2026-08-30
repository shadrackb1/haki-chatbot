import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { classifyViolation } from '../src/violation-classifier.js';
import { findCountyOffice } from '../src/county-directory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evals = JSON.parse(readFileSync(path.join(__dirname, '..', 'data', 'golden-evals.json'), 'utf8'));

test('golden evals: violation classifications match the KB', () => {
  for (const c of evals.classification) {
    const result = classifyViolation(c.input);
    assert.equal(result ? result.id : null, c.expect, `case "${c.id}" mismatched`);
  }
});

test('golden evals: county labour office lookup is complete and correct', () => {
  for (const c of evals.countyLookup) {
    const off = findCountyOffice(c.county);
    assert.equal(off ? off.officer : null, c.expectOfficer, `county "${c.county}" mismatched`);
  }
});

test('golden evals: 2026 agricultural minimum wage figures are present in the KB', () => {
  const kb = JSON.parse(readFileSync(path.join(__dirname, '..', 'data', 'legal-knowledge-base.json'), 'utf8'));
  const mw = evals.minimumWage2026;
  const daily = kb.minimum_wages.agricultural;
  assert.equal(daily.unskilled, mw.agriculturalDaily);
  assert.equal(daily.monthly_unskilled, mw.agriculturalMonthly);
  assert.equal(daily.grades.stockman_herdsman_watchman, mw.stockman);
  assert.equal(daily.grades.tractor_driver, mw.tractorDriver);
  assert.equal(daily.grades.combined_harvester_driver, mw.combinedHarvester);
  assert.equal(daily.grades.farm_foreman_clerk, mw.farmForeman);
  assert.equal(daily.effective_date, mw.effective);
});