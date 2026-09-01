# AgriShield HRDD Dashboard v2 — Modern Analytics + Live Data

Date: 2026-09-01
Status: Approved design

## Goal

Upgrade the corporate HRDD dashboard (`src/dashboard.js`) from a static 3s-polling
snapshot into a **professional, modern analytics dashboard** where the data visibly
**moves** in real time, driven by the live Monitor event feed.

## Constraints

- **Air-gapped, no CDN.** Per the existing design constraint ("no CDN, works
  air-gapped"), all charts, styling and JS must be self-contained inline
  SVG/CSS/JS. No charting library is installed (verified `node_modules`), so we
  hand-roll small SVG chart helpers.
- **Real data first.** The moving data comes from the real `Monitor` event stream
  (messages, crisis, registrations, autonomous pushes, SLA escalations). A
  guarded demo/simulator puts guaranteed motion on screen for demonstrations even
  when the bot is idle.
- Anonymization is preserved — only redacted payloads surface.

## Architecture

- Single-file self-contained Express dashboard stays in `src/dashboard.js`.
- **Real-time transport:** use the already-installed `socket.io`. The Express app
  is created on an `http.Server`; we attach Socket.IO to it and forward every
  Monitor `push()` event to connected browsers as `monitor:event`. This is the
  live "data moving" backbone (replaces the barely-used SSE endpoint as the
  primary stream; SSE kept for compatibility).
- **Timeseries endpoint:** `GET /api/feed?window=1h&bucket=60s` buckets Monitor
  ring events (+ in-memory counter history) into per-bucket counts (reactive,
  autonomous) and returns a rolling window plus the last N raw events for the
  ticker. Client animates it into an area chart.
- **Simulator:** `POST /api/simulate?count=N` (demo toggle) pushes synthetic
  Monitor events so the dashboard demonstrably animates when idle.

## Frontend (modern analytics / SaaS command-center)

- **Layout:** sticky top header (logo, live status dot, clock, demo toggle, nav
  tabs), KPI strip with animated counters + mini sparklines, a responsive grid of
  chart cards, then full-width tables (cases + SMS console).
- **Hand-rolled inline SVG charts (dependency-free):**
  - Activity area/line chart (messages/min + autonomous/min, rolling window).
  - Channel donut (WhatsApp vs SMS).
  - Case-status donut (IN_REVIEW / ESCALATED / RESOLVED).
  - Sentiment distribution stacked bar.
  - County hotspots — animated horizontal bars that re-sort.
  - Sparklines on each KPI card.
- **Live event feed** — scrolling ticker of recent monitor events with type icons
  (crisis / registration / activity / sla-escalation / autonomous). Centerpiece of
  "data moving".
- **System status cards** — bot online, LLM routing, SMS channel kind, uptime,
  session/user counts.
- Smooth `requestAnimationFrame` number counters, CSS transitions, socket-driven
  instant updates merged with periodic refresh.

## Testing (TDD — tests written first, watch fail, then implement)

Extend `test/dashboard.test.js`:

1. `/api/feed` returns a valid bucketed timeseries (buckets array, earliest/latest
   timestamps, integer counts) for a seeded window.
2. `/api/feed` returns a valid empty shape when no events exist (no crash).
3. `/api/feed` honors `bucket` and `window` params (bucket count ≈ window/bucket).
4. `POST /api/simulate` pushes N synthetic monitor events and `/api/feed` reflects
   the increased reactive count.
5. Socket.IO server emits `monitor:event` to a connected client when `monitor.push`
   fires (integration).
6. Case-status donut endpoint (`/api/cases` already returns statuses; client-side
   aggregation covered by shape test) — verified via existing `/api/cases`.

## Verification

- `npm test` (full suite green, including the new dashboard tests; all other tests
  unaffected).
- Manual: load `http://localhost:3003/`, flip the demo toggle, observe the
  activity chart, ticker, donuts and sparklines animating in real time; real
  monitor events animate the same panels. No external network requests.
