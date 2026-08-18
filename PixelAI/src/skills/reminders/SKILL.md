# Reminders Skill

Set, list, and manage timed reminders via WhatsApp.

## Overview

The Reminders skill allows users to create, view, and manage timed reminders through natural language commands. Reminders persist across bot restarts and support both one-time and recurring schedules.

## Triggers

```
remind me, set reminder, reminder, don't forget, schedule,
alarm, notify me, remember to
```

## Actions

### Set Reminder

Creates a new reminder with a natural language time expression and text.

**Supported time formats:**

| Pattern | Example |
|---------|---------|
| `in X minutes/hours/days/weeks` | "remind me in 30 minutes to take medication" |
| `tomorrow at HH:MM` | "remind me tomorrow at 9am to call the lawyer" |
| `next [day] at HH:MM` | "remind me next Friday at 2pm for the meeting" |
| `today at HH:MM` | "remind me today at 5pm to leave" |
| `at HH:MM` | "remind me at 3pm to check emails" |
| `at noon` / `at midnight` | "remind me at noon to pray" |
| `every day at HH:MM` | "remind me every day at 8am to take medication" |
| `every [day] at HH:MM` | "remind me every Monday at 10am for standup" |
| `every weekday at HH:MM` | "remind me every weekday at 7am to exercise" |
| `every weekend at HH:MM` | "remind me every weekend at 9am to clean" |

**Time suffixes:** `am`, `pm` supported. 12-hour format assumed when AM/PM present.

**Examples:**

```
Remind me in 2 hours to call mom
Set a reminder for tomorrow at 9am to check emails
Remind me every Monday at 10am for standup
Don't forget to buy groceries at 5pm
Schedule a reminder every weekday at 7am to exercise
```

**Response:**

```
✅ Reminder set for Wednesday, August 19, 2026 at 9:00 AM:
Call the lawyer

🔄 Recurring: Every Monday

ID: a1b2c3d4
```

### List Reminders

Shows all active (unfired) reminders for the user.

**Examples:**

```
List my reminders
Show reminders
What are my reminders?
```

**Response:**

```
📋 Your Active Reminders (2):

1. *Call the lawyer*
   📅 Wednesday, August 19, 2026 at 9:00 AM
   ID: a1b2c3d4

2. *Exercise*
   📅 Monday, August 25, 2026 at 7:00 AM
   🔄 Recurring: Every weekday (Mon–Fri)
   ID: e5f6g7h8

_Reply "delete reminder [ID or text]" to remove one._
```

### Delete Reminder

Removes a reminder by its ID (first 8 characters) or by text match.

**Examples:**

```
Delete reminder a1b2c3d4
Remove the reminder for call the lawyer
Cancel reminder exercise
```

**Response (success):**

```
🗑️ Removed reminder: Call the lawyer
```

**Response (not found):**

```
❌ No matching reminder found for "exercise". Use "list reminders" to see all.
```

### Clear All

Removes all active reminders for the user.

**Examples:**

```
Clear my reminders
Remove all reminders
Delete all reminders
```

**Response:**

```
🗑️ Cleared all 5 reminder(s).
```

## Recurring Reminders

Recurring reminders use the following schedule types:

| Type | Pattern | Behavior |
|------|---------|----------|
| Daily | `every day at HH:MM` | Fires once per day |
| Weekly | `every [day] at HH:MM` | Fires once per week on that day |
| Weekdays | `every weekday at HH:MM` | Fires Mon–Fri |
| Weekend | `every weekend at HH:MM` | Fires Sat–Sun |

When a recurring reminder fires, the next occurrence is automatically scheduled and persisted.

## Timezone Handling

The skill resolves time using the user's timezone:

1. **`context.timezone`** — If the context provides a timezone (e.g. `"Africa/Nairobi"`, `"EAT"`, `"EST"`), it is used
2. **IANA timezone names** — Parsed via `toLocaleString`
3. **Abbreviation fallback** — Common abbreviations supported: `EAT`, `CAT`, `SAST`, `EST`, `PST`, `IST`, `JST`, `UTC`, etc.
4. **UTC default** — If no timezone is available, UTC is assumed

## Persistence

Reminders are stored in `data/reminders.json`:

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "userId": "254746053175@s.whatsapp.net",
    "text": "Call the lawyer",
    "triggerTime": "2026-08-19T06:00:00.000Z",
    "createdAt": "2026-08-18T05:00:00.000Z",
    "recurring": null,
    "fired": false
  }
]
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID v4 identifier |
| `userId` | `string` | WhatsApp JID of the user |
| `text` | `string` | Reminder text |
| `triggerTime` | `string` | ISO 8601 UTC timestamp of when to fire |
| `createdAt` | `string` | ISO 8601 UTC timestamp of creation |
| `recurring` | `object\|null` | Recurring schedule config (`{ type, day? }`) |
| `fired` | `boolean` | Whether the reminder has been delivered |

## Startup Recovery

On bot startup, all reminders are loaded from disk. Unfired reminders are re-scheduled with `setTimeout` based on their `triggerTime`. Recurring reminders compute their next occurrence from the stored time.

## Integration

### Skill Interface

```js
export default {
  name: 'reminders',
  description: 'Set, list, and manage timed reminders via WhatsApp',
  triggers: ['remind me', 'set reminder', 'reminder', "don't forget", 'schedule', 'alarm', 'notify me', 'remember to'],
  async execute(message, context) {
    // Returns { response: string, metadata?: { reminderId?, action? } }
  },
  isAvailable() { return true; }
}
```

### Injecting Send Function

To deliver reminders to WhatsApp, inject the send function after the socket is ready:

```js
import remindersSkill from './skills/reminders/index.js';

// After sock is connected:
remindersSkill.init(async (userId, message) => {
  await sock.sendMessage(userId, { text: message });
});
```

### Context Object

The `context` parameter should include:

```js
{
  chatId: '254746053175@s.whatsapp.net',
  senderId: '254746053175@s.whatsapp.net',
  senderName: 'John',
  isGroup: false,
  timezone: 'EAT'  // Optional — abbreviation or IANA name
}
```

## Error Handling

| Scenario | Response |
|----------|----------|
| No time specified | Instructions for time formats |
| No reminder text | Prompt for what to remind about |
| Time already passed | "That time has already passed today" |
| Unrecognized time | Fallback with example formats |
| Delete non-existent | "No matching reminder found" |
| Clear with none | "You had no reminders to clear" |

## File Structure

```
src/skills/reminders/
├── index.js      # Skill implementation
└── SKILL.md      # This documentation
```

Data stored at: `data/reminders.json`
