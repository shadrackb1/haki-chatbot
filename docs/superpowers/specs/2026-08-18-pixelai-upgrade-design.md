# PixelAI Upgrade Design Spec

> **Date:** 2026-08-18
> **Goal:** Transform PixelAI from a simple chatbot into a multi-purpose WhatsApp AI companion with modular skills, admin system, analytics, and media handling.
> **LLM Provider:** NVIDIA NIM only (keep what works)

## Architecture

### Skill System
Modular skill registry. Every capability is a pluggable skill with a standard interface:
- `name` — unique identifier
- `description` — what it does
- `triggers` — keyword patterns that activate it
- `execute(message, context)` → `{ response, media?, metadata? }`
- `isAvailable()` — checks if API keys/config exist

### Message Flow
```
WhatsApp Message → MessageRouter (detect triggers) → SkillRegistry (load skill) → Skill.execute() → Humanizer.postProcess() → Send
```

## Skills (12 total)

| # | Skill | Trigger Examples | API |
|---|-------|-----------------|-----|
| 1 | web-search | "search for", "look up", "google" | Firecrawl / SerpAPI |
| 2 | weather | "weather", "forecast", "temperature" | OpenWeatherMap (free) |
| 3 | translation | "translate to", "in swahili", "in french" | LLM (built-in) |
| 4 | calculator | "calculate", "math", "convert", "how much is" | None (local) |
| 5 | reminders | "remind me", "set reminder", "don't forget" | None (local + setTimeout) |
| 6 | knowledge-qa | "from my docs", "in my notes", "based on" | None (local RAG) |
| 7 | image-gen | "generate image", "create picture", "draw" | Stability AI / DALL-E |
| 8 | image-analysis | (when user sends image) | Vision LLM |
| 9 | voice-transcribe | (when user sends voice) | Whisper / Groq |
| 10 | code-helper | "write code", "debug", "explain code", "function" | LLM (built-in) |
| 11 | summarizer | "summarize", "tldr", "short version" | LLM (built-in) |
| 12 | location | "near me", "directions", "map" | OpenStreetMap |

## Admin System

Bot owner WhatsApp commands: `!stats`, `!skills`, `!skill <name> on/off`, `!users`, `!user <phone>`, `!logs`, `!broadcast`, `!config`, `!memory`, `!backup`, `!restart`

## Analytics

Structured JSON metrics: total users, active today, messages today, skill usage counts, LLM calls, avg response time.

## Rate Limiting

- Per user: 20 msg/min, 200/day
- Global: 100 concurrent LLM calls
- Per skill: configurable cooldowns

## Media Handling

Send/receive images, documents, audio. Voice message transcription. Image generation and sending.

## File Structure

```
PixelAI/src/
├── index.js, llm-reasoning.js, conversation-manager.js
├── personal-knowledge-base.js, humanizer.js
├── message-router.js (NEW)
├── skill-registry.js (NEW)
├── rate-limiter.js (NEW)
├── admin-commands.js (NEW)
├── analytics.js (NEW)
├── media-handler.js (NEW)
├── location-handler.js (NEW)
├── voice-handler.js (NEW)
├── intent-classifier.js (enhanced)
├── response-generator.js (fallback only)
├── escalation-system.js (enhanced)
└── skills/ (12 skill directories)
```

## Dependencies Added

- `node-cron` — scheduled reminders
- `sharp` — image processing
- `cheerio` — HTML parsing for web scraping

## Constraints

- NVIDIA NIM only (no multi-provider)
- All data local (privacy-first)
- MIT license
- Baileys (unofficial WhatsApp)
