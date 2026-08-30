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
import { toWhatsApp } from './whatsapp-format.js';
import { buildRetriever } from './knowledge-retriever.js';
import EmbeddingEngine from './embedding-engine.js';
import TranslationEngine from './translation-engine.js';
import GrievancePipeline from './grievance-pipeline.js';
import UserDatabase from './user-db.js';
import RegistrationFlow from './registration-flow.js';
import SessionManager from './session-manager.js';
import Monitor from './monitor.js';
import AutonomyEngine, { ORIGINS } from './autonomy-engine.js';
import { acquireLock, releaseLock } from './instance-lock.js';
import EmpathyEngine from './empathy-engine.js';
import IQEngine from './iq-engine.js';
import CrisisSupport from './crisis-support.js';
import LanguageLibrary from './language-library.js';
import { createSmsGateway } from './sms-gateway.js';
import SmsHandler from './sms-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 健康检查服务器（用于运行状态监控 + SMS 模拟器控制台）──
let botLive = false;
let smsGateway = null;
const HEALTH_PORT = process.env.HEALTH_PORT || 3001;
const healthServer = http.createServer((req, res) => {
  const respond = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(body);
  };

  if (req.url === '/health') {
    respond(botLive ? 200 : 503, JSON.stringify({ status: botLive ? 'ok' : 'starting', bot: 'Haki-Agri-Shield', uptime: process.uptime() }));
  } else if (req.url === '/sms' || req.url === '/sms/') {
    const gateway = smsGateway;
    // POST → inject an inbound SMS from any number into the simulator.
    if (req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => { raw += c; if (raw.length > 4096) req.destroy(); });
      req.on('end', () => {
        try {
          const input = JSON.parse(raw);
          if (!gateway || gateway.kind !== 'simulator') {
            respond(400, JSON.stringify({ ok: false, error: `no simulator gateway (active: ${gateway ? gateway.kind : 'none'})` }));
            return;
          }
          const message = gateway.inject({ from: input.from, text: input.text });
          respond(200, JSON.stringify({ ok: true, message }));
        } catch (e) {
          respond(400, JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
    // GET → lightweight in-memory SMS console (full dashboard arrives in Phase 4).
    const outbox = gateway && gateway.outbox ? [...gateway.outbox].reverse().slice(0, 20).map(m => `<li><b>→ ${m.to}</b>: ${m.text}</li>`).join('') : '<li>(none)</li>';
    const inbox = gateway && gateway.inbound ? [...gateway.inbound].reverse().slice(0, 20).map(m => `<li><b>← ${m.from}</b>: ${m.text}</li>`).join('') : '<li>(none)</li>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>SMS Simulator — Haki</title></head>
<body style="font-family:monospace"><h1>📱 SMS Simulator (${gateway ? gateway.kind : 'unstarted'})</h1>
<form method="POST" action="/sms"><label>From:</label><input name="from" value="+254700000001"><br>
<label>Text:</label><textarea name="text" rows="3" cols="60"></textarea><br><button>Send SMS</button></form>
<h2>Inbound</h2><ul>${inbox}</ul><h2>Outbox</h2><ul>${outbox}</ul></body></html>`);
  } else {
    respond(404, '未找到');
  }
});
healthServer.on('error', (err) => {
  console.log(`⚠️ 健康检查服务器不可用（${err.code}）— 主服务继续运行`);
});
healthServer.listen(HEALTH_PORT, () => console.log(`💓 健康检查: http://localhost:${HEALTH_PORT}/health`));

// ============================================
// HAKI 聊天机器人 — AI 引擎
// ============================================

// 初始化对话管理器（让机器人更像真人）
const conversationManager = new ConversationManager();

// 初始化 LLM 推理引擎（提供智能）
const llmEngine = new LLMReasoningEngine();

// 初始化语音处理器（通过 Whisper 转录语音留言）
const voiceHandler = new VoiceHandler();

// 初始化图像处理器（通过 Gemini 视觉描述照片）
const imageHandler = new ImageHandler();

// 初始化法律语料检索器（基于法规条文的 BM25 检索）
const retriever = buildRetriever(path.join(__dirname, '..', 'data', 'legal-corpus.json'));

// ── 注册/登录/会话/仪表盘/自主化升级模块 ──
const userDb = new UserDatabase();
const sessions = new SessionManager();
const monitor = new Monitor({ port: process.env.MONITOR_PORT || 3002 });
monitor.attachSource('userDb', userDb);
monitor.attachSource('sessions', sessions);
monitor.start();

const autonomy = new AutonomyEngine();
autonomy.start(60 * 1000);

const registration = new RegistrationFlow(userDb, {
  onComplete: (user) => {
    monitor.push('registration', { phone: user.phone, status: 'COMPLETE' });
    monitor.pushCredentials(user);
    autonomy.setSubscribers(userDb.listRegistered().map(u => u.phone));
  }
});

// ── 情感支持 / 危机路由 / 多语言引擎（2026 全量升级）──
const empathy = new EmpathyEngine();
const iq = new IQEngine();
const crisisSupport = new CrisisSupport();
const langLib = new LanguageLibrary();

// ── 资源最大化：语义检索向量引擎 + Gemini 翻译引擎 ──
const embedder = new EmbeddingEngine();
const translation = new TranslationEngine();

// ── 共享受理管线（WhatsApp + SMS 同一套核心）──
const pipeline = new GrievancePipeline({ llmEngine, retriever, embedder, empathy, iq, crisisSupport, langLib, translation });

// ── SMS 入口：复用共享管线，按 MSISDN 建档（模拟器 / TextBee / Gammu）──
smsGateway = createSmsGateway();
const smsHandler = new SmsHandler({ pipeline, gateway: smsGateway, conversationManager, monitor });
smsHandler.start();
console.log(`📱 SMS channel: ${smsGateway.kind} (${smsGateway.kind === 'simulator' ? 'https://localhost:' + HEALTH_PORT + '/sms console' : 'shortcode 22141'})`);

// 自主分发 → 无需用户触发，直接通过 WhatsApp 发出
autonomy.onDispatch((phone, text, origin) => {
  if (sockRef) {
    sockRef.sendMessage(phone, { text }).catch(e => console.log(`⚠️ 自主分发失败: ${e.message}`));
    monitor.push('autonomous-notification', { phone, origin }, origin);
  }
});

let sockRef = null;
let keepaliveInterval = null;

console.log('🗂️ 法律语料库: ' + retriever.corpus.length + ' 条条文已完成索引');

console.log('🧠 AI Engine: ' + (llmEngine.isAvailable() ? `unlocked (${llmEngine.getActiveProviders().map(p => p.key).join(', ')}) — routing: ${llmEngine.getRouterSnapshot().mode}` : '规则引擎（兜底）'));
console.log('🎤 Voice notes: ' + (voiceHandler.enabled ? voiceHandler.providerName : '未启用'));
console.log('🖼️ Photos: ' + (imageHandler.enabled ? `视觉模型: ${imageHandler.model}` : '未检测到（设置 GOOGLE_API_KEY 后可分析图片）'));
console.log('🎬 Video clips: ' + (imageHandler.enabled ? `分析引擎: ${imageHandler.model}` : 'disabled'));
console.log('🌍 Translation: ' + (translation.enabled ? `Gemini bidirectional (${translation.languageName('sw')} · ${translation.languageName('fr')} · ${translation.languageName('ki')} + 20 more)` : 'disabled (set GOOGLE_API_KEY)'));
console.log('🧲 Semantic RAG: ' + (embedder.isAvailable() ? embedder.enabled().map(p => `${p.name} [${p.model}]`).join(' + ') : 'BM25 only'));
console.log('💬 对话风格：拟人化并带欢迎流程');
console.log('💛 Emotional support: ' + (crisisSupport.crisisOrganizations().length > 0 ? `${crisisSupport.crisisOrganizations().length} support lines loaded` : 'disabled'));

// Real multilingual detection via LanguageLibrary (Swahili + local languages)
function detectLanguage(text) {
  const r = langLib.detectLanguage(text);
  return r.language || r.detected || 'en';
}

// ============================================
// WHATSAPP 机器人 — Baileys 连接
// ============================================

const logger = pino({ level: 'silent' });

async function startBot() {
  console.log('🔑 正在启动 Haki 农业护盾（Haki Agri-Shield）…');
  console.log('📱 请用 WhatsApp 扫描二维码连接');

  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth_info'));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ['Haki Agri-Shield', 'Safari', '1.0']
  });

  // 凭证更新时保存
  sock.ev.on('creds.update', saveCreds);

  // 处理连接状态更新
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n');
      console.log('╔══════════════════════════════════════════════════════════╗');
      console.log('║           HAKI 聊天机器人 - WHATSAPP 连接                ║');
      console.log('╚══════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('📱 第 1 步：在手机上打开 WhatsApp');
      console.log('📱 第 2 步：点击 ⋮（三个点）→ 关联设备');
      console.log('📱 第 3 步：点击“关联设备”');
      console.log('📱 第 4 步：扫描下方二维码');
      console.log('');
      // 终端紧凑型二维码（无回调 — 直接写入标准输出）
      try {
        qrcode.generate(qr, { small: true });
      } catch (e) {
        console.log('⚠️ 终端二维码渲染失败，原始数据:');
        console.log(qr);
      }
      console.log('');
      console.log('💡 提示：把终端窗口调窄一些（约 60 字符宽）');
      console.log('💡 提示：或在文件管理器中打开 qr-code.png');
      console.log('');
      // 另存为 PNG 方便扫描
      QRCode.toFile(path.join(__dirname, '..', 'qr-code.png'), qr, { width: 400, margin: 2 })
        .then(() => {
          console.log('📸 二维码已保存至: ' + path.join(__dirname, '..', 'qr-code.png'));
          console.log('   → 打开该文件并用 WhatsApp 扫描');
        })
        .catch(err => console.log('⚠️ 无法保存二维码图片:', err.message));
    }

    if (connection === 'close') {
      if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      // 440 = 连接被替换：另一个实例用同一会话登录，抢走了连接。
      // 此时重连只会引发 440 死循环 — 必须退出。
      if (statusCode === DisconnectReason.connectionReplaced) {
        console.log('🚫 检测到连接被替换 (440)：另一个机器人实例正在使用同一 WhatsApp 会话。');
        console.log('   请确保只运行一个实例（node src/index.js）。本实例即将退出。');
        releaseLock();
        process.exit(1);
      }

      console.log(`❌ 连接已关闭。状态码: ${statusCode}`);

      if (shouldReconnect) {
        console.log('🔄 正在重新连接…');
        startBot();
      } else {
        console.log('👋 已退出登录。请重新扫描二维码。');
        // 清除认证信息并重启
        fs.rmSync(path.join(__dirname, '..', 'auth_info'), { recursive: true, force: true });
        startBot();
      }
    }

    if (connection === 'open') {
      botLive = true;
      sockRef = sock;
      autonomy.setSubscribers(userDb.listRegistered().map(u => u.phone));
      console.log('✅ Haki Agri-Shield online! (workplace rights)');
      console.log('💬 Waiting for messages…\n');

      // Keepalive: ping WhatsApp every 30s to prevent WebSocket timeout
      // when the terminal is minimised or the OS deprioritises the event loop.
      if (keepaliveInterval) clearInterval(keepaliveInterval);
      keepaliveInterval = setInterval(() => {
        try {
          if (sock?.ws?.readyState === 1) {
            sock.ws.ping();
          }
        } catch {}
      }, 30_000);
      if (keepaliveInterval?.unref) keepaliveInterval.unref();
    }
  });

  // 处理收到的消息（私信与群组统一处理器）
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // 跳过自己发送的消息和状态更新
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const from = msg.key.remoteJid;
      const isGroup = from.endsWith('@g.us');
      const mentionsMe = msg.message?.extendedTextMessage?.mentionedJid?.includes(sock.user?.id);

      // 群聊中仅在被@提及时响应
      if (isGroup && !mentionsMe) continue;

      let messageText = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption || '';

      try {
      // 照片 → 用视觉模型描述后进入正常处理管线
      if (msg.message?.imageMessage) {
        if (!imageHandler.enabled) {
          if (!messageText) {
            await sock.sendMessage(from, { text: '🖼️ I can\'t see photos yet. Could you describe what happened in your own words?' });
            continue;
          }
          // 有图注但无视觉密钥：仅用图注文字继续
        } else {
          console.log(`🖼️ 来自 ${from} 的照片 — 分析中…`);
          const { description, error } = await imageHandler.processImageMessage(msg, sock);
          if (error || !description) {
            console.log(`⚠️ 照片分析失败: ${error}`);
            await sock.sendMessage(from, { text: '😅 I couldn\'t quite make out that photo. Try sending it again, or just describe it in text.' });
            continue;
          }
          messageText = messageText
            ? `${messageText}\n\n[The user also sent a photo. ${description}]`
            : `[用户发来一张照片。${description}]`;
          console.log(`🖼️ 照片分析完成: ${description.slice(0, 80)}…`);
        }
      }

      // 视频 → Gemini 观看事故/违规片段（支持 ffmpeg 帧抽帧兜底）
      if (!messageText && msg.message?.videoMessage) {
        if (!imageHandler.enabled) {
          await sock.sendMessage(from, { text: '🎬 I can\'t watch videos yet. Could you describe what happened in your own words?' });
          continue;
        }
        console.log(`🎬 来自 ${from} 的视频 — 分析中…`);
        const { description, error } = await imageHandler.processVideoMessage(msg, sock);
        if (error || !description) {
          console.log(`⚠️ 视频分析失败: ${error}`);
          await sock.sendMessage(from, { text: '😅 I couldn\'t make out that clip. Try again, or describe it in text.' });
          continue;
        }
        messageText = `[The user sent a video clip. ${description}]`;
        console.log(`🎬 视频分析完成: ${description.slice(0, 80)}…`);
      }

      // 语音留言 → 通过 Whisper/Gemini 转录（如已配置）
      if (!messageText && msg.message?.audioMessage) {
        if (!voiceHandler.enabled) {
          await sock.sendMessage(from, { text: '🎤 I can\'t process voice messages yet — could you type instead?' });
          continue;
        }
        console.log(`🎤 来自 ${from} 的语音 — 转录中…`);
        const { text: transcript, error } = await voiceHandler.processVoiceMessage(msg, sock);
        if (error || !transcript) {
          console.log(`⚠️ 转录失败: ${error}`);
          await sock.sendMessage(from, { text: '😅 Sorry, I couldn\'t make out that audio clearly. Try again, or type your message.' });
          continue;
        }
        messageText = transcript;
        console.log(`🎤 转录结果: ${messageText}`);
      }

      if (!messageText) continue;

      // 去除群消息中对机器人的@提及
      if (isGroup) {
        messageText = messageText.replace(/@\d+/g, '').trim();
        if (!messageText) continue;
      }

      console.log(`📩 收到来自 ${from} 的消息: ${messageText}`);

      // 登录：恒为真 — 手机号即身份，即刻准入
        const session = sessions.login(from);

        // 存款数据库：确保用户记录存在
        userDb.ensureUser(from);

        const lang = detectLanguage(messageText);

        // 注册流程：采集凭证期间拦截消息
        const regReply = registration.handle(from, messageText, lang);
        if (regReply) {
          await sock.sendMessage(from, { text: regReply });
          monitor.push('activity', { sessionId: session.sessionId, kind: 'registration', step: registration.currentStep(from) });
          continue;
        }

        // 未注册用户请求注册时启动注册流程
        if (!userDb.isRegistered(from) && /\b(register|registration|signup|sign up|jiunge)\b/i.test(messageText) && !isGroup) {
          const prompt = registration.start(from, lang);
          await sock.sendMessage(from, { text: prompt });
          monitor.push('activity', { sessionId: session.sessionId, kind: 'registration-started' });
          continue;
        }

        // 获取用户资料
        const user = conversationManager.getUser(from);

        // 更新最后在线时间
        conversationManager.updateLastSeen(from);

        // Welcome new users — brief, NO forced registration.
        // They can use the bot immediately. Registration is optional.
        if (!isGroup && user.isNewUser === true && !userDb.isRegistered(from)) {
          console.log(`🎯 New user detected — sending welcome`);
          conversationManager.markAsReturning(from);
          const welcomeMsg = conversationManager.getWelcomeMessage(user, lang);
          await sock.sendMessage(from, { text: welcomeMsg });
          monitor.push('activity', { kind: 'welcome' });
          console.log(`✅ Welcome sent to ${from}\n`);
          // Do NOT continue — let the user's actual message flow to LLM
        }

        // ============================================
        // 共享受理管线：语言检测 → Gemini 翻译 → 情绪 → 危机门 → 分类 →
        // 混合语义 RAG → 分层多模型 LLM → 回复回译（WhatsApp 与 SMS 共用）
        // ============================================
        const history = conversationManager.getConversationHistory(from);

        const result = await pipeline.process({
          text: messageText,
          callerId: from,
          history,
          user: {
            location: user.location,
            workType: user.workType,
            isNewUser: user.isNewUser,
            conversationCount: user.conversationCount
          }
        });

        // 危机介入：优先于法律回复 — 免费支持线路 + 暖转介，绝不让机器人独自应付
        if (result.kind === 'crisis') {
          const crisisReply = result.reply;
          await sock.sendMessage(from, { text: toWhatsApp(crisisReply) });
          conversationManager.addToHistory(from, 'user', messageText);
          conversationManager.addToHistory(from, 'assistant', crisisReply);
          conversationManager.updateContext(from, { lastIntent: 'crisis', lastTopic: `crisis:${result.crisisResult.level}` });
          sessions.recordTransaction(from, {
            direction: 'exchange',
            userMessage: messageText.slice(0, 500),
            botResponse: crisisReply.slice(0, 500),
            intent: 'crisis',
            topic: 'emotional-support',
            language: result.lang,
            crisisLevel: result.crisisResult.level,
            usedLLM: false,
            provider: null
          });
          monitor.push('crisis', {
            sessionId: session.sessionId,
            phone: from,
            level: result.crisisResult.level,
            escalate: result.crisisResult.escalate,
            triggers: (result.crisisResult.triggers || []).slice(0, 3).map(t => t.phrase)
          }, ORIGINS.KNOWN_TRIGGER);

          // 严重危机 → 24 小时后暖回访 + 标记转介人工/CSO 跟进
          if (result.crisisResult.escalate) {
            autonomy.scheduleFollowUp(from, 'checking in on you after your last message', 24);
            monitor.push('crisis-escalation', {
              sessionId: session.sessionId,
              level: 'severe',
              action: 'warm-handoff'
            }, ORIGINS.AUTONOMOUS_FOLLOW_UP);
          }
          console.log(`💛 Crisis intervention (${result.crisisResult.level}) >> ${from}`);
          continue;
        }

        // 将本轮对话存入历史记录以保留上下文
        conversationManager.addToHistory(from, 'user', messageText);
        conversationManager.addToHistory(from, 'assistant', result.reply);

        // 用最新意图更新用户上下文（多轮感知）
        conversationManager.updateContext(from, {
          lastIntent: result.reasoning.intent,
          lastTopic: result.reasoning.topic,
          lastViolation: result.violation ? result.violation.id : null
        });

        // 发送 AI 生成的回复（真实智能，而非静态模板）
        await sock.sendMessage(from, { text: toWhatsApp(result.reply) });

        // 会话版本化：将本次交互保存为不可变的版本化事务
        const tx = sessions.recordTransaction(from, {
          direction: 'exchange',
          userMessage: messageText.slice(0, 500),
          botResponse: result.reply.slice(0, 500),
          intent: result.reasoning.intent,
          topic: result.reasoning.topic,
          violation: result.violation ? result.violation.id : null,
          language: result.lang,
          usedLLM: result.usedLLM,
          provider: result.provider || null,
          tier: result.tier || null,
          sentiment: result.sentiment.sentiment,
          iqIntents: result.iqResult.intents,
          crisisLevel: result.crisisResult.level
        });

        // 仪表盘：自动推送机器人活动（来源：已知触发 — 用户先发消息）
        monitor.push('activity', {
          sessionId: session.sessionId,
          txId: tx.txId,
          intent: result.reasoning.intent,
          violation: result.violation ? result.violation.id : null,
          tier: result.tier || null
        }, ORIGINS.KNOWN_TRIGGER);

        // 为严重违规安排自主跟进回访
        if (result.violation && ['WAGE_VIOLATION', 'SAFETY_VIOLATION', 'HARASSMENT'].includes(result.violation.id)) {
          autonomy.scheduleFollowUp(from, `The ${result.violation.id.toLowerCase().replace('_', ' ')} issue you reported`);
          monitor.push('follow-up-scheduled', { sessionId: session.sessionId, violation: result.violation.id }, ORIGINS.AUTONOMOUS_FOLLOW_UP);
        }

        console.log(`✅ 已回复 ${from}（通过 ${result.usedLLM ? (result.provider ? `LLM [${result.provider}${result.tier ? ':' + result.tier : ''}]` : 'LLM') : '兜底规则'}${result.analysisTranslated ? ' · 已回译' : ''}）`);
        console.log(`   意图: ${result.reasoning.intent} | 主题: ${result.reasoning.topic} | 紧急度: ${result.reasoning.urgency || '-'} | 情绪: ${result.sentiment.sentiment}\n`);
      } catch (error) {
        console.error('❌ 处理消息出错:', error);

        // 错误提示本身也可能失败（连接抖动）— 绝不让异常逃逸
        try {
          await sock.sendMessage(from, {
            text: conversationManager.getErrorMessage('en')
          });
        } catch (sendErr) {
          console.error('⚠️ 错误提示消息发送失败:', sendErr.message);
        }
      }
    }
  });
}

// 启动机器人（单实例锁保护）
const lock = acquireLock();
if (!lock.acquired) {
  console.error('🚫 拒绝启动：' + lock.reason);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n👋 收到 ${sig}，正在关闭 Haki 农业护盾…`);
    releaseLock();
    process.exit(0);
  });
}
process.on('exit', () => releaseLock());

// ── 全局兜底：任何未捕获异常只记录，绝不让进程静默退出 ──
const ERROR_LOG = path.join(__dirname, '..', 'temp', 'bot-errors.log');
function logFatal(tag, err) {
  const line = `[${new Date().toISOString()}] ${tag}: ${err && err.stack ? err.stack : err}\n`;
  try { fs.appendFileSync(ERROR_LOG, line); } catch {}
  console.error('🛑 ' + tag + ':');
  console.error(err && err.stack ? err.stack : err);
}
process.on('unhandledRejection', (reason) => logFatal('未处理的 Promise 拒绝（进程保持运行）', reason));
process.on('uncaughtException', (err) => logFatal('未捕获异常（进程保持运行）', err));

startBot().catch(err => {
  console.error('❌ 启动机器人失败:', err);
  releaseLock();
  process.exit(1);
});
