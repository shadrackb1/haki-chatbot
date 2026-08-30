# AGRISHIELD

## AI-Powered WhatsApp Bot for Workers' Rights in Kenya's Agribusiness Sector

**Business and Human Rights Solutions Challenge — Project Writeup**

**Team Name:** [Team Name]

**Institution:** [University Name]

**Date:** September 2026

---

## Table of Contents

1. Abstract
2. Introduction and Background
3. Problem Definition
4. Solution Overview
5. Alignment with UNGPs and Business and Human Rights Principles
6. Technical Architecture
7. User-Centred Design
8. Innovation
9. Impact and Scalability
10. Sustainability and Future Roadmap
11. Conclusion
12. References

---

## 1. Abstract

Kenya's agribusiness sector employs millions of workers, many of whom face wage violations, unsafe working conditions, lack of contracts, and other labour rights abuses. These workers often lack access to timely, actionable information about their legal rights and the remedy pathways available to them. Existing legal aid services are overstretched, geographically limited, and predominantly English-speaking, leaving a critical gap for rural and low-literacy workers.

AgriShield Chatbot is an AI-powered WhatsApp bot that provides instant, grounded legal guidance to Kenyan agribusiness workers. Workers describe their workplace problems in plain language — via text, voice notes, or photographs — and the bot identifies the specific violation under Kenyan law, cites the applicable statute, and walks the user through a step-by-step remedy pathway, including which office to visit, what documents to carry, and the expected timeline.

The system combines a legal knowledge base of 308 statutory passages, a BM25 retrieval engine for grounded responses, and a multi-provider large language model (LLM) pipeline that reasons through each query before generating a response. Voice notes are transcribed via Whisper, and photographs are analysed via Gemini vision to identify payslips, contracts, and workplace hazards. The bot operates in English and Swahili, requires no internet browser or smartphone app — only WhatsApp — and functions fully offline in rule-based fallback mode when no LLM API key is configured.

AgriShield directly advances the objectives of the United Nations Guiding Principles on Business and Human Rights (UNGPs) by empowering rights-holders with information, lowering barriers to remedy, and creating a scalable tool for monitoring corporate human rights compliance in Kenya's agricultural sector.

---

## 2. Introduction and Background

### 2.1 The UNGPs and the Right to Remedy

The United Nations Guiding Principles on Business and Human Rights (UNGPs), endorsed in 2011, establish three foundational pillars: the state duty to protect human rights, the corporate responsibility to respect human rights, and the need for effective remedy when abuses occur. Principle 25 states that where business enterprises identify that they have caused or contributed to adverse impacts, they should provide for or cooperate in their remediation through legitimate processes.

In 2021, the UNGPs 10+ Roadmap set out priorities for the next decade, including enhancing access to remedy for affected rights-holders and leveraging technology to monitor and report business-related human rights abuses.

### 2.2 Kenya's Agribusiness Sector

Agriculture accounts for approximately 33% of Kenya's GDP and employs over 70% of the rural population. The sector includes large-scale flower farms, tea and coffee plantations, horticultural export operations, and livestock enterprises. Workers in this sector face systemic violations including:

- Payment below the statutory minimum wage (KES 15,000-17,000/month depending on zone)
- Absence of written employment contracts
- Exposure to hazardous chemicals without protective equipment
- Child labour in tea and coffee picking
- Gender-based harassment and discrimination
- Land displacement without adequate compensation

The Cultivating Justice Project, funded by the European Union and implemented by DanChurchAid, Pamoja Trust, and CEPCJ, has worked with over 100 agribusinesses in Nakuru, Nyandarua, and Nairobi Metropolis counties to promote responsible business conduct. AgriShield Chatbot builds on this work by extending rights information directly to workers through the platform they already use daily: WhatsApp.

### 2.3 Why WhatsApp

WhatsApp is the most widely used messaging platform in Kenya, with over 11 million active users. Unlike web-based legal databases or smartphone apps, WhatsApp:

- Works on basic smartphones and feature phones via WhatsApp Lite
- Operates on low-bandwidth connections common in rural areas
- Requires no new app installation or account creation
- Supports voice notes for users with low literacy
- Supports photo sharing for visual evidence (payslips, contracts, injuries)

