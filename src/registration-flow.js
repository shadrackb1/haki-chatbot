import UserDatabase from './user-db.js';

const KENYAN_COUNTIES = [
  'Bomet', 'Bungoma', 'Busia', 'Elgeyo Marakwet', 'Embu', 'Garissa', 'Homa Bay',
  'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga',
  'Kisii', 'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu', 'Machakos', 'Makueni',
  'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa', 'Muranga', 'Nairobi',
  'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu',
  'Siaya', 'Taita Taveta', 'Tana River', 'Tharaka Nithi', 'Trans Nzoia',
  'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'
];

const WORK_TYPES = ['farm worker', 'farmer', 'plantation', 'domestic', 'casual labourer', 'trader'];

const STEPS = {
  ASK_NAME: {
    next: 'ASK_COUNTY',
    prompt: (lang) => lang === 'sw'
      ? 'Karibu! Niambie jina lako la kwanza?'
      : 'Welcome! What\'s your first name?',
    apply: (db, phone, text) => db.setCredential(phone, 'firstName', titleCase(text))
  },
  ASK_COUNTY: {
    next: 'ASK_WORK_TYPE',
    prompt: (lang) => lang === 'sw'
      ? 'Asante! Uko kaunti gani? (mfano: Kericho)'
      : `Thanks! Which county are you in? (e.g. Kericho)`,
    apply: (db, phone, text) => {
      const match = matchCounty(text);
      return db.setCredential(phone, 'location', match || titleCase(text));
    }
  },
  ASK_WORK_TYPE: {
    next: null,
    prompt: (lang) => lang === 'sw'
      ? 'Sawa! Unafanya kazi gani? (farm worker, farmer, plantation, domestic, casual labourer, trader)'
      : 'Nice! What kind of work do you do? (farm worker, farmer, plantation, domestic, casual labourer, trader)',
    apply: (db, phone, text) => db.setCredential(phone, 'workType', matchWorkType(text) || text.toLowerCase())
  }
};

