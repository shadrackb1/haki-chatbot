import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_NAMES_PLURAL = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
const WEEKDAY_NAMES = ['weekdays', 'weekdays', 'weekdays', 'weekdays', 'weekdays', 'weekend', 'weekend'];

const TIMEZONE_OFFSETS = {
  'eat': 3, 'cat': 2, 'sast': 2, 'eet': 2,
  'ist': 5.5, 'jst': 9, 'kst': 9,
  'pst': -8, 'pdt': -7, 'mst': -7, 'mdt': -6,
  'cst': -6, 'cdt': -5, 'est': -5, 'edt': -4,
  'utc': 0, 'gmt': 0, 'bst': 1, 'cet': 1, 'cest': 2,
  'eest': 3, 'ist': 5.5, 'sgt': 8, 'hkt': 8,
  'aest': 10, 'aedt': 11, 'nzst': 12, 'nzdt': 13,
};

let activeTimers = new Map();

let reminders = [];

function loadReminders() {
  try {
    if (fs.existsSync(REMINDERS_FILE)) {
      const raw = fs.readFileSync(REMINDERS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        reminders = parsed;
      } else {
        reminders = [];
      }
    } else {
      reminders = [];
    }
  } catch (err) {
    console.error('[Reminders] Failed to load reminders:', err.message);
    reminders = [];
  }
}

function saveReminders() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Reminders] Failed to save reminders:', err.message);
  }
}

function getUserTimezone(context) {
  if (context?.timezone) {
    const tz = context.timezone.toLowerCase().trim();
    if (tz in TIMEZONE_OFFSETS) {
      return TIMEZONE_OFFSETS[tz];
    }
    try {
      const offset = new Date().toLocaleString('en-US', { timeZone: tz });
      return (new Date(offset) - new Date()) / 3600000;
    } catch {
      // Fall through
    }
  }
  return 0;
}

function getUserReminders(userId) {
  return reminders.filter((r) => r.userId === userId && !r.fired);
}