By meeting workers on a platform they already trust and use, AgriShield eliminates the adoption barrier that defeats most legal tech interventions.

---

## 3. Problem Definition

### 3.1 The Core Problem

Agribusiness workers in Kenya do not know their rights under Kenyan law, and when they do, they lack accessible, actionable guidance on how to enforce those rights. The information gap creates a cycle of exploitation: workers accept illegal wages, unsafe conditions, and unfair treatment because they do not know that the law protects them, or because the remedy process appears impossibly complex.

### 3.2 Who Is Affected

| Stakeholder | Specific Challenge |
|-------------|-------------------|
| Farm workers | Below-minimum wages, no contracts, exposure to pesticides without PPE |
| Tea and coffee pickers | Child labour, piece-rate pay below daily minimum |
| Flower farm workers | Gender-based harassment, chemical exposure, union suppression |
| Smallholder farmers | Land grabs, unfair contract terms, lack of market information |
| Youth in agribusiness | Exploitative internship schemes, unpaid labour |

### 3.3 Why Existing Solutions Fall Short

| Existing Solution | Limitation |
|-------------------|------------|
| Legal aid clinics | Geographically limited; understaffed; operating hours conflict with work schedules |
| Government labour offices | Bureaucratic; workers unaware of their existence; language barriers |
| NGO hotlines | Limited capacity; call-centre model does not scale |
| Legal information websites | Require internet access, literacy, and legal knowledge to navigate |
| Community paralegals | Insufficient coverage; training gaps; no standardised knowledge base |

### 3.4 The Gap AgriShield Fills

AgriShield addresses the intersection of three failures:

1. **Information failure**: Workers do not know their rights
2. **Access failure**: Existing remedies are geographically, linguistically, or temporally out of reach
3. **Format failure**: Legal information is presented in formats workers cannot use (long documents, English-only, text-heavy)

---

## 4. Solution Overview

### 4.1 What Is AgriShield

AgriShield is a free WhatsApp chatbot that helps Kenyan agribusiness workers understand their rights under Kenyan law and take action when those rights are violated. A worker sends a message describing their problem — "I am paid KES 200 a day with no contract" — and AgriShield:

1. **Identifies** the specific legal violation (e.g., wage violation, contract violation)
2. **Cites** the applicable law (e.g., Employment Act 2007, Section 10)
3. **Explains** the violation in plain language (English or Swahili)
4. **Guides** the user through a remedy pathway:
   - Which office to visit (e.g., County Labour Office, Employment and Labour Relations Court)
   - What documents to bring
   - Expected timeline
   - Contact numbers for free legal assistance (e.g., NLAS: 0800 723 255)

### 4.2 How It Works

The user journey is simple:

```
Worker sends message (text, voice note, or photo)
        |
        v
AgriShield processes input:
  - Text: direct analysis
  - Voice note: transcribed via Whisper
  - Photo: described via Gemini Vision
        |
        v
AgriShield classifies the violation against 7 categories:
  Wage | Safety | Contract | Child Labour | Environment | Gender | Land
        |
        v
AgriShield retrieves relevant legal passages (BM25 RAG over 308 statutes)
        |
        v
LLM reasons about the query, violation, and legal context
        |
        v
AgriShield generates a grounded response with:
  - Violation identification
  - Applicable law and section
  - Step-by-step remedy pathway
  - Contact information
        |
        v
Response sent to worker via WhatsApp
```

### 4.3 Key Features

| Feature | Description |
|---------|-------------|
| Multi-language | English and Swahili; local language support planned |
| Voice input | Workers send voice notes; transcribed via Whisper |
| Photo analysis | Workers photograph payslips, contracts, or injuries; analysed via Gemini Vision |
| Legal grounding | All responses cite specific Kenyan statutes; no hallucinated law |
| Offline fallback | Rule-based responses when no LLM API key is configured |
| Low-literacy friendly | Plain language, WhatsApp format, no app installation required |
| Group support | Works in WhatsApp groups when @mentioned |
| Conversation memory | Remembers context across messages for multi-turn guidance |

---

