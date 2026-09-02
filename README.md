<div align="center">

# 🛡️ AgriShield

### AI-Powered WhatsApp Bot for Business & Human Rights in Kenya's Agribusiness

**Code for Dignity. Innovate for Impact.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys-25D366?logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

*Built for the Business & Human Rights Solutions Challenge — a hackathon by the Cultivating Justice Project (CEPCJ · DanChurchAid · Pamoja Trust) in partnership with Riara University.*

</div>

---

## 🌱 What is AgriShield?

**AgriShield** is a free, AI-powered **WhatsApp bot** that puts Kenyan labour law in the pocket of every farm and agribusiness worker.

A worker describes a problem in plain language — *"I'm paid KES 200 a day with no contract"* — and AgriShield:

1. 🧠 **Identifies the violation** under Kenyan labour law
2. 📜 **Cites the relevant statute** from a grounded legal knowledge base
3. 🗺️ **Walks through the remedy pathway** — which office to go to, what documents to bring, and the timeline

Answers come from an **LLM grounded against a legal knowledge base** (`data/legal-knowledge-base.json`) with a **rule-based fallback** when no API key is configured — so the bot always answers, even offline.

> **"Haki"** — Swahili for *justice* — is the promise at the heart of this project.

---

## ✨ Features

### 🧠 Intelligent Legal Reasoning
- **Reasoning-first pipeline** — the bot *reasons → understands → answers*, like modern LLM assistants
- **Multi-provider LLM routing** — NVIDIA NIM, Groq & Google AI Studio with round-robin, priority, or favorite modes; automatic retry + failure-weighting + cascade
- **Semantic RAG** — hybrid retrieval (BM25 + dense embeddings fused with Reciprocal Rank Fusion) for accurate, grounded answers
- **Rule-based fallback** — fully functional without any API key

### 🌍 Built for Real Workers
- **Bilingual** — English 🇬🇧 and Swahili 🇰🇪 out of the box
- **26+ language translation** — worker messages auto-translated for accurate legal analysis, replies translated back
- **Voice notes** 🎤 — transcribed via Whisper or Gemini audio (OGG/OPUS native)
- **Photos & video** 📸 — workplace evidence analyzed via Gemini vision
- **SMS channel** 📱 — works on feature phones via TextBee or Gammu (self-hosted, fee-free)

### ⚖️ Remedy & Accountability
- **Violation classifier** — maps grievances to Kenyan labour law
- **Case tracking + SLA escalation** — every serious grievance opens a tracked case:
  | Severity | SLA |
  |----------|-----|
  | 🚨 Crisis | 2 hours |
  | 🛡️ Safety / harassment | 24 hours |
  | 💰 Wage / contract / child / environment / land | 72 hours |
- **CSO notification** — overdue cases auto-escalate and notify civil society organizations
- **UNGp reporting** — UN Guiding Principles-aligned grievance reporting
- **Corporate HRDD dashboard** — live, self-hosted: anonymized KPIs, county hotspots, case queue, SLA view & SMS console

