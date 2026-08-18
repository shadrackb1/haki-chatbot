import dotenv from 'dotenv';
dotenv.config();
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import ConversationManager from './conversation-manager.js';
import LLMReasoningEngine from './llm-reasoning.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Health Check Server (for uptime monitoring) ──
let botLive = false;
const HEALTH_PORT = process.env.HEALTH_PORT || 3001;
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(botLive ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: botLive ? 'ok' : 'starting', bot: 'Haki', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});
healthServer.listen(HEALTH_PORT, () => console.log(`💓 Health check: http://localhost:${HEALTH_PORT}/health`));

// ============================================
// HAKI CHATBOT - AI Engine
// ============================================

// Load legal knowledge base
const legalKB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'legal-knowledge-base.json'), 'utf8'));

// Initialize conversation manager (makes bot feel human)
const conversationManager = new ConversationManager();

// Initialize LLM reasoning engine (adds intelligence)
const llmEngine = new LLMReasoningEngine();
// Initialize user sessions map for tracking conversation state
const userSessions = new Map();

console.log('🧠 AI Engine: ' + (llmEngine.isAvailable() ? 'LLM-powered (meta/llama-3.1-8b-instruct)' : 'Rule-based (fallback)'));
console.log('💬 Conversation: Human-like with welcome flow');

function detectLanguage(text) {
   // Always return English for now - working with English first
   return 'en';
}



function detectIntent(text) {
  const lower = text.toLowerCase();
  
  // Help patterns
  if (/^(help|msaada|nisaidie|nini|what|nini cha|cha kufanya)/i.test(lower)) {
    return 'help';
  }
  
  // Minimum wage question
  if (/mshahara|minimum wage|wage|pay|kulipwa|pesa.*kidogo|underpaid|low pay/i.test(lower)) {
    return 'minimum_wage';
  }
  
  // Rights question
  if (/haki|rights|what are my|nini haki|rights yangu|nina haki/i.test(lower)) {
    return 'rights';
  }
  
  // Institution/contact question
  if (/contact|numba|simu|phone|wapi|where|office|ofisi|institution|shirika/i.test(lower)) {
    return 'contact';
  }
  
  // Thank you
  if (/asante|thank|shukrani|poa|sawa|sawa sana/i.test(lower)) {
    return 'thanks';
  }
  
  // Greeting patterns
  if (/^(habari|hello|hi|hey|mambo|jambo|niaje|sawa|poa|ndio|morning|evening|afternoon)/i.test(lower)) {
    return 'greeting';
  }
  
  return 'violation_report';
}

