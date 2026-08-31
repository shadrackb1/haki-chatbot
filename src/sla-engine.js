// ============================================
// SLA ENGINE — keep every grievance on a clock
// Per-severity turnaround windows aligned with UNGP 31 (legitimate,
// equitable, transparent) timelines:
//   crisis   → 2 hours   (mental-health / severe safety)
//   critical → 24 hours  (SAFETY_VIOLATION, GENDER_VIOLENCE)
//   standard → 72 hours  (wage, no-contract, child labour, environment, land)
//   info     → 5 days    (general inquiries)
// On each tick, any IN_REVIEW case past its deadline is escalated and an
// event lands in Monitor (and CSO contacts get notified via callback).
// ============================================

export const WINDOW_HOURS = { crisis: 2, critical: 24, standard: 72, info: 120 };
export const CRITICAL_VIOLATIONS = ['SAFETY_VIOLATION', 'GENDER_VIOLENCE'];
export const STANDARD_VIOLATIONS = ['WAGE_VIOLATION', 'NO_CONTRACT', 'CHILD_LABOR', 'ENVIRONMENTAL_HARM', 'LAND_RIGHTS', 'UNFAIR_DISMISSAL', 'WORKING_HOURS'];

export function severityFor({ crisisLevel, violation } = {}) {
  if (String(crisisLevel || '').toLowerCase() === 'severe') return 'crisis';
  if (CRITICAL_VIOLATIONS.includes(violation)) return 'critical';
  if (STANDARD_VIOLATIONS.includes(violation)) return 'standard';
  return 'info';
}

export function slaLimit(severity, windows = WINDOW_HOURS) {
  return (windows[severity] ?? windows.info ?? 120) * 60 * 60 * 1000;
}

class SLAEngine {
  constructor(options = {}) {
    this.caseStore = options.caseStore;
    this.windows = { ...WINDOW_HOURS, ...(options.windows || {}) };
    this.monitor = options.monitor || null;
    this.csoContacts = options.csoContacts || [];
    this.onEscalate = options.onEscalate || null;
    this._now = options.now || null; // injectable clock for tests
  }

  now() {
    return this._now ? this._now() : new Date();
  }

  // SLA deadline for a fresh case.
  deadlineFor({ crisisLevel, violation, createdAt = new Date() }, windows = this.windows) {
    const severity = severityFor({ crisisLevel, violation });
    return new Date(new Date(createdAt).getTime() + slaLimit(severity, windows));
  }

  // Mark a case that should otherwise be created already with its deadline.
  seal(record) {
    if (record && !record.slaDeadline) {
      record.slaDeadline = this.deadlineFor(record).toISOString();
      this.caseStore?.update?.(record.caseId, { slaDeadline: record.slaDeadline }, 'SLA deadline assigned');
    }
    return record;
  }

  // One resolution: escalate every overdue IN_REVIEW case. Returns the
  // cases escalated on THIS tick (idempotent across ticks).
  tick(now = this.now()) {
    if (!this.caseStore) return [];
    const escalated = [];
    const overdue = this.caseStore.byStatus('IN_REVIEW').filter((c) => {
      if (!c.slaDeadline) return false;
      return new Date(c.slaDeadline).getTime() <= now.getTime();
    });

    for (const record of overdue) {
      const updated = this.caseStore.escalate(record.caseId, 'SLA deadline exceeded');
      if (!updated) continue;
      escalated.push(updated);
      const event = {
        caseId: updated.caseId,
        county: updated.county,
        category: updated.category,
        violation: updated.violation,
        crisisLevel: updated.crisisLevel,
        overdueByH: Math.round((now.getTime() - new Date(updated.slaDeadline).getTime()) / 3600000),
        escalatedAt: now.toISOString()
      };
      this.monitor?.push('sla-escalation', event);
      this.onEscalate?.(updated, event);
      for (const contact of this.csoContacts) {
        console.log(`🚨 SLA escalation → CSO ${contact}: ${updated.caseId} (${updated.category}) overdue ${event.overdueByH}h`);
      }
    }
    return escalated;
  }

  start(intervalMs = 60 * 1000) {
    this.stop();
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (error) {
        console.error('[sla-engine] tick error:', error.message);
      }
    }, intervalMs);
    if (this.timer.unref) this.timer.unref();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export default SLAEngine;