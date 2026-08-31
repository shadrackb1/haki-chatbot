import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (error) {
    console.log('⚠️ Could not load users database, starting fresh');
  }
  return {};
}

const SAVE_DEBOUNCE_MS = 1500;
let saveTimer = null;
let pendingUsers = null;

function writeUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (error) {
    console.log('⚠️ Could not save users database:', error.message);
  }
}

function flushPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    writeUsers(pendingUsers);
    pendingUsers = null;
  }
}

function saveUsers(users) {
  pendingUsers = users;
  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeUsers(pendingUsers);
      pendingUsers = null;
    }, SAVE_DEBOUNCE_MS);
    if (typeof saveTimer.unref === 'function') saveTimer.unref();
  }
}

process.on('exit', flushPendingSave);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    flushPendingSave();
    process.exit(0);
  });
}

class ConversationManager {
  constructor() {
    this.users = loadUsers();
    this.conversationStates = new Map();
  }

  getUser(phoneNumber) {
    console.log(`👤 getUser called for: ${phoneNumber}`);
    console.log(`   Exists in memory: ${!!this.users[phoneNumber]}`);
    if (!this.users[phoneNumber]) {
      console.log(`   Creating NEW user`);
      this.users[phoneNumber] = {
        phone: phoneNumber,
        isNewUser: true,
        firstName: null,
        language: null,
        location: null,
        workType: null,
        conversationCount: 0,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        preferences: {
          receiveUpdates: true,
          shareLocation: false
        },
        context: {
          lastIntent: null,
          lastViolation: null,
          pendingAction: null,
          conversationHistory: []
        }
      };
      saveUsers(this.users);
    } else {
      console.log(`   Existing user: isNewUser=${this.users[phoneNumber].isNewUser}, count=${this.users[phoneNumber].conversationCount}`);
    }
    return this.users[phoneNumber];
  }

  updateLastSeen(phoneNumber) {
    console.log(`⏱️ updateLastSeen called for: ${phoneNumber}`);
    if (this.users[phoneNumber]) {
      this.users[phoneNumber].lastSeen = new Date().toISOString();
      this.users[phoneNumber].conversationCount++;
      console.log(`   conversationCount now: ${this.users[phoneNumber].conversationCount}`);
      saveUsers(this.users);
    } else {
      console.log(`⚠️ User not found in memory for updateLastSeen: ${phoneNumber}`);
    }
  }

  markAsReturning(phoneNumber) {
    console.log(`🔄 markAsReturning called for: ${phoneNumber}`);
    console.log(`   Before: isNewUser = ${this.users[phoneNumber]?.isNewUser}`);
    if (this.users[phoneNumber]) {
      this.users[phoneNumber].isNewUser = false;
      console.log(`   After: isNewUser = ${this.users[phoneNumber].isNewUser}`);
      saveUsers(this.users);
    } else {
      console.log(`⚠️ User not found in memory: ${phoneNumber}`);
    }
  }

  updateContext(phoneNumber, updates) {
    if (this.users[phoneNumber]) {
      this.users[phoneNumber].context = {
        ...this.users[phoneNumber].context,
        ...updates
      };
      saveUsers(this.users);
    }
  }

  getConversationHistory(phoneNumber) {
    if (this.users[phoneNumber]) {
      return this.users[phoneNumber].context.conversationHistory || [];
    }
    return [];
  }

  addToHistory(phoneNumber, role, content) {
    if (this.users[phoneNumber]) {
      const history = this.users[phoneNumber].context.conversationHistory || [];
      history.push({ role, content, timestamp: new Date().toISOString() });
      if (history.length > 20) {
        history.shift();
      }
      this.users[phoneNumber].context.conversationHistory = history;
      saveUsers(this.users);
    }
  }

  getState(phoneNumber) {
    return this.conversationStates.get(phoneNumber) || {
      step: 'welcome',
      data: {},
      retryCount: 0
    };
  }

  setState(phoneNumber, state) {
    this.conversationStates.set(phoneNumber, state);
  }

