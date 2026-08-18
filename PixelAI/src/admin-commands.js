import { existsSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { dataDir } from './paths.js';

export class AdminCommands {
  #owner;
  #skills;
  #analytics;
  #conversations;
  #rateLimiter;
  #auditLog;

  constructor({ botOwnerNumber, skillRegistry, analytics, conversationManager, rateLimiter }) {
    this.#owner = botOwnerNumber?.replace(/[^0-9]/g, '');
    this.#skills = skillRegistry;
    this.#analytics = analytics;
    this.#conversations = conversationManager;
    this.#rateLimiter = rateLimiter;
    this.#auditLog = [];
  }

  isOwner(senderId) {
    const normalized = senderId?.replace(/[^0-9]/g, '');
    return normalized && this.#owner && normalized === this.#owner;
  }

  async handleCommand(command, args, senderId, sock, chatId) {
    if (!this.isOwner(senderId)) {
      await this.#reply(sock, chatId, '🚫 Not authorized. Only the bot owner can use admin commands.');
      return false;
    }

    const start = Date.now();
    const cmd = (command || '').toLowerCase().trim();
    const logEntry = {
      command: cmd,
      args: args?.join(' '),
      senderId,
      timestamp: new Date().toISOString(),
    };

    try {
      let response;

      switch (cmd) {
        case '!stats':
          response = this.#handleStats();
          break;
        case '!skills':
          response = this.#handleSkills();
          break;
        case '!skill':
          response = this.#handleSkillToggle(args);
          break;
        case '!users':
          response = this.#handleUsers();
          break;
        case '!user':
          response = this.#handleUserDetail(args);
          break;
        case '!logs':
          response = this.#handleLogs();
          break;
        case '!broadcast':
          response = await this.#handleBroadcast(args, sock);
          break;
        case '!config':
          response = args?.length ? this.#handleConfigSet(args) : this.#handleConfigShow();
          break;
        case '!memory':
          response = this.#handleMemory();
          break;
        case '!backup':
          response = this.#handleBackup();
          break;
        case '!restart':
          response = this.#handleRestart();
          break;
        case '!help':
          response = this.#handleHelp();
          break;
        default:
          response = `❓ Unknown command: \`${cmd}\`\n\nType \`!help\` for available commands.`;
      }

      logEntry.status = 'success';
      logEntry.duration = Date.now() - start;
      this.#logAudit(logEntry);

      if (response) {
        await this.#reply(sock, chatId, response);
      }

      return true;
    } catch (err) {
      logEntry.status = 'error';
      logEntry.error = err.message;
      logEntry.duration = Date.now() - start;
      this.#logAudit(logEntry);

      const errorMsg = `❌ Command \`${cmd}\` failed:\n\`\`\`\n${err.message}\n\`\`\`\nPlease check the logs for details.`;
      await this.#reply(sock, chatId, errorMsg).catch(() => {});
      return false;
    }
  }

  // ── Command Handlers ──────────────────────────────────────────────

  #handleStats() {
    const dashboard = typeof this.#analytics?.formatConsoleDashboard === 'function'
      ? this.#analytics.formatConsoleDashboard()
      : null;

    if (dashboard) {
      return `📊 *Analytics Dashboard*\n\n\`\`\`\n${dashboard}\n\`\`\``;
    }

    const stats = this.#analytics?.getStats?.() ?? this.#analytics?.stats ?? null;
    if (!stats) return '📊 No analytics data available.';

    const lines = ['📊 *Analytics Overview*'];
    for (const [key, val] of Object.entries(stats)) {
      const display = typeof val === 'object' ? JSON.stringify(val, null, 2) : val;
      lines.push(`• *${key}:* ${display}`);
    }
    return lines.join('\n');
  }

  #handleSkills() {
    const registry = this.#skills;
    if (!registry?.getAll) return '🔧 No skill registry loaded.';

    const all = registry.getAllSkills?.() ?? registry.skills ?? [];
    if (!Array.isArray(all) || all.length === 0) return '🔧 No skills loaded.';

    const lines = ['🔧 *Loaded Skills*\n'];
    for (const skill of all) {
      const name = skill.name ?? skill.id ?? 'unknown';
      const enabled = skill.enabled !== false ? '✅' : '❌';
      const count = skill.usageCount ?? skill.usage ?? 0;
      const desc = skill.description ? `\n    _${skill.description}_` : '';
      lines.push(`${enabled} *${name}* — used ${count}x${desc}`);
    }
    lines.push(`\n_Total: ${all.length} skill(s)_`);
    return lines.join('\n');
  }

  #handleSkillToggle(args) {
    if (!args || args.length < 2) {
      return '❓ Usage: `!skill <name> on/off`\n\nExample: `!skill weather on`';
    }

    const [name, state] = args;
    const enable = ['on', 'enable', 'true', '1'].includes(state.toLowerCase());

    const registry = this.#skills;
    if (!registry?.enableSkill && !registry?.disableSkill) {
      return '🔧 Skill registry does not support toggling.';
    }

    const skill = typeof registry.getSkillByName === 'function'
      ? registry.getSkillByName(name)
      : null;

    if (!skill) return `❌ Skill \`${name}\` not found.`;

    if (enable && typeof registry.enableSkill === 'function') {
      registry.enableSkill(name);
    } else if (!enable && typeof registry.disableSkill === 'function') {
      registry.disableSkill(name);
    } else {
      return `❌ Cannot ${enable ? 'enable' : 'disable'} skill \`${name}\`.`;
    }

    return `${enable ? '✅' : '❌'} Skill *${name}* is now *${enable ? 'enabled' : 'disabled'}*.`;
  }

  #handleUsers() {
    const mgr = this.#conversations;
    if (!mgr?.getUsers && !mgr?.users && !mgr?.getAllUsers) {
      return '👥 No user data available.';
    }

    const users = mgr.getAllUsers?.() ?? mgr.getUsers?.() ?? mgr.users ?? null;
    if (!users) return '👥 No user data available.';

    let entries;
    if (Array.isArray(users)) {
      entries = users;
    } else if (users instanceof Map) {
      entries = [...users.values()];
    } else {
      entries = Object.values(users);
    }

    if (!entries.length) return '👥 No registered users.';

    const lines = ['👥 *Registered Users*\n'];
    for (const user of entries.slice(0, 30)) {
      const phone = user.phone ?? user.id ?? user.userId ?? 'unknown';
      const lastSeen = user.lastSeen
        ? new Date(user.lastSeen).toLocaleString()
        : 'unknown';
      const msgs = user.messageCount ?? user.msgCount ?? user.messages?.length ?? 0;
      lines.push(`• *${phone}* — ${msgs} msgs, last: ${lastSeen}`);
    }

    if (entries.length > 30) {
      lines.push(`\n_...and ${entries.length - 30} more_`);
    }
    lines.push(`\n_Total: ${entries.length} user(s)_`);
    return lines.join('\n');
  }

  #handleUserDetail(args) {
    if (!args?.length) {
      return '❓ Usage: `!user <phone>`\n\nExample: `!user 254712345678`';
    }

    const phone = args[0].replace(/[^0-9+]/g, '');
    const mgr = this.#conversations;

    let user;
    if (typeof mgr.getUser === 'function') {
      user = mgr.getUser(phone);
    } else if (typeof mgr.get === 'function') {
      user = mgr.get(phone);
    } else if (mgr.users instanceof Map) {
      user = mgr.users.get(phone);
    } else if (mgr.users && typeof mgr.users === 'object') {
      user = mgr.users[phone];
    }

    if (!user) return `👤 No data found for *${phone}*.`;

    const lines = [
      `👤 *User Profile: ${phone}*\n`,
      `• *Messages:* ${user.messageCount ?? user.msgCount ?? user.messages?.length ?? 0}`,
      `• *Last Seen:* ${user.lastSeen ? new Date(user.lastSeen).toLocaleString() : 'Unknown'}`,
      `• *First Seen:* ${user.firstSeen ? new Date(user.firstSeen).toLocaleString() : 'Unknown'}`,
      `• *Registered:* ${user.registeredAt ? new Date(user.registeredAt).toLocaleString() : 'Unknown'}`,
    ];

    if (user.name || user.profileName) {
      lines.push(`• *Name:* ${user.name ?? user.profileName}`);
    }
    if (user.conversationState || user.state) {
      lines.push(`• *State:* ${user.conversationState ?? user.state}`);
    }
    if (user.rating != null) {
      lines.push(`• *Rating:* ${user.rating}/5`);
    }
    if (Array.isArray(user.topics) && user.topics.length) {
      lines.push(`• *Topics:* ${user.topics.join(', ')}`);
    }

    return lines.join('\n');
  }

  #handleLogs() {
    const analytics = this.#analytics;
    const errors = analytics?.recentErrors ?? analytics?.getRecentErrors?.() ?? [];
    const escalations = analytics?.escalations ?? analytics?.getEscalations?.() ?? [];

    const lines = ['📋 *Recent Errors & Escalations*\n'];

    if (Array.isArray(errors) && errors.length) {
      lines.push('*Errors:*');
      for (const err of errors.slice(-5)) {
        const ts = err.timestamp ? `[${new Date(err.timestamp).toLocaleString()}]` : '';
        lines.push(`• ${ts} ${err.message ?? err.error ?? JSON.stringify(err)}`);
      }
    } else {
      lines.push('• _No recent errors_');
    }

    lines.push('');

    if (Array.isArray(escalations) && escalations.length) {
      lines.push('*Escalations:*');
      for (const esc of escalations.slice(-5)) {
        const ts = esc.timestamp ? `[${new Date(esc.timestamp).toLocaleString()}]` : '';
        lines.push(`• ${ts} ${esc.message ?? JSON.stringify(esc)}`);
      }
    } else {
      lines.push('• _No escalations_');
    }

    return lines.join('\n');
  }

  async #handleBroadcast(args, sock) {
    if (!args?.length) {
      return '❓ Usage: `!broadcast <message>\n\nSends a message to all active users.';
    }

    const message = args.join(' ');
    const mgr = this.#conversations;

    const users = mgr.getAllUsers?.() ?? mgr.getUsers?.() ?? mgr.users ?? null;
    let entries = [];
    if (Array.isArray(users)) entries = users;
    else if (users instanceof Map) entries = [...users.values()];
    else if (users && typeof users === 'object') entries = Object.values(users);

    const active = entries.filter(u => {
      if (u.active === false) return false;
      if (u.lastSeen) {
        const daysSince = (Date.now() - new Date(u.lastSeen).getTime()) / 86400000;
        return daysSince < 30;
      }
      return true;
    });

    if (!active.length) return '📢 No active users to broadcast to.';

    const phones = active.map(u => (u.phone ?? u.id ?? u.userId ?? '').replace(/[^0-9]/g, '')).filter(Boolean);

    if (!phones.length) return '📢 No valid phone numbers found.';

    let sent = 0;
    let failed = 0;

    for (const phone of phones) {
      try {
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        sent++;
      } catch {
        failed++;
      }
    }

    return `📢 *Broadcast Complete*\n\n• *Message:* ${message}\n• *Sent:* ${sent}\n• *Failed:* ${failed}\n• *Total:* ${phones.length}`;
  }

  #handleConfigShow() {
    const lines = ['⚙️ *Current Configuration*\n'];

    const entries = [
      ['Bot Owner', this.#owner],
      ['Skills Loaded', (this.#skills?.getAllSkills?.() ?? this.#skills?.skills ?? []).length || 0],
      ['Analytics', this.#analytics ? 'Active' : 'Inactive'],
      ['Conversations', this.#conversations ? 'Active' : 'Inactive'],
      ['Rate Limiter', this.#rateLimiter ? 'Active' : 'Inactive'],
    ];

    if (typeof this.#rateLimiter?.getStats === 'function') {
      const rl = this.#rateLimiter.getStats();
      if (rl) {
        entries.push(['Rate Limit Window', `${rl.windowMs ?? 'N/A'}ms`]);
        entries.push(['Rate Limit Max', rl.maxRequests ?? 'N/A']);
      }
    }

    for (const [key, val] of entries) {
      lines.push(`• *${key}:* ${val}`);
    }

    return lines.join('\n');
  }

  #handleConfigSet(args) {
    if (args.length < 2) {
      return '❓ Usage: `!config <key> <value>`\n\nExample: `!config maxMessages 100`';
    }

    const [key, ...rest] = args;
    const value = rest.join(' ');
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');

    const configPath = join(dataDir(), 'config.json');
    let config = {};

    try {
      if (existsSync(configPath)) {
        config = JSON.parse(readFileSync(configPath, 'utf-8'));
      }
    } catch {
      // start fresh
    }

    const parsed = value === 'true' ? true
      : value === 'false' ? false
      : !isNaN(value) && value !== '' ? Number(value)
      : value;

    config[normalizedKey] = parsed;

    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      return `⚙️ *Config Updated*\n\n• *${key}* → \`${parsed}\`\n\nRestart may be required for some changes.`;
    } catch (err) {
      return `❌ Failed to save config: ${err.message}`;
    }
  }

  #handleMemory() {
    const lines = ['🧠 *Memory Usage*\n'];

    // Process memory
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      lines.push('*Process Memory:*');
      lines.push(`• RSS: ${this.#fmtBytes(mem.rss)}`);
      lines.push(`• Heap Used: ${this.#fmtBytes(mem.heapUsed)}`);
      lines.push(`• Heap Total: ${this.#fmtBytes(mem.heapTotal)}`);
      lines.push(`• External: ${this.#fmtBytes(mem.external)}`);
      lines.push('');
    }

    // Data file sizes
    const dir = dataDir();
    const files = ['conversations.json', 'users.json', 'analytics.json', 'config.json', 'audit-log.json'];

    lines.push('*Data Files:*');
    for (const file of files) {
      const filePath = join(dir, file);
      try {
        if (existsSync(filePath)) {
          const stat = statSync(filePath);
          const kb = (stat.size / 1024).toFixed(1);
          const modified = stat.mtime.toLocaleString();
          lines.push(`• ${file}: ${kb} KB (modified: ${modified})`);
        } else {
          lines.push(`• ${file}: _not found_`);
        }
      } catch {
        lines.push(`• ${file}: _unable to read_`);
      }
    }

    return lines.join('\n');
  }

  #handleBackup() {
    const dir = dataDir();
    const backup = {};
    const files = ['conversations.json', 'users.json', 'analytics.json', 'config.json'];

    for (const file of files) {
      const filePath = join(dir, file);
      try {
        if (existsSync(filePath)) {
          backup[file] = JSON.parse(readFileSync(filePath, 'utf-8'));
        }
      } catch {
        backup[file] = null;
      }
    }

    backup._meta = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    const json = JSON.stringify(backup, null, 2);

    console.log('\n══════════════════════════════════════');
    console.log('  ADMIN BACKUP EXPORT');
    console.log('══════════════════════════════════════');
    console.log(json);
    console.log('══════════════════════════════════════\n');

    const sizeKB = (json.length / 1024).toFixed(1);
    return `💾 *Backup Exported*\n\n• *Size:* ${sizeKB} KB\n• *Files:* ${Object.keys(backup).length - 1}\n• *Logged to console.*\n\nTimestamp: ${new Date().toISOString()}`;
  }

  #handleRestart() {
    const reason = 'Admin-initiated restart via !restart command';
    console.log(`\n⚠️  [ADMIN] Restart triggered at ${new Date().toISOString()}`);
    console.log(`   Reason: ${reason}\n`);

    setTimeout(() => {
      process.exit(0);
    }, 500);

    return '🔄 *Restarting...*\n\nBot will shut down and restart momentarily. This message was the last admin command logged.';
  }

  #handleHelp() {
    return [
      '🛠️ *Admin Commands*\n',
      '• `!stats` — Analytics dashboard',
      '• `!skills` — List loaded skills',
      '• `!skill <name> on/off` — Toggle a skill',
      '• `!users` — List all users',
      '• `!user <phone>` — User detail',
      '• `!logs` — Recent errors & escalations',
      '• `!broadcast <msg>` — Message all active users',
      '• `!config` — Show configuration',
      '• `!config <key> <value>` — Update config',
      '• `!memory` — Memory & file sizes',
      '• `!backup` — Export all data as JSON',
      '• `!restart` — Graceful restart',
      '• `!help` — This message\n',
      `_Owner: ${this.#owner ?? 'not set'}_`,
    ].join('\n');
  }

  // ── Helpers ───────────────────────────────────────────────────────

  async #reply(sock, chatId, text) {
    if (!sock?.sendMessage || !chatId) return;
    await sock.sendMessage(chatId, { text });
  }

  #logAudit(entry) {
    this.#auditLog.push(entry);
    if (this.#auditLog.length > 200) {
      this.#auditLog = this.#auditLog.slice(-100);
    }

    const icon = entry.status === 'success' ? '✅' : '❌';
    console.log(
      `[ADMIN] ${icon} ${entry.command} ${entry.args ?? ''} — ${entry.duration ?? 0}ms`
    );
  }

  #fmtBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(1)} ${units[i]}`;
  }

  getAuditLog() {
    return [...this.#auditLog];
  }
}
