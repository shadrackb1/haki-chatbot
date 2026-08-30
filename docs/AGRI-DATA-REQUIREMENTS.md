# AgriShield — Data & Information Requirements (Agribusiness-Wide)

**Scope:** the bot serves the WHOLE Kenyan agribusiness value chain — input supply, growing
(fresh produce, flowers, tea, coffee, sugarcane, dairy, livestock), logistics & cold chain,
processing & packing, export/trade — covering workers, smallholder farmers, tenants and
community members, not only farm workers.

These are the verified data requirements for the AI to function properly, with sources and
refresh cadence. Every item maps to a file in `data/`.

---

## 0. What exists today (gap check)

| Layer | Exists | Gap |
|---|---|---|
| Legal corpus | 104 passages (boot log: `法律语料库: 104 条条文`) | ✅ Rolled out 2026-08-30 — was ~34, writeup now matches (104+) |
| Violation categories | 7 (+ certification fraud) | No value-chain segment labels; no fee/timeline tables per county |
| Knowledge base | `legal-knowledge-base.json` | ✅ 2026 refresh — wage orders L.N. 163/2024 + 2026 Order, SHIF-era payroll world, corrected hotlines; `agribusiness_segments` added |
| Languages | en + sw + ~20 local welcomes | No full legal-term glossaries |
| Retrieval | BM25 + hybrid (nv-embed / text-embedding-004) | No persisted vector index or corpus metadata (validity dates) |
| Crisis lines | 6 | No child-labour dedicated line, no NLAS verified number |
| Dashboard/UNGP | SLA + escalation + report export | No real incident data |

---

## 1. LEGAL / WAGE DATA (highest priority — currently 3–6 years stale)

### 1.1 Statutes to ingest (with § refs, validity date, source URL)
- Constitution of Kenya 2010: Art. 41 (labour), Art. 40 (property), Art. 21
- Employment Act 2007 (+ 2022 Amendments: casual-worker contracts, enhanced leave/training)
- Labour Relations Act 2007 (unfair termination remedies — max 12 months)
- Labour Institutions Act 2007 (minimum wage infra)
- Regulation of Wages Orders: **L.N. 164/2024 (General)** and **L.N. 163/2024 (Agricultural)**
  — and the **2026 Amendment Order in force since 1 May 2026** (Kenya Law history shows 2026 revs)
- Work Injury Benefits Act 2007 (WIBA)
- Occupational Safety & Health Act 2007 (OSHA)
- Children Act 2022; Employment (Child Labour) rules
- Environmental Management & Co-ordination Act 1999 (+ Noise Regs)
- Land Act 2012, Land Registration Act, Community Land Act 2016, NLC Act
- Legal Aid Act 2016 (eligibility: income < KES 30,000/month)
- Data Protection Act 2019
- Social Health Insurance Act 2023 (**SHIF** replaces NHIF), NSSF Act 2013 (Third Schedule), PAYE/Income Tax Act via KRA

**Primary sources:** new.kenyalaw.org · labour.go.ke (Employment Act PDFs, DOSH county contacts PDF)
· landcommission.go.ke/land-laws · Gazette (SIs) · kenyalaw.org/judgments/KEELRC (33,069 ELRC judgments).

### 1.2 Wage tables — verified Aug 2026 (WageIndicator manual; 2026 order)
Agricultural industry (per WageIndicator, valid Aug 2026):

| Grade | Daily | Monthly |
|---|---|---|
| Unskilled worker | KES 335.86 | KES 7,997.33 |
| Stockman / herdsman / watchman | 391.14 | 9,235.78 |
| Farm foreman / clerk | 609.66 | 14,427.13 |
| Tractor driver | 430.52 | 10,136.30 |
| Combined-harvester driver | 473.82 | 11,166.62 |

General wage order (applies to non-agri value-chain jobs — processing, packing, logistics,
trade) L.N. 164/2024: Nairobi/centre KES ~700+ /day tier; municipal/shrine tiers; rural tiers —
encode full town-by-town General Order table + **2026 update**.
Normal hours: 45/wk (52 max). House allowance added to basic.

### 1.3 Deduction stack (2026)
- **NSSF (Year 4 tiers):** lower limit KES 9,000, upper limit KES 108,000, 6% + 6%; max employee
  KES 6,480/mo (Tier I 540 + Tier II 5,940)
- **SHIF:** 2.75% of gross salary (min KES 300/mo), no cap; paid via KRA; remit by 9th
- **Housing Levy (AHL):** 1.5% + 1.5% (2026 status per latest court/statute — flag for re-verify)
- **PAYE:** 10–35% bands (KRA)
Current knowledge base predates SHIF — the single most user-facing incorrect data.

---

## 2. INSTITUTIONS & REMEDY DATA

