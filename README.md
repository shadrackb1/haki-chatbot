# Haki / AgriShield

WhatsApp grievance bot for business and human rights in Kenya's agribusiness. Farm workers report issues in their own language; cases get triaged, tracked, and escalated.

## What it does

- WhatsApp and SMS intake with multi-language support (sw / en and more)
- Grievance pipeline: classify violations, open tracked cases, set SLA deadlines
- Crisis routing for safety and harassment reports
- Voice notes, photos, and short video handled via Gemini / Whisper
- Hybrid RAG (BM25 + embeddings) over Kenyan agri and rights knowledge
- SLA escalation that notifies CSOs when deadlines slip
- Self-hosted HRDD dashboard: anonymized KPIs, county hotspots, case queue

## Stack

Node.js, Express, Socket.IO, Baileys (WhatsApp), pdfkit, multi-provider LLM router (NVIDIA NIM, Groq, Google Gemini). Docker-ready.

## Run locally

```bash
npm install
cp .env.example .env   # at least one LLM key
npm run dev
```

Optional: SMS gateway (TextBee / Gammu), dashboard on `DASHBOARD_PORT`.

## License

Private / all rights reserved.
