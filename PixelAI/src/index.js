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
import Humanizer from './humanizer.js';
import SkillRegistry from './skill-registry.js';
import MessageRouter from './message-router.js';
import Agent from './agent.js';
import RateLimiter from './rate-limiter.js';
import Analytics from './analytics.js';
import { AdminCommands } from './admin-commands.js';
import MediaHandler from './media-handler.js';
import VoiceHandler from './voice-handler.js';
import LocationHandler from './location-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Health Check Server (for uptime monitoring) ──
let botLive = false;
let latestQr = null;
const HEALTH_PORT = process.env.HEALTH_PORT || 3002;
const healthServer = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(botLive ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: botLive ? 'ok' : 'starting', bot: 'PixelAI', uptime: process.uptime() }));
  } else if (req.url === '/qr.png') {
    // Raw QR image — scan straight from the browser
    if (!latestQr) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('QR not ready yet. Refresh in a few seconds.');
      return;
    }
    try {
      const png = await QRCode.toBuffer(latestQr, { width: 512, margin: 2 });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(png);
    } catch (e) {
      res.writeHead(500);
      res.end('QR render failed');
    }
  } else if (req.url === '/qr') {
    // Auto-refreshing page with a big scannable QR
    if (!latestQr) {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end('<meta http-equiv="refresh" content="3"><p style="font-family:sans-serif;font-size:20px;padding:40px">Waiting for QR from WhatsApp… this page refreshes itself.</p>');
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(latestQr, { width: 480, margin: 2 });
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end(`<!doctype html><html><head><title>PixelAI — Scan to connect</title>
<meta http-equiv="refresh" content="15">
<style>body{font-family:sans-serif;background:#111;color:#eee;text-align:center;padding-top:30px}
img{background:#fff;padding:16px;border-radius:12px}</style></head><body>
<h1>📱 PixelAI — WhatsApp QR</h1>
<p>WhatsApp → <b>Linked Devices</b> → <b>Link a Device</b> → scan below.<br>Page auto-refreshes every 15s (QR expires fast — scan the newest).</p>
<img src="${dataUrl}" alt="WhatsApp QR">
</body></html>`);
    } catch (e) {
      res.writeHead(500);
      res.end('QR render failed');
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});
healthServer.listen(HEALTH_PORT, () => console.log(`💓 Health check: http://localhost:${HEALTH_PORT}/health`));

// ============================================
// INITIALIZE ALL SYSTEMS
// ============================================

const analytics = new Analytics();
const rateLimiter = new RateLimiter();
const skillRegistry = new SkillRegistry();
await skillRegistry.loadSkills();

const llmEngine = new LLMReasoningEngine();
const humanizer = new Humanizer();
const conversationManager = new ConversationManager();
const mediaHandler = new MediaHandler({ dataDir: path.join(__dirname, '..', 'data', 'media'), maxFileSize: 10 * 1024 * 1024 });
const voiceHandler = new VoiceHandler();
const locationHandler = new LocationHandler();
const adminCommands = new AdminCommands({
    botOwnerNumber: process.env.BOT_OWNER_NUMBER,
    skillRegistry,
    analytics,
    conversationManager,
    rateLimiter
});
const messageRouter = new MessageRouter(skillRegistry, llmEngine, rateLimiter, analytics);
const agent = new Agent(llmEngine, skillRegistry);

console.log('🧠 Pixel AI: Intelligent Conversational Companion');
console.log('🤖 LLM Engine: ' + (llmEngine.isAvailable() ? `Active (${llmEngine.getModelInfo().provider} + failover)` : 'Not configured - using fallback'));
console.log('💾 Memory: Persistent conversation history + user learning');
console.log('📦 Skills loaded: ' + skillRegistry.getAllSkills().length);
console.log('🚀 Rate limiter: Active');
console.log('📊 Analytics: Active');
console.log('🔒 Admin commands: Ready');
console.log('🎨 Media handler: Ready');
console.log('🎙️ Voice handler: Ready');
console.log('📍 Location handler: Ready');

