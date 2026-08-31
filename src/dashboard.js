import express from 'express';
import http from 'http';
import { WINDOW_HOURS } from './sla-engine.js';

// ============================================
// CORPORATE HRDD DASHBOARD
// Live window into the AgriShield operation: anonymity-preserving KPIs, county
// risk hotspots, the case queue with SLA/escalation view, and a live SMS
// console. Express (already in package.json); live refresh uses polling +
// Server-Sent Events. Charts are dependency-free inline CSS/SVG — no CDN,
// works air-gapped.
// ============================================

function inlinePage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgriShield HRDD Dashboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0c1117;--surface:#161b22;--surface2:#1c2333;--border:#30363d;
  --text:#e6edf3;--text2:#8b949e;--text3:#6e7681;
  --green:#3fb950;--green2:#238636;--green-bg:rgba(63,185,80,.12);
  --red:#f85149;--red2:#da3633;--red-bg:rgba(248,81,73,.12);
  --amber:#d29922;--amber2:#bb8009;--amber-bg:rgba(210,153,34,.12);
  --blue:#58a6ff;--blue2:#1f6feb;--blue-bg:rgba(88,166,255,.12);
  --purple:#bc8cff;--purple-bg:rgba(188,140,255,.12);
  --radius:8px;--radius-lg:12px;
}
html{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:var(--text);background:var(--bg)}
body{min-height:100vh}

/* ── Header ── */
header{background:var(--surface);border-bottom:1px solid var(--border);padding:16px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100;backdrop-filter:blur(12px);background:rgba(22,27,34,.85)}
.logo{display:flex;align-items:center;gap:12px}
.logo svg{width:28px;height:28px}
.logo h1{font-size:18px;font-weight:600;letter-spacing:-.3px}
.logo span{color:var(--text2);font-weight:400;font-size:13px}
.status{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.dot.off{background:var(--red);box-shadow:0 0 6px var(--red)}

/* ── Layout ── */
.container{max-width:1400px;margin:0 auto;padding:24px}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.full{grid-column:1/-1}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;transition:border-color .2s}
.card:hover{border-color:#484f58}
.card-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text2);margin-bottom:16px}
.card-title svg{width:16px;height:16px;opacity:.6}

/* ── KPI Cards ── */
.kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px 20px;display:flex;flex-direction:column;gap:6px;transition:all .2s;position:relative;overflow:hidden}
.kpi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:var(--radius-lg) var(--radius-lg) 0 0}
.kpi-card:hover{border-color:#484f58;transform:translateY(-1px)}
.kpi-card.green::before{background:var(--green)}.kpi-card.red::before{background:var(--red)}
.kpi-card.amber::before{background:var(--amber)}.kpi-card.blue::before{background:var(--blue)}
.kpi-card.purple::before{background:var(--purple)}
.kpi-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text2)}
.kpi-value{font-size:28px;font-weight:700;letter-spacing:-.5px;line-height:1}
.kpi-value.green{color:var(--green)}.kpi-value.red{color:var(--red)}
.kpi-value.amber{color:var(--amber)}.kpi-value.blue{color:var(--blue)}
.kpi-value.purple{color:var(--purple)}
.kpi-sub{font-size:11px;color:var(--text3)}