## 5. Alignment with UNGPs and Business and Human Rights Principles

### 5.1 Principle 1 — State Duty to Protect

While AgriShield is not a state tool, it complements state obligations by:

- Informing workers of the protections already afforded by Kenyan law
- Directing users to state institutions (County Labour Offices, ODPC, KNCHR)
- Creating a documented trail of reported violations that can inform policy advocacy

### 5.2 Principle 2 — Corporate Responsibility to Respect

AgriShield holds businesses accountable by:

- Making workers aware when their employer is violating the law
- Providing workers with specific legal citations they can present to employers
- Enabling workers to file complaints with the correct institutions
- Creating awareness of due diligence obligations under the Employment Act 2007 and WIBA 2007

### 5.3 Principle 3 — Access to Remedy

This is where AgriShield has its most direct impact. The UNGPs require that effective remedy mechanisms be available when abuses occur. AgriShield:

- Lowers the information barrier to remedy (workers know what to do)
- Lowers the procedural barrier (step-by-step guidance)
- Lowers the linguistic barrier (Swahili support)
- Lowers the technological barrier (WhatsApp, no app needed)
- Lowers the financial barrier (completely free)

### 5.4 UNGPs 10+ Roadmap Alignment

| Roadmap Priority | AgriShield Contribution |
|------------------|-------------------|
| Mainstreaming BHR in business | Workers equipped with knowledge to demand compliance |
| Operating environment for BHR | Legal information accessible to the most vulnerable |
| Rights-holders and stakeholders | Workers empowered as active participants, not passive beneficiaries |
| Remedy and accountability | Clear pathways from violation to institutional remedy |

---

## 6. Technical Architecture

### 6.1 System Overview

AgriShield is built on Node.js using the Baileys library for WhatsApp Web connectivity. The system operates as a WebSocket client that connects to WhatsApp, receives messages, processes them through the AI pipeline, and sends responses.

### 6.2 Core Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| WhatsApp Connection | Baileys (open-source) | WebSocket-based WhatsApp Web API; no Meta Business API fees |
| LLM Engine | NVIDIA NIM, Groq, Google AI Studio | Multi-provider fallback chain for natural language reasoning |
| Legal Knowledge Base | JSON (938 lines) | 7 violation categories with Swahili/English/local keywords, applicable laws, remedy pathways |
| Legal Corpus | JSON (308 passages) | Verified statutory passages for RAG retrieval |
| RAG Retrieval | BM25 (pure JS, zero dependencies) | In-memory search over legal corpus; top-3 passages per query |
| Voice Transcription | OpenAI Whisper / Groq Whisper | Converts WhatsApp voice notes to text |
| Image Analysis | Google Gemini Vision | Analyses photos of payslips, contracts, workplace conditions |
| Conversation Manager | Custom (JSON persistence) | User profiles, conversation history (20 msgs), welcome flow |
| WhatsApp Formatting | Custom converter | Converts markdown to WhatsApp-compatible format |

### 6.3 LLM Reasoning Pipeline

AgriShield uses a two-step reasoning process inspired by chain-of-thought prompting:

**Step 1 — Reason**: The LLM analyses the user's message and produces structured output:

```json
{
  "understanding": "worker describing unpaid wages for 3 weeks",
  "intent": "request",
  "topic": "wages",
  "sentiment": "frustrated",
  "urgency": "soon",
  "key_points": ["unpaid wages", "3 weeks"],
  "response_strategy": "provide legal guidance with remedy steps"
}
```

**Step 2 — Generate**: The LLM generates a response grounded in:
- The classified violation and applicable laws
- The retrieved legal passages (BM25 RAG)
- The user's conversation history
- The reasoning output from Step 1

This two-step process ensures responses are both contextually appropriate and legally grounded.

### 6.4 Fallback Architecture

When no LLM API key is configured, AgriShield operates in rule-based mode:

- Keyword matching against violation categories
- Template-based responses with statutory citations
- Full functionality without any external API calls

This ensures the bot works in resource-constrained environments and is not dependent on paid services.

### 6.5 Legal Corpus

The legal knowledge base contains verified passages from:

- Constitution of Kenya 2010 (Article 41 — Labour Relations)
- Employment Act 2007 (Sections on contracts, wages, working conditions)
- Work Injury Benefits Act 2007 (WIBA — employer insurance, accident reporting)
- Occupational Safety and Health Act 2007 (workplace safety obligations)
- Children Act 2001 (child labour prohibitions)
- Environmental Management and Coordination Act 1999 (environmental protections)
- National Land Commission Act (land rights)

Each passage includes the statute name, section number, verified text, and source URL for verification.

---

## 7. User-Centred Design

### 7.1 Design Principles

AgriShield was designed around the constraints of its target users:

| User Constraint | Design Response |
|-----------------|-----------------|
| Low literacy | Voice note input; plain language output; no jargon |
| Limited connectivity | Lightweight WhatsApp messages; no media-heavy responses |
| Basic smartphones | No app installation; works on WhatsApp Lite |
| Limited legal knowledge | Step-by-step guidance; no assumption of legal terminology |
| Swahili-dominant | Full Swahili support; local language keywords in progress |
| Distrust of technology | Familiar WhatsApp interface; no account creation; human-like tone |

### 7.2 Conversation Design

AgriShield's responses are designed to feel like advice from a knowledgeable friend, not a legal database:

- Acknowledges the user's situation with empathy
- Explains the violation in plain language
- Provides specific, actionable steps
- Cites the law for credibility
- Encourages the user to take action
- Provides follow-up contact numbers

### 7.3 Welcome Flow

New users receive a welcome message explaining what AgriShield can do, with examples of how to describe their problem. This lowers the activation barrier and sets expectations.

### 7.4 Testing and Feedback

The bot has been tested with sample queries across all 7 violation categories, with both English and Swahili inputs, and with voice notes. The rule-based fallback has been validated against the legal knowledge base to ensure accurate violation classification.

---

## 8. Innovation

### 8.1 What Makes AgriShield Different

| Existing Approach | AgriShield's Innovation |
|-------------------|-------------------|
| Legal aid websites require internet browsers and literacy | AgriShield works on WhatsApp — the platform workers already use |
| Hotlines require phone calls during business hours | AgriShield is available 24/7 via asynchronous messaging |
| Generic legal information databases | AgriShield classifies the specific violation and provides targeted remedy steps |
| English-only legal resources | AgriShield supports Swahili and is building local language support |
| Text-only interfaces | AgriShield accepts voice notes and photographs as input |
| API-dependent AI systems | AgriShield works offline with rule-based fallback |

### 8.2 Technical Innovation

- **RAG-grounded legal reasoning**: Unlike generic chatbots that hallucinate legal citations, AgriShield retrieves verified statutory passages before generating responses
- **Multi-provider LLM fallback**: Automatic escalation across NVIDIA, Groq, and Google ensures high availability
- **Morphological keyword matching**: The violation classifier handles inflected forms (wages, injured, evicted) through automatic stem variant generation
- **Zero-dependency BM25**: The retrieval engine runs entirely in-memory with no external search infrastructure

### 8.3 Social Innovation

- **Meet workers where they are**: No new app, no new platform, no new behaviour required
- **Voice-first design**: Workers can explain their problem in their own words
- **Grounded, not generic**: Every response cites specific Kenyan law — workers receive information they can act on
- **Dignity-centred**: Its tone treats workers as rights-holders, not charity recipients

---

## 9. Impact and Scalability

### 9.1 Impact

| Impact Dimension | Measurement |
|------------------|-------------|
| Reach | Any WhatsApp user in Kenya can access AgriShield — no registration, no fees |
| Rights awareness | Workers learn their rights through every interaction |
| Remedy access | Workers receive step-by-step guidance to file complaints |
| Evidence generation | Photo analysis creates documented evidence of violations |
| Data for advocacy | Aggregated violation data can inform policy and corporate accountability |

### 9.2 Scalability

AgriShield is designed to scale across Kenya's agribusiness sector and beyond:

| Scaling Dimension | Approach |
|-------------------|----------|
| Geographic | WhatsApp is nationwide; no physical infrastructure needed |
| Linguistic | Swahili complete; local languages (Kikuyu, Luo, Kalenjin) in progress |
| Sectoral | Violation categories can be expanded to mining, manufacturing, services |
| Institutional | API architecture allows integration with labour office databases |
| Continental | UNGPs framework is pan-African; model replicable in other jurisdictions |

### 9.3 Expected Outcomes (Aligned with Hackathon Criteria)

| Outcome | Indicator | Target |
|---------|-----------|--------|
| Worker rights awareness | Number of unique users served | 1,000 in first 6 months |
| Violation identification | Number of violations classified | 500 in first 6 months |
| Remedy referrals | Number of users directed to labour offices | 200 in first 6 months |
| Geographic reach | Counties with active users | 5+ counties |
| University engagement | Students trained on BHR tech solutions | 20+ students via hackathon |

---

## 10. Sustainability and Future Roadmap

### 10.1 Sustainability Plan

| Revenue/Sustainability Stream | Description |
|-------------------------------|-------------|
| Institutional partnerships | Integration with County Labour Offices and KNCHR for official use |
| NGO partnerships | Licensing to legal aid organisations working in agribusiness |
| University adoption | Curriculum integration at Riara and partner universities |
| Grant funding | Continued EU and development partner support for scaling |
| Open-source community | Community contributions to legal corpus and local language support |

### 10.2 Roadmap

| Phase | Timeline | Deliverables |
|-------|----------|-------------|
| Phase 1 (Current) | Sept 2026 | Hackathon prototype; 7 violation categories; English + Swahili |
| Phase 2 | Oct-Dec 2026 | Pilot with 50 workers in Nakuru County; local language support (Kikuyu, Luo) |
| Phase 3 | Jan-Mar 2027 | Integration with County Labour Office case management; escalation system |
| Phase 4 | Apr-Sep 2027 | Scale to 5 counties; 1,000+ users; data dashboard for advocacy |
| Phase 5 | 2028+ | Continental replication; API for partner organisations; policy influence |

---

## 11. Conclusion

AgriShield Chatbot is a practical, scalable, and rights-centred solution to a problem that affects millions of Kenyan workers. By combining accessible technology (WhatsApp), grounded AI reasoning (RAG over verified legal corpora), and user-centred design (voice input, Swahili support, plain language), AgriShield lowers every barrier between a worker and their right to remedy.

The solution directly advances the UNGPs by:
- Empowering rights-holders with actionable legal information
- Lowering barriers to access remedy mechanisms
- Creating a tool that complements state and corporate obligations
- Demonstrating how technology can operationalise business and human rights principles

AgriShield does not replace legal aid, labour offices, or court systems. It bridges the information gap that prevents workers from reaching these institutions in the first place.

**Every worker deserves to know their rights. AgriShield helps them get there.**

---

## 12. References

1. United Nations. (2011). *UN Guiding Principles on Business and Human Rights*. United Nations Human Rights Office of the High Commissioner.

2. United Nations. (2021). *UNGP 10+ Roadmap for the Next Decade*. Working Group on Business and Human Rights.

3. Republic of Kenya. (2010). *The Constitution of Kenya, 2010*. Government Printer.

4. Republic of Kenya. (2007). *Employment Act, 2007*. Government Printer.

5. Republic of Kenya. (2007). *Work Injury Benefits Act, 2007*. Government Printer.

6. Republic of Kenya. (2007). *Occupational Safety and Health Act, 2007*. Government Printer.

7. Republic of Kenya. (2019). *Data Protection Act, 2019*. Government Printer.

8. Republic of Kenya. (2001). *Children Act, 2001*. Government Printer.

9. European Union. (2023). *Guidelines on Financial Support to Third Parties under EU Grant Programmes*.

10. DanChurchAid, Pamoja Trust, CEPCJ. (2025). *Cultivating Justice Project: Baseline Report on Business and Human Rights in Kenya's Agribusiness Sector*.

---

*Prepared by: [Team Name]*

*Institution: [University Name]*

*Hackathon: Business and Human Rights Solutions Challenge, 24-25 September 2026*

*Project: AgriShield Chatbot — AI-Powered Workers' Rights Guide*

*Contact: [Email TBA]*
