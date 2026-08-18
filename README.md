# 🇰🇪 HAKI CHATBOT - Business & Human Rights WhatsApp Bot

> *"From Rights Knowledge to Real Justice — In Your Language, On Your Phone"*

## What Is This?

**Haki Chatbot** is a free, open-source WhatsApp bot that helps agribusiness workers and farmers in Kenya:
- **Know their rights** under Kenyan labour laws
- **Report violations** (wage theft, unsafe conditions, child labor, etc.)
- **Get connected** to the right remedy institution (Labour Office, Court, Legal Aid)

## How It Works

```
User texts WhatsApp → AI classifies intent → Bot responds conversationally:
  1. Welcome new users with friendly introduction
  2. Understands questions vs requests
  3. Identifies violations with reasoning
  4. Provides step-by-step remedy with empathy
  5. Remembers context for natural conversation
```

## Tech Stack

| Component | Technology | Cost |
|-----------|-----------|------|
| WhatsApp Connection | Baileys (open-source) | FREE |
| AI Engine | Rule-based + Optional LLM (NVIDIA/OpenAI) | FREE / Paid |
| Conversation | Human-like with empathy & memory | FREE |
| Language Support | Swahili, English, Kikuyu, Luo, Kalenjin | FREE |
| Hosting | Your laptop/server | FREE |

## Setup (3 Steps)

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Add LLM API key for AI reasoning
# Edit .env file and add your NVIDIA/OpenAI API key

# 3. Run the bot
npm start

# 4. Scan QR code with WhatsApp
# WhatsApp > Linked Devices > Link a Device
```

## Features

### 🗣️ Human-Like Conversation
- **Welcome flow** for new users
- **Remembers** user's name, language, location
- **Empathetic responses** - "I understand this is tough"
- **Encouraging tone** - "You deserve better"
- **Natural follow-ups** - "Tell me more about your situation"

### 🧠 AI Reasoning (Optional)
- **Intent classification** - Distinguishes questions from requests
- **Situation reasoning** - Understands complex scenarios
- **Request filtering** - Blocks spam/irrelevant messages
- **Context awareness** - Remembers conversation history

### ⚖️ Legal Knowledge Base
Covers 8 violation categories:
1. Wage violations (below minimum wage)
2. No written contract
3. Safety violations (no PPE)
4. Child labor
5. Environmental harm
6. Gender-based violence
7. Land rights violations
8. Certification fraud

### 🏛️ Remedy Institution Database
- 10 national institutions
- 3 legal aid NGOs
- All 47 county labour offices
- Toll-free numbers included

### 📱 WhatsApp Integration
- Works like ChatGPT/Meta AI on WhatsApp
- User texts → Bot responds naturally
- No app download needed
- Works on basic phones

## Demo Scenarios

### Scenario 1: New User Welcome
**User (new):** "Habari"
**Haki:** "Habari za asubuhi! 👋 Karibu sana Haki Chatbot! Mimi ni Haki, msaidizi wako wa haki za kazi..."

### Scenario 2: Wage Violation with Empathy
**User:** "Nalipwa KES 200 tu kwa siku"
**Haki:** "Naelewa hii ni shida kubwa kwako. 😔 Nimegundua kuwa una tatizo la mshahara chini ya kiwango cha chini. Hii ni kinyume na sheria ya Kenya..."

### Scenario 3: Question vs Request
**User:** "What are my rights?"
**Haki:** [Provides comprehensive rights list]

**User:** "I want to file a complaint"
**Haki:** [Guides through complaint process]

## Project Structure

```
Haki-Chatbot/
├── src/
│   ├── index.js                 # Main bot + message handler
│   ├── llm-reasoning.js         # AI reasoning engine (optional)
│   └── conversation-manager.js  # Human-like conversation flow
├── data/
│   ├── legal-knowledge-base.json # Laws, violations, remedies
│   └── users.json               # User profiles (auto-generated)
├── docs/
│   ├── WHATSAPP-SETUP.md        # Baileys vs Official API
│   └── LLM-SETUP.md             # How to enable AI reasoning
├── auth_info/                   # Auto-generated WhatsApp session
├── .env                         # Configuration
├── .env.example                 # Configuration template
├── package.json
└── README.md
```

## Evaluation Criteria Alignment

| Criteria | Weight | How Haki Wins |
|----------|--------|---------------|
| Impact | 30% | Targets 800,000+ smallholder farmers + all agribusiness workers |
| Innovation | 20% | AI-powered violation classification + multi-door remedy routing + human-like conversation |
| Practicality | 20% | WhatsApp = zero barrier. Works on basic phones |
| Sustainability | 15% | B2B compliance, government contracts, CSO partnerships |
| Scalability | 10% | Works for ANY crop, ANY county, ANY East African country |

## Important Notes

- **Baileys is unofficial** — It connects to WhatsApp Web, not the official API
- **Use a secondary number** — Don't use your personal WhatsApp number
- **No Meta approval needed** — Just scan QR code and start
- **Free forever** — MIT license, no hidden costs
- **LLM is optional** — Bot works great without it (rule-based mode)

## License

MIT License - Free to use, modify, and distribute.

---

Built for the **Business and Human Rights Solutions Challenge** hackathon, 24-25 September 2026.
Theme: *Code for Dignity. Innovate for Impact*