function formatTime(date, tzOffset) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const local = new Date(utc + tzOffset * 3600000);
  const h = local.getHours();
  const m = local.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const dateStr = local.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `${dateStr} at ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatTimeShort(date, tzOffset) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const local = new Date(utc + tzOffset * 3600000);
  const h = local.getHours();
  const m = local.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function parseTimeExpression(text, tzOffset = 0) {
  const lower = text.toLowerCase().trim();
  const now = new Date();

  const targetDate = new Date(now.getTime() + tzOffset * 3600000);
  let timeParsed = null;
  let remainingText = lower;
  let recurring = null;
  let isRecurring = false;

  // --- Recurring patterns ---

  // "every day at HH:MM"
  const everyDayMatch = lower.match(
    /(?:every\s+day|daily)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/
  );
  if (everyDayMatch) {
    isRecurring = true;
    recurring = { type: 'daily' };
    timeParsed = parseClockTime(everyDayMatch[1], everyDayMatch[2], everyDayMatch[3]);
    remainingText = lower.replace(everyDayMatch[0], '').trim();
  }

  // "every Monday/Tuesday/... at HH:MM"
  if (!isRecurring) {
    for (let i = 0; i < DAY_NAMES.length; i++) {
      const pattern = new RegExp(
        `every\\s+${DAY_NAMES[i]}s?\\s+(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?`
      );
      const dayMatch = lower.match(pattern);
      if (dayMatch) {
        isRecurring = true;
        recurring = { type: 'weekly', day: i };
        timeParsed = parseClockTime(dayMatch[1], dayMatch[2], dayMatch[3]);
        remainingText = lower.replace(dayMatch[0], '').trim();
        break;
      }
    }
  }

  // "every weekday at HH:MM" / "every weekend at HH:MM"
  if (!isRecurring) {
    const weekdayMatch = lower.match(
      /every\s+(weekdays?|weekends?)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/
    );
    if (weekdayMatch) {
      isRecurring = true;
      const isWeekend = weekdayMatch[1].startsWith('weekend');
      recurring = { type: isRecurring ? (isWeekend ? 'weekend' : 'weekdays') : 'weekdays' };
      timeParsed = parseClockTime(weekdayMatch[2], weekdayMatch[3], weekdayMatch[4]);
      remainingText = lower.replace(weekdayMatch[0], '').trim();
    }
  }

  // --- One-time relative patterns ---

  if (!isRecurring) {
    // "in X minutes/hours/days/weeks"
    const inMatch = lower.match(
      /in\s+(\d+)\s+(minutes?|mins?|hours?|hrs?|days?|weeks?)\s*(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/
    );
    if (inMatch) {
      const amount = parseInt(inMatch[1], 10);
      const unit = inMatch[2].toLowerCase();
      let ms = 0;
      if (unit.startsWith('min') || unit.startsWith('min')) ms = amount * 60000;
      else if (unit.startsWith('hour') || unit.startsWith('hr')) ms = amount * 3600000;
      else if (unit.startsWith('day')) ms = amount * 86400000;
      else if (unit.startsWith('week')) ms = amount * 604800000;

      const triggerMs = now.getTime() + ms;
      return {
        triggerTime: new Date(triggerMs),
        recurring: null,
        remainingText: lower.replace(inMatch[0], '').trim(),
      };
    }

    // "tomorrow at HH:MM"
    const tomorrowMatch = lower.match(
      /tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/
    );
    if (tomorrowMatch) {
      const tp = parseClockTime(tomorrowMatch[1], tomorrowMatch[2], tomorrowMatch[3]);
      const trigger = new Date(targetDate);
      trigger.setDate(trigger.getDate() + 1);
      trigger.setHours(tp.hours, tp.minutes, 0, 0);
      return {
        triggerTime: new Date(trigger.getTime() - tzOffset * 3600000),
        recurring: null,
        remainingText: lower.replace(tomorrowMatch[0], '').trim(),
      };
    }

    // "next Monday/Tuesday/... at HH:MM"
    for (let i = 0; i < DAY_NAMES.length; i++) {
      const pattern = new RegExp(
        `next\\s+${DAY_NAMES[i]}s?\\s+(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?`
      );
      const nextDayMatch = lower.match(pattern);
      if (nextDayMatch) {
        const tp = parseClockTime(nextDayMatch[1], nextDayMatch[2], nextDayMatch[3]);
        const trigger = new Date(targetDate);
        const currentDay = trigger.getDay();
        let daysUntil = i - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        trigger.setDate(trigger.getDate() + daysUntil);
        trigger.setHours(tp.hours, tp.minutes, 0, 0);
        return {
          triggerTime: new Date(trigger.getTime() - tzOffset * 3600000),
          recurring: null,
          remainingText: lower.replace(nextDayMatch[0], '').trim(),
        };
      }
    }

    // "today at HH:MM"
    const todayMatch = lower.match(
      /today\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/
    );
    if (todayMatch) {
      const tp = parseClockTime(todayMatch[1], todayMatch[2], todayMatch[3]);
      const trigger = new Date(targetDate);
      trigger.setHours(tp.hours, tp.minutes, 0, 0);
      if (trigger.getTime() <= now.getTime()) {
        return { triggerTime: null, recurring: null, remainingText: lower, error: 'That time has already passed today.' };
      }
      return {
        triggerTime: new Date(trigger.getTime() - tzOffset * 3600000),
        recurring: null,
        remainingText: lower.replace(todayMatch[0], '').trim(),
      };
    }

    // "at HH:MM" (assumes today or tomorrow)
    const atMatch = lower.match(
      /(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s|$)/
    );
    if (atMatch) {
      const tp = parseClockTime(atMatch[1], atMatch[2], atMatch[3]);
      const trigger = new Date(targetDate);
      trigger.setHours(tp.hours, tp.minutes, 0, 0);
      if (trigger.getTime() <= now.getTime()) {
        trigger.setDate(trigger.getDate() + 1);
      }
      return {
        triggerTime: new Date(trigger.getTime() - tzOffset * 3600000),
        recurring: null,
        remainingText: lower.replace(atMatch[0], '').trim(),
      };
    }

    // "at noon"
    if (lower.includes('at noon')) {
      const trigger = new Date(targetDate);
      trigger.setHours(12, 0, 0, 0);
      if (trigger.getTime() <= now.getTime()) {
        trigger.setDate(trigger.getDate() + 1);
      }
      return {
        triggerTime: new Date(trigger.getTime() - tzOffset * 3600000),
        recurring: null,
        remainingText: lower.replace('at noon', '').trim(),
      };
    }

    // "at midnight"
    if (lower.includes('at midnight') || lower === 'midnight') {
      const trigger = new Date(targetDate);
      trigger.setDate(trigger.getDate() + 1);
      trigger.setHours(0, 0, 0, 0);
      return {
        triggerTime: new Date(trigger.getTime() - tzOffset * 3600000),
        recurring: null,
        remainingText: lower.replace('at midnight', '').replace('midnight', '').trim(),
      };
    }
  }

  // --- Recurring: schedule from now ---
  if (isRecurring && recurring && timeParsed) {
    const trigger = new Date(targetDate);
    trigger.setHours(timeParsed.hours, timeParsed.minutes, 0, 0);

    if (recurring.type === 'daily') {
      if (trigger.getTime() <= now.getTime()) {
        trigger.setDate(trigger.getDate() + 1);
      }
    } else if (recurring.type === 'weekly') {
      const currentDay = trigger.getDay();
      let daysUntil = recurring.day - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      if (daysUntil === 0 && trigger.getTime() <= now.getTime()) daysUntil = 7;
      trigger.setDate(trigger.getDate() + daysUntil);
    } else if (recurring.type === 'weekdays') {
      let daysUntil = 1;
      if (trigger.getTime() > now.getTime() && trigger.getDay() >= 1 && trigger.getDay() <= 5) {
        daysUntil = 0;
      } else {
        while (daysUntil <= 7) {
          const candidate = new Date(targetDate);
          candidate.setDate(candidate.getDate() + daysUntil);
          candidate.setHours(timeParsed.hours, timeParsed.minutes, 0, 0);
          if (candidate.getDay() >= 1 && candidate.getDay() <= 5) break;
          daysUntil++;
        }
      }
      if (daysUntil > 0) {
        trigger.setDate(trigger.getDate() + daysUntil);
      }
    } else if (recurring.type === 'weekend') {
      let daysUntil = 1;
      if (trigger.getTime() > now.getTime() && (trigger.getDay() === 0 || trigger.getDay() === 6)) {
        daysUntil = 0;
      } else {
        while (daysUntil <= 7) {
          const candidate = new Date(targetDate);
          candidate.setDate(candidate.getDate() + daysUntil);
          candidate.setHours(timeParsed.hours, timeParsed.minutes, 0, 0);
          if (candidate.getDay() === 0 || candidate.getDay() === 6) break;
          daysUntil++;
        }
      }
      if (daysUntil > 0) {
        trigger.setDate(trigger.getDate() + daysUntil);
      }
    }

    return {
      triggerTime: new Date(trigger.getTime() - tzOffset * 3600000),
      recurring,
      remainingText: remainingText,
    };
  }

  return { triggerTime: null, recurring: null, remainingText: lower, error: null };
}

function parseClockTime(hourStr, minuteStr, ampmStr) {
  let hours = parseInt(hourStr, 10);
  const minutes = minuteStr ? parseInt(minuteStr, 10) : 0;

  if (ampmStr) {
    const ampm = ampmStr.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

function extractReminderText(originalMessage, timeExpression) {
  const lower = originalMessage.toLowerCase();
  const timeLower = timeExpression.toLowerCase();

  let cleaned = lower;

  const patterns = [
    /remind\s+me\s+/i,
    /set\s+a?\s*reminder\s+/i,
    /don'?t\s+forget\s+to\s+/i,
    /schedule\s+/i,
    /set\s+alarm\s+/i,
    /notify\s+me\s+/i,
    /remember\s+to\s+/i,
  ];

  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  cleaned = cleaned.replace(
    /(?:to\s+)?(?:remind|reminder|alarm|schedule|notify|remember)\s*/gi,
    ''
  );

  cleaned = cleaned.trim();

  if (!cleaned || cleaned.length < 2) {
    return null;
  }

  return cleaned;
}

function scheduleReminder(reminder, sendMessage) {
  const now = Date.now();
  const triggerAt = new Date(reminder.triggerTime).getTime();
  const delay = triggerAt - now;

  if (delay <= 0) {
    fireReminder(reminder, sendMessage);
    return;
  }

  const timer = setTimeout(() => {
    fireReminder(reminder, sendMessage);
  }, delay);

  activeTimers.set(reminder.id, timer);
}

function fireReminder(reminder, sendMessage) {
  const msg = `⏰ *Reminder:* ${reminder.text}`;

  console.log(`[Reminders] Firing reminder ${reminder.id} for ${reminder.userId}: ${reminder.text}`);

  if (reminder.recurring) {
    const nextTime = computeNextRecurringTime(reminder.triggerTime, reminder.recurring);
    if (nextTime) {
      reminder.triggerTime = nextTime.toISOString();
      saveReminders();
      scheduleReminder(reminder, sendMessage);
    } else {
      reminder.fired = true;
      saveReminders();
    }
  } else {
    reminder.fired = true;
    saveReminders();
  }

  if (typeof sendMessage === 'function') {
    sendMessage(reminder.userId, msg).catch((err) => {
      console.error(`[Reminders] Failed to send reminder to ${reminder.userId}:`, err.message);
    });
  }
}

function computeNextRecurringTime(currentTriggerTime, recurring) {
  const current = new Date(currentTriggerTime);

  if (recurring.type === 'daily') {
    current.setDate(current.getDate() + 1);
    return current;
  }

  if (recurring.type === 'weekly') {
    current.setDate(current.getDate() + 7);
    return current;
  }

  if (recurring.type === 'weekdays') {
    let daysToAdd = 1;
    while (daysToAdd <= 7) {
      const candidate = new Date(current);
      candidate.setDate(candidate.getDate() + daysToAdd);
      if (candidate.getDay() >= 1 && candidate.getDay() <= 5) {
        return candidate;
      }
      daysToAdd++;
    }
    return null;
  }

  if (recurring.type === 'weekend') {
    let daysToAdd = 1;
    while (daysToAdd <= 7) {
      const candidate = new Date(current);
      candidate.setDate(candidate.getDate() + daysToAdd);
      if (candidate.getDay() === 0 || candidate.getDay() === 6) {
        return candidate;
      }
      daysToAdd++;
    }
    return null;
  }

  return null;
}

function deleteReminder(userId, identifier) {
  const idx = reminders.findIndex(
    (r) => r.userId === userId && (r.id === identifier || r.text.toLowerCase().includes(identifier.toLowerCase()))
  );
  if (idx === -1) return null;

  const removed = reminders.splice(idx, 1)[0];

  const timer = activeTimers.get(removed.id);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(removed.id);
  }

  saveReminders();
  return removed;
}

function clearUserReminders(userId) {
  const userReminders = reminders.filter((r) => r.userId === userId);
  for (const r of userReminders) {
    const timer = activeTimers.get(r.id);
    if (timer) {
      clearTimeout(timer);
      activeTimers.delete(r.id);
    }
  }
  reminders = reminders.filter((r) => r.userId !== userId);
  saveReminders();
  return userReminders.length;
}

function initializeReminders(sendMessage) {
  loadReminders();

  const unfired = reminders.filter((r) => !r.fired);
  console.log(`[Reminders] Loaded ${reminders.length} reminders, ${unfired.length} active`);

  for (const reminder of unfired) {
    scheduleReminder(reminder, sendMessage);
  }
}

function detectAction(message) {
  const lower = message.toLowerCase().trim();

  if (/\b(list|show|see|what are|display)\b.*\b(reminders?|alarms?)\b/i.test(lower) ||
      /\breminders?\s+(list|show)/i.test(lower)) {
    return 'list';
  }

  if (/\b(clear|remove all|delete all|wipe)\b.*\b(reminders?|alarms?)\b/i.test(lower) ||
      /\breminders?\s+(clear|remove all|delete all)/i.test(lower)) {
    return 'clear';
  }

  if (/\b(delete|remove|cancel)\b.*\b(reminder|alarm)/i.test(lower) ||
      /\b(reminder|alarm)\s+(delete|remove|cancel)/i.test(lower)) {
    return 'delete';
  }

  return 'set';
}

export default {
  name: 'reminders',
  description: 'Set, list, and manage timed reminders via WhatsApp',
  triggers: [
    'remind me',
    'set reminder',
    'reminder',
    "don't forget",
    'schedule',
    'alarm',
    'notify me',
    'remember to',
  ],

  async execute(message, context) {
    const userId = context?.senderId || context?.chatId || 'unknown';
    const tzOffset = getUserTimezone(context);
    const action = detectAction(message);

    // --- LIST ---
    if (action === 'list') {
      const userReminders = getUserReminders(userId);
      if (userReminders.length === 0) {
        return { response: '📋 You have no active reminders.', metadata: { action: 'list' } };
      }

      let response = `📋 *Your Active Reminders (${userReminders.length}):*\n\n`;
      userReminders.sort((a, b) => new Date(a.triggerTime) - new Date(b.triggerTime));

      for (let i = 0; i < userReminders.length; i++) {
        const r = userReminders[i];
        const timeStr = formatTime(new Date(r.triggerTime), tzOffset);
        const recurringStr = r.recurring ? ` 🔄 (${formatRecurring(r.recurring)})` : '';
        response += `${i + 1}. *${r.text}*\n   📅 ${timeStr}${recurringStr}\n   ID: \`${r.id.slice(0, 8)}\`\n\n`;
      }

      response += `_Reply "delete reminder [ID or text]" to remove one._`;
      return { response, metadata: { action: 'list', count: userReminders.length } };
    }

    // --- DELETE ---
    if (action === 'delete') {
      const lower = message.toLowerCase();
      let identifier = null;

      const idMatch = lower.match(
        /(?:delete|remove|cancel)\s+(?:the\s+)?(?:reminder\s+)?(?:#?)?([a-f0-9]{8})/i
      );
      if (idMatch) {
        identifier = idMatch[1];
      } else {
        const textMatch = lower.match(
          /(?:delete|remove|cancel)\s+(?:the\s+)?reminder\s+(?:for|about|to)\s+(.+)/i
        );
        if (textMatch) {
          identifier = textMatch[1].trim();
        } else {
          const simpleMatch = lower.match(
            /(?:delete|remove|cancel)\s+(?:the\s+)?(.+)/i
          );
          if (simpleMatch) {
            identifier = simpleMatch[1].trim();
          }
        }
      }

      if (!identifier) {
        return {
          response: '❓ Which reminder? Use:\n• `delete reminder [ID]`\n• `delete reminder [text]`',
          metadata: { action: 'delete' },
        };
      }

      const removed = deleteReminder(userId, identifier);
      if (removed) {
        return {
          response: `🗑️ Removed reminder: *${removed.text}*`,
          metadata: { action: 'delete', reminderId: removed.id },
        };
      }

      return {
        response: `❌ No matching reminder found for "${identifier}". Use "list reminders" to see all.`,
        metadata: { action: 'delete' },
      };
    }

    // --- CLEAR ---
    if (action === 'clear') {
      const count = clearUserReminders(userId);
      if (count === 0) {
        return { response: '📋 You had no reminders to clear.', metadata: { action: 'clear' } };
      }
      return {
        response: `🗑️ Cleared all ${count} reminder(s).`,
        metadata: { action: 'clear', count },
      };
    }

    // --- SET ---
    const timeResult = parseTimeExpression(message, tzOffset);

    if (timeResult.error) {
      return { response: `⚠️ ${timeResult.error}`, metadata: { action: 'set' } };
    }

    if (!timeResult.triggerTime) {
      return {
        response: "⏰ I couldn't understand the time. Try:\n• \"Remind me in 30 minutes to call mom\"\n• \"Remind me tomorrow at 9am to check emails\"\n• \"Set a reminder every Monday at 10am for standup\"\n• \"Remind me at 5pm to leave\"",
        metadata: { action: 'set' },
      };
    }

    const reminderText = extractReminderText(message, timeResult.remainingText || message);

    if (!reminderText || reminderText.length < 2) {
      return {
        response: "📝 What should I remind you about? Say something like:\n• \"Remind me at 3pm to pick up groceries\"\n• \"Remind me in 2 hours to take medication\"",
        metadata: { action: 'set' },
      };
    }

    const id = crypto.randomUUID();
    const now = new Date();

    const reminder = {
      id,
      userId,
      text: reminderText,
      triggerTime: timeResult.triggerTime.toISOString(),
      createdAt: now.toISOString(),
      recurring: timeResult.recurring,
      fired: false,
    };

    reminders.push(reminder);
    saveReminders();

    scheduleReminder(reminder, null);

    const formattedTime = formatTime(timeResult.triggerTime, tzOffset);
    const recurringStr = timeResult.recurring ? `\n🔄 Recurring: ${formatRecurring(timeResult.recurring)}` : '';

    return {
      response: `✅ Reminder set for ${formattedTime}:\n*${reminderText}*${recurringStr}\n\nID: \`${id.slice(0, 8)}\``,
      metadata: { action: 'set', reminderId: id },
    };
  },

  isAvailable() {
    return true;
  },

  // Expose for external send function injection (e.g. WhatsApp sock)
  setSendMessage(fn) {
    this._sendMessage = fn;
    return this;
  },

  // Initialize on module load — call after sock is ready
  init(sendMessage) {
    initializeReminders(sendMessage);
    return this;
  },
};

function formatRecurring(recurring) {
  if (!recurring) return '';
  switch (recurring.type) {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return `Every ${DAY_NAMES[recurring.day]}`;
    case 'weekdays':
      return 'Every weekday (Mon–Fri)';
    case 'weekend':
      return 'Every weekend (Sat–Sun)';
    default:
      return 'Recurring';
  }
}
