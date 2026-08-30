# HakiAgri Full Upgrade — Design Spec

**Date:** 2026-08-30
**Status:** Approved (user: "UPGRADE EVERYTHING … SMS INSTEAD", simulator-first, free/OSS SMS provider)

## Goal

Upgrade the Haki chatbot from a rights-only WhatsApp assistant into "HakiAgri":
a two-sided grievance system with (1) advanced emotional-support / crisis routing,
(2) an SMS intake channel, (3) an auditable case store with SLA escalation and CSO
routing, (4) a corporate human-rights due-diligence (HRDD) dashboard, and
(5) UNGP / OECD-FAO compliance report export.

## Remaining constraints (carried over)

- Bot remains **workplace-rights only** — Shamba-to-Ship / GrainChain / market
  features stay removed.
- **All 3 configured LLM provider keys are used at will** — the engine must use
  every active key (round-robin rotation + per-task routing + failure-weighting
  + cascade), not just the first one configured. `usedProvider` feeds back into
  the pipeline/dashboard.
- **Existing empathy support is kept and extended**, never deleted.
- Free, open-source SMS: **TextBee** and **Gammu SMSD** (both self-hosted, no
  per-message fees) behind one `SmsGateway` interface; a built-in **simulator**
  is the default so the demo runs with no hardware.
- WhatsApp pipeline, LLM cascade (NVIDIA→Groq→Google) and rule fallback unchanged.
- Windows + PowerShell dev env; `npm test` = `node --test test/*.test.js`.

## Architecture

```
WhatsApp (Baileys)  ─┐
SMS In/Out (SmsGateway) ─┤→ Triage (violation-classifier / detectLanguage)
                         ├→ CrisisSupport gate (crisis? → support line + warm handoff flag)
                         ├→ legal RAG (BM25) + LLM reply
                         ├→ EmpathyEngine + IQEngine (sentiment/intent richness)
                         └→ CaseStore (every grievance = a Case)
                                 │
                                 ├→ SLAEngine (tick via AutonomyEngine)
                                 │    └→ ESCALATED → CSO / management route
                                 ├→ Dashboard (Express + Chart.js, no CDN)
                                 │    └→ anonymized hotspots, case queue, live SMS console
                                 └→ UNGP/FAO Report (pdfkit) per client
```

## New modules

### Phase 0 — LLM multi-provider unlock (`src/llm-router.js`)
- `LLMRouter`: rotates across **all enabled providers** (NVIDIA / Groq / Google),
  modes `round-robin` (default), `priority`, `favorite` via `LLM_ROUTING` /
  `LLM_FAVORITE_PROVIDER` env. Consecutive failures deprioritize a provider;
  retry (2x transient) then cascade. Per-message override via `context.llm.provider`.
- `LLMReasoningEngine` returns `usedProvider`; index.js logs and surfaces it.

### Phase 1 — Emotional support (`src/crisis-support.js`, `data/support-organizations.json`)
- `CrisisDetector`: severe-distress patterns (self-harm, suicide, hopelessness,
  despair) in English + Swahili (+ local langs where available). Levels:
  `none | moderate | severe`.
- `SupportNetwork`: free Kenyan support organizations (Befrienders Kenya,
  Kenya Red Cross 1199, KEMH 0800 720 122, GBV 1195), each with
  multilingual message templates.
- `CrisisSupport.triage(message, lang)` → `{ level, triggers, response, escalate }`.
- Warm-handoff: when cries can't be handled by the bot → flag a case for CSO /
  human follow-up (feeds CaseStore + Monitor).
- Wire `EmpathyEngine` + `IQEngine` + `CrisisSupport` into `src/index.js` before
  the legal pipeline. Empathic prefix is prepended to the reply; severe crisis
  short-circuits to the support response.
- Replace `detectLanguage()` stub in `index.js` with `LanguageLibrary`.

### Phase 2 — SMS channel (`src/sms-gateway.js`, `src/sms-handler.js`)
- `SmsGateway` interface: `send(sms)`, `start(handler)`, `stop()`.
  - `SimulatorProvider` (default): stores outbox, exposes an express route +
    in-memory web console to inject inbound SMS from any number.
  - `TextBeeProvider`: REST to a self-hosted TextBee instance (`.env`).
  - `GammuProvider`: polls an SMSD back-end (filesystem/dir or CLI), invokes
    `gammu-smsd-inject` for outbound.
- `SmsHandler`: reuses the same pipeline as WhatsApp
  (triage → crisis → RAG → LLM → empathized reply), keyed by MSISDN.
- Toll-free shortcode placeholder `22141` (configurable via `.env`).

### Phase 3 — Cases + SLA (`src/case-store.js`, `src/sla-engine.js`)
- `CaseStore`: appends to `data/cases.json`. A Case = { caseId, channel, phone
  (anonymized), county, category, crisisLevel, status, createdAt, slaDeadline,
  events[] }.
- `SLAEngine`: per-severity windows (crisis → short). On autonomy tick, marks
  `IN_REVIEW` → `ESCALATED` for overdue cases and emits an escalation event to
  Monitor + registered CSO contact list (`.env`).

### Phase 4 — Corporate HRDD dashboard (`src/dashboard.js`, `views/`)
- Express + socket.io (deps already present) so the monitor and cases stream live.
- Pages: overview KPIs, anonymized county risk hotspots (inline Chart.js — no CDN),
  case queue with filters, SLA/escalation view, live inbound-SMS console.

### Phase 5 — UNGP / OECD-FAO report (`src/ungp-report.js`)
- Builds an audit-ready report from case data mapped to UNGP Pillars P1–P3,
  UNGP 31 grievance-mechanism criteria, OECD-FAO 5-step due-diligence.
- Export: markdown + PDF via pdfkit (already a dependency).

## Tests (new, `node --test test/*.test.js`)

- `test/crisis-support.test.js`, `test/sms-gateway.test.js`, `test/sms-handler.test.js`,
  `test/case-store.test.js`, `test/sla-engine.test.js`, `test/ungp-report.test.js`,
  `test/dashboard.test.js`. Existing 80 tests stay green.

## Build order / checklist

- [x] Spec written
- [ ] Phase 0: llm-router.js (round-robin across all API keys) + tests
- [ ] Phase 1: crisis-support.js + support-organizations.json + tests
- [ ] Phase 1: wire Empathy + IQ + Crisis into index.js; real detectLanguage
- [ ] Phase 2: sms-gateway.js (Simulator/TextBee/Gammu) + sms-handler.js + tests
- [ ] Phase 3: case-store.js + sla-engine.js + tests
- [ ] Phase 4: dashboard.js (Express + Chart.js hotspots + live SMS console) + tests
- [ ] Phase 5: ungp-report.js + tests
- [ ] Full suite green; commit + push