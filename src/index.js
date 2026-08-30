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
import { classifyViolation } from './violation-classifier.js';
import { toWhatsApp } from './whatsapp-format.js';
import { buildRetriever } from './knowledge-retriever.js';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 健康检查服务器（用于运行状态监控）──
let botLive = false;
const HEALTH_PORT = process.env.HEALTH_PORT || 3001;
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(botLive ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: botLive ? 'ok' : 'starting', bot: 'Haki-Agri-Shield', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end('未找到');
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

      // 语音留言 → 通过 Whisper 转录（如已配置）
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
        // 情感支持：危机检测在任何法律分析之前
        // ============================================
        empathy.setCulturalContext(from, lang);
        const sentimentState = empathy.processSentiment(from, messageText, null);
        const history = conversationManager.getConversationHistory(from);
        const iqResult = iq.processMessage(from, messageText, lang, history);

        const crisisResult = crisisSupport.triage(messageText, lang);

        // 危机介入：优先于法律回复 — 免费支持线路 + 暖转介，绝不让机器人独自应付
        if (crisisResult.needsCare) {
          const crisisReply = crisisResult.response;
          await sock.sendMessage(from, { text: toWhatsApp(crisisReply) });
          conversationManager.addToHistory(from, 'user', messageText);
          conversationManager.addToHistory(from, 'assistant', crisisReply);
          conversationManager.updateContext(from, { lastIntent: 'crisis', lastTopic: `crisis:${crisisResult.level}` });
          sessions.recordTransaction(from, {
            direction: 'exchange',
            userMessage: messageText.slice(0, 500),
            botResponse: crisisReply.slice(0, 500),
            intent: 'crisis',
            topic: 'emotional-support',
            language: lang,
            crisisLevel: crisisResult.level,
            usedLLM: false,
            provider: null
          });
          monitor.push('crisis', {
            sessionId: session.sessionId,
            phone: from,
            level: crisisResult.level,
            escalate: crisisResult.escalate,
            triggers: crisisResult.triggers.slice(0, 3).map(t => t.phrase)
          }, ORIGINS.KNOWN_TRIGGER);

          // 严重危机 → 24 小时后暖回访 + 标记转介人工/CSO 跟进
          if (crisisResult.escalate) {
            autonomy.scheduleFollowUp(from, 'checking in on you after your last message', 24);
            monitor.push('crisis-escalation', {
              sessionId: session.sessionId,
              level: 'severe',
              action: 'warm-handoff'
            }, ORIGINS.AUTONOMOUS_FOLLOW_UP);
          }
          console.log(`💛 Crisis intervention (${crisisResult.level}) >> ${from}`);
          continue;
        }

        // ============================================
        // 先推理，后回答（ChatGPT 式）
        // ============================================
        // 违规分类以增强法律推理（RAG）
        const violation = classifyViolation(messageText);

        // 从语料库检索有依据的法律条文（RAG）
        const knowledge = retriever.search(messageText, 3);

        // processMessage 返回 { reasoning, response, usedLLM, provider }
        // 使用 LLM 生成的回复 — 这是真实的 AI 输出
        const { reasoning, response: llmResponse, usedLLM, provider } = await llmEngine.processMessage(messageText, {
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
          history: history,
          knowledge: knowledge
        });

        // 将本轮对话存入历史记录以保留上下文
        conversationManager.addToHistory(from, 'user', messageText);
        conversationManager.addToHistory(from, 'assistant', llmResponse);

        // 用最新意图更新用户上下文（多轮感知）
        conversationManager.updateContext(from, {
          lastIntent: reasoning.intent,
          lastTopic: reasoning.topic,
          lastViolation: violation ? violation.id : null
        });

        // 发送 AI 生成的回复（真实智能，而非静态模板）
        await sock.sendMessage(from, { text: toWhatsApp(llmResponse) });

        // 会话版本化：将本次交互保存为不可变的版本化事务
        const tx = sessions.recordTransaction(from, {
          direction: 'exchange',
          userMessage: messageText.slice(0, 500),
          botResponse: llmResponse.slice(0, 500),
          intent: reasoning.intent,
          topic: reasoning.topic,
          violation: violation ? violation.id : null,
          language: lang,
          usedLLM,
          provider: provider || null,
          sentiment: sentimentState.sentiment,
          iqIntents: iqResult.intents,
          crisisLevel: crisisResult.level
        });

        // 仪表盘：自动推送机器人活动（来源：已知触发 — 用户先发消息）
        monitor.push('activity', {
          sessionId: session.sessionId,
          txId: tx.txId,
          intent: reasoning.intent,
          violation: violation ? violation.id : null
        }, ORIGINS.KNOWN_TRIGGER);

        // 为严重违规安排自主跟进回访
        if (violation && ['WAGE_VIOLATION', 'SAFETY_VIOLATION', 'HARASSMENT'].includes(violation.id)) {
          autonomy.scheduleFollowUp(from, `The ${violation.id.toLowerCase().replace('_', ' ')} issue you reported`);
          monitor.push('follow-up-scheduled', { sessionId: session.sessionId, violation: violation.id }, ORIGINS.AUTONOMOUS_FOLLOW_UP);
        }

        console.log(`✅ 已回复 ${from}（通过 ${usedLLM ? (provider ? `LLM [${provider}]` : 'LLM') : '兜底规则'})`);
        console.log(`   意图: ${reasoning.intent} | 主题: ${reasoning.topic} | 紧急度: ${reasoning.urgency} | 情绪: ${sentimentState.sentiment}\n`);
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
