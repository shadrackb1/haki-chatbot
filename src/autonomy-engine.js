const ORIGINS = {
  KNOWN_TRIGGER: 'KNOWN_TRIGGER',
  AUTONOMOUS_IMPORTANT_INFO: 'AUTONOMOUS_IMPORTANT_INFO',
  AUTONOMOUS_FOLLOW_UP: 'AUTONOMOUS_FOLLOW_UP'
};

const FOLLOW_UP_DELAYS_HOURS = [24, 72];

class AutonomyEngine {
  constructor() {
    this.pendingFollowUps = [];
    this.dispatch = null;
    this.timer = null;
    this.stats = { ticks: 0, dispatched: [] };
  }

  // 机器人登记消息实际发出方式（WhatsApp 套接字发送器）
  onDispatch(fn) {
    this.dispatch = fn;
  }

  classify(origin) {
    return Object.values(ORIGINS).includes(origin) ? origin : ORIGINS.KNOWN_TRIGGER;
  }

  isAutonomous(origin) {
    return origin !== ORIGINS.KNOWN_TRIGGER;
  }

  _notify(phone, text, origin) {
    if (!this.dispatch) return false;
    const msg = {
      phone,
      text,
      origin: this.classify(origin),
      triggered: !this.isAutonomous(origin),
      at: new Date().toISOString()
    };
    this.dispatch(msg.phone, msg.text, msg.origin);
    this.stats.dispatched.push({ ...msg, text: undefined });
    if (this.stats.dispatched.length > 200) this.stats.dispatched.shift();
    return true;
  }

  scheduleFollowUp(phone, context, hours = FOLLOW_UP_DELAYS_HOURS[0]) {
    const when = Date.now() + hours * 60 * 60 * 1000;
    this.pendingFollowUps.push({
      phone,
      context,
      dueAt: new Date(when).toISOString(),
      sent: false,
      origin: ORIGINS.AUTONOMOUS_FOLLOW_UP
    });
    return true;
  }

  pushImportantInfo(phone, info) {
    return this._notify(
      phone,
      `📢 Important update: ${info}`,
      ORIGINS.AUTONOMOUS_IMPORTANT_INFO
    );
  }

  broadcastImportantInfo(phones, info) {
    let n = 0;
    for (const p of phones) n += this.pushImportantInfo(p, info) ? 1 : 0;
    return n;
  }

  setSubscribers(phones) {
    this.subscribers = phones;
  }

  _processFollowUps(now = Date.now()) {
    let fired = 0;
    for (const f of this.pendingFollowUps) {
      if (!f.sent && new Date(f.dueAt).getTime() <= now) {
        this._notify(
          f.phone,
          `👋 Following up: ${f.context}. How did it go? Need any more help?`,
          f.origin
        );
        f.sent = true;
        fired++;
      }
    }
    this.pendingFollowUps = this.pendingFollowUps.filter(f => !f.sent);
    return fired;
  }

  // 由 index.js 按间隔调用 — 无需任何用户触发的自主检查
  tick() {
    this.stats.ticks += 1;
    const followUpsFired = this._processFollowUps();
    return { ticks: this.stats.ticks, followUpsFired };
  }

  start(intervalMs = 60 * 1000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  comparisonSnapshot() {
    const d = this.stats.dispatched;
    return {
      totalDispatched: d.length,
      knownTrigger: d.filter(x => x.origin === ORIGINS.KNOWN_TRIGGER).length,
      autonomousImportantInfo: d.filter(x => x.origin === ORIGINS.AUTONOMOUS_IMPORTANT_INFO).length,
      autonomousFollowUp: d.filter(x => x.origin === ORIGINS.AUTONOMOUS_FOLLOW_UP).length,
      pendingFollowUps: this.pendingFollowUps.length
    };
  }
}

export default AutonomyEngine;
export { ORIGINS };