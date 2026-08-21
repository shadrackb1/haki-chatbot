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
import VoiceHandler from './voice-handler.js';
import ImageHandler from './image-handler.js';

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

// Initialize voice handler (transcribes voice notes via Whisper)
const voiceHandler = new VoiceHandler();

// Initialize image handler (describes photos via Gemini vision)
const imageHandler = new ImageHandler();

console.log('🧠 AI Engine: ' + (llmEngine.isAvailable() ? `LLM-powered` : 'Rule-based (fallback)'));
console.log('🎤 Voice notes: ' + (voiceHandler.enabled ? voiceHandler.providerName : 'disabled'));
console.log('🖼️ Photos: ' + (imageHandler.enabled ? `vision via ${imageHandler.model}` : 'not detected (set GOOGLE_API_KEY to analyse)'));
console.log('💬 Conversation: Human-like with welcome flow');

function detectLanguage(text) {
   // Always return English for now - working with English first
   return 'en';
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

  // Handle incoming messages (single unified handler for DMs and groups)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Skip own messages and status updates
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const from = msg.key.remoteJid;
      const isGroup = from.endsWith('@g.us');
      const mentionsMe = msg.message?.extendedTextMessage?.mentionedJid?.includes(sock.user?.id);

      // In groups, only respond when explicitly mentioned
      if (isGroup && !mentionsMe) continue;

      let messageText = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption || '';

      // Photos → describe with vision model, then feed through the normal pipeline
      if (msg.message?.imageMessage) {
        if (!imageHandler.enabled) {
          if (!messageText) {
            await sock.sendMessage(from, { text: '🖼️ I can\'t analyse photos yet. Could you describe what\'s happening in your own words?' });
            continue;
          }
          // Caption present but no vision key: proceed with caption text alone
        } else {
          console.log(`🖼️ Photo from ${from} — analysing...`);
          const { description, error } = await imageHandler.processImageMessage(msg, sock);
          if (error || !description) {
            console.log(`⚠️ Photo analysis failed: ${error}`);
            await sock.sendMessage(from, { text: '😅 I couldn\'t make out that photo. Try sending it again or describe it in words.' });
            continue;
          }
          messageText = messageText
            ? `${messageText}\n\n[The user also sent a photo. ${description}]`
            : `[The user sent a photo. ${description}]`;
          console.log(`🖼️ Photo analysed: ${description.slice(0, 80)}...`);
        }
      }

      // Voice notes → transcribe via Whisper (if configured)
      if (!messageText && msg.message?.audioMessage) {
        if (!voiceHandler.enabled) {
          await sock.sendMessage(from, { text: '🎤 I can\'t process voice notes yet — mind typing it instead?' });
          continue;
        }
        console.log(`🎤 Voice note from ${from} — transcribing...`);
        const { text: transcript, error } = await voiceHandler.processVoiceMessage(msg, sock);
        if (error || !transcript) {
          console.log(`⚠️ Transcription failed: ${error}`);
          await sock.sendMessage(from, { text: '😅 Sorry, that audio didn\'t come through clearly on my side. Try once more, or just type it.' });
          continue;
        }
        messageText = transcript;
        console.log(`🎤 Transcribed: ${messageText}`);
      }

      if (!messageText) continue;

      // Strip the bot mention from group messages
      if (isGroup) {
        messageText = messageText.replace(/@\d+/g, '').trim();
        if (!messageText) continue;
      }

      console.log(`📩 Message from ${from}: ${messageText}`);

      try {
        // Get user profile
        const user = conversationManager.getUser(from);
        const lang = detectLanguage(messageText);

        // Update last seen
        conversationManager.updateLastSeen(from);

        // Welcome first-time users (DMs only — never in groups)
        if (!isGroup && user.isNewUser === true) {
          console.log(`🎯 New user detected - sending welcome and marking as returning`);
          conversationManager.markAsReturning(from);
          const welcomeMsg = conversationManager.getWelcomeMessage(user, lang);
          await sock.sendMessage(from, { text: welcomeMsg });
          console.log(`✅ Welcome message sent to new user ${from}\n`);
          continue;
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
}

// Start the bot
startBot().catch(err => {
  console.error('❌ Failed to start bot:', err);
  process.exit(1);
});
