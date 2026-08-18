# PixelAI Upgrade Implementation Plan

> **Goal:** Transform PixelAI into a multi-purpose WhatsApp AI companion with modular skills, admin, analytics, and media handling.
> **LLM:** NVIDIA NIM only (keep current)
> **Architecture:** Pluggable skill system with message routing

## Task 1: Core Infrastructure

### 1a. Skill Registry (`src/skill-registry.js`)
- Skill loading from `src/skills/` directory
- Skill interface validation
- Trigger matching engine
- Skill enable/disable per config
- List all skills, get skill by name

### 1b. Message Router (`src/message-router.js`)
- Receives incoming message
- Checks triggers against all registered skills
- Routes to highest-confidence skill
- Falls back to LLM reasoning if no skill matches
- Handles media messages (images, voice, docs)

### 1c. Rate Limiter (`src/rate-limiter.js`)
- Per-user: 20 msg/min, 200/day
- Per-skill cooldowns
- Global concurrent limit
- Graceful "slow down" responses

### 1d. Analytics (`src/analytics.js`)
- Track: user count, messages, skill usage, LLM calls, response times
- Persist to `data/analytics.json`
- Console dashboard output
- Daily reset capability

### 1e. Admin Commands (`src/admin-commands.js`)
- Parse `!command` syntax
- Owner-only permission check
- All admin commands: stats, skills, users, logs, broadcast, config, memory, backup, restart
- Send results back via WhatsApp

## Task 2: Skills (12 total)

### 2a. web-search
- Uses Firecrawl or web scraping with cheerio
- Returns top 5 results with titles, URLs, snippets
- Formats for WhatsApp readability

### 2b. weather
- OpenWeatherMap free API
- Current weather + 3-day forecast
- Location-based or city name

### 2c. translation
- LLM-powered (pass translation prompt to NVIDIA NIM)
- Auto-detect source language
- Support: Swahili, English, French, Spanish, Arabic, Hindi, Chinese, Japanese, Korean, Portuguese

### 2d. calculator
- Math expression evaluator (safe, no eval)
- Unit conversions (temperature, weight, distance, currency)
- Currency rates (free API)

### 2e. reminders
- Parse natural language time ("tomorrow at 9am", "in 2 hours", "every Monday")
- Store in `data/reminders.json`
- node-cron for scheduling
- WhatsApp notification when reminder fires

### 2f. knowledge-qa
- Simple RAG over `data/knowledge-base/` files
- Text extraction from txt, md, json files
- Keyword matching + LLM summarization
- No vector DB needed for v1

### 2g. image-gen
- Stability AI or DALL-E API
- Generate from text prompt
- Send image via WhatsApp (sharp for resizing)

### 2h. image-analysis
- When user sends image, use vision LLM
- Describe, analyze, answer questions about image
- Requires OpenAI GPT-4o vision or similar

### 2i. voice-transcribe
- When user sends voice message
- Download audio from WhatsApp
- Send to Whisper API / Groq for transcription
- Return transcribed text + respond

### 2j. code-helper
- LLM-powered code generation
- Explain code, debug, refactor
- Format code blocks for WhatsApp (monospace)

### 2k. summarizer
- LLM-powered summarization
- Handle text, URLs (fetch page content), documents
- Configurable length: brief (2-3 sentences), medium, detailed

### 2l. location
- OpenStreetMap / Nominatim for geocoding
- Nearby places search
- Basic directions
- Weather by coordinates

## Task 3: Media & Voice Handling

### 3a. Media Handler (`src/media-handler.js`)
- Receive images, documents, audio from WhatsApp
- Save to `data/media/` temporarily
- Process based on type (image → analyze, audio → transcribe, doc → parse)
- Send images/media back to WhatsApp

### 3b. Voice Handler (`src/voice-handler.js`)
- Download voice message audio (ogg/opus)
- Convert to WAV/MP3 if needed (sharp or ffmpeg)
- Send to transcription API
- Return text for further processing

### 3c. Location Handler (`src/location-handler.js`)
- Parse WhatsApp location messages
- Reverse geocode coordinates
- Find nearby places
- Return formatted location info

## Task 4: Enhanced Existing Files

### 4a. Enhanced `index.js`
- Integrate MessageRouter
- Add media message handling (images, voice, location, documents)
- Add admin command parsing
- Add analytics tracking
- Add rate limiting before message processing

### 4b. Enhanced `llm-reasoning.js`
- Accept custom system prompts from skills
- Add `processWithPrompt(message, systemPrompt, context)` method
- Keep existing `processMessage()` for core chat

### 4c. Enhanced `intent-classifier.js`
- Add LLM-powered intent detection as primary
- Keep regex patterns as fast fallback
- Add skill-specific intent categories

### 4d. Enhanced `escalation-system.js`
- Add WhatsApp notification to bot owner
- Add escalation history persistence
- Add configurable severity levels

## Task 5: Config & Setup

### 5a. Updated `.env.example`
- Add all API key slots: FIRECRAWL_API_KEY, OPENWEATHER_API_KEY, STABILITY_API_KEY, OPENAI_API_KEY, WHISPER_API_KEY, GOOGLE_MAPS_API_KEY
- Add bot config: BOT_OWNER_NUMBER, RATE_LIMIT_PER_USER, RATE_LIMIT_PER_DAY

### 5b. Updated `package.json`
- Add new dependencies: node-cron, sharp, cheerio

### 5c. Skills Guide (`docs/SKILLS-GUIDE.md`)
- How to create custom skills
- Skill interface documentation
- Example skill template

## Execution Order

1. **Task 1** (Core infra) — skill-registry → message-router → rate-limiter → analytics → admin-commands
2. **Task 5** (Config) — .env.example, package.json
3. **Task 2** (Skills) — calculator → translation → web-search → weather → reminders → code-helper → summarizer → knowledge-qa → image-gen → image-analysis → voice-transcribe → location
4. **Task 3** (Media) — media-handler → voice-handler → location-handler
5. **Task 4** (Enhanced files) — index.js → llm-reasoning.js → intent-classifier.js → escalation-system.js
6. **Task 5c** (Docs) — SKILLS-GUIDE.md

## Verification

After each task:
1. Run `node src/index.js` — should start without errors
2. Test skill loading: console should show all 12 skills registered
3. Send test WhatsApp messages for each skill
4. Test admin commands
5. Test rate limiting
6. Test media handling (send image, voice)
