import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load users database
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

// One incoming message can touch the profile several times (lastSeen,
// history, context). Debounce so each burst hits the disk once instead of
// on every call; pending changes are flushed on shutdown.
function saveUsers(users) {
  pendingUsers = users;
  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeUsers(pendingUsers);
      pendingUsers = null;
    }, SAVE_DEBOUNCE_MS);
    // A pending save alone shouldn't keep the process alive
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

// ============================================
// CONVERSATION MANAGER
// Makes the bot feel like talking to a real human
// ============================================

class ConversationManager {
  constructor() {
    this.users = loadUsers();
    this.conversationStates = new Map();
  }

  // Get or create user profile
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

  // Update user last seen
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

  // Mark user as no longer new
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

  // Update user context
  updateContext(phoneNumber, updates) {
    if (this.users[phoneNumber]) {
      this.users[phoneNumber].context = {
        ...this.users[phoneNumber].context,
        ...updates
      };
      saveUsers(this.users);
    }
  }

  // Get conversation history for a user
  getConversationHistory(phoneNumber) {
    if (this.users[phoneNumber]) {
      return this.users[phoneNumber].context.conversationHistory || [];
    }
    return [];
  }

  // Add a message to conversation history
  addToHistory(phoneNumber, role, content) {
    if (this.users[phoneNumber]) {
      const history = this.users[phoneNumber].context.conversationHistory || [];
      history.push({ role, content, timestamp: new Date().toISOString() });
      
      // Keep only last 20 messages to manage context
      if (history.length > 20) {
        history.shift();
      }
      
      this.users[phoneNumber].context.conversationHistory = history;
      saveUsers(this.users);
    }
  }

  // Get conversation state
  getState(phoneNumber) {
    return this.conversationStates.get(phoneNumber) || {
      step: 'welcome',
      data: {},
      retryCount: 0
    };
  }

  // Update conversation state
  setState(phoneNumber, state) {
    this.conversationStates.set(phoneNumber, state);
  }

  // Clear conversation state
  clearState(phoneNumber) {
    this.conversationStates.delete(phoneNumber);
  }

  // ============================================
  // WELCOME FLOW FOR NEW USERS
  // ============================================

  getWelcomeMessage(user, lang = 'en') {
    if (lang === 'sw') {
      return `🇰🇪 *Karibu Haki Chatbot!*

Mimi ni Haki. Nasaidia wafanyakazi wa mashamba nchini Kenya kufahamu haki zao chini ya sheria, na hatua za kuchukua pale haki zinapokiukwa.

Unaweza kunieleza shida yako — mshahara mdogo, kukosekana kwa mkataba, usalama kazini, unyanyasaji — nami nitakuonyesha sheria inayohusika na ofisi inayoweza kukusaidia. Au uliza chochote, kwa mfano: "mshahara wa chini ni ngapi?"

Ni nini kinatokea kazini kwako?`;
    }

    return `🇰🇪 *Welcome to Haki Chatbot!*

I'm Haki. I help people working on Kenya's farms and in agribusiness understand their rights under Kenyan law, and what to do when those rights are ignored.

Tell me what's happening — low pay, no contract, unsafe conditions, harassment — and I'll show you the law that applies plus the office that can actually help. Or just ask something like "what's the minimum wage?"

So, what's going on at your workplace?`;
  }