  clearState(phoneNumber) {
    this.conversationStates.delete(phoneNumber);
  }

  getWelcomeMessage(user, lang = 'en') {
    if (lang === 'sw') {
      return `Karibu AgriShield 🇰🇪

Nisaidie kuelewa haki zako za kazi — mshahara, mkataba, usalama, ajira ya watoto, unyanyasaji, na ardhi. Kazi yako iwe shambani, kiwandani, pakheni au usafiri.

Sema tu kiliotokea. Hakuna usajili wa lazima.
Mfano: "Ninalipwa KES 200 bila mkataba"

Unataka msaada wa kukufaa wewe? Andika "register". Si lazima.`;
    }

    return `Welcome to AgriShield 🇰🇪

I help Kenyan workers understand their rights — wages, contracts, safety, child labour, harassment, land. Whether you're on a farm, in a packhouse, factory, or on the road.

Just tell me what happened. No sign-up needed.
Example: "I'm paid KES 200 with no contract"

Want help tailored to you? Say "register". Optional.`;
  }

  getConversationalGreeting(user, lang = 'en') {
    const hour = new Date().getHours();
    let timeGreeting = '';

    if (lang === 'sw') {
      if (hour < 12) timeGreeting = 'Habari za asubuhi';
      else if (hour < 17) timeGreeting = 'Habari za mchana';
      else timeGreeting = 'Habari za jioni';
    } else {
      if (hour < 12) timeGreeting = 'Good morning';
      else if (hour < 17) timeGreeting = 'Good afternoon';
      else timeGreeting = 'Good evening';
    }

    if (user.isNewUser) {
      return this.getWelcomeMessage(user, lang);
    }

    if (lang === 'sw') {
      return `${timeGreeting}, ${user.firstName || 'rafiki'}!

Kuna jipya kazini? Niambie nini kilitokea.

Hujui pa kuanzia? Uliza kuhusu haki zako au andika "numbers" kwa nambari za msaada.`;
    }

    return `${timeGreeting}, ${user.firstName || 'friend'}!

Anything new at work? Tell me what happened.

Not sure where to start? Ask about your rights or type "numbers" for helplines.`;
  }