### 🤖 PixelAI — Personal Assistant (included)
A general-purpose WhatsApp assistant with **pluggable skills**: calculator, translation, web search, weather, reminders, code help, summarization, document QA, image generation & analysis, voice transcription, and location lookup — with rate limiting, analytics, and admin commands.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        WhatsApp                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ Baileys (WebSocket)
┌──────────────────────────▼──────────────────────────────────┐
│                     AgriShield Bot                          │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Grievance  │→ │  Violation   │→ │  LLM Reasoning      │  │
│  │ Pipeline   │  │  Classifier  │  │  Engine (multi-     │  │
│  └────────────┘  └──────────────┘  │  provider routing)  │  │
│  ┌────────────┐  ┌──────────────┐  └──────────┬──────────┘  │
│  │ Knowledge  │  │  Translation │             │             │
│  │ Retriever  │  │  Engine      │  ┌──────────▼──────────┐  │
│  │ (RAG)      │  │  (26 langs)  │  │  Semantic RAG       │  │
│  └────────────┘  └──────────────┘  │  BM25 + Embeddings  │  │
│  ┌────────────┐  ┌──────────────┐  └─────────────────────┘  │
│  │ Case Store │  │  SLA Engine  │                           │
│  │ + Escal.   │  │  + Monitor   │  ┌─────────────────────┐  │
│  └────────────┘  └──────────────┘  │  Voice / Vision /   │  │
│  ┌────────────┐  ┌──────────────┐  │  SMS Channels       │  │
│  │ Dashboard  │  │  Rate Limiter│  └─────────────────────┘  │
│  └────────────┘  └──────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- A WhatsApp account (for the bot's phone number)
- *(Optional)* A free LLM API key from [NVIDIA NIM](https://build.nvidia.com), [Groq](https://console.groq.com), or [Google AI Studio](https://aistudio.google.com)

### 1. Install & configure

```bash
# Clone
git clone https://github.com/shadrackb1/haki-chatbot.git
cd haki-chatbot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# → add at least one LLM API key (NVIDIA → Groq → Google, tried in that order)
```

### 2. Run

```bash
npm start
```

Scan the QR code with WhatsApp → **Linked Devices → Link a Device**.

### 3. Run with Docker (recommended for production)

```bash
docker compose up -d          # runs AgriShield + PixelAI side by side
docker compose logs -f        # watch both bots
docker compose down           # stop both
```

> ☁️ Oracle Cloud Free Tier deployment guide: [`docs/DEPLOY-ORACLE-CLOUD.md`](docs/DEPLOY-ORACLE-CLOUD.md)

---

## 💬 Example Conversation

```
👩🏾🌾 Worker: I work on a flower farm. I've been paid KES 200 a day for 3 months
              with no contract and no payslips.

🤖 AgriShield: I'm sorry to hear that. Based on Kenyan labour law, this raises
              several concerns:

              1. 📜 Employment Act 2007, s.9 — written contract required for
                 employment lasting 3+ months
              2. 💰 Regulation of Wages (Agricultural Industry) Order — minimum
                 wage for agricultural workers is higher than KES 200/day
              3. 🧾 Employment Act, s.20 — payslips must be provided

              Next steps:
              • Visit the County Labour Office in your county (I can give you
                the address)
              • Bring: ID, any payslips, and a record of hours worked
              • Timeline: the office typically responds within 14 days

              Would you like me to find the nearest labour office for you?
```

---

## 📁 Project Structure

```
haki-chatbot/
├── src/                    # AgriShield bot source
│   ├── index.js            # Main entry — WhatsApp socket, health server
│   ├── llm-reasoning.js    # Multi-provider LLM engine (routing, retries)
│   ├── grievance-pipeline.js  # End-to-end grievance processing
│   ├── violation-classifier.js # Kenyan labour law classifier
│   ├── knowledge-retriever.js  # Semantic RAG (BM25 + embeddings)
│   ├── embedding-engine.js     # Dense embeddings
│   ├── translation-engine.js   # 26-language translation
│   ├── voice-handler.js        # Whisper / Gemini audio transcription
│   ├── image-handler.js        # Vision analysis of photos/video
│   ├── sms-gateway.js          # SMS channel (simulator/textbee/gammu)
│   ├── case-store.js           # Case tracking
│   ├── sla-engine.js           # SLA deadlines + escalation
│   ├── dashboard.js            # Corporate HRDD dashboard
│   ├── crisis-support.js       # Crisis triage
│   ├── empathy-engine.js       # Empathetic response generation
│   ├── conversation-manager.js # Session memory
│   ├── user-db.js              # User persistence
│   ├── registration-flow.js    # Onboarding flow
│   ├── rate-limiter.js         # Abuse protection
│   └── ...                     # 30+ modules
├── PixelAI/                # Personal assistant bot (pluggable skills)
├── data/                   # Legal knowledge base, county offices, evals
├── docs/                   # Project writeups, deployment guides
├── test/                   # Tests
├── docker-compose.yml      # AgriShield + PixelAI
├── Dockerfile.haki         # AgriShield image
└── Dockerfile.pixelai      # PixelAI image
```

---

## 🧪 Testing

```bash
npm test
```

---

## 🗺️ Roadmap

- [x] Reasoning-first LLM pipeline with multi-provider routing
- [x] Semantic RAG with hybrid retrieval
- [x] Voice, vision, and SMS channels
- [x] Case tracking with SLA escalation
- [x] Corporate HRDD dashboard
- [ ] SQLite migration for case store (scalability)
- [ ] Multi-language beyond Swahili/English (rule-based)
- [ ] Case tracking with ticket numbers & follow-ups
- [ ] USSD fallback for feature phones
- [ ] Interactive legal quizzes for worker education

---

## 🤝 Contributing

Contributions are welcome! This project was born in a hackathon and grew into a serious tool for worker rights. If you'd like to help:

1. 🍴 Fork the repository
2. 🌿 Create a feature branch (`git checkout -b feature/amazing-idea`)
3. 💾 Commit your changes (`git commit -m 'feat: add amazing idea'`)
4. 📤 Push to the branch (`git push origin feature/amazing-idea`)
5. 🎉 Open a Pull Request

---

## 📄 License

[MIT](LICENSE) © 2026 — Built with ❤️ for the workers of Kenya's agribusiness sector.

---

<div align="center">

**AgriShield** — *Haki kwa kila mfanyakazi.* (Justice for every worker.)

</div>