  // ============================================
  // CONVERSATIONAL RESPONSE GENERATORS
  // ============================================

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

Ni furaha kukuona tena. Kuna shida mpya kazini? Niambie yaliyotokea.

Ukiwa umesahau, unaweza uliza haki zako, au andika "nambari" kupata ofisi za msaada.`;
    }

    return `${timeGreeting}, ${user.firstName || 'friend'}! 👋

Good to hear from you again. Got a new problem at work? Tell me what happened.

If you're not sure where to start, ask about your rights, or type "numbers" for offices that can help.`;
  }

  getConversationalResponse(intent, violation, user, lang = 'en') {
    // Add human-like conversational elements
    const empathyPhrases = {
      sw: [
        'Samahani, hii ni pigo sana.',
        'Pole sana. Ni vizuri uliongea.',
        'Hilo halipo sawa kabisa.',
        'Nasikitika unapitia hivi.'
      ],
      en: [
        'I\'m sorry — that\'s a hard situation.',
        'That isn\'t fair, and you\'re right to speak up.',
        'Pole. Thanks for telling me.',
        'That sounds exhausting to deal with.'
      ]
    };

    const encouragementPhrases = {
      sw: [
        'Usiache hivi. Haki yako ina thamani.',
        'Watu hushinda kesi kama hii. Nawe unaweza.',
        'Hatua kwa hatua, tutafika.',
        'Sheria iko upande wako hapa.'
      ],
      en: [
        'Don\'t let this go — your rights matter.',
        'People win cases like this. You can too.',
        'One step at a time from here.',
        'The law is on your side here.'
      ]
    };

    const randomEmpathy = empathyPhrases[lang][Math.floor(Math.random() * empathyPhrases[lang].length)];
    const randomEncouragement = encouragementPhrases[lang][Math.floor(Math.random() * encouragementPhrases[lang].length)];

    // Build conversational response
    if (lang === 'sw') {
      let response = `${randomEmpathy}\n\n`;

      if (violation) {
        response += `Kimsingi, unaelezea *${violation.description}*. Sheria ya Kenya haikubali hili.\n\n`;
        response += `*Sheria inayohusika:*\n`;

        for (const law of violation.applicable_laws) {
          response += `📜 ${law.law} (${law.section})\n`;
          response += `   "${law.detail}"\n\n`;
        }

        response += `*Hatua za kufuata:*\n`;
        for (const pathway of violation.remedy_pathways) {
          response += `🏛️ ${pathway.institution}\n`;
          response += `   ${pathway.action}\n`;
          for (const step of pathway.process) {
            response += `   • ${step}\n`;
          }
          response += `   ⏰ Muda: ${pathway.timeline}\n\n`;
        }

        response += `${randomEncouragement}\n\n`;
        response += `Ukihitaji msaada zaidi, andika "msaada".`;
      } else {
        response += `Niambie zaidi kuhusu hali yako. Kwa mfano: "Nalipwa KES 200 tu kwa siku" au "Hawatupi barakoa".\n\n`;
        response += `Au andika "haki zangu" ujue haki zako zote.`;
      }

      return response;
    }

    // English version
    let response = `${randomEmpathy}\n\n`;

    if (violation) {
      response += `So you're dealing with *${violation.description}*. Kenyan law does not allow this.\n\n`;
      response += `*The law that applies:*\n`;

      for (const law of violation.applicable_laws) {
        response += `📜 ${law.law} (${law.section})\n`;
        response += `   "${law.detail}"\n\n`;
      }

      response += `*What you can do:*\n`;
      for (const pathway of violation.remedy_pathways) {
        response += `🏛️ ${pathway.institution}\n`;
        response += `   ${pathway.action}\n`;
        for (const step of pathway.process) {
          response += `   • ${step}\n`;
        }
        response += `   ⏰ Timeline: ${pathway.timeline}\n\n`;
      }

      response += `${randomEncouragement}\n\n`;
      response += `If you need anything else, just type "help".`;
    } else {
      response += `Tell me a bit more about your situation. For example: "I am paid only KES 200 per day" or "They don't give us gloves".\n\n`;
      response += `Or type "rights" to see what the law says you're entitled to.`;
    }

    return response;
  }

  // ============================================
  // CONVERSATIONAL CLARIFICATION
  // ============================================

  getClarificationMessage(lang = 'en') {
    if (lang === 'sw') {
      return `🤔 Nina taka kuelewa vizuri. Niambie zaidi: unafanya kazi gani, na tatizo hasa ni lipi? Inasaidia pia ukijua kaunti yako.

Mfano: "Nafanya kazi ya kuvuna kahawa Nyeri. Nalipwa KES 200 tu kwa siku na sina mkataba."`;
    }

    return `🤔 I want to make sure I understand you right. Tell me a bit more: what work do you do, and what exactly is the problem? Knowing your county helps too.

For example: "I pick coffee in Nyeri and I'm paid KES 200 a day with no contract."`;
  }

  // ============================================
  // CONVERSATIONAL FOLLOW-UPS
  // ============================================

  getFollowUpMessage(user, lang = 'en') {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'asubuhi' : hour < 17 ? 'mchana' : 'jioni';

    if (lang === 'sw') {
      return `Habari za ${timeOfDay}, ${user.firstName || 'rafiki'}! 🇰🇪

Kuna jambo jipya? Ikiwa ulikuwa na tatizo lililopita, niambie ulivyofika nayo.`;
    }

    return `Good ${timeOfDay}, ${user.firstName || 'friend'}! 🇰🇪

Anything new? If you had a problem earlier, let me know how far you've gotten with it — happy to pick it up from there.`;
  }

  // ============================================
  // HUMAN-LIKE ERROR HANDLING
  // ============================================

  getErrorMessage(lang = 'en') {
    if (lang === 'sw') {
      return `😅 Samahani, kuna hitilafu upande wangu. Tuma ujumbe tena tafadhali.

Ikiwa itaendelea, piga NLAS bure: 0800 723 255.`;
    }

    return `😅 Sorry, something went wrong on my end. Could you send that again?

If it keeps happening, call NLAS for free on 0800 723 255.`;
  }

  // ============================================
  // HUMAN-LIKE CLOSING
  // ============================================

  getClosingMessage(user, lang = 'en') {
    if (lang === 'sw') {
      return `🙏 Asante sana, ${user.firstName || 'rafiki'}! Haki yako ina thamani — usiache kuifuatilia.

NLAS wanatoa msaada wa kisheria bure: 0800 723 255. Karibu tena ukihitaji. 🇰🇪`;
    }

    return `🙏 Thank you, ${user.firstName || 'friend'}! Your rights are worth fighting for — don't let this drop.

NLAS gives free legal help if you need a person to talk to: 0800 723 255. Come back any time. 🇰🇪`;
  }
}

export default ConversationManager;