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
      return `🇰🇪 *Karibu Haki!*

Mimi ni msaidizi wako — ninasaidia na haki za kazi: mshahara, mkataba, usalama kazini, ajira ya watoto, unyanyasaji na ardhi.

Unaweza kuniuliza chochote sasa hivi — hakuna usajili unaohitajika. Kwa mfano:
• "Ninalipwa KES 200 bila mkataba"
• "Sijapata mapumziko kwa siku nyingi"
• "Mwenye shamba hatoi mkataba"

Kwa usaidizi bora zaidi, sema "register" kuweka jina na eneo lako. Lakini si lazima — niulize tu!`;
    }

    return `🇰🇪 *Welcome to Haki!*

I'm your assistant — I help with workplace rights: wages, contracts, safety on the job, child labour, harassment and land.

You can ask me anything right now — no registration needed. For example:
• "I'm paid KES 200 with no contract"
• "I've worked for days without a break"
• "My employer won't give me a contract"

For better, personalized help, say "register" to share your name and location. But it's totally optional — just ask!`;
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
      return `${timeGreeting}, ${user.firstName || 'rafiki'}! 👋

Karibu tena. Kuna jambo jipya kuhusu kazi? Niambie kilichotokea.

Ukihitaji mwanzo, unaweza kuuliza kuhusu haki zako au kuandika "numbers" kupata nambari za msaada.`;
    }

    return `${timeGreeting}, ${user.firstName || 'friend'}! 👋

Welcome back. Anything new at work? Tell me what happened.

If you're not sure where to start, ask about your rights or type "numbers" for helpdesk contacts.`;
  }

  getConversationalResponse(intent, violation, user, lang = 'en') {
    const empathyPhrases = {
      sw: [
        'Pole sana. Hiyo si sawa.',
        'Naelewa. Asante kwa kujitokeza.',
        'Hii ni ngumu, lakini unafanya vyema kwa kusema.',
        'Sikiliza, hii haki haitakiwi.'
      ],
      en: [
        'That\'s really tough. I\'m sorry you\'re going through this.',
        'You\'re right to speak up — this isn\'t okay.',
        'Thanks for telling me. That takes courage.',
        'This sounds exhausting. You deserve better.'
      ]
    };

    const encouragementPhrases = {
      sw: [
        'Usikubali hii. Haki yako ni muhimu.',
        'Kesi kama hii zimeshinda. Na wewe unaweza.',
        'Hatua kwa hatua. Tuko pamoja.',
        'Sheria iko upande wako.'
      ],
      en: [
        'Don\'t let this slide — your rights matter.',
        'Similar cases have been won before. You can too.',
        'One step at a time. We\'ll get through this.',
        'The law is on your side here.'
      ]
    };

    const randomEmpathy = empathyPhrases[lang]?.[Math.floor(Math.random() * (empathyPhrases[lang]?.length || 1))] || empathyPhrases.en[0];
    const randomEncouragement = encouragementPhrases[lang]?.[Math.floor(Math.random() * (encouragementPhrases[lang]?.length || 1))] || encouragementPhrases.en[0];

    if (lang === 'sw') {
      let response = `${randomEmpathy}\n\n`;

      if (violation) {
        response += `Kulingana na ulivyosema, hii ni *${violation.description}*. Sheria ya Kenya hairuhusu hii.\n\n`;
        response += `*Sheria inayotumika:*\n`;

        for (const law of violation.applicable_laws) {
          response += `📜 ${law.law} (${law.section})\n`;
          response += `   "${law.detail}"\n\n`;
        }

        response += `*Hatua unazoweza kuchukua:*\n`;
        for (const pathway of violation.remedy_pathways) {
          response += `🏛️ ${pathway.institution}\n`;
          response += `   ${pathway.action}\n`;
          for (const step of pathway.process) {
            response += `   • ${step}\n`;
          }
          response += `   ⏰ Muda: ${pathway.timeline}\n\n`;
        }

        response += `${randomEncouragement}\n\n`;
        response += `Kwa msaada zaidi, andika "help".`;
      } else {
        response += `Niambie zaidi kuhusu hali yako. Mfano: "Napewa KES 200 tu kwa siku" au "Wananipa barakoa tu".\n\n`;
        response += `Au andika "rights" kuona haki zote sheria inazokupa.`;
      }

      return response;
    }

    let response = `${randomEmpathy}\n\n`;

    if (violation) {
      response += `What you're describing is *${violation.description}*. Kenyan law does not allow this.\n\n`;
      response += `*Applicable laws:*\n`;

      for (const law of violation.applicable_laws) {
        response += `📜 ${law.law} (${law.section})\n`;
        response += `   "${law.detail}"\n\n`;
      }

      response += `*Steps you can take:*\n`;
      for (const pathway of violation.remedy_pathways) {
        response += `🏛️ ${pathway.institution}\n`;
        response += `   ${pathway.action}\n`;
        for (const step of pathway.process) {
          response += `   • ${step}\n`;
        }
        response += `   ⏰ Timeline: ${pathway.timeline}\n\n`;
      }

      response += `${randomEncouragement}\n\n`;
      response += `For more help, reply "help".`;
    } else {
      response += `Tell me more about your situation. For example: "I'm only paid KES 200 a day" or "They don't provide gloves".\n\n`;
      response += `Or type "rights" to see all the rights the law gives you.`;
    }

    return response;
  }

  getClarificationMessage(lang = 'en') {
    if (lang === 'sw') {
      return `🤔 Nataka kuhakikisha nimeelewa. Tafadhali nieleze zaidi: unafanya kazi gani, na tatizo ni nini? Kujua county yako pia inasaidia.

Mfano: "Nafanya kazi ya kuvuna kahawa Nyeri, nalipwa KES 200 tu kwa siku, na sina mkataba."`;
    }

    return `🤔 I want to make sure I understand correctly. Please tell me more: what kind of work do you do, and what exactly is the problem? Knowing your county also helps.

Example: "I pick coffee in Nyeri, earn only KES 200/day, and have no contract."`;
  }

  getFollowUpMessage(user, lang = 'en') {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    if (lang === 'sw') {
      const timeSw = hour < 12 ? 'asubuhi' : hour < 17 ? 'mchana' : 'jioni';
      return `Habari za ${timeSw}, ${user.firstName || 'rafiki'}! 🇰🇪

Kuna jambo jipya? Ukiwa na swali la awali, niambie umefikia hatua gani.`;
    }

    return `Good ${timeOfDay}, ${user.firstName || 'friend'}! 🇰🇪

Any updates? If you had a previous issue, tell me where things stand — we can pick up from there.`;
  }

  getErrorMessage(lang = 'en') {
    if (lang === 'sw') {
      return `😅 Pole, kuna tatizo upande wangu. Tafadhali tuma tena ujumbe wako.

Endelea kutokea, piga NLAS kwa nambari hii: 0800 723 255.`;
    }

    return `😅 Sorry, something went wrong on my end. Could you try sending your message again?

If this keeps happening, call NLAS toll-free: 0800 723 255.`;
  }

  getClosingMessage(user, lang = 'en') {
    if (lang === 'sw') {
      return `🙏 Asante sana, ${user.firstName || 'rafiki'}! Haki yako inastahili kupigania — usiache kufuatilia.

NLAS wanatoa msaada wa kisheria bila malipo: 0800 723 255. Rejea wakati wowote. 🇰🇪`;
    }

    return `🙏 Thank you so much, ${user.firstName || 'friend'}! Your rights are worth fighting for — don't let this drop.

If you want to talk to a real person, NLAS offers free legal aid: 0800 723 255. Come back anytime. 🇰🇪`;
  }
}

export default ConversationManager;