// ============================================
// MESSAGE QUEUE WITH CONCURRENCY CONTROL
// ============================================

class MessageQueue {
    constructor(options = {}) {
        this.concurrency = options.concurrency || 3;
        this.queue = [];
        this.running = 0;
        this.processing = false;
    }

    async enqueue(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.processing || this.running >= this.concurrency || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0 && this.running < this.concurrency) {
            const { task, resolve, reject } = this.queue.shift();
            this.running++;

            try {
                const result = await task();
                resolve(result);
            } catch (error) {
                reject(error);
            } finally {
                this.running--;
                if (this.queue.length > 0 && this.running < this.concurrency) {
                } else {
                    break;
                }
            }
        }

        this.processing = false;
    }

    getStats() {
        return {
            queueLength: this.queue.length,
            running: this.running,
            concurrency: this.concurrency
        };
    }
}

const messageQueue = new MessageQueue({ concurrency: 3 });

// ============================================
// GROUP SETTINGS MANAGEMENT
// ============================================

const GROUP_SETTINGS_FILE = path.join(__dirname, '..', 'data', 'group-settings.json');

function loadGroupSettings() {
    try {
        if (fs.existsSync(GROUP_SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(GROUP_SETTINGS_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Error loading group settings:', e);
    }
    return {};
}

function saveGroupSettings(settings) {
    try {
        fs.writeFileSync(GROUP_SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('Error saving group settings:', e);
    }
}

function isGroupEnabled(chatId) {
    // Groups are opt-in: the bot only replies when @mentioned until an admin
    // or the owner runs "pixel on" in that group.
    const settings = loadGroupSettings();
    return settings[chatId]?.enabled === true;
}

function setGroupEnabled(chatId, enabled) {
    const settings = loadGroupSettings();
    settings[chatId] = { ...settings[chatId], enabled };
    saveGroupSettings(settings);
}

function getGroupAdmins(chatId) {
    const settings = loadGroupSettings();
    return settings[chatId]?.admins || [];
}

function setGroupAdmins(chatId, admins) {
    const settings = loadGroupSettings();
    settings[chatId] = { ...settings[chatId], admins };
    saveGroupSettings(settings);
}

function isBotOwner(senderId) {
    const ownerNumber = process.env.BOT_OWNER_NUMBER || '254746053175';
    return senderId.includes(ownerNumber);
}

async function getGroupParticipants(sock, chatId) {
    try {
        const metadata = await sock.groupMetadata(chatId);
        return metadata.participants || [];
    } catch (e) {
        return [];
    }
}

function isGroupAdmin(senderId, participants) {
    const participant = participants.find(p => p.id === senderId);
    return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
}

// ============================================
// HELPER: Extract message body from various types
// ============================================

function getMessageBody(msg) {
    const m = msg.message;
    if (!m) return { type: 'unknown', text: '', raw: null };

    if (m.conversation) {
        return { type: 'text', text: m.conversation, raw: m.conversation };
    }
    if (m.extendedTextMessage) {
        return { type: 'text', text: m.extendedTextMessage.text || '', raw: m.extendedTextMessage };
    }
    if (m.imageMessage) {
        return { type: 'image', text: m.imageMessage.caption || '', raw: m.imageMessage };
    }
    if (m.videoMessage) {
        return { type: 'video', text: m.videoMessage.caption || '', raw: m.videoMessage };
    }
    if (m.audioMessage) {
        return { type: 'voice', text: '', raw: m.audioMessage };
    }
    if (m.documentMessage) {
        return { type: 'document', text: m.documentMessage.fileName || '', raw: m.documentMessage };
    }
    if (m.locationMessage) {
        return { type: 'location', text: m.locationMessage.name || '', raw: m.locationMessage };
    }
    if (m.contactMessage) {
        return { type: 'contact', text: m.contactMessage.displayName || '', raw: m.contactMessage };
    }
    if (m.stickerMessage) {
        return { type: 'sticker', text: '', raw: m.stickerMessage };
    }

    return { type: 'unknown', text: '', raw: null };
}

// ============================================
// WHATSAPP BOT - Baileys Connection
// ============================================

const logger = pino({ level: 'silent' });

async function startBot() {
    console.log('🔑 Starting Pixel AI...');
    console.log('📱 Scan QR code with WhatsApp to connect');

    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth_info'));
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger,
        browser: ['Pixel AI', 'Chrome', '1.0']
    });

    sock.ev.on('creds.update', saveCreds);

    // Store bot's own JID
    let botJid = null;
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQr = qr;
            console.log('\n');
            console.log('════════════════════════════════════════════');
            console.log('  SCAN THIS QR: WhatsApp → Linked Devices');
            console.log('════════════════════════════════════════════');
            try {
                qrcode.generate(qr, { small: true }, (qrCode) => {
                    console.log(qrCode);
                });
            } catch (e) {
                console.log('(QR could not render in this terminal)');
            }
            console.log(`Can't see it? Open http://localhost:${HEALTH_PORT}/qr or qr-code.png`);
            QRCode.toFile(path.join(__dirname, '..', 'qr-code.png'), qr, { width: 400, margin: 2 })
                .catch(() => {});
        }

        if (connection === 'open') {
            botLive = true;
            botJid = sock.user?.id;
            console.log('✅ Pixel AI is LIVE!');
            console.log('🤖 Bot JID:', botJid);
            console.log('💬 Ready for intelligent conversation...\n');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`❌ Connection closed. Status: ${statusCode}`);

            if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                setTimeout(startBot, 3000);
            } else {
                console.log('👋 Logged out. Scan QR again.');
                fs.rmSync(path.join(__dirname, '..', 'auth_info'), { recursive: true, force: true });
                setTimeout(startBot, 3000);
            }
        }
    });

    // ============================================
    // HELPER: Check if bot is mentioned in message
    // ============================================
    function isBotMentioned(msg, botJid) {
        if (!botJid) return false;

        const botNumber = botJid.split('@')[0];

        const mentionedJids = msg.message?.extendedTextMessage?.mentionedJid;
        if (mentionedJids && Array.isArray(mentionedJids)) {
            for (const jid of mentionedJids) {
                if (jid === botJid || jid.includes(botNumber)) {
                    return true;
                }
            }
        }

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        if (text && text.includes('@')) {
            const botName = 'pixel ai';
            const lowerText = text.toLowerCase();
            if (lowerText.includes(`@${botNumber}`) ||
                lowerText.includes('@pixel') ||
                lowerText.includes('@pixelai') ||
                lowerText.includes('@' + botName.replace(' ', ''))) {
                return true;
            }
        }

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (contextInfo?.mentionedJid) {
            for (const jid of contextInfo.mentionedJid) {
                if (jid === botJid || jid.includes(botNumber)) {
                    return true;
                }
            }
        }

        return false;
    }

    // ============================================
    // HANDLE PIXEL COMMAND (toggle bot in group)
    // ============================================
    async function handlePixelCommand(sock, msg, chatId, senderId, cleanText) {
        if (!chatId.endsWith('@g.us')) return false;

        const lowerText = cleanText.toLowerCase().trim();

        const isPixelCommand = lowerText === 'pixel' ||
                               lowerText === '/pixel' ||
                               lowerText === '!pixel' ||
                               lowerText.startsWith('pixel ') ||
                               lowerText.startsWith('/pixel ') ||
                               lowerText.startsWith('!pixel ');

        if (!isPixelCommand) return false;

        try {
            const participants = await getGroupParticipants(sock, chatId);
            const isAdmin = isGroupAdmin(senderId, participants);
            const owner = isBotOwner(senderId);

            if (!isAdmin && !owner) {
                await sock.sendMessage(chatId, {
                    text: "❌ Only group admins or the bot owner can use this command."
                });
                return true;
            }

            const parts = lowerText.split(' ');
            const subcommand = parts[1] || 'toggle';

            const currentlyEnabled = isGroupEnabled(chatId);

            if (subcommand === 'on' || subcommand === 'enable' || subcommand === 'start') {
                if (currentlyEnabled) {
                    await sock.sendMessage(chatId, {
                        text: "✅ Pixel AI is already enabled in this group."
                    });
                } else {
                    setGroupEnabled(chatId, true);
                    await sock.sendMessage(chatId, {
                        text: "✅ Pixel AI enabled! I'll now respond to messages in this group."
                    });
                }
            } else if (subcommand === 'off' || subcommand === 'disable' || subcommand === 'stop') {
                if (!currentlyEnabled) {
                    await sock.sendMessage(chatId, {
                        text: "⏸️ Pixel AI is already disabled in this group."
                    });
                } else {
                    setGroupEnabled(chatId, false);
                    await sock.sendMessage(chatId, {
                        text: "⏸️ Pixel AI disabled. I'll stop responding in this group. Use 'pixel on' to re-enable."
                    });
                }
            } else if (subcommand === 'status') {
                await sock.sendMessage(chatId, {
                    text: currentlyEnabled
                        ? "✅ Pixel AI is **enabled** in this group."
                        : "⏸️ Pixel AI is **disabled** in this group. Use 'pixel on' to enable."
                });
            } else {
                const newState = !currentlyEnabled;
                setGroupEnabled(chatId, newState);
                await sock.sendMessage(chatId, {
                    text: newState
                        ? "✅ Pixel AI enabled! I'll now respond to messages in this group."
                        : "⏸️ Pixel AI disabled. I'll stop responding in this group. Use 'pixel on' to re-enable."
                });
            }
        } catch (error) {
            console.error('Pixel command error:', error);
        }

        return true;
    }

    // ============================================
    // UNIFIED MESSAGE HANDLER - Handles DM, Group, Media
    // ============================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            const senderId = msg.key.participant || msg.key.remoteJid;
            if (msg.key.fromMe && !isBotOwner(senderId)) continue;
            if (msg.key.remoteJid === 'status@broadcast') continue;

            const chatId = msg.key.remoteJid;
            const isGroup = chatId.endsWith('@g.us');

            const senderName = msg.pushName || 'friend';

            // Parse message body (text, image, voice, location, etc.)
            const body = getMessageBody(msg);
            const messageText = body.text;

            // Rate limit check
            const rateLimitResult = await rateLimiter.checkLimit(senderId);
            if (!rateLimitResult.allowed) {
                console.log(`⏱️ Rate limited: ${senderId} (${rateLimitResult.retryAfter}s cooldown)`);
                await sock.sendMessage(chatId, {
                    text: `⏱️ Slow down! Try again in ${rateLimitResult.retryAfter} seconds.`
                });
                continue;
            }

            // Check if bot should respond
            const mentionsMe = isBotMentioned(msg, botJid);
            const isDirectMessage = !isGroup;

            // Check for pixel command (GROUPS ONLY) — only for text
            if (body.type === 'text' || body.type === 'unknown') {
                const isPixelCmd = isGroup && await handlePixelCommand(sock, msg, chatId, senderId, messageText || '');
                if (isPixelCmd) continue;
            }

            // Admin command check: starts with ! or /
            const isAdminCmd = (body.type === 'text' || body.type === 'unknown') &&
                               messageText && /^[!/]/.test(messageText.trim());
            if (isAdminCmd) {
                try {
                    const cmdParts = messageText.trim().split(/\s+/);
                    const cmd = cmdParts[0];
                    const cmdArgs = cmdParts.slice(1);
                    const adminResult = await adminCommands.handleCommand(cmd, cmdArgs, senderId, sock, chatId);
                    if (adminResult) {
                        analytics.trackMessage(senderId, 'incoming', { chatId, command: messageText.trim() });
                        continue;
                    }
                } catch (error) {
                    console.error('❌ Admin command error:', error);
                }
            }

            // For groups: check if enabled
            if (isGroup && !isGroupEnabled(chatId)) {
                continue;
            }

            // Determine if we should respond
            const shouldRespond = isDirectMessage || (isGroup && (mentionsMe || isGroupEnabled(chatId)));

            if (!shouldRespond) {
                if (isGroup) {
                    console.log(`   ❌ GROUP IGNORED - disabled or no mention`);
                } else {
                    console.log(`   ❌ DM IGNORED - should not happen!`);
                }
                continue;
            }

            // DEBUG LOG
            console.log(`📥 ${isGroup ? 'GROUP' : 'DM'} received:`, {
                chatId,
                senderId,
                isGroup,
                isDirectMessage,
                mentionsMe,
                groupEnabled: isGroupEnabled(chatId),
                msgType: body.type,
                text: (messageText || '').substring(0, 50)
            });

            // Build processing context
            const chatContext = {
                chatId,
                isGroup,
                senderId,
                senderName,
                phoneNumber: senderId.replace(/@s\.whatsapp\.net$/, '').replace(/:.*/, ''),
                participant: isGroup ? senderId : null,
                msgType: body.type
            };

            try {
                // Ensure conversation exists
                const chat = conversationManager.getChat(chatId, { isGroup, senderId, senderName });
                if (chat.isNewChat) {
                    conversationManager.markAsReturning(chatId, { isGroup, senderId });
                }
                conversationManager.updateLastSeen(chatId, { isGroup, senderId });

                let responseText = null;
                let responseBuffer = null;
                let responseMimeType = null;
                let responseFileName = null;

                // ---- IMAGE MESSAGE HANDLING ----
                if (body.type === 'image') {
                    console.log(`🖼️ Image message from ${senderId} in ${chatId}`);
                    try {
                        const downloaded = await mediaHandler.downloadMedia(msg, sock);
                        if (downloaded && downloaded.buffer) {
                            const imageSkill = skillRegistry.getSkillByName('image-analysis');
                            if (imageSkill && imageSkill.isAvailable()) {
                                const ctx = { ...chatContext, imageBuffer: downloaded.buffer, caption: messageText };
                                const result = await imageSkill.execute(messageText || 'describe this image', ctx);
                                responseText = result?.response || result?.text || null;
                            } else {
                                responseText = "Image analysis isn't available yet. Add OPENAI_API_KEY or GEMINI_API_KEY to enable it.";
                            }
                        } else {
                            responseText = "I couldn't download that image. Mind sending it again?";
                        }
                    } catch (err) {
                        console.error('❌ Image processing error:', err);
                        responseText = "I had trouble processing that image.";
                    }
                }

                // ---- VOICE MESSAGE HANDLING ----
                else if (body.type === 'voice') {
                    console.log(`🎙️ Voice message from ${senderId} in ${chatId}`);
                    try {
                        const downloaded = await mediaHandler.downloadMedia(msg, sock);
                        if (downloaded && downloaded.buffer) {
                            const voiceSkill = skillRegistry.getSkillByName('voice-transcribe');
                            if (voiceSkill && voiceSkill.isAvailable()) {
                                const ctx = { ...chatContext, audioBuffer: downloaded.buffer };
                                const result = await voiceSkill.execute('', ctx);
                                responseText = result?.response || result?.text || "I couldn't understand that voice message.";
                            } else {
                                responseText = "Voice transcription isn't available yet. Add OPENAI_API_KEY or GROQ_API_KEY to enable it.";
                            }
                        } else {
                            responseText = "I couldn't download that voice message.";
                        }
                    } catch (err) {
                        console.error('❌ Voice processing error:', err);
                        responseText = "I had trouble processing that voice message.";
                    }
                }

                // ---- LOCATION MESSAGE HANDLING ----
                else if (body.type === 'location') {
                    console.log(`📍 Location message from ${senderId} in ${chatId}`);
                    const locationData = body.raw;
                    try {
                        const locSkill = skillRegistry.getSkillByName('location');
                        if (locSkill) {
                            const ctx = {
                                ...chatContext,
                                location: {
                                    lat: locationData?.degreesLatitude,
                                    lng: locationData?.degreesLongitude,
                                    latitude: locationData?.degreesLatitude,
                                    longitude: locationData?.degreesLongitude,
                                    name: locationData?.name || ''
                                }
                            };
                            const result = await locSkill.execute('nearby places', ctx);
                            responseText = result?.response || result?.text || null;
                        } else {
                            responseText = "Location skill isn't loaded.";
                        }
                    } catch (err) {
                        console.error('❌ Location processing error:', err);
                        responseText = "I had trouble processing that location.";
                    }
                }

                // ---- DOCUMENT MESSAGE HANDLING ----
                else if (body.type === 'document') {
                    console.log(`📄 Document message from ${senderId} in ${chatId}`);
                    try {
                        const downloaded = await mediaHandler.downloadMedia(msg, sock);
                        if (downloaded && downloaded.buffer) {
                            const fileName = body.raw?.fileName || downloaded.originalFileName || downloaded.fileName || 'unknown-document';
                            const kbDir = path.join(__dirname, '..', 'data', 'knowledge-base');
                            if (!fs.existsSync(kbDir)) fs.mkdirSync(kbDir, { recursive: true });
                            const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
                            const filePath = path.join(kbDir, `${Date.now()}_${safeName}`);
                            fs.writeFileSync(filePath, downloaded.buffer);
                            responseText = `📄 Document "${fileName}" saved to knowledge base! I can reference it in future conversations.`;
                            analytics.trackMessage(senderId, 'incoming', { chatId, type: 'document', fileName });
                        } else {
                            responseText = "I couldn't download that document.";
                        }
                    } catch (err) {
                        console.error('❌ Document processing error:', err);
                        responseText = "I had trouble saving that document.";
                    }
                }

                // ---- VIDEO MESSAGE HANDLING ----
                else if (body.type === 'video') {
                    console.log(`🎬 Video message from ${senderId} in ${chatId}`);
                    responseText = "I received the video. I can't fully analyze video yet, but I'm working on it!";
                }

                // ---- STICKER / CONTACT / UNKNOWN → text fallback ----
                else if (body.type === 'sticker' || body.type === 'contact') {
                    // Non-text media with no handler — politely skip
                    continue;
                }

                // ---- TEXT MESSAGE HANDLING (primary path) ----
                else {
                    let cleanText = messageText;
                    if (isGroup) {
                        cleanText = cleanText.replace(/@\d+/g, '').trim();
                    }
                    if (!cleanText) continue;

                    const triggerType = isDirectMessage ? 'DM' : (mentionsMe ? 'MENTION' : 'GROUP');
                    console.log(`📩 ${triggerType} [${chatId}] from ${senderId}: ${cleanText}`);

                    // Agent first (tool-grounded, anti-hallucination); router as fallback
                    try {
                        if (agent.isAvailable()) {
                            const agentResult = await agent.run(cleanText, chatContext);
                            responseText = agentResult?.response || null;
                            if (agentResult?.file?.buffer) {
                                responseBuffer = agentResult.file.buffer;
                                responseMimeType = agentResult.file.mimetype || 'application/pdf';
                                responseFileName = agentResult.file.fileName || 'document.pdf';
                            }
                            if (agentResult?.metadata?.toolsUsed?.length) {
                                console.log(`🛠️ tools used: ${agentResult.metadata.toolsUsed.join(' → ')}`);
                            }
                        } else {
                            throw new Error('agent unavailable');
                        }
                    } catch (agentErr) {
                        console.log('↪️ falling back to router:', agentErr.message);
                        try {
                            const routeResult = await messageRouter.route(cleanText, chatContext);
                            responseText = routeResult?.text || routeResult?.response || null;
                            if (routeResult?.file?.buffer) {
                                responseBuffer = routeResult.file.buffer;
                                responseMimeType = routeResult.file.mimetype || 'application/pdf';
                                responseFileName = routeResult.file.fileName || 'document.pdf';
                            }
                        } catch (routeErr) {
                        console.error('⚠️ Router failed, falling back to LLM:', routeErr.message);
                        // Fallback to original LLM path
                        const userContext = conversationManager.getChatContext(chatId, {
                            isGroup,
                            senderId,
                            senderName,
                            participant: isGroup ? senderId : null
                        });
                        const { reasoning, response, usedLLM } = await llmEngine.processMessage(cleanText, userContext);

                        conversationManager.updateChatContext(chatId, {
                            lastIntent: reasoning.intent,
                            lastTopics: reasoning.topics,
                            lastReasoning: reasoning
                        }, { isGroup, senderId });

                        await conversationManager.learnFromConversation(chatId, reasoning, { isGroup, senderId });

                        const chatType = isGroup ? `GROUP:${chatId}` : `DM:${chatId}`;
                        console.log(`🧠 [${chatType}] ${reasoning.intent} | ${reasoning.topics.join(', ')} | ${reasoning.suggestedApproach} | ${usedLLM ? 'LLM' : 'fallback'}`);
                        if (reasoning.topicShift) console.log(`🔄 [${chatType}] Topic shift detected`);
                        if (reasoning.connectionsToMake.length) console.log(`🔗 [${chatType}] Connections:`, reasoning.connectionsToMake.join(', '));

                        responseText = response;
                        }
                    }
                }

                // ---- SEND RESPONSE ----
                if (responseText) {
                    const humanizedResponse = humanizer.humanize(responseText);

                    const sendOptions = { text: humanizedResponse };
                    if (isGroup) {
                        sendOptions.mentions = [senderId];
                    }

                    await sock.sendMessage(chatId, sendOptions);
                    console.log(`✅ Sent text (${humanizedResponse.length} chars) to ${chatId}\n`);
                }

                // If the route returned a media buffer (image / video / document), send it
                if (responseBuffer) {
                    let mediaPayload;
                    if (responseMimeType.startsWith('image')) {
                        mediaPayload = { image: responseBuffer };
                    } else if (responseMimeType.startsWith('video')) {
                        mediaPayload = { video: responseBuffer };
                    } else {
                        mediaPayload = {
                            document: responseBuffer,
                            mimetype: responseMimeType,
                            fileName: responseFileName
                        };
                    }
                    if (isGroup) {
                        mediaPayload.mentions = [senderId];
                    }
                    await sock.sendMessage(chatId, mediaPayload);
                    console.log(`✅ Sent media (${responseMimeType}) to ${chatId}\n`);
                }

                // Record analytics
                analytics.trackMessage(senderId, 'outgoing', {
                    chatId,
                    isGroup,
                    msgType: body.type,
                    responded: !!responseText || !!responseBuffer
                });

            } catch (error) {
                console.error('❌ Error:', error);

                await sock.sendMessage(chatId, {
                    text: "Something went wrong on my end. Mind trying that again?"
                });

                analytics.trackError('message_handler', error.message, {
                    chatId,
                    senderId
                });
            }
        }
    });
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

function gracefulShutdown(signal) {
    console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);

    try {
        analytics.save();
        console.log('📊 Analytics saved.');
    } catch (e) {
        console.error('⚠️ Failed to save analytics:', e.message);
    }

    try {
        const mediaDir = path.join(__dirname, '..', 'data', 'media');
        if (fs.existsSync(mediaDir)) {
            const files = fs.readdirSync(mediaDir);
            let cleaned = 0;
            for (const file of files) {
                const filePath = path.join(mediaDir, file);
                const stat = fs.statSync(filePath);
                // Clean files older than 1 hour
                if (Date.now() - stat.mtimeMs > 3600000) {
                    fs.unlinkSync(filePath);
                    cleaned++;
                }
            }
            if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} old media files.`);
        }
    } catch (e) {
        console.error('⚠️ Media cleanup error:', e.message);
    }

    console.log('👋 Pixel AI shutting down.');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start
startBot().catch(err => {
    console.error('❌ Failed to start:', err);
    process.exit(1);
});




