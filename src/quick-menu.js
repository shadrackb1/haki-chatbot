import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

// ============================================
// QUICK MENU — WhatsApp interactive quick-reply buttons + text fallback
// Sends a lightweight menu when users type "menu", "help", "numbers",
// "rights", etc.  Handles the button tap → routes to the right handler.
// ============================================

const MENU_TRIGGER = /^(?:menu|help|rights|haki|nambari|numbers|msaada|contact(?:s)?|directory|jiunge|register|case)$/i;

export function isMenuRequest(text) {
  return MENU_TRIGGER.test(String(text || '').trim());
}

// -----------------------------------------------
// Build the interactive quick-reply payload (Baileys nativeFlowMessage)
// Returns { interactiveMessage: ... } which is safe to pass to sock.sendMessage.
// -----------------------------------------------
export function buildInteractiveMenu(lang = 'en') {
  const isSw = lang === 'sw';
  const bodyText = isSw
    ? 'Chagua chochote hapo chini, au uandike swali lako moja kwa moja.'
    : 'Pick one below, or type your question directly.';

  const footerText = isSw
    ? 'AgriShield — haki zako, urahisi.'
    : 'AgriShield — your rights, made simple.';

  const buttons = [
    { label: isSw ? 'Haki zangu' : 'My rights', id: 'menu_rights' },
    { label: isSw ? 'Nambari za msaada' : 'Help numbers', id: 'menu_numbers' },
    { label: isSw ? 'Jisajili' : 'Register', id: 'menu_register' },
    { label: isSw ? 'Hali ya kesi' : 'My case', id: 'menu_case' },
  ];

  return {
    interactiveMessage: {
      body: { text: bodyText },
      footer: { text: footerText },
      nativeFlowMessage: {
        buttons: buttons.map(b => ({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: b.label, id: b.id })
        }))
      }
    }
  };
}

// -----------------------------------------------
// Text fallback menu (always safe, never ignored by WhatsApp)
// -----------------------------------------------
export function buildTextMenu(lang = 'en') {
  if (lang === 'sw') {
    return `📋 *Menyu ya AgriShield*

1️⃣ *Haki zangu* — haki za msingi kwa wafanyikazi
2️⃣ *Nambari za msaada* — NLAS, DOSHS, Childline
3️⃣ *Jisajili* — weka jina na kaunti yako
4️⃣ *Hali ya kesi* — uliza kuhusu kesi yako

Andika nambari (1–4) au tuulize swali lolote.`;
  }
  return `📋 *AgriShield Menu*

1️⃣ *My rights* — core workplace rights
2️⃣ *Help numbers* — NLAS, DOSHS, Childline
3️⃣ *Register* — set your name and county
4️⃣ *My case* — check a case reference

Type 1–4 or ask me anything.`;
}

// -----------------------------------------------
// Handle a quick-reply selection from the interactive button
// Returns a { kind: 'text'|'action', reply, action? } response.
// -----------------------------------------------
const RIGHTS_TEXT = {
  en: `⚖️ *Your core rights as a Kenyan worker*

1. *Fair pay* — at least KES 15,000/month (Economic Survey 2026); farm wages vary by county.
2. *Written contract* — your employer must provide one within 2 months of starting work (Employment Act s.10).
3. *Safe workplace* — you have the right to protective equipment, training, and to refuse dangerous work (OSHA s.12, 44).
4. *Weekly rest* — at least 1 day off every 7 days (Employment Act s.27).
5. *No child labour* — under-18s are protected (Children Act s.56; OSHA s.58).
6. *Harassment protection* — sexual, verbal, or physical harassment is illegal (Employment Act s.81).

Type "register" to get help tailored to your county and sector.`,
  sw: `⚖️ *Haki zako msingi kama mfanyikazi wa Kenya*

1. *Mshahara wa haki* — angalau KES 15,000/mwezi (Economic Survey 2026); mishahara ya kilimo inatofautiana kulingana na kaunti.
2. *Mkataba wa maandishi* — mwenye ajira anapaswa kukupa ndani ya miezi 2 (Employment Act s.10).
3. *Usalama kazini* — una haki ya vifaa vya ulinzi, mafunzo, na kukataa kazi hatari (OSHA s.12, 44).
4. *Mapumziko ya kila wiki* — angalau siku 1 kwa siku 7 (Employment Act s.27).
5. *Hakuna kazi ya watoto* — chini ya miaka 18 inalindwa (Children Act s.56; OSHA s.58).
6. *Ulinzi dhidi ya unyanyasaji* — unyanyasaji wa kijinsia, maneno, au kimwili ni haramu (Employment Act s.81).

Andika "register" kupata msaada unaolingana na wewe.`
};

