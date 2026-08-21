# Haki Chatbot

WhatsApp bots built on Baileys (Node.js). Both run in Docker and stay connected via QR login.

## Haki — workplace rights for Kenya's agribusiness workers

A free WhatsApp bot for farm and agribusiness workers in Kenya. Describe a problem ("I'm paid KES 200 a day with no contract") and the bot identifies the violation under Kenyan labour law, cites the relevant statute, and walks you through the remedy pathway — which office to go to, what documents you need, and the timeline.

Answers come from an LLM grounded against a legal knowledge base (`data/legal-knowledge-base.json`), with a rule-based fallback when no API key is configured. Voice notes are transcribed through Whisper when a key is set. English by default; Swahili on request.

## PixelAI — personal assistant bot

A general-purpose WhatsApp assistant (`PixelAI/`) with pluggable skills in `PixelAI/src/skills/`: calculator, translation, web search, weather, reminders, code help, summarization, document QA, image generation and analysis, voice transcription, and location lookup. Includes rate limiting, analytics, and admin commands.

## Quick start

```bash
cd Haki-Chatbot          # Haki
# or
cd Haki-Chatbot/PixelAI  # PixelAI

npm install
npm start

# Scan the QR with WhatsApp → Linked Devices → Link a Device
```

Copy `.env.example` to `.env` and add at least one LLM API key (NVIDIA NIM, Groq, or Google AI Studio — tried in that order).

## Deployment

Both bots run as Docker containers (`docker-compose.yml`, Oracle Cloud Free Tier setup in `docs/DEPLOY-ORACLE-CLOUD.md`):

```bash
docker compose up -d
```

## License

MIT