/* ── Bars ── */
.bar-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.bar-label{width:100px;font-size:12px;color:var(--text2);text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{flex:1;height:20px;background:var(--surface2);border-radius:4px;overflow:hidden;position:relative}
.bar-fill{height:100%;border-radius:4px;transition:width .6s cubic-bezier(.4,0,.2,1);display:flex;align-items:center;padding-left:8px;font-size:11px;font-weight:600;color:#fff;min-width:24px}
.bar-fill.green{background:linear-gradient(90deg,var(--green2),var(--green))}
.bar-fill.red{background:linear-gradient(90deg,var(--red2),var(--red))}
.bar-fill.amber{background:linear-gradient(90deg,var(--amber2),var(--amber))}
.bar-count{font-size:12px;color:var(--text2);width:28px;text-align:right;flex-shrink:0}

/* ── Heatmap grid ── */
.heatmap-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
.heat-cell{border-radius:var(--radius);padding:12px 10px;text-align:center;transition:transform .15s;cursor:default;position:relative}
.heat-cell:hover{transform:scale(1.05)}
.heat-cell .county{font-size:11px;font-weight:600;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.heat-cell .pct{font-size:22px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.heat-cell .detail{font-size:10px;color:rgba(255,255,255,.75);margin-top:2px}

/* ── Tables ── */
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--text2);padding:8px 12px;border-bottom:1px solid var(--border);background:var(--surface2)}
td{padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px;vertical-align:middle}
tr:hover td{background:rgba(255,255,255,.02)}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;line-height:1}
.badge.review{background:var(--blue-bg);color:var(--blue)}
.badge.escalated{background:var(--red-bg);color:var(--red)}
.badge.resolved{background:var(--green-bg);color:var(--green)}
.sla-warn{color:var(--red);font-weight:700;font-variant-numeric:tabular-nums}
.sla-ok{color:var(--green);font-variant-numeric:tabular-nums}

/* ── Filters ── */
.filters{display:flex;gap:8px;margin-bottom:12px}
select{background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:6px 12px;font-size:12px;font-family:inherit;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;padding-right:28px}
select:focus{outline:none;border-color:var(--blue)}

/* ── SMS Console ── */
.sms-form{display:flex;gap:8px;margin-bottom:12px}
.sms-form input{flex:1;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;font-size:13px;font-family:inherit}
.sms-form input:focus{outline:none;border-color:var(--blue)}
.sms-form input:first-child{max-width:160px}
.btn{background:var(--green2);color:#fff;border:none;border-radius:var(--radius);padding:8px 16px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;transition:background .15s}
.btn:hover{background:var(--green)}
.sms-log{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.log-box{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px;max-height:180px;overflow-y:auto;font-family:'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;font-size:11px;line-height:1.7;color:var(--text2)}
.log-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text3);margin-bottom:6px}

/* ── Footer ── */
footer{text-align:center;padding:20px;color:var(--text3);font-size:11px;border-top:1px solid var(--border)}

/* ── Responsive ── */
@media(max-width:900px){.cards{grid-template-columns:1fr}.kpi-row{grid-template-columns:repeat(3,1fr)}.sms-log{grid-template-columns:1fr}}
@media(max-width:600px){.kpi-row{grid-template-columns:repeat(2,1fr)}header{padding:12px 16px}.container{padding:16px}}
</style></head><body>

<header>
  <div class="logo">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="var(--green-bg)" stroke="var(--green)"/></svg>
    <h1>AgriShield <span>HRDD Dashboard</span></h1>
  </div>
  <div class="status">
    <div class="dot" id="live-dot"></div>
    <span id="live">connecting…</span>
  </div>
</header>

<div class="container">
  <div class="kpi-row" id="kpis"></div>

  <div class="cards">
    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
        County Risk Hotspots
      </div>
      <div id="hotspots"></div>
    </div>

    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>
        Sentiment Heatmap
      </div>
      <div id="sentiment"></div>
    </div>

    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        SLA Windows
      </div>
      <table><thead><tr><th>Tier</th><th>Window</th></tr></thead><tbody id="sla-windows"></tbody></table>
      <div style="margin-top:16px">
        <div class="card-title" style="margin-bottom:8px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Overdue Cases
        </div>
        <table><thead><tr><th>Case</th><th>Category</th><th>Overdue</th></tr></thead><tbody id="overdue"></tbody></table>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
        Case Queue
      </div>
      <div class="filters">
        <select id="f-status"><option value="">All statuses</option><option>IN_REVIEW</option><option>ESCALATED</option><option>RESOLVED</option></select>
        <select id="f-county"><option value="">All counties</option></select>
      </div>
      <div style="overflow-x:auto">
      <table><thead><tr><th>Case</th><th>Channel</th><th>County</th><th>Category</th><th>Status</th><th>Created</th><th>SLA Due</th></tr></thead><tbody id="cases"></tbody></table>
      </div>
    </div>

    <div class="card full">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        SMS Console
      </div>
      <form class="sms-form" id="sms-form">
        <input name="from" value="+254700000001" placeholder="From">
        <input name="text" placeholder="Type an inbound SMS…">
        <button class="btn" type="submit">Send</button>
      </form>
      <div class="sms-log">
        <div><div class="log-label">Inbox</div><div class="log-box" id="inbox"></div></div>
        <div><div class="log-label">Outbox</div><div class="log-box" id="outbox"></div></div>
      </div>
    </div>
  </div>
</div>

<footer>AgriShield HRDD Dashboard — data is anonymized. No personally identifiable information is displayed.</footer>

<script>
const $=id=>document.getElementById(id);
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}

function kpiCard(label, value, variant, sub) {
  return '<div class="kpi-card '+variant+'"><div class="kpi-label">'+esc(label)+'</div><div class="kpi-value '+variant+'">'+esc(String(value))+'</div>'+(sub?'<div class="kpi-sub">'+esc(sub)+'</div>':'')+'</div>';
}

function heatColor(pct) {
  if (pct >= 75) return '#da3633';
  if (pct >= 50) return '#d29922';
  if (pct >= 25) return '#9e6a03';
  if (pct > 0) return '#238636';
  return '#1c2333';
}

async function load() {
  try {
    const [o,c,h,s,sms,sen] = await Promise.all([
      fetch('/api/overview').then(r=>r.json()),
      fetch('/api/cases').then(r=>r.json()),
      fetch('/api/hotspots').then(r=>r.json()),
      fetch('/api/sla').then(r=>r.json()),
      fetch('/api/sms').then(r=>r.json()),
      fetch('/api/sentiment').then(r=>r.json())]);

    // KPIs
    const k = o.kpis;
    $('kpis').innerHTML =
      kpiCard('Open', k['Open cases'], 'blue') +
      kpiCard('Escalated', k['Escalated'], 'red') +
      kpiCard('Resolved', k['Resolved'], 'green') +
      kpiCard('Total', k['Total tracked'], 'purple') +
      kpiCard('Overdue', k['Overdue SLA'], 'red', k['Overdue SLA'] > 0 ? 'SLA breached' : 'All on track') +
      kpiCard('SMS Rx', k['SMS received'], 'amber') +
      kpiCard('SMS Tx', k['SMS sent'], 'amber') +
      kpiCard('Reactive', k['Reactive activity'], 'blue') +
      kpiCard('Autonomous', k['Autonomous pushes'], 'purple');

    // Hotspot bars
    const max = Math.max(1, ...h.map(x => x.count));
    $('hotspots').innerHTML = h.length
      ? h.map(x => '<div class="bar-row"><span class="bar-label">' + esc(x.county) + '</span><div class="bar-track"><div class="bar-fill green" style="width:' + Math.round(100 * x.count / max) + '%"></div></div><span class="bar-count">' + x.count + '</span></div>').join('')
      : '<div style="color:var(--text3);padding:20px 0;text-align:center;font-size:13px">No cases yet.</div>';

    // Sentiment heatmap
    $('sentiment').innerHTML = sen.counties.length
      ? '<div class="heatmap-grid">' + sen.counties.map(x => {
        const bg = heatColor(x.heat);
        const det = Object.entries(x.distribution).map(([k,v]) => k + ':' + v).join(' · ');
        return '<div class="heat-cell" style="background:'+bg+'"><div class="county">'+esc(x.county)+'</div><div class="pct">'+x.heat+'%</div><div class="detail">'+esc(det)+'</div></div>';
      }).join('') + '</div><div style="margin-top:12px;font-size:11px;color:var(--text3)">Distress intensity = share of negative sentiment per county · ' + sen.totals.negative + '/' + sen.totals.cases + ' negative</div>'
      : '<div style="color:var(--text3);padding:20px 0;text-align:center;font-size:13px">No cases yet.</div>';

    // SLA windows
    $('sla-windows').innerHTML = Object.entries(s.windows).map(([k,v]) => '<tr><td style="font-weight:600;text-transform:capitalize">'+esc(k)+'</td><td class="sla-ok">'+v+' hours</td></tr>').join('');

    // Overdue
    $('overdue').innerHTML = s.overdue.length
      ? s.overdue.map(x => '<tr><td style="font-family:monospace;font-size:12px">'+esc(x.caseId)+'</td><td>'+esc(x.category)+'</td><td class="sla-warn">'+x.overdueByH+'h overdue</td></tr>').join('')
      : '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:16px">All cases within SLA</td></tr>';

    // Case table
    const counties = new Set(c.map(x => x.county));
    $('f-county').innerHTML = '<option value="">All counties</option>' + [...counties].map(x => '<option>' + esc(x) + '</option>').join('');
    const fs = $('f-status').value, fc = $('f-county').value;
    $('cases').innerHTML = c.filter(x => (!fs || x.status === fs) && (!fc || x.county === fc))
      .map(x => '<tr><td style="font-family:monospace;font-size:12px">'+esc(x.caseId)+'</td><td><span style="text-transform:uppercase;font-size:10px;font-weight:600;letter-spacing:.5px;color:var(--text2)">'+esc(x.channel)+'</span></td><td>'+esc(x.county)+'</td><td>'+esc(x.category)+'</td><td><span class="badge '+({IN_REVIEW:'review',ESCALATED:'escalated',RESOLVED:'resolved'}[x.status]||'review')+'">'+esc(x.status)+'</span></td><td style="color:var(--text2);font-size:12px">'+esc((x.createdAt||'').slice(0,16).replace('T',' '))+'</td><td style="color:var(--text2);font-size:12px">'+esc((x.slaDeadline||'').slice(0,16).replace('T',' '))+'</td></tr>').join('')
      || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No cases match filters.</td></tr>';

    // SMS
    $('inbox').textContent = sms.inbox.join('\\n') || '(none)';
    $('outbox').textContent = sms.outbox.join('\\n') || '(none)';

    // Status indicator
    $('live-dot').className = 'dot';
    $('live').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch(e) {
    $('live-dot').className = 'dot off';
    $('live').textContent = 'Offline — ' + e.message;
  }
}

$('sms-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  await fetch('/api/sms/inject', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({from:f.get('from'),text:f.get('text')}) });
  ev.target.reset(); ev.target.elements.from.value = '+254700000001'; load();
});
$('f-status').addEventListener('change', load);
$('f-county').addEventListener('change', load);
load();
setInterval(load, 3000);
try { const es = new EventSource('/api/events'); es.onmessage = () => load(); es.onerror = () => {}; } catch(e) {}
</script></body></html>`;
}

class Dashboard {
  constructor({ caseStore, slaEngine, monitor, smsGateway, port = 3003 } = {}) {
    this.caseStore = caseStore;
    this.slaEngine = slaEngine;
    this.monitor = monitor;
    this.smsGateway = smsGateway;
    this.port = Number(process.env.DASHBOARD_PORT || port);
    this.server = null;
    this._unsub = null;
    this._sseClients = new Set();
  }

  _overview() {
    const store = this.caseStore;
    const stats = store ? store.stats() : null;
    const overdueCount = this.slaEngine && store ? this._slaView().overdue.length : 0;
    return {
      kpis: {
        'Open cases': stats ? stats.open : 0,
        'Escalated': stats ? stats.escalated : 0,
        'Resolved': stats ? stats.resolved : 0,
        'Total tracked': stats ? stats.total : 0,
        'Overdue SLA': overdueCount,
        'SMS sent': this.smsGateway && this.smsGateway.outbox ? this.smsGateway.outbox.length : 0,
        'SMS received': this.smsGateway && this.smsGateway.inbound ? this.smsGateway.inbound.length : 0,
        'Reactive activity': this.monitor ? this.monitor.counters.reactive || 0 : 0,
        'Autonomous pushes': this.monitor ? this.monitor.counters.autonomousInfo || 0 : 0
      },
      uptime: this.monitor ? this.monitor.snapshot().uptimeSeconds : 0
    };
  }

  _hotspots() {
    const counts = new Map();
    for (const c of this.caseStore ? this.caseStore.all() : []) {
      const key = c.county || '(unknown)';
      if (!counts.has(key)) counts.set(key, { county: key, count: 0, categories: {} });
      const entry = counts.get(key);
      entry.count += 1;
      entry.categories[c.category] = (entry.categories[c.category] || 0) + 1;
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }

  _slaView() {
    const now = new Date();
    const cases = this.caseStore ? this.caseStore.all() : [];
    const overdue = cases
      .filter((c) => c.status === 'IN_REVIEW' && c.slaDeadline && new Date(c.slaDeadline) <= now)
      .map((c) => ({
        caseId: c.caseId,
        county: c.county,
        category: c.category,
        status: c.status,
        overdueByH: Math.round((now - new Date(c.slaDeadline)) / 3600000)
      }))
      .sort((a, b) => b.overdueByH - a.overdueByH);
    const upcoming = cases
      .filter((c) => c.status === 'IN_REVIEW' && c.slaDeadline && new Date(c.slaDeadline) > now)
      .map((c) => ({ caseId: c.caseId, category: c.category, dueInH: Math.round((new Date(c.slaDeadline) - now) / 3600000) }))
      .sort((a, b) => a.dueInH - b.dueInH);
    return { windows: WINDOW_HOURS, overdue, upcoming };
  }

  // Sentiment heatmap: aggregate case sentiment by county (anonymized).
  _sentimentView() {
    const order = { fearful: 5, angry: 4, sad: 3, urgent: 3, negative: 2, frustrated: 2, neutral: 1, positive: 0, hopeful: 0 };
    const byCounty = new Map();
    for (const c of this.caseStore ? this.caseStore.all() : []) {
      const key = c.county || '(unknown)';
      if (!byCounty.has(key)) byCounty.set(key, { county: key, total: 0, negative: 0, distribution: {} });
      const e = byCounty.get(key);
      e.total += 1;
      const sent = c.sentiment || 'neutral';
      e.distribution[sent] = (e.distribution[sent] || 0) + 1;
      if ((order[sent] ?? 1) >= 2) e.negative += 1;
    }
    const arr = [...byCounty.values()].map((e) => ({
      county: e.county,
      total: e.total,
      negative: e.negative,
      // normalized red-zone intensity 0..100 (share of negative sentiment)
      heat: e.total ? Math.round((e.negative / e.total) * 100) : 0,
      distribution: e.distribution
    }));
    arr.sort((a, b) => b.heat - a.heat || b.total - a.total);
    return { counties: arr, totals: { cases: arr.reduce((s, c) => s + c.total, 0), negative: arr.reduce((s, c) => s + c.negative, 0) } };
  }

  _smsView() {
    const g = this.smsGateway;
    if (!g) return { kind: 'none', inbox: [], outbox: [] };
    const inbox = g.inbound ? [...g.inbound].reverse().slice(0, 25).map((m) => `${m.from}: ${m.text}`) : [];
    const outbox = g.outbox ? [...g.outbox].reverse().slice(0, 25).map((m) => `${m.to}: ${m.text}`) : [];
    return { kind: g.kind, inbox, outbox, snapshot: g.snapshot ? g.snapshot() : null };
  }

  start() {
    if (this.server) return this;
    const app = express();
    app.use(express.json({ limit: '64kb' }));

    app.get('/', (_req, res) => res.type('html').send(inlinePage()));
    app.get('/api/overview', (_req, res) => res.json(this._overview()));
    app.get('/api/hotspots', (_req, res) => res.json(this._hotspots()));
    app.get('/api/sla', (_req, res) => res.json(this._slaView()));
    app.get('/api/sentiment', (_req, res) => res.json(this._sentimentView()));
    app.get('/api/sms', (_req, res) => res.json(this._smsView()));
    app.post('/api/sms/inject', (req, res) => {
      if (!this.smsGateway || this.smsGateway.kind !== 'simulator') {
        return res.status(400).json({ ok: false, error: 'SMS simulator not active' });
      }
      try {
        const message = this.smsGateway.inject({ from: req.body.from, text: req.body.text });
        res.json({ ok: true, message });
      } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
      }
    });
    app.get('/api/snapshot', (_req, res) => {
      res.json({
        overview: this._overview(),
        hotspots: this._hotspots(),
        sla: this._slaView(),
        sms: this._smsView(),
        monitor: this.monitor ? this.monitor.snapshot() : null
      });
    });
    // Live event stream (Server-Sent Events) → page refreshes on any Monitor push.
    app.get('/api/events', (req, res) => {
      const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
      heartbeat.unref?.();
      this._sseClients.add(res);
      req.on('close', () => {
        clearInterval(heartbeat);
        this._sseClients.delete(res);
      });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(`data: ${JSON.stringify({ type: 'dashboard-connect', at: new Date().toISOString() })}\n\n`);
    });

    this.server = http.createServer(app);
    this._unsub = this.monitor && typeof this.monitor.subscribe === 'function'
      ? this.monitor.subscribe((event) => {
          for (const client of this._sseClients) {
            if (!client.writableEnded) client.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        })
      : null;

    this.server.listen(this.port, () => {
      console.log(`📊 HRDD Dashboard: http://localhost:${this.port}`);
    });
    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ 仪表盘端口 ${this.port} 被占用 — 已切换至 ${this.port + 1}`);
        this.port += 1;
        this.stop();
        this.start();
      } else {
        console.error(`⚠️ 仪表盘错误: ${err.message}`);
      }
    });
    return this;
  }

  get url() {
    return this.server ? `http://localhost:${this.server.address()?.port || this.port}` : null;
  }

  stop() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    for (const client of this._sseClients) {
      try { client.end(); } catch {}
    }
    this._sseClients.clear();
    if (this.server) {
      this.server.closeAllConnections?.();
      this.server.close();
      this.server = null;
    }
  }
}

export default Dashboard;