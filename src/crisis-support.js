import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_NETWORK_PATH = path.join(__dirname, '..', 'data', 'support-organizations.json');

// Phrases are matched in ANY language (union), so a Swahili distress message is
// caught even before language detection runs. Sub-word keys (jiua, kufa) are
// kept inside multi-word phrases to avoid false positives like "alikufa".
const CRISIS_PATTERNS = {
  severe: [
    // English
    /(?:i\s+(?:will|am\s+going\s+to)\s+kill\s+myself|kill\s+myself|suicid|end\s+(?:it\s+all|my\s+life)|want\s+to\s+die|wish\s+i\s+was\s+dead|don'?t\s+want\s+to\s+(?:live|be\s+alive)|have\s+no\s+reason\s+to\s+live|better\s+off\s+dead|can'?t\s+go\s+on\s+like\s+this|no\s+point\s+in\s+living|cut\s+myself|hang\s+myself|poison\s+myself|harm\s+myself|hurt\s+myself|self.?harm)/i,
    // Swahili
    /(?:nitajiua|kujiua|najidhuru|kujidhuru|kujiumiza|kumaliza\s+maisha|kutaka\s+kufa|nataka\s+nife|ni\s+bora\s+nikufe|bora\s+nife|sitaki\s+kuishi|sina\s+sababu\s+ya\s+kuishi|nimechoka\s+na\s+maisha|maisha\s+yamenimaliza|nimechoshwa\s+na\s+kuishi|taka\s+kuondoka\s+duniani|sina\s+uhitaji\s+wa\s+kuishi)/i
  ],
  moderate: [
    // English
    /(?:hopeless|despair|worthless|nothing\s+left\s+(?:for\s+me|to\s+live\s+for)|no\s+one\s+would\s+miss\s+me|nobody\s+would\s+care|can'?t\s+take\s+it\s+anymore|burden\s+to\s+everyone|too\s+much\s+to\s+bear|falling\s+apart|alone\s+and\s+scared|no\s+way\s+out)/i,
    // Swahili
    /(?:kukata\s+tamaa|kata\s+tamaa|nimekata\s+tamaa|kukata\s+matumaini|nimekata\s+matumaini|ni\s+mzigo\s+kwa\s+wengine|matatizo\s+yamenizidi|maneno\s+yamenizidi|sina\s+mtu\s+wa\s+kuongea|sina\s+msaada\s+wa\s+mtu\s+ye\s+yote|wameniacha\s+peke\s+yangu|nimebaki\s+pekee|nimemaliza\s+nguvu)/i
  ]
};

function detectCrisis(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return { level: 'none', triggers: [] };

  const triggers = [];
  let level = 'none';

  for (const [lvl, patterns] of Object.entries(CRISIS_PATTERNS)) {
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        const found = m[0] || re.source;
        triggers.push({ level: lvl, phrase: found.slice(0, 80) });
      }
    }
  }

  if (triggers.some(t => t.level === 'severe')) level = 'severe';
  else if (triggers.some(t => t.level === 'moderate')) level = 'moderate';

  return { level, triggers };
}

class CrisisSupport {
  constructor(networkPath = DEFAULT_NETWORK_PATH) {
    this.network = { organizations: [], templates: {} };
    try {
      this.network = JSON.parse(fs.readFileSync(networkPath, 'utf8'));
    } catch (err) {
      console.error(`[CrisisSupport] Failed to load support network: ${err.message}`);
    }
  }

  // Pure, deterministic detection — no randomness, safe for tests.
  detect(message) {
    return detectCrisis(message);
  }

  crisisOrganizations() {
    return (this.network.organizations || []).filter(o => o.crisis);
  }

  supportLines(lang = 'en') {
    const template = (this.network.templates || {})[lang] || (this.network.templates || {}).en;
    if (!template) return '';
    return this.crisisOrganizations()
      .map(o => template.support_label
        .replace('{name}', o.name)
        .replace('{phone}', o.phone)
        .replace('{hours}', o.hours))
      .join('\n');
  }

  buildMessage(level, lang = 'en') {
    const templates = (this.network.templates || {})[lang] || (this.network.templates || {}).en || {};
    let msg = '';
    if (level === 'severe') {
      msg = templates.severe_intro + '\n' + this.supportLines(lang) + '\n\n' + templates.severe_outro + templates.footer;
    } else if (level === 'moderate') {
      msg = templates.moderate_intro + '\n\n' + templates.moderate_outro + '\n' + this.supportLines(lang) + templates.footer;
    }
    return msg;
  }

  // The full triage the pipeline calls. `escalate` triggers a warm handoff:
  // the case is flagged for a human/CSO, not just left to the chatbot.
  triage(message, lang = 'en') {
    const { level, triggers } = this.detect(message);
    return {
      level,
      triggers,
      escalate: level === 'severe',
      needsCare: level !== 'none',
      organizations: this.crisisOrganizations(),
      response: level === 'none' ? '' : this.buildMessage(level, lang)
    };
  }
}

export default CrisisSupport;
export { detectCrisis, CRISIS_PATTERNS };