# AgriShield Agribusiness Data Rollout — 2026-08-30

## Goal
Load the bot with current, sector-wide data so it works for the WHOLE agribusiness
value chain (input supply, growers, logistics/cold chain, processing/packing, export,
trade) — not just farm workers. Old data (2017/2018/2021 wages, NHIF, stale contacts)
is replaced with verified 2024/2026 figures, the legal corpus grows from ~34 to 100+
passages, a county labour-officer directory is added, remedy tables + crisis lines are
updated, and a golden eval suite gates correctness.

## Architecture
- `data/legal-knowledge-base.json` — rule-mode facts (categories, wage tables,
  deduction stack, remedy institutions, instant responses).
- `data/legal-corpus.json` — retrieval corpus (passages with category + source + verified).
- `data/county-labour-offices.json` — NEW: 47-county Ministry/DOSHS contact directory.
- `data/support-organizations.json` — crisis/support hotline registry.
- `test/golden-evals.test.js` + `data/golden-evals.json` — NEW: eval suite.
- Consumers: `violation-classifier.js`, `llm-reasoning.js`, `conversation-manager.js`,
  `crisis-support.js` read these files at startup; keep shapes backward compatible.

## Tech Stack
Node 20 ESM, `node:test`, JSON data files, no new deps.

## Constraints
- Must not change output shapes consumed by src (extra fields OK, existing keys stable).
- All wages/deductions sourced from live research (L.N. 163/164/2024, 2026 order,
  WageIndicator Aug 2026, KRA/NSSF/SHA rates) — flagged `verified: true` only when
  confirmed, else `verified: false`.
- `npm test` (190 tests) must stay green; add tests for new files.

## Tasks
- [x] 1. Save research report → `docs/AGRI-DATA-REQUIREMENTS.md`
- [x] 2. Knowledge base refresh (wages, SHIF/NSSF/AHL/PAYE, NLAS hotline, ELRC, MOL contacts, sector segments)
- [x] 3. Corpus expansion 34 → 100+ passages (write `legal-corpus-additions.json`, merge by id) — 104 passages
- [x] 4. `data/county-labour-offices.json` (47 counties from official DOSH list) + wire into remedy lookup (`src/county-directory.js`, grievance-pipeline, llm-reasoning)
- [x] 5. Remedy pathway tables (ELRC fees/waiver, NLAS eligibility, NLC county coordinators) — ELRC/NLAS/NLC in KB; county coordinators still thin
- [x] 6. Golden eval suite `data/golden-evals.json` + `test/golden-evals.test.js` (+ fixes: tier constants matched to real KB ids, fallback NLAS number, corpus counts)
- [x] 7. Crisis network add: Childline 116, GBV 1195 verified, DOSHS hotline, NLAS
- [x] 8. `npm test` green (193 tests, incl. new tests)
- [x] 9. Commit + push