### 2.1 Ministry of Labour (verified)
Bishops Road, Social Security House · +254 (020) 2729801/804-819 · complaints@labour.go.ke.
Complaint → Form LD-64 → conciliation after 7 days → demand notice → ELRC.
**47-county DOSH officer directory**: downloaded from labour.go.ke (Sept 2022 official PDF) → encoded
in `data/county-labour-offices.json`.

### 2.2 ELRC (verified)
Stations: Nairobi, Mombasa, Kisumu, Nakuru, Kericho, Nyeri, Eldoret + sub-registries (Malindi, Machakos,
Bungoma, Garissa, Meru, Kisii, Voi, Kitale). Registrar Milimani, +254 0730 182 000.
Fees: Second Schedule (r.81, Procedure Rules L.N. 133/2024 as amended 2025). **r.81(2) fee waiver** for
parties without sufficient means. Unfair-dismissal complaint: file within **3 months**.

### 2.3 Legal aid (verified)
NLAS toll-free **0800 720 640** (update old docs/bot text 0800 723 255), offices Nairobi/Kisumu/Mombasa/
Eldoret/Nakuru, WhatsApp +254 703 149 933. Eligibility: income < KES 30,000/mo, decision in 48h.

### 2.4 Land (verified)
NLC HQ 316 Upper Hill Chambers, Ngong Rd, +254 (020) 2718050; **47 county coordinators** published at
landcommission.go.ke/county-coordinators (encode per county). Eviction: 3-month notice.

### 2.5 Sector instruments (verified)
KFC FOSS + KS 1758 (horticulture, 160,000 workers) · FLP/Fairtrade · EU CS3D applies to Kenyan exporters
from 2027 · Cultivating Justice project (DCA + Pamoja Trust, 3-yr) baseline data channel for dashboard.

---

## 3. LANGUAGE & CULTURAL DATA
- Legal-term glossaries (wages/mkataba/usalama/… ) in Sw+En; keyed to `local-languages.json` (20+ langs).
- Code-mixed Swahili/Sheng voice; payslip & contract image taxonomy (fields to extract).

## 4. LLM ENGINEERING DATA (makes the AI itself function well)
- **Golden eval suite** (100+ pairs, en+sw) with expected category/source → `data/golden-evals.json` + test.
- Corpus chunk metadata: `{statute, section, category, validFrom, validTo, source_url, verified}`.
- Guardrails: refusal/off-topic en+sw; jurisdiction disclaimers; GBV/child-labour escalation.
- Feedback loop: per-reply rating → golden-set growth; sampled traces for evals.
- Ops-as-data: model-routing table, RAG top-K/temperature config, trace log, cost ledger.

---

## 5. Prioritized roadmap

| # | Item | Source | Refresh | Effort | Status |
|---|---|---|---|---|---|
| 1 | 2026 wage tables + deduction stack | Kenya Law L.N. 163/164/2024 + 2026 order; KRA/NSSF/SHA | Yearly | S | ✅ Done 2026-08-30 |
| 2 | 47-county labour officer directory | labour.go.ke DOSH PDF | Yearly | S | ✅ Done — `county-labour-offices.json`; Busia/Isiolo → HQ fallback |
| 3 | Legal corpus 34 → 100+ passages w/ metadata | Kenya Law full-texts | Quarterly | M | ✅ Done — 104 passages |
| 4 | Remedy tables (ELRC fees/waiver, NLAS, NLC/ELC per county) | Judiciary, nlas.go.ke, landcommission | Yearly | M | 🟡 Partial — ELRC/NLAS/NLC in KB; county coordinators still thin |
| 5 | Golden eval suite (100+ Q/A en+sw) | Author from KB + tests | Continuous | M | 🟡 V1 — `data/golden-evals.json` + `test/golden-evals.test.js` (deterministic) |
| 6 | Case-law summaries (20 landmarks, KEELRC) | Kenya Law | Quarterly | M | ⬜ Not yet |
| 7 | Feedback + consent + PII-minimization capture | Code | Continuous | M | ⬜ Not yet |
| 8 | Crisis/GBV/child-labour hotline registry | NCAJ/NLAS/DOSHS | Yearly | S | 🟡 Partial — Childline 116/DOSHS/NLAS/KNH in `support-organizations.json` |
| 9 | Sector reports pipeline (Cultivating Justice, KFC FOSS) | DCA/Pamoja | Quarterly | L | ⬜ Not yet |
| 10 | Language glossaries (en+sw+~10 local) | Authors + community | Quarterly | L | ⬜ Not yet |

Bottom line: the AI runs and its legally-sensitive data is now largely current (2026 wages, SHIF-era payroll,
104-passage corpus) with a county labour-officer directory and golden evals. Items 4 (county coordinators), 5 (more
cases), 6, 7, 9, 10 remain for trustworthiness and sector depth.