const NUMBERS_TEXT = {
  en: `📞 *Help numbers*

• *NLAS* (free legal aid): 0800 720 640 · WhatsApp: +254 703 149 933
• *DOSHS* (occupational safety): +254 (020) 2729801
• *Childline Kenya* (child labour): 116
• *GBV Hotline*: 1195
• *Befrienders Kenya* (emotional support): +254 722 178 177

All crisis lines are toll-free and confidential.`,
  sw: `📞 *Nambari za msaada*

• *NLAS* (msaada wa kisheria bure): 0800 720 640 · WhatsApp: +254 703 149 933
• *DOSHS* (usalama kazini): +254 (020) 2729801
• *Childline Kenya* (ajira ya watoto): 116
• *GBV Hotline* (unyanyasaji wa kijinsia): 1195
• *Befrienders Kenya* (msaada wa kihemko): +254 722 178 177

Zote ni bure na za siri.`
};

const CASE_TEXT = {
  en: `📝 To check your case status, type the case reference number the bot gave you (e.g. AGRI-2026-0001). Don't have one yet? Describe your issue and one will be opened automatically.`,
  sw: `📝 Kuangalia hali ya kesi yako, andika nambari ya kesi uliyopewa (mfano AGRI-2026-0001). Hujaipata bado? Eleza tatizo lako na kesi itafunguliwa moja kwa moja.`
};

export function handleMenuAction(actionId, lang = 'en') {
  switch (actionId) {
    case 'menu_rights':  return { kind: 'text', reply: RIGHTS_TEXT[lang] || RIGHTS_TEXT.en, action: 'rights' };
    case 'menu_numbers': return { kind: 'text', reply: NUMBERS_TEXT[lang] || NUMBERS_TEXT.en, action: 'numbers' };
    case 'menu_case':    return { kind: 'text', reply: CASE_TEXT[lang] || CASE_TEXT.en, action: 'case' };
    case 'menu_register':return { kind: 'action', reply: null, action: 'register' };
    default: return null;
  }
}

// -----------------------------------------------
// Parse an incoming message to extract a menu button selection.
// Returns the button id string, or null.
// -----------------------------------------------
export function parseMenuSelection(msg) {
  if (!msg?.message) return null;
  // NativeFlow button tap → interactiveResponseMessage
  const nativeFlow = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (nativeFlow) {
    try { return JSON.parse(nativeFlow).id; } catch { /* ignore */ }
  }
  // Legacy quick_reply → buttonsResponseMessage
  if (msg.message.buttonsResponseMessage?.selectedButtonId) {
    return msg.message.buttonsResponseMessage.selectedButtonId;
  }
  return null;
}

// -----------------------------------------------
// Handle a numeric "1", "2", "3", "4" text reply to the menu
// -----------------------------------------------
export function parseNumericMenu(text, lang = 'en') {
  const t = String(text || '').trim();
  if (!/^[1-4]$/.test(t)) return null;
  const map = { en: ['menu_rights', 'menu_numbers', 'menu_register', 'menu_case'], sw: ['menu_rights', 'menu_numbers', 'menu_register', 'menu_case'] };
  return (map[lang] || map.en)[parseInt(t, 10) - 1];
}

export default { isMenuRequest, buildInteractiveMenu, buildTextMenu, handleMenuAction, parseMenuSelection, parseNumericMenu };
