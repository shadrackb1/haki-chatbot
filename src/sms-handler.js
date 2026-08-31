import { normalizeMsisdn } from './sms-gateway.js';

// ============================================
// SMS CHANNEL HANDLER
// Phone-number (MSISDN) intake for workers without smartphones/data.
// Reuses the exact same grievance pipeline as WhatsApp:
//   language detection → crisis gate → classifier → hybrid RAG →
//   tiered multi-provider LLM → empathized, translated reply → sent back.
// ============================================

class SmsHandler {
  constructor({
    pipeline,
    gateway,
    conversationManager,
    monitor,
    caseStore = null,
    slaEngine = null,
    maxLength = 480,
    rateLimiter = null
  }) {
    this.pipeline = pipeline;
    this.gateway = gateway;
    this.conversationManager = conversationManager;
    this.monitor = monitor || null;
    this.caseStore = caseStore;
    this.slaEngine = slaEngine;
    this.maxLength = maxLength;
    this.rateLimiter = rateLimiter;
  }

  // Split an over-long reply into 160/480-char segments SMS can carry.
  chunk(text, limit = this.maxLength) {
    const chunks = [];
    let rest = String(text || '').trim();
    while (rest.length > limit) {
      let cut = rest.lastIndexOf(' ', limit);
      if (cut < limit * 0.5) cut = limit;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  async handle(message) {
    // normalize the number so history/cases key on one canonical form
    const callerId = normalizeMsisdn(message.from || '');
    const text = String(message.text || '').trim();
    if (!callerId || !text) return { ok: false, error: 'SMS requires from + text' };
    if (!this.pipeline) return { ok: false, error: 'no pipeline configured' };

    const user = this.conversationManager
      ? this.conversationManager.getUser(callerId)
      : null;
    const history = this.conversationManager
      ? this.conversationManager.getConversationHistory(callerId)
      : [];

    // Per-phone throttle on the LLM/cost path (shared with WhatsApp).
    if (this.rateLimiter && !this.rateLimiter.hit(callerId)) {
      return { ok: false, kind: 'throttled', throttled: true, reply: 'Too many messages — please wait.' };
    }

    const result = await this.pipeline.process({
      text,
      callerId,
      history,
      user: user
        ? {
            location: user.location,
            workType: user.workType,
            isNewUser: user.isNewUser,
            conversationCount: user.conversationCount
          }
        : undefined
    });

    this._openCaseIfNeeded(result, callerId);

    // reply in whatever language the pipeline produced, split for SMS
    const reply = result.reply || result.error || 'Sorry, something went wrong.';
    const segments = this.chunk(reply);

    let sent = 0;
    for (const segment of segments) {
      await this.gateway.send({ to: callerId, text: segment });
      sent += 1;
    }

    if (this.conversationManager) {
      this.conversationManager.addToHistory(callerId, 'user', text);
      this.conversationManager.addToHistory(callerId, 'assistant', reply);
      this.conversationManager.updateContext(callerId, {
        lastIntent: result.reasoning ? result.reasoning.intent : null,
        lastTopic: result.reasoning ? result.reasoning.topic : null,
        lastViolation: result.violation ? result.violation.id : null
      });
    }

    if (this.monitor) {
      this.monitor.push('sms', {
        channel: 'sms',
        phone: callerId,
        kind: result.kind,
        violation: result.violation ? result.violation.id : null,
        tier: result.tier || null,
        segments: sent
      });
    }

    if (result.kind === 'crisis' && result.crisisResult && result.crisisResult.escalate) {
      return { ok: true, kind: 'crisis', escalate: true, sent, reply };
    }
    return { ok: true, kind: result.kind, sent, reply };
  }

  // Serious matters (crisis escalation or a classified violation) get a
  // tracked case with an SLA deadline, just like WhatsApp.
  _openCaseIfNeeded(result, callerId) {
    if (!this.caseStore || !result || result.kind === 'error') return null;
    const severe = result.kind === 'crisis' && result.crisisResult && result.crisisResult.level === 'severe';
    if (!severe && !result.violation) return null;
    const user = this.conversationManager ? this.conversationManager.getUser(callerId) : null;
    return this.caseStore.create({
      channel: 'sms',
      phone: callerId,
      county: user && user.location ? user.location : 'unknown',
      category: result.violation ? result.violation.id.toLowerCase().replace('_', ' ') : 'crisis',
      violation: result.violation ? result.violation.id : null,
      crisisLevel: result.crisisResult ? result.crisisResult.level : 'none',
      sentiment: result.sentiment ? result.sentiment.sentiment : null,
      workType: user ? user.workType : null,
      slaDeadline: this.slaEngine
        ? this.slaEngine.deadlineFor({
            crisisLevel: result.crisisResult ? result.crisisResult.level : 'none',
            violation: result.violation ? result.violation.id : null
          })
        : null
    });
  }

  // Attach to the gateway's inbound callback.
  start() {
    if (!this.gateway) throw new Error('SmsHandler requires a gateway');
    this.gateway.start((message) => this.handle(message));
    return this;
  }

  stop() {
    if (this.gateway) this.gateway.stop();
  }
}

export default SmsHandler;
export { SmsHandler };