  getConversationalResponse(intent, violation, user, lang = 'en') {
    const empathyPhrases = {
      sw: [
        'Pole. Hiyo si sawa.',
        'Asante kwa kujitokeza.',
        'Hii haki haitakiwi.',
        'Unafanya vyema kwa kusema.'
      ],
      en: [
        'That\'s not right. I\'m sorry.',
        'Thanks for telling me.',
        'You shouldn\'t have to deal with this.',
        'This isn\'t okay.'
      ]
    };

    const encouragementPhrases = {
      sw: [
        'Usikubali hii.',
        'Kesi kama hii zimeshinda.',
        'Sheria iko upande wako.',
        'Hatua kwa hatua.'
      ],
      en: [
        'Don\'t let this slide.',
        'Cases like this have been won before.',
        'The law is on your side.',
        'One step at a time.'
      ]
    };

    const randomEmpathy = empathyPhrases[lang]?.[Math.floor(Math.random() * (empathyPhrases[lang]?.length || 1))] || empathyPhrases.en[0];
    const randomEncouragement = encouragementPhrases[lang]?.[Math.floor(Math.random() * (encouragementPhrases[lang]?.length || 1))] || encouragementPhrases.en[0];

    if (lang === 'sw') {
      let response = `${randomEmpathy}\n\n`;

      if (violation) {
        response += `Kulingana na ulivyosema, hii ni *${violation.description}*.\n\n`;

        for (const law of violation.applicable_laws) {
          response += `📜 ${law.law} — ${law.section}\n`;
          response += `   "${law.detail}"\n\n`;
        }

        response += `*Hatua unazoweza kuchukua:*\n`;
        for (const pathway of violation.remedy_pathways) {
          response += `🏛️ ${pathway.institution}\n`;
          response += `   ${pathway.action}\n`;
          for (const step of pathway.process) {
            response += `   • ${step}\n`;
          }
          response += `   ⏰ ${pathway.timeline}\n\n`;
        }

        const docs = [];
        for (const pathway of violation.remedy_pathways || []) {
          for (const d of pathway.documents_needed || []) {
            if (!docs.includes(d)) docs.push(d);
          }
        }
        if (docs.length) {
          response += `📎 *Nini cha kuleta:*\n`;
          for (const d of docs) response += `   • ${d}\n`;
          response += `\n`;
        }

        response += `${randomEncouragement}`;
      } else {
        response += `Niambie zaidi. Mfano: "Napewa KES 200 tu kwa siku" au "Wananipa barakoa tu".\n\n`;
        response += `Au andika "rights" kuona haki zote.`;
      }

      return response;
    }

    let response = `${randomEmpathy}\n\n`;

    if (violation) {
      response += `What you're describing is *${violation.description}*.\n\n`;

      for (const law of violation.applicable_laws) {
        response += `📜 ${law.law} — ${law.section}\n`;
        response += `   "${law.detail}"\n\n`;
      }

      response += `*What you can do:*\n`;
      for (const pathway of violation.remedy_pathways) {
        response += `🏛️ ${pathway.institution}\n`;
        response += `   ${pathway.action}\n`;
        for (const step of pathway.process) {
          response += `   • ${step}\n`;
        }
        response += `   ⏰ ${pathway.timeline}\n\n`;
      }

      const docs = [];
      for (const pathway of violation.remedy_pathways || []) {
        for (const d of pathway.documents_needed || []) {
          if (!docs.includes(d)) docs.push(d);
        }
      }
      if (docs.length) {
        response += `📎 *What to bring:*\n`;
        for (const d of docs) response += `   • ${d}\n`;
        response += `\n`;
      }

      response += `${randomEncouragement}`;
    } else {
      response += `Tell me more. For example: "I'm only paid KES 200 a day" or "They don't provide gloves".\n\n`;
      response += `Or type "rights" to see what the law says.`;
    }

    return response;
  }

  getClarificationMessage(lang = 'en') {
    if (lang === 'sw') {
      return `Nataka kuelewa vizuri. Niambie:
• Unafanya kazi gani?
• Tatizo ni lipi?
• Kaunti yako ni ipi?

Mfano: "Nafanya kazi ya kuvuna kahawa Nyeri, nalipwa KES 200 tu kwa siku, na sina mkataba."`;
    }

    return `I need a bit more detail:
• What kind of work do you do?
• What's the problem?
• Which county are you in?

Example: "I pick coffee in Nyeri, earn KES 200/day, and have no contract."`;
  }

  getFollowUpMessage(user, lang = 'en') {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    if (lang === 'sw') {
      const timeSw = hour < 12 ? 'asubuhi' : hour < 17 ? 'mchana' : 'jioni';
      return `Habari za ${timeSw}, ${user.firstName || 'rafiki'}! 🇰🇪

Kuna kifungua kiguu? Ukiwa na swali la awali, niambie umefikia hatua gani.`;
    }

    return `Good ${timeOfDay}, ${user.firstName || 'friend'}! 🇰🇪

Any progress on your case? Tell me where things stand — we can pick up from there.`;
  }

  getErrorMessage(lang = 'en') {
    if (lang === 'sw') {
      return `Kuna tatizo upande wangu. Tafadhali tuma tena.

Ikiwa inaendelea, piga NLAS: 0800 720 640.`;
    }

    return `Something went wrong on my end. Could you try again?

If this keeps up, call NLAS toll-free: 0800 720 640.`;
  }

  getClosingMessage(user, lang = 'en') {
    if (lang === 'sw') {
      return `Asante, ${user.firstName || 'rafiki'}! Haki yako inastahili kupigania.

NLAS: 0800 720 640 (bila malipo). Rejea wakati wowote. 🇰🇪`;
    }

    return `Thanks, ${user.firstName || 'friend'}! Your rights are worth fighting for.

NLAS offers free legal aid: 0800 720 640. Come back anytime. 🇰🇪`;
  }
}

export default ConversationManager;
