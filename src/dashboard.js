import express from 'express';
import http from 'http';
import { WINDOW_HOURS } from './sla-engine.js';

// ============================================
// CORPORATE HRDD DASHBOARD
// Live window into the Haki operation: anonymity-preserving KPIs, county
// risk hotspots, the case queue with SLA/escalation view, and a live SMS
// console. Express (already in package.json); live refresh uses polling +
// Server-Sent Events. Charts are dependency-free inline CSS/SVG — no CDN,
// works air-gapped.
// ============================================

function inlinePage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Haki HRDD Dashboard</title>
<style>
:root{--nk:#0a4d2f;--gold:#c9a227;--paper:#f6f3ec;--ink:#1c2b22;--muted:#5c6b60;--danger:#b3261e}
*{box-sizing:border-box}body{font-family:system-ui,Segoe UI,Roboto,sans-serif;background:var(--paper);color:var(--ink);margin:0}
header{background:var(--nk);color:#fff;padding:14px 22px;display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}
header h1{font-size:18px;margin:0;letter-spacing:.5px}header .live{color:#9fe8bf;font-size:12px}
main{padding:18px 22px;max-width:1280px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:18px}
.card{background:#fff;border:1px solid #e3dccb;border-radius:10px;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.card h3{margin:0 0 10px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.kpi{font-size:26px;font-weight:700}
.kpi small{font-size:12px;color:var(--muted);font-weight:500}
.row{display:flex;gap:14px;flex-wrap:wrap}.col{flex:1;min-width:320px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--muted);font-weight:600;border-bottom:2px solid #e3dccb;padding:6px 8px}
td{padding:6px 8px;border-bottom:1px solid #efe9da;vertical-align:top}
.bar{height:18px;border-radius:4px;background:var(--nk);min-width:2px}
.bar-wrap{display:flex;align-items:center;gap:8px}.bar-label{width:120px;font-size:12px}
.badge{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:600}
.badge.review{background:#eef1f6;color:#345;}.badge.escalated{background:#fdeaea;color:var(--danger)}
.badge.resolved{background:#e6f4ea;color:#1b7a3d}
.sla-warn{color:var(--danger);font-weight:700}
form{display:flex;gap:8px;margin:10px 0}input,select,button{font:inherit;padding:7px 10px;border:1px solid #d6d0bf;border-radius:6px}
button{background:var(--nk);color:#fff;border:none;cursor:pointer}
pre{background:#1c2b22;color:#c8f0d8;padding:10px;border-radius:8px;font-size:11px;overflow:auto}
</style></head><body>
<header><h1>🌾 Haki — Corporate HRDD Dashboard</h1><span class="live" id="live">connecting…</span></header>
<main>
<div class="grid" id="kpis"></div>
<div class="row">
  <div class="col card"><h3>County risk hotspots</h3><div id="hotspots"></div></div>
  <div class="col card"><h3>SLA windows</h3><table><tbody id="sla-windows"></tbody></table>
      <h3>Overdue</h3><table><thead><tr><th>Case</th><th>Category</th><th>Overdue</th><th>Status</th></tr></thead><tbody id="overdue"></tbody></table></div>
</div>
<div class="card"><h3>Case queue <small>(anonymous)</small></h3>
  <div style="display:flex;gap:8px;margin:8px 0">
    <select id="f-status"><option value="">all statuses</option><option>IN_REVIEW</option><option>ESCALATED</option><option>RESOLVED</option></select>
    <select id="f-county"><option value="">all counties</option></select>
  </div>
  <table><thead><tr><th>Case</th><th>Channel</th><th>County</th><th>Category</th><th>Status</th><th>Created</th><th>SLA due</th></tr></thead><tbody id="cases"></tbody></table></div>
<div class="card"><h3>Live SMS console</h3>
  <form id="sms-form"><input name="from" value="+254700000001" style="width:160px"><input name="text" placeholder="Type an inbound SMS…" style="flex:1"><button>Send as SMS</button></form>
  <div class="row"><div class="col"><h3 style="font-size:12px">Inbox</h3><pre id="inbox"></pre></div>
  <div class="col"><h3 style="font-size:12px">Outbox</h3><pre id="outbox"></pre></div></div></div>
</main>
<script>
const $=id=>document.getElementById(id);
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}
async function load(){
  try{
    const [o,c,h,s,sms]=await Promise.all([
      fetch('/api/overview').then(r=>r.json()),
      fetch('/api/cases').then(r=>r.json()),
      fetch('/api/hotspots').then(r=>r.json()),
      fetch('/api/sla').then(r=>r.json()),
      fetch('/api/sms').then(r=>r.json())]);
    $('kpis').innerHTML=Object.entries(o.kpis).map(([k,v])=>'<div class="card"><h3>'+esc(k)+'</h3><div class="kpi">'+esc(String(v))+'</div></div>').join('');
    const max=Math.max(1,...h.map(x=>x.count));
    $('hotspots').innerHTML=h.length?h.map(x=>'<div class="bar-wrap"><span class="bar-label">'+esc(x.county)+'</span><div class="bar" style="width:'+Math.round(100*x.count/max)+'%"></div><span>'+x.count+'</span></div>').join(''):'<div>No cases yet.</div>';
    $('sla-windows').innerHTML=Object.entries(s.windows).map(([k,v])=>'<tr><td>'+k+'</td><td>'+v+'h</td></tr>').join('');
    $('overdue').innerHTML=s.overdue.length?s.overdue.map(x=>'<tr><td>'+esc(x.caseId)+'</td><td>'+esc(x.category)+'</td><td class="sla-warn">'+x.overdueByH+'h</td><td>'+esc(x.status)+'</td></tr>').join(''):'<tr><td colspan=4>Nothing overdue 🎉</td></tr>';
    const counties=new Set(c.map(x=>x.county));$('f-county').innerHTML='<option value="">all counties</option>'+[...counties].map(x=>'<option>'+esc(x)+'</option>').join('');
    const fs=$('f-status').value,fc=$('f-county').value;
    $('cases').innerHTML=c.filter(x=>(!fs||x.status===fs)&&(!fc||x.county===fc)).map(x=>'<tr><td>'+esc(x.caseId)+'</td><td>'+esc(x.channel)+'</td><td>'+esc(x.county)+'</td><td>'+esc(x.category)+'</td><td><span class="badge '+({IN_REVIEW:'review',ESCALATED:'escalated',RESOLVED:'resolved'}[x.status]||'review')+'">'+esc(x.status)+'</span></td><td>'+esc((x.createdAt||'').slice(0,16).replace('T',' '))+'</td><td>'+esc((x.slaDeadline||'').slice(0,16).replace('T',' '))+'</td></tr>').join('')||'<tr><td colspan=7>No cases.</td></tr>';
    $('inbox').textContent=sms.inbox.join('\\n')||'(none)';$('outbox').textContent=sms.outbox.join('\\n')||'(none)';
    $('live').textContent='updated '+new Date().toLocaleTimeString();
  }catch(e){$('live').textContent='offline: '+e.message;}
}
$('sms-form').addEventListener('submit',async ev=>{ev.preventDefault();const f=new FormData(ev.target);
  const res=await fetch('/api/sms/inject',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:f.get('from'),text:f.get('text')})});
  ev.target.reset();ev.target.elements.from.value='+254700000001';load();});
$('f-status').addEventListener('change',load);$('f-county').addEventListener('change',load);
load();setInterval(load,3000);
try{const es=new EventSource('/api/events');es.onmessage=()=>load();es.onerror=()=>{};}catch(e){}
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