# 🤖 HAKI CHATBOT — WhatsApp AI Bots

Two AI-powered WhatsApp bots, always on.

---

## 🇰🇪 Haki — Human Rights & Agribusiness Bot

> *"From Rights Knowledge to Real Justice — In Your Language, On Your Phone"*

A free WhatsApp bot that helps agribusiness workers and farmers in Kenya:

- **Know their rights** under Kenyan labour laws
- **Report violations** (wage theft, unsafe conditions, child labor, etc.)
- **Get connected** to the right remedy institution (Labour Office, Court, Legal Aid)
- **Language:** English default (Swahili available on request)

---

## 🧠 PixelAI — Personal AI Assistant

> *"Your everyday AI companion, right in WhatsApp"*

A multi-purpose personal assistant bot with 12 built-in skills:

- **Calculator** — math, unit conversion, currency
- **Translation** — 100+ languages via LLM
- **Web Search** — real-time internet lookups
- **Weather** — current conditions and forecasts
- **Reminders** — set and manage reminders
- **Code Helper** — generate, debug, explain code
- **Summarizer** — condense text, articles, docs
- **Knowledge QA** — answer questions from your uploaded documents
- **Image Generation** — create images from text prompts
- **Image Analysis** — describe and analyze photos
- **Voice Transcription** — convert voice messages to text
- **Location** — nearby places, directions, geocoding
- **Admin Commands** — stats, analytics, skill management
- **Rate Limiting** — prevent spam
- **Humanizer** — natural, conversational responses

---

## Quick Start

```bash
# Install dependencies (for either bot)
cd Haki-Chatbot        # for Haki
cd Haki-Chatbot/PixelAI  # for PixelAI

npm install
npm start

# Scan QR with WhatsApp → Linked Devices → Link a Device
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| WhatsApp | Baileys (open-source) |
| AI Engine | NVIDIA NIM (Llama 3.1 8B) |
| Runtime | Node.js + ES Modules |
| Language | English (both bots) |

## Deployment

Both bots run 24/7 via Docker on Oracle Cloud Free Tier (free forever).

See `docs/DEPLOY-ORACLE-CLOUD.md` for full deployment guide.

```bash
docker compose up -d
```

## License

MIT