// Enhanced text processing for better matching
function tokenizeText(text) {
  // Convert to lowercase and split by non-alphanumeric characters
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

// Calculate TF-IDF like score for better matching
function calculateRelevanceScore(query, category) {
  const queryTokens = tokenizeText(query);
  if (queryTokens.length === 0) return 0;
  
  // Get all keywords for this category
  const allKeywords = [
    ...category.keywords_sw,
    ...category.keywords_en,
    ...Object.values(category.keywords_local || {}).flat()
  ].map(keyword => keyword.toLowerCase());
  
  // Calculate term frequency
  const tf = {};
  queryTokens.forEach(token => {
    tf[token] = (tf[token] || 0) + 1;
  });
  
  // Calculate score based on keyword matches
  let score = 0;
  const matchedKeywords = new Set();
  
  queryTokens.forEach(token => {
    if (allKeywords.includes(token)) {
      // Basic match score
      score += 1;
      matchedKeywords.add(token);
      
      // Bonus for exact phrase matches (if query has multiple words)
      if (queryTokens.length > 1) {
        // Check for bigrams
        for (let i = 0; i < queryTokens.length - 1; i++) {
          const bigram = queryTokens.slice(i, i + 2).join(' ');
          if (allKeywords.includes(bigram)) {
            score += 0.5; // Bonus for phrase match
          }
        }
      }
    }
  });
  
  // Normalize by query length to prevent longer queries from always scoring higher
  return score / Math.sqrt(queryTokens.length);
}

// Enhanced violation classification with RAG-like capabilities
function classifyViolation(text) {
  const lower = text.toLowerCase();
  const violations = [];
  
  for (const category of legalKB.violation_categories) {
    // Calculate enhanced relevance score
    const score = calculateRelevanceScore(lower, category);
    
    if (score > 0) {
      violations.push({
        id: category.id,
        score: score,
        data: category
      });
    }
  }
  
  // Sort by score descending
  violations.sort((a, b) => b.score - a.score);
  
  // Return the best match if score is above threshold
  const bestMatch = violations.length > 0 ? violations[0] : null;
  return bestMatch && bestMatch.score > 0.3 ? bestMatch : null; // Threshold for relevance
}

// ============================================
// RESPONSE GENERATORS
// ============================================

function generateGreeting(lang) {
  if (lang === 'sw') {
    return `🇺🇸 *HABARI! Karibu Haki Chatbot* 🇰🇪

Mimi ni *Haki*, msaidizi wako wa haki za kazi katika kilimo cha Kenya.

*Ninaweza kukusaidia na:*
1️⃣ *Kujua haki zako* - Mshahara, mkataba, usalama
2️⃣ *Kulalamika* - Kwa kosa lolote la haki za kazi
3️⃣ *Kupata msaada* - Mahakama, ofisi ya kazi, msaada wa kisheria

*Tuambie:*
- Unafanya kazi gani?
- Unapata shida gani?
- Unataka kujua nini?

Tafadhali andika ujumbe wako kwa undani. 🔍`;
  }
  return `🇺🇸 *HELLO! Welcome to Haki Chatbot* 🇰🇪

I am *Haki*, your workplace rights assistant for Kenya's agribusiness sector.

*I can help you with:*
1️⃣ *Know your rights* - Wages, contracts, safety
2️⃣ *File a complaint* - For any workplace rights violation
3️⃣ *Get help* - Labour office, court, legal aid

*Tell us:*
- What work do you do?
- What problem are you facing?
- What do you want to know?

Please describe your situation in detail. 🔍`;
}

function generateMinimumWageInfo(lang) {
  if (lang === 'sw') {
    return `💰 *KIWANGO CHA MSHAHARA WA CHINI - KILIMO*

Kulingana na *Sheria ya Mazingira ya Kazi 2007*:

📋 *Wafanyakazi wa Kilimo:*
• *Haina ujuzi:* KES 282.90 kwa siku
• *Nusu ujuzi:* KES 350.00 kwa siku
• *Ujuzi:* KES 418.40 kwa siku

📋 *Wafanyakazi wa Jumla:*
• *Nairobi:* KES 653 kwa siku
• *Manispaa:* KES 500 kwa siku
• *Vijijini:* KES 367 kwa siku

⚠️ *Kumbuka:*
- Mshahara wa chini ni *haki ya kikatiba*
- Mshahara lazima ulipwe *kila mwezi* si zaidi ya mwezi mmoja
- Ikiwa unalipwa chini ya kiwango hii, hii ni *kinyume na sheria*

*Kama unalipwa chini ya kiwango hiki:*
→ Tafadhali tumia #Ripoti ili kulalamika`;
  }
  return `💰 *MINIMUM WAGE - AGRICULTURAL SECTOR*

According to the *Employment Act 2007*:

📋 *Agricultural Workers:*
• *Unskilled:* KES 282.90 per day
• *Semi-skilled:* KES 350.00 per day
• *Skilled:* KES 418.40 per day

📋 *General Workers:*
• *Nairobi:* KES 653 per day
• *Municipalities:* KES 500 per day
• *Rural areas:* KES 367 per day

⚠️ *Important:*
- Minimum wage is a *constitutional right*
- Wages must be paid *monthly* at most
- If you are paid below this amount, it is *illegal*

*If you are paid below minimum wage:*
→ Please use #Report to file a complaint`;
}

function generateRightsInfo(lang) {
  if (lang === 'sw') {
    return `📜 *HAKI ZAKO KAZI KATIKA KILIMO*

*Kila mfanyakazi wa kilimo anastahili:*

1️⃣ *Mshahara wa chini* - KES 282.90 kwa siku (haina ujuzi)
2️⃣ *Mkataba wa maandishi* - Ndani ya miezi 2 ya kuanza kazi
3️⃣ *Vifaa vya usalama* - Barakoa, glavu, mavazi (bila malipo)
4️⃣ *Siku ya kazi* - Saa 8 kwa siku, masaa 48 kwa wiki
5️⃣ *Mapumziko* - Siku 21 kwa mwaka (hali ya kazi)
6️⃣ *Magonjwa ya kazi* - Bima ya afya inalazimika
7️⃣ *Usalama* - Kazi salama bila hatari
8️⃣ *Kutokunyanyaswa* - Hakuna unyanyasaji wa kijinsia
9️⃣ *Kutofanywa kazi mtoto* - Watoto chini ya miaka 16 hawaruhusiwi
🔟 *Haki ya kulalamika* - Unaweza kulalamika bila adhabu

*Kama haki zako zinakiukwa:*
→ Tumia #Ripoti kulalamika
→ Au piga nambari ya msaada wa bure`;
  }
  return `📜 *YOUR RIGHTS IN AGRICULTURAL WORK*

*Every agricultural worker is entitled to:*

1️⃣ *Minimum wage* - KES 282.90/day (unskilled)
2️⃣ *Written contract* - Within 2 months of starting work
3️⃣ *Safety equipment* - Masks, gloves, clothing (free)
4️⃣ *Working hours* - 8 hours/day, 48 hours/week
5️⃣ *Leave* - 21 days per year (employment)
6️⃣ *Work injury coverage* - Health insurance mandatory
7️⃣ *Safety* - Safe workplace without hazards
8️⃣ *No harassment* - No sexual or gender-based harassment
9️⃣ *No child labor* - Children under 16 cannot work
🔟 *Right to complain* - You can file complaints without punishment

*If your rights are violated:*
→ Use #Report to file a complaint
→ Or call free help numbers`;
}

function generateViolationResponse(violation, lang) {
  const category = violation.data;
  
  if (lang === 'sw') {
    let response = `🚨 *ULALAMIKA: ${category.description}*\n\n`;
    response += `*Sheria Inayofaa:*\n`;
    
    for (const law of category.applicable_laws) {
      response += `📜 ${law.law}\n`;
      response += `   ${law.section} - ${law.title}\n`;
      response += `   ${law.detail}\n\n`;
    }
    
    response += `⚖️ *Njia za Suluhisho:*\n\n`;
    
    for (const pathway of category.remedy_pathways) {
      response += `🏛️ *${pathway.institution}*\n`;
      response += `   Hatua: ${pathway.action}\n`;
      response += `   Mchakato:\n`;
      
      for (const step of pathway.process) {
        response += `   • ${step}\n`;
      }
      
      response += `   📋 Hitaji: ${pathway.documents_needed.join(', ')}\n`;
      response += `   ⏰ Muda: ${pathway.timeline}\n\n`;
    }
    
    response += `📞 *Wasiliana Nasi:*\n`;
    response += `   NLAS (Msaidizi wa Bure): 0800 723 255\n`;
    response += `   Labour Office: 020 222 3344\n`;
    response += `   KNCHR: 0800 720 607\n\n`;
    response += `💬 *Unahitaji msaada zaidi? Andika "msaada" au "help"`;
    
    return response;
  }
  
  let response = `🚨 *COMPLAINT RECEIVED: ${category.description}*\n\n`;
  response += `*Applicable Law:*\n`;
  
  for (const law of category.applicable_laws) {
    response += `📜 ${law.law}\n`;
    response += `   ${law.section} - ${law.title}\n`;
    response += `   ${law.detail}\n\n`;
  }
  
  response += `⚖️ *Remedy Pathways:*\n\n`;
  
  for (const pathway of category.remedy_pathways) {
    response += `🏛️ *${pathway.institution}*\n`;
    response += `   Action: ${pathway.action}\n`;
    response += `   Process:\n`;
    
    for (const step of pathway.process) {
      response += `   • ${step}\n`;
    }
    
    response += `   📋 Required: ${pathway.documents_needed.join(', ')}\n`;
    response += `   ⏰ Timeline: ${pathway.timeline}\n\n`;
  }
  
  response += `📞 *Contact Us:*\n`;
  response += `   NLAS (Free Aid): 0800 723 255\n`;
  response += `   Labour Office: 020 222 3344\n`;
  response += `   KNCHR: 0800 720 607\n\n`;
  response += `💬 *Need more help? Type "help"`;
  
  return response;
}

function generateHelp(lang) {
  if (lang === 'sw') {
    return `ℹ️ *MSAADA - Jinsi ya Kutumia Haki Chatbot*

*Njia 3 za Kutumia:*

1️⃣ *Kujua Haki Zako*
   Andika: "haki zangu" au "rights"
   → Utapata orodha ya haki zako zote

2️⃣ *Kulalamika Kuhusu Kosa*
   Andika: Maelezo ya tatizo lako
   mfano: "Nalipwa KES 200 tu kwa siku"
   → Chatbot itagundua kosa na kukupa suluhisho

3️⃣ *Kupata Nambari za Msaada*
   Andika: "nambari" au "contact"
   → Utapata nambari za simu za ofisi mbalimbali

*Maneno Muhimu:*
• "haki zangu" - Orodha ya haki
• "mshahara" - Taarifa za mshahara wa chini
• "nambari" - Nambari za msaada
• "help" - Msaada wa ziada

*Tafadhali andika ujumbe wako kwa undani ili tupate kukusaidia vyema!* 🔍`;
  }
  return `ℹ️ *HELP - How to Use Haki Chatbot*

*3 Ways to Use:*

1️⃣ *Know Your Rights*
   Type: "rights" or "what are my rights"
   → You'll get a list of all your rights

2️⃣ *Report a Violation*
   Type: Description of your problem
   e.g., "I am paid only KES 200 per day"
   → Chatbot will identify the violation and give you solutions

3️⃣ *Get Help Numbers*
   Type: "contact" or "numbers"
   → You'll get phone numbers for various offices

*Key Phrases:*
• "rights" - List of rights
• "minimum wage" - Minimum wage information
• "contact" - Help numbers
• "help" - Additional help

*Please describe your situation in detail so we can help you effectively!* 🔍`;
}

function generateContactInfo(lang) {
  if (lang === 'sw') {
    let response = `📞 *NAMBARI ZA MSADA - KILIMO CHA KENYA*\n\n`;
    
    for (const inst of legalKB.remedy_institutions.national) {
      response += `🏛️ *${inst.name}*\n`;
      response += `   📞 ${inst.contact}\n`;
      if (inst.website) response += `   🌐 ${inst.website}\n`;
      response += `   Huduma: ${inst.services.join(', ')}\n\n`;
    }
    
    response += `🏢 *NGO ZA MSDA WA KISHERIA:*\n\n`;
    
    for (const ngo of legalKB.remedy_institutions.ngo_legal_aid) {
      response += `🏛️ *${ngo.name}*\n`;
      response += `   📞 ${ngo.contact}\n`;
      response += `   🌐 ${ngo.website}\n`;
      response += `   Huduma: ${ngo.services.join(', ')}\n\n`;
    }
    
    return response;
  }
  
  let response = `📞 *HELP NUMBERS - KENYA AGRICULTURE*\n\n`;
  
  for (const inst of legalKB.remedy_institutions.national) {
    response += `🏛️ *${inst.name}*\n`;
    response += `   📞 ${inst.contact}\n`;
    if (inst.website) response += `   🌐 ${inst.website}\n`;
    response += `   Services: ${inst.services.join(', ')}\n\n`;
  }
  
  response += `🏢 *LEGAL AID NGOs:*\n\n`;
  
  for (const ngo of legalKB.remedy_institutions.ngo_legal_aid) {
    response += `🏛️ *${ngo.name}*\n`;
    response += `   📞 ${ngo.contact}\n`;
    response += `   🌐 ${ngo.website}\n`;
    response += `   Services: ${ngo.services.join(', ')}\n\n`;
  }
  
  return response;
}

function generateThanks(lang) {
  if (lang === 'sw') {
    return `🙏 *Asante sana kwa kuwasiliana nasi!*

*Kumbuka:*
✅ Haki zako ni muhimu
✅ Unastahili kazi salama na ya heshima
Usisite kuwasiliana nasi tena ikiwa unahitaji msaada.

*Piga:*
📞 NLAS (Bure): 0800 723 255
📞 Labour Office: 020 222 3344

*Kila la heri!* 🇰🇪`;
  }
  return `🙏 *Thank you for reaching out!*

*Remember:*
✅ Your rights matter
✅ You deserve safe and dignified work
Don't hesitate to contact us again if you need help.

*Call:*
📞 NLAS (Free): 0800 723 255
📞 Labour Office: 020 222 3344

*All the best!* 🇰🇪`;
}

// ============================================
// MAIN AI ENGINE
// ============================================

function generateResponse(message, userPhone) {
  // Get or create session
  let session = userSessions.get(userPhone) || {
    language: null,
    conversationState: 'new',
    violationsReported: []
  };
  
  // Detect language
  const lang = detectLanguage(message);
  session.language = lang;
  
  // Detect intent
  const intent = detectIntent(message);
  
  let response = '';
  
  switch (intent) {
    case 'greeting':
      response = generateGreeting(lang);
      break;
    
    case 'help':
      response = generateHelp(lang);
      break;
    
    case 'minimum_wage':
      response = generateMinimumWageInfo(lang);
      break;
    
    case 'rights':
      response = generateRightsInfo(lang);
      break;
    
    case 'contact':
      response = generateContactInfo(lang);
      break;
    
    case 'thanks':
      response = generateThanks(lang);
      break;
    
    case 'violation_report':
      const violation = classifyViolation(message);
      if (violation) {
        response = generateViolationResponse(violation, lang);
        session.violationsReported.push({
          type: violation.id,
          timestamp: new Date().toISOString(),
          message: message
        });
      } else {
        // Can't classify - ask for more details
        if (lang === 'sw') {
          response = `🤔 *Sijaelewa vizuri tatizo lako.*\n\n`;
          response += `Tafadhali eleza zaidi:\n\n`;
          response += `• Unafanya kazi gani? (Kahawa, maua, mboga, nk)\n`;
          response += `• Unapata shida gani? (Mshahara, usalama, mkataba, nk)\n`;
          response += `• Uko wapi? (Kaunti gani)\n\n`;
          response += `mfano: "Nafanya kazi kwenye shamba la kahawa Nyeri. Nalipwa KES 200 tu kwa siku na sina mkataba."\n\n`;
          response += `Au andika "haki zangu" kujua haki zako.`;
        } else {
          response = `🤔 *I didn't understand your situation clearly.*\n\n`;
          response += `Please explain more:\n\n`;
          response += `• What work do you do? (Coffee, flowers, vegetables, etc.)\n`;
          response += `• What problem are you facing? (Wages, safety, contract, etc.)\n`;
          response += `• Where are you? (Which county)\n\n`;
          response += `Example: "I work on a coffee farm in Nyeri. I am paid only KES 200 per day and have no contract."\n\n`;
          response += `Or type "rights" to know your rights.`;
        }
      }
      break;
    
    default:
      response = lang === 'sw' 
        ? `Tafadhali eleza tatizo lako kwa undani.`
        : `Please describe your situation in detail.`;
  }
  
  // Update session
  userSessions.set(userPhone, session);
  
  return response;
}

// ============================================
// WHATSAPP BOT - Baileys Connection
// ============================================

const logger = pino({ level: 'silent' });

async function startBot() {
  console.log('🔑 Starting Haki Chatbot...');
  console.log('📱 Scan QR code with WhatsApp to connect');
  
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth_info'));
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ['Haki Chatbot', 'Safari', '1.0']
  });
  
  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);
  
  // Handle connection updates
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
if (qr) {
      console.log('\n');
      console.log('╔══════════════════════════════════════════════════════════╗');
      console.log('║           HAKI CHATBOT - WHATSAPP CONNECTION            ║');
      console.log('╚══════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('📱 STEP 1: Open WhatsApp on your phone');
      console.log('📱 STEP 2: Tap ⋮ (3 dots) → Linked Devices');
      console.log('📱 STEP 3: Tap "Link a Device"');
      console.log('📱 STEP 4: Scan the QR code below');
      console.log('');
      // Compact QR code for terminal
      qrcode.generate(qr, { small: true }, (qrCode) => {
        console.log(qrCode);
      });
      console.log('');
      console.log('💡 TIP: Make your terminal window NARROWER (about 60 chars wide)');
      console.log('💡 TIP: Or open qr-code.png in your file explorer');
      console.log('');
      // Save as PNG for easy scanning
      QRCode.toFile(path.join(__dirname, '..', 'qr-code.png'), qr, { width: 400, margin: 2 })
        .then(() => {
          console.log('📸 QR code saved to: ' + path.join(__dirname, '..', 'qr-code.png'));
          console.log('   → Open this file and scan with WhatsApp');
        })
        .catch(err => console.log('⚠️ Could not save QR image:', err.message));
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`❌ Connection closed. Status: ${statusCode}`);
      
      if (shouldReconnect) {
        console.log('🔄 Reconnecting...');
        startBot();
      } else {
        console.log('👋 Logged out. Please scan QR code again.');
        // Clear auth info and restart
        fs.rmSync(path.join(__dirname, '..', 'auth_info'), { recursive: true, force: true });
        startBot();
      }
    }
    
    if (connection === 'open') {
      botLive = true;
      console.log('✅ Haki Chatbot is LIVE!');
      console.log('💬 Waiting for messages...\n');
    }
  });
  
  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    for (const msg of messages) {
      // Skip own messages and status updates
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;
      
      const from = msg.key.remoteJid;
      const messageText = msg.message?.conversation || 
                         msg.message?.extendedTextMessage?.text || '';
      
      if (!messageText) continue;
      
      console.log(`📩 Message from ${from}: ${messageText}`);
      
      try {
        // Get user profile
        const user = conversationManager.getUser(from);
        const lang = detectLanguage(messageText);
        
        // Update last seen
        conversationManager.updateLastSeen(from);
        
        // Check if this is a new user (isNewUser flag)
        console.log(`🔍 Checking new user: conversationCount=${user.conversationCount}, isNewUser=${user.isNewUser}`);
        if (user.isNewUser === true) {
          // Mark as returning so next message doesn't get welcome
          console.log(`🎯 New user detected - sending welcome and marking as returning`);
          conversationManager.markAsReturning(from);
          const welcomeMsg = conversationManager.getWelcomeMessage(user, lang);
          await sock.sendMessage(from, { text: welcomeMsg });
          console.log(`✅ Welcome message sent to new user ${from}\n`);
          return; // Important: return early for new users
        }
        
        // ============================================
        // REASON FIRST, THEN ANSWER (ChatGPT-style)
        // ============================================
        // Classify violation for enhanced legal reasoning (RAG)
        const violation = classifyViolation(messageText);
        
        // Pass conversation history for context-aware multi-turn reasoning
        const history = conversationManager.getConversationHistory(from);
        
        // processMessage returns { reasoning, response, usedLLM }
        // USE THE LLM-GENERATED RESPONSE - this is the real AI output
        const { reasoning, response: llmResponse, usedLLM } = await llmEngine.processMessage(messageText, {
          language: lang,
          location: user.location,
          workType: user.workType,
          isNewUser: user.isNewUser,
          conversationCount: user.conversationCount,
          violation: violation ? {
            id: violation.id,
            description: violation.data.description,
            applicable_laws: violation.data.applicable_laws,
            remedy_pathways: violation.data.remedy_pathways
          } : null,
          history: history
        });
        
        // Store this exchange in conversation history for context
        conversationManager.addToHistory(from, 'user', messageText);
        conversationManager.addToHistory(from, 'assistant', llmResponse);
        
        // Update user context with latest intent for multi-turn awareness
        conversationManager.updateContext(from, {
          lastIntent: reasoning.intent,
          lastTopic: reasoning.topic,
          lastViolation: violation ? violation.id : null
        });
        
        // Send the AI-generated response (real intelligence, not static templates)
        await sock.sendMessage(from, { text: llmResponse });
        
        console.log(`✅ Response sent to ${from} (via ${usedLLM ? 'LLM' : 'fallback'})`);
        console.log(`   Intent: ${reasoning.intent} | Topic: ${reasoning.topic} | Urgency: ${reasoning.urgency}\n`);
      } catch (error) {
        console.error('❌ Error processing message:', error);
        
        await sock.sendMessage(from, { 
          text: conversationManager.getErrorMessage('en') 
        });
      }
    }
  });
  
  // Handle group messages (optional)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      
      // Check if message is in a group and mentions the bot
      const isGroup = msg.key.remoteJid.endsWith('@g.us');
      const mentionsMe = msg.message?.extendedTextMessage?.mentionedJid?.includes(sock.user?.id);
      
      if (isGroup && mentionsMe) {
        const from = msg.key.remoteJid;
        const messageText = msg.message?.extendedTextMessage?.text || 
                           msg.message?.conversation || '';
        
        // Remove bot mention from text
        const cleanText = messageText.replace(/@\d+/g, '').trim();
        
        if (cleanText) {
          console.log(`📩 Group message mentioning bot: ${cleanText}`);
          
          // Get user profile for conversational responses
          const user = conversationManager.getUser(from);
          const lang = detectLanguage(cleanText);
          
          // Detect intent and violation for conversational response
          const intent = detectIntent(cleanText);
          const violation = classifyViolation(cleanText);
          
          // Use conversational response function for more natural language
          let response;
          if (intent === 'greeting') {
            response = conversationManager.getConversationalGreeting(user, lang);
          } else {
            response = conversationManager.getConversationalResponse(intent, violation, user, lang);
          }
          
          await sock.sendMessage(from, { 
            text: response,
            mentions: [msg.key.participant || msg.key.remoteJid]
          });
        }
      }
    }
  });
}

// Start the bot
startBot().catch(err => {
  console.error('❌ Failed to start bot:', err);
  process.exit(1);
});


