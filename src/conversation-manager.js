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

// Save users database
function saveUsers(users) {
  try {
    console.log(`💾 Saving users to: ${USERS_FILE}`);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    console.log(`✅ Users saved successfully`);
  } catch (error) {
    console.log('⚠️ Could not save users database:', error.message);
  }
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
      return `🇰🇪 *Karibu sana Haki Chatbot!*

Mimi ni *Haki*, msaidizi wako wa haki za kazi katika kilimo cha Kenya.

Ninafanya kazi kama mtu ambaye unaelewa shida zako za kazi na kukupa ushauri mzuri.

*Ninaweza kukusaidia na:*
✅ Kujua haki zako kama mfanyakazi wa kilimo
✅ Kuelewa kama unanyanyaswa au unakiukwa
✅ Kupata namba za ofisi za kazi na mahakama
✅ Kujua hatua za kufanya kama una shida

*Tusiane kama hii ni mara yako ya kwanza?*
Andika: "Ndio" au "Hapana"

Au andika moja ya haya:
• "Nina shida ya mshahara"
• "Haki zangu ni nini?"
• "Nataka kulalamika"`;
    }

    return `🇰🇪 *Welcome to Haki Chatbot!*

I'm *Haki*, your workplace rights assistant for Kenya's agribusiness sector.

I work like a friend who understands your work problems and gives you good advice.

*I can help you with:*
✅ Know your rights as an agricultural worker
✅ Understand if you're being mistreated or exploited
✅ Get phone numbers for labour offices and courts
✅ Know what steps to take if you have a problem

*Is this your first time here?*
Type: "Yes" or "No"

Or type one of these:
• "I have a wage problem"
• "What are my rights?"
• "I want to file a complaint"`;
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

Nikutumbuhie tena. Ni gani tena unahitaji kujua au unapata shida gani kazini?

Kama umesahau, unaweza andika:
• "Haki zangu" - kujua haki zako
• "Nina shida" - kuelezea tatizo lako
• "Nambari" - kupata namba za msaada

Niko hapa kukusaidia! 💪`;
    }

    return `${timeGreeting}, ${user.firstName || 'friend'}! 👋

Good to see you again. What do you need help with today?

If you forgot, you can type:
• "My rights" - to know your rights
• "I have a problem" - to describe your issue
• "Numbers" - to get help numbers

