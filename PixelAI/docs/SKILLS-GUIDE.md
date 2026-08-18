# PixelAI Skills Guide

## How Skills Work

PixelAI uses a **modular skill system**. Each skill is a self-contained module that handles a specific capability. Skills are automatically loaded from `src/skills/` at startup.

### Skill Interface

Every skill must export a default object with this interface:

```js
export default {
  name: 'my-skill',                    // Unique identifier
  description: 'What it does',          // Human-readable description
  triggers: ['trigger word', 'phrase'], // Keywords that activate this skill
  async execute(message, context) {     // Main execution function
    // message: the user's message text
    // context: { chatId, isGroup, senderId, senderName, location?, imageBuffer?, audioBuffer? }
    
    // Must return:
    return {
      response: 'Text response to send',  // Required
      media: {                             // Optional - for sending images/files
        type: 'image',                     // 'image', 'audio', 'document'
        buffer: Buffer,                    // File buffer
        caption: 'Optional caption'        // Caption for media
      },
      metadata: {}                         // Optional - any extra data
    };
  },
  isAvailable() {                         // Check if skill can run
    return true;                           // Return false if API key missing, etc.
  }
};
```

### Adding a New Skill

1. Create a directory: `src/skills/my-skill/`
2. Create `index.js` with the skill interface above
3. Create `SKILL.md` with documentation
4. Restart PixelAI — it auto-discovers new skills

### Example: Simple Skill

```js
// src/skills/fortune/index.js
export default {
  name: 'fortune',
  description: 'Get a random fortune cookie',
  triggers: ['fortune', 'lucky number', 'predict my future'],
  async execute(message, context) {
    const fortunes = [
      'A great opportunity lies ahead.',
      'The code you write today will save you tomorrow.',
      'A helpful stranger will share wisdom.',
      'Debugging is just storytelling with error messages.'
    ];
    const fortune = fortunes[Math.floor(Math.random() * fortunes.length)];
    return { response: `🔮 *Fortune:* ${fortune}` };
  },
  isAvailable() { return true; }
};
```

### Example: API Skill

```js
// src/skills/dog-facts/index.js
export default {
  name: 'dog-facts',
  description: 'Get random dog facts',
  triggers: ['dog fact', 'tell me about dogs', 'puppy fact'],
  async execute(message, context) {
    try {
      const res = await fetch('https://dog-api.kinduff.com/api/facts?number=1');
      const data = await res.json();
      return { response: `🐕 *Dog Fact:* ${data.facts[0]}` };
    } catch (error) {
      return { response: 'Sorry, I couldn\'t fetch a dog fact right now.' };
    }
  },
  isAvailable() { return true; }
};
```

## Built-in Skills

| Skill | What It Does | API Required |
|-------|-------------|--------------|
| `web-search` | Search the internet | Firecrawl (or free scraping) |
| `weather` | Weather forecasts | OpenWeatherMap (free) |
| `translation` | Translate between 100+ languages | NVIDIA NIM (existing) |
| `calculator` | Math, unit conversions, currency | None |
| `reminders` | Set timed reminders | None |
| `knowledge-qa` | Answer from your documents (RAG) | None |
| `image-gen` | Generate images from text | Stability AI or OpenAI |
| `image-analysis` | Describe/analyze images | OpenAI GPT-4o |
| `voice-transcribe` | Transcribe voice messages | OpenAI Whisper or Groq |
| `code-helper` | Generate/explain code | NVIDIA NIM (existing) |
| `summarizer` | Summarize text and URLs | NVIDIA NIM (existing) |
| `location` | Nearby places, directions | OpenStreetMap (free) |

## Admin Commands

Use these in WhatsApp (bot owner only):

| Command | Description |
|---------|-------------|
| `!stats` | Show analytics dashboard |
| `!skills` | List all skills with status |
| `!skill <name> on/off` | Enable/disable a skill |
| `!users` | List all users |
| `!user <phone>` | User details |
| `!logs` | Recent errors |
| `!broadcast <msg>` | Message all users |
| `!config` | Show config |
| `!config <key> <value>` | Update config |
| `!memory` | Memory usage |
| `!backup` | Export data |
| `!restart` | Restart bot |
| `!help` | List commands |

## Group Commands

| Command | Description |
|---------|-------------|
| `pixel on` | Enable bot in group |
| `pixel off` | Disable bot in group |
| `pixel status` | Check bot status |
| `pixel` | Toggle bot on/off |

## File Structure

```
src/skills/
├── web-search/         # Internet search
├── weather/            # Weather forecasts
├── translation/        # Language translation
├── calculator/         # Math and conversions
├── reminders/          # Scheduled reminders
├── knowledge-qa/       # Document Q&A (RAG)
├── image-gen/          # AI image generation
├── image-analysis/     # Image description
├── voice-transcribe/   # Voice to text
├── code-helper/        # Code generation
├── summarizer/         # Text summarization
└── location/           # Maps and places
```
