// ============================================
// CASE LOOKUP — let users check their grievance
// by typing the case reference the bot issued on report.
// ============================================

// AGRI-2026-0001 (both full token and bare number accepted)
const CASE_REF = /\bAGRI-(\d{4})-(\d{4})\b/i;

export function extractCaseRef(text) {
  const m = CASE_REF.exec(String(text || ''));
  if (!m) return null;
  return `AGRI-${m[1]}-${m[2]}`;
}

// Does the message look like a case-status check?
//   1) contains a full AGRI-YYYY-NNNN reference, or
//   2) is a bare 4+ digit code (shorthand), or
//   3) explicitly asks "status of my case" + a number
export function isCaseStatusRequest(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (CASE_REF.test(t)) return true;
  if (/status|hali|hali ya kesi/i.test(t) && /\b\d{4,}\b/.test(t)) return true;
  // bare AGRI-shorthand like "AGRI0001" or a 4-digit code alone
  if (/\bAGRI\-?\d{4,}\b/i.test(t)) return true;
  if (/^\d{4,}$/.test(t)) return true;
  return false;
}

// Resolve the requested reference to a stored caseId.
// Accepts: full "AGRI-2026-0001", barer "AGRI20260001", "20260001", or the
// short "0001" within the current year.
export function resolveCaseRef(text, caseStore, { now = new Date() } = {}) {
  const t = String(text || '').trim();
  const direct = extractCaseRef(t);
  if (direct) {
    const hit = caseStore.get(direct);
    if (hit) return { caseId: direct, case: hit };
  }

  // Bare all-digit code: AGRI-2026-0001 → digits "20260001" or short "0001"
  const digit = /(\d{4,})/.exec(t);
  if (digit) {
    const full = digit[1];
    const all = caseStore.all();
    // Try exact trailing match on the numeric suffix
    for (const c of all) {
      const m = /AGRI-\d{4}-(\d{4})$/.exec(c.caseId || '');
      if (m) {
        if (c.caseId.replace(/\D/g, '') === full) return { caseId: c.caseId, case: c };
        if (m[1] === full.padStart(4, '0')) {
          const year = String(now.getFullYear());
          if (c.caseId.includes(year)) return { caseId: c.caseId, case: c };
        }
      }
    }
  }
  return { caseId: null, case: null };
}

const STATUS_LABEL = { IN_REVIEW: 'in review', ESCALATED: 'escalated', RESOLVED: 'resolved' };

export function formatCaseStatus(ref, store, lang = 'en') {
  const { case: rec } = resolveCaseRef(ref, store);
  if (!rec) {
    return lang === 'sw'
      ? `😕 Sikuweza kupata kesi hiyo. Hakikisha nambari ni sahihi (mfano AGRI-2026-0001).`
      : `😕 I couldn't find that case. Double-check the reference (e.g. AGRI-2026-0001).`;
  }
  const label = STATUS_LABEL[rec.status] || rec.status.toLowerCase();
  const deadline = rec.slaDeadline
    ? new Date(rec.slaDeadline).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : (lang === 'sw' ? 'haijawekwa' : 'not set');

  if (lang === 'sw') {
    return `📋 *Kesi yako: ${rec.caseId}*

• Hali: *${label}*
• Kategoria: ${rec.category}
• Kaunti: ${rec.county}
• Muda wa matokeo (SLA): ${deadline}

Kama hali ni "escalated", mtaalamu atawasiliana nawe. Endelea kutuma ujumbe ukihitaji msaada zaidi.`;
  }
  return `📋 *Your case: ${rec.caseId}*

• Status: *${label}*
• Category: ${rec.category}
• County: ${rec.county}
• SLA deadline (result by): ${deadline}

If it says "escalated", a specialist will reach out. Keep messaging if you need more help.`;
}

export default { extractCaseRef, isCaseStatusRequest, resolveCaseRef, formatCaseStatus };