I'm here to help! 💪`;
  }

  getConversationalResponse(intent, violation, user, lang = 'en') {
    // Add human-like conversational elements
    const empathyPhrases = {
      sw: [
        'Napo katika hiyo shida pamoja nawe.',
        'Nafahamu kwamba hii ni kitu kibaya sana kwako.',
        'Pole sana, hii si mara nzuri kukubalika.',
        'Unahitaji msaada, na hapa pamoja nawe.',
        'Si lazima usihisi mwenyewe tu, niko hapa.',
        'Hii ni shida kubwa, lakini tutakufanya pamoja.',
        'Nafahamu kwamba una jasho kali, sisi tutakusaidia.',
        'Unakubalika vizuri, na sisi tutakusaidia katika hiyo.'
      ],
      en: [
        'I understand this is a really tough situation.',
        'I\'m sorry you\'re going through this.',
        'This is absolutely not fair.',
        'You deserve much better than this.',
        'I\'m here with you on this.'
      ]
    };

    const encouragementPhrases = {
      sw: [
        'Usisite kufanya hatua. Haki yako ni muhimu.',
        'Tutapigana pamoja kuhusu hii.',
        'Una nguvu ya kufanya hili. Usikate tamaa.',
        'Hii ni hatua yako ya kwanza kuelekea haki.'
      ],
      en: [
        'Don\'t hesitate to take action. Your rights matter.',
        'We\'ll fight this together.',
        'You have the power to do this. Don\'t give up.',
        'This is your first step toward justice.'
      ]
    };

    const randomEmpathy = empathyPhrases[lang][Math.floor(Math.random() * empathyPhrases[lang].length)];
    const randomEncouragement = encouragementPhrases[lang][Math.floor(Math.random() * encouragementPhrases[lang].length)];

    // Build conversational response
    if (lang === 'sw') {
      let response = `${randomEmpathy}\n\n`;
      
      if (violation) {
        response += `Nimegundua kuwa una tatizo la *${violation.description}*.\n\n`;
        response += `Hii ni kinyume na sheria ya Kenya. Unastahili kulindwa.\n\n`;
        response += `*Hii ndiyo sheria inayofaa:*\n`;
        
        for (const law of violation.applicable_laws) {
          response += `📜 ${law.law} (${law.section})\n`;
          response += `   "${law.detail}"\n\n`;
        }

        response += `*Njia ya kufanya:*\n`;
        for (const pathway of violation.remedy_pathways) {
          response += `🏛️ ${pathway.institution}\n`;
          response += `   ${pathway.action}\n`;
          for (const step of pathway.process) {
            response += `   • ${step}\n`;
          }
          response += `   ⏰ Muda: ${pathway.timeline}\n\n`;
        }

        response += `${randomEncouragement}\n\n`;
        response += `💬 *Unahitaji msaada zaidi?* Andika "msaada" au nambari zako.`;
      } else {
        response += `Niko hapa kukusaidia. Unaweza kuniambia zaidi kuhusu shida lako.\n\n`;
        response += `Mfano: "Nalipwa KES 200 tu kwa siku" au "Hawatupi barakoa"\n\n`;
        response += `Au andika "haki zangu" kujua haki zako zote.`;
      }

      return response;
    }

    // English version
    let response = `${randomEmpathy}\n\n`;
    
    if (violation) {
      response += `I can see you're dealing with *${violation.description}*.\n\n`;
      response += `This is against Kenyan law. You deserve protection.\n\n`;
      response += `*Here's the law that applies:*\n`;
      
      for (const law of violation.applicable_laws) {
        response += `📜 ${law.law} (${law.section})\n`;
        response += `   "${law.detail}"\n\n`;
      }

      response += `*Here's what you can do:*\n`;
      for (const pathway of violation.remedy_pathways) {
        response += `🏛️ ${pathway.institution}\n`;
        response += `   ${pathway.action}\n`;
        for (const step of pathway.process) {
          response += `   • ${step}\n`;
        }
        response += `   ⏰ Timeline: ${pathway.timeline}\n\n`;
      }

      response += `${randomEncouragement}\n\n`;
      response += `💬 *Need more help?* Type "help" or your question.`;
    } else {
      response += `I'm here to help. Tell me more about your situation.\n\n`;
      response += `Example: "I am paid only KES 200 per day" or "They don't give us gloves"\n\n`;
      response += `Or type "rights" to know all your rights.`;
    }

    return response;
  }

  // ============================================
  // CONVERSATIONAL CLARIFICATION
  // ============================================

  getClarificationMessage(lang = 'en') {
    if (lang === 'sw') {
      return `🤔 *Ningependa kuelewa zaidi...*

Tafadhali niambie:
• Unafanya kazi gani? (Kahawa, maua, mboga, nk)
• Unapata shida gani? (Mshahara, usalama, mkataba, nk)
• Uko wapi? (Kaunti gani)

Mfano: "Nafanya kazi kwenye shamba la kahawa Nyeri. Nalipwa KES 200 tu kwa siku na sina mkataba."`;
    }

    return `🤔 *I want to understand better...*

Please tell me:
• What work do you do? (Coffee, flowers, vegetables, etc.)
• What problem are you facing? (Wages, safety, contract, etc.)
• Where are you? (Which county)

Example: "I work on a coffee farm in Nyeri. I am paid only KES 200 per day and have no contract."`;
  }

  // ============================================
  // CONVERSATIONAL FOLLOW-UPS
  // ============================================

  getFollowUpMessage(user, lang = 'en') {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'asubuhi' : hour < 17 ? 'mchana' : 'jioni';

    if (lang === 'sw') {
      return `🇰🇪 *Habari za ${timeOfDay}, ${user.firstName || 'rafiki'}!*

Nikutumbuhie tena. Je, kuna jambo jipya unataka kujua au kushirikisha?

Kama ulikuwa na tatizo, tafadhali eleza zaidi ili niweze kukusaidia vizuri.

*Andika moja ya haya:*
• "Nina shida ya mshahara"
• "Haki zangu ni nini?"
• "Nambari za msaada"
• "Nina tatizo jipya"`;
    }

    return `🇰🇪 *Good ${timeOfDay}, ${user.firstName || 'friend'}!*

Good to see you again. Is there something new you'd like to know or share?

If you had a problem earlier, please tell me more so I can help you better.

*Type one of these:*
• "I have a wage problem"
• "What are my rights?"
• "Help numbers"
• "I have a new problem"`;
  }

  // ============================================
  // HUMAN-LIKE ERROR HANDLING
  // ============================================

  getErrorMessage(lang = 'en') {
    if (lang === 'sw') {
      return `😅 *Samahani, kuna kitu kimefanyika vibaya.*

Tafadhali jaribu tena. Kama shida inaendelea, unaweza:
• Andika "msaada" kupata msaada
• Piga namba: 0800 723 255 (NLAS - bure)

Niko hapa kukusaidia! 💪`;
    }

    return `😅 *Sorry, something went wrong.*

Please try again. If the problem continues, you can:
• Type "help" to get assistance
• Call: 0800 723 255 (NLAS - free)

I'm here to help! 💪`;
  }

  // ============================================
  // HUMAN-LIKE CLOSING
  // ============================================

  getClosingMessage(user, lang = 'en') {
    if (lang === 'sw') {
      return `🙏 *Asante sana, ${user.firstName || 'rafiki'}!*

Kumbuka:
✅ Haki zako ni muhimu sana
✅ Unastahili kazi salama na ya heshima
✅ Usisite kuwasiliana nasi tena ikiwa unahitaji msaada

*Kila la heri!* 🇰🇪

_Piga NLAS kwa msaada wa bure: 0800 723 255_`;
    }

    return `🙏 *Thank you so much, ${user.firstName || 'friend'}!*

Remember:
✅ Your rights matter
✅ You deserve safe and dignified work
✅ Don't hesitate to contact us again if you need help

*All the best!* 🇰🇪

_Call NLAS for free help: 0800 723 255_`;
  }
}

export default ConversationManager;