function titleCase(s) {
  return s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function matchCounty(text) {
  const t = text.toLowerCase().trim();
  return KENYAN_COUNTIES.find(c => c.toLowerCase() === t)
    || KENYAN_COUNTIES.find(c => c.toLowerCase().includes(t) && t.length >= 4)
    || null;
}

function matchWorkType(text) {
  const t = text.toLowerCase();
  return WORK_TYPES.find(w => t.includes(w)) || null;
}

// Natural-language skip detection — covers casual deflections
// so users are never trapped in registration.
const SKIP_PATTERNS = [
  /\b(skip|pass|later|maybe|not\s*now|no\s*(?:thanks|thank\s*you)|nah|nope|just\s*(?:ask|help|chat)|cancel|exit|quit|stop|bypass|continue\s*(?:without|anyway)|hata\s*sjui|sawa\s*tu|acha\s*tu|si\s*now|baadaye|tutonana)\b/i,
  /^(?:\?+|\.+|!+|-+|ok+|hm+|uh+)$/i,
  /^(?:no|yeye|ndio|hapana|sawa)\s*[.!?]*$/i,
];

// Classify whether a message is clearly answering a registration question
// vs. a free-form request that should go to the LLM.
const REGISTRATION_ANSWER_PATTERNS = [
  // Name-like: short, single/double word, no question words
  /^(?:[a-z]{2,15})(?:\s[a-z]{2,15})?$/i,
  // County names (Kenyan)
  new RegExp(`^(?:${KENYAN_COUNTIES.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`, 'i'),
  // Work types
  new RegExp(`^(?:${WORK_TYPES.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`, 'i'),
];

function looksLikeRegistrationAnswer(text, currentStep) {
  const t = text.trim();
  if (t.length > 60) return false;
  if (SKIP_PATTERNS.some(p => p.test(t))) return false;
  // If the step is ASK_COUNTY, check against county list
  if (currentStep === 'ASK_COUNTY') {
    return matchCounty(t) !== null || t.split(/\s+/).length <= 3;
  }
  if (currentStep === 'ASK_WORK_TYPE') {
    return matchWorkType(t) !== null || t.split(/\s+/).length <= 3;
  }
  // ASK_NAME: short answer, no question words
  if (currentStep === 'ASK_NAME') {
    return !/\b(what|how|where|when|why|who|which|help|rights|wage|pay|contract|safety)\b/i.test(t)
      && t.split(/\s+/).length <= 3;
  }
  return false;
}

class RegistrationFlow {
  constructor(userDb, { onComplete } = {}) {
    this.db = userDb;
    this.onComplete = onComplete;
  }

  isActive(phone) {
    const u = this.db.get(phone);
    return Boolean(u && u.registration && u.registration.status === 'IN_PROGRESS');
  }

  currentStep(phone) {
    const u = this.db.get(phone);
    return u?.registration?.step || null;
  }

  start(phone, lang = 'en') {
    if (!this.db.exists(phone)) this.db.ensureUser(phone);
    this.db.startRegistration(phone);
    return STEPS.ASK_NAME.prompt(lang);
  }

  _abandon(phone, reason) {
    this.db._write(phone, (u) => {
      u.registration.status = u.credentials.firstName ? 'COMPLETE' : 'ABANDONED';
      if (u.registration.status === 'COMPLETE') u.registration.completedAt = new Date().toISOString();
      delete u.registration.step;
      return u;
    }, reason);
    const done = this.db.isRegistered(phone);
    if (done && this.onComplete) this.onComplete(this.db.get(phone));
    return done;
  }

  // Returns a reply string if the registration flow handles the message,
  // or null to let the normal LLM pipeline process it.
  handle(phone, messageText, lang = 'en') {
    if (!this.isActive(phone)) return null;
    const step = this.currentStep(phone);
    const trimmed = messageText.trim();

    // Skip / cancel / deflection — exit registration, let user through to LLM
    if (SKIP_PATTERNS.some(p => p.test(trimmed))) {
      const done = this._abandon(phone, 'registration-skip');
      return done
        ? (lang === 'sw'
          ? 'Sawa, umekamilisha. Sasa unaweza kuuliza chochote!'
          : 'You\'re registered! Ask me anything — wages, contracts, safety, or just say hello.')
        : (lang === 'sw'
          ? 'Sawa, hiyo yaachishwa. Unaweza kuanza tena mwishoni kwa kusema "register". Vinginevyo, niulize chochote!'
          : 'No worries — registration skipped. You can type "register" later. In the meantime, ask me anything!');
    }

    // If the message does NOT look like an answer to the current question,
    // don't intercept — let it flow to the LLM. The user is trying to
    // ask something, not register.
    if (!looksLikeRegistrationAnswer(trimmed, step)) {
      // But if they've been stuck for 3+ turns with no valid answer, nudge once
      const u = this.db.get(phone);
      const attempts = (u?.registration?.attempts || 0) + 1;
      this.db._write(phone, (u) => {
        if (!u.registration) u.registration = {};
        u.registration.attempts = attempts;
        return u;
      }, 'reg-attempts');
      if (attempts <= 1) {
        // First non-answer: let it through to LLM silently
        return null;
      }
      // Second non-answer: remind them about skip
      this.db._write(phone, (u) => {
        u.registration.attempts = 0;
        return u;
      }, 'reg-attempts-reset');
      return lang === 'sw'
        ? `Kumbuka, unaweza kuuliza chochote bila kusajili. Sema "skip" kuachisha usajili.`
        : `You can ask me anything without registering — just say "skip" to skip registration.`;
    }

    const stepDef = STEPS[step];
    if (!stepDef) {
      this.start(phone, lang);
      return STEPS.ASK_NAME.prompt(lang);
    }

    stepDef.apply(this.db, phone, trimmed);

    if (stepDef.next) {
      this.db.setRegistrationStep(phone, stepDef.next);
      return STEPS[stepDef.next].prompt(lang);
    }

    this.db.completeRegistration(phone);
    const user = this.db.get(phone);
    if (this.onComplete) this.onComplete(user);
    return lang === 'sw'
      ? `Umekamilika ${user.firstName}! ✅ Tumehifadhi maelezo yako (${user.location}, ${user.workType}). Sasa ninaweza kukusaidia vizuri zaidi.`
      : `You're all set, ${user.firstName}! ✅ Saved your details (${user.location} — ${user.workType}). Now I can help you much better.`;
  }
}

export default RegistrationFlow;
export { KENYAN_COUNTIES, WORK_TYPES };
