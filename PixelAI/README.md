# 🧠 Pixel AI - Intelligent Conversational Companion

A personal WhatsApp chatbot that thinks, remembers, and converses like a real intellectual companion. Powered by LLM reasoning with persistent memory and contextual awareness.

## ✨ What Makes It Different

**Not a bot. A thinking partner.**

| Traditional Bots | Pixel AI |
|------------------|----------|
| Pattern matching & templates | Deep LLM reasoning on every message |
| Stateless, forgetful | Persistent memory across all conversations |
| Generic responses | Intellectually engaged, personally attuned |
| Single-topic limited | Cross-topic synthesis & connection-making |
| Reactive only | Proactive curiosity & follow-through |
| No personality | Consistent, evolving intellectual persona |

## 🧠 Core Intelligence

### Deep Reasoning Pipeline
Every message goes through multi-step analysis:
1. **Understand** - What's really being said/asked (beyond literal words)
2. **Intent Classification** - True intent: questioning, sharing, venting, exploring, creating, philosophizing
3. **Topic Mapping** - Primary/secondary topics, detecting shifts from history
4. **Emotional Attunement** - Sentiment, urgency, implicit needs
5. **Contextual Intelligence** - References to prior conversation, shared knowledge, cultural touchpoints
6. **Intellectual Depth Assessment** - Surface vs. moderate vs. deep engagement needed
7. **Trajectory Prediction** - Where conversation is naturally heading
8. **Personalization Strategy** - How to weave in user's interests, style, history
9. **Response Strategy** - Conversational, analytical, empathetic, creative, philosophical, playful

### Persistent Memory System
- **Full conversation history** (last 50 exchanges per user)
- **User profiles** that learn: interests, communication style, known facts, topic frequency
- **Cross-conversation synthesis** - References earlier discussions naturally
- **Adaptive depth** - Matches your intellectual level automatically

### Intellectual Omnivory
Genuinely engages with:
- Science, technology, philosophy, psychology
- Arts, literature, music, creative pursuits
- Complex systems, economics, politics, ethics
- Personal projects, learning journeys, creative work
- Abstract concepts, big questions, speculative ideas
- Niche topics, obscure knowledge, interdisciplinary connections

## 📱 Features

- **WhatsApp Native** - Works on any phone via Baileys (WhatsApp Web)
- **LLM-Powered** - Uses NVIDIA Nemotron or your configured model
- **Persistent Identity** - Remembers you across sessions, devices, time
- **Contextual Awareness** - Time of day, conversation flow, emotional state
- **Natural Conversation** - Contractions, humor, uncertainty, opinions, pushback
- **Privacy-First** - All data local, no external logging
- **Group Support** - Can be enabled for group conversations (opt-in)

## 🛠️ Setup

```bash
# 1. Install dependencies
cd PixelAI
npm install

# 2. Configure your API key (already set in .env)
# LLM_API_KEY=nvapi-... (NVIDIA Nemotron)
# LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
# LLM_MODEL=meta/llama-3.1-8b-instruct

# 3. Customize your identity
# Edit data/personal-knowledge-base.json with your bio, interests, projects, values

# 4. Start
npm start

# 5. Scan QR code with WhatsApp
# Settings → Linked Devices → Link a Device
```

## 🎯 Customizing Your Identity

Edit `data/personal-knowledge-base.json`:

```json
{
  "profile": {
    "name": "Alex",
    "bio": "Systems thinker building tools for thought. Fascinated by how minds work - both human and artificial. Currently exploring the intersection of cognitive science and software architecture.",
    "occupation": "Software Engineer / Independent Researcher",
    "interests": [
      "cognitive architectures",
      "programming language design", 
      "attention economy",
      "complexity science",
      "philosophy of mind"
    ],
    "values": [
      "intellectual honesty",
      "craftsmanship",
      "curiosity over correctness"
    ],
    "projects": [
      "building a personal knowledge graph",
      "learning Rust for WASM",
      "writing about distributed cognition"
    ]
  }
}
```

## 💬 Conversation Examples

**You:** "the sky"
**Pixel:** "The sky's such a deceptively simple word for something that's actually a layered atmospheric phenomenon, a cultural canvas, and a psychological boundary all at once. Are you thinking about the physics — Rayleigh scattering and all that — or the human experience of looking up? I've always found it interesting how the same sky looks different depending on whether you're a meteorologist, a poet, or someone just trying to guess if they need an umbrella."

**You:** "I've been thinking about attention as a scarce resource"
**Pixel:** "That's the Herbert Simon line — 'a wealth of information creates a poverty of attention.' But the modern twist is that attention isn't just scarce, it's being *engineered*. The whole attention economy is basically industrial-scale cognitive hijacking. What made you land on this? Are you coming at it from a design angle, a personal productivity thing, or something more philosophical?"

**You:** "debugging a weird Rust lifetime issue"
**Pixel:** "Ah, the borrow checker doing its job — frustrating in the moment, grateful later. What's the pattern? Self-referential struct? Async trait bounds? I've spent enough hours fighting the borrow checker that I've developed opinions on which lifetime annotations are actually expressive vs. which are just the compiler being pedantic. Happy to rubber-duck it if it helps."

## 🏗️ Architecture

```
src/
├── index.js              # WhatsApp connection + orchestration
├── llm-reasoning.js      # Deep reasoning engine (THE BRAIN)
├── conversation-manager.js # Persistent memory & user profiles
├── personal-knowledge-base.js # Your identity configuration
├── intent-classifier.js  # Lightweight intent detection (fallback)
├── response-generator.js # Template responses (fallback only)
├── calendar-integration.js # Schedule features
└── escalation-system.js  # Urgent message detection

data/
├── personal-knowledge-base.json # Your identity
├── users.json              # Conversation metadata
├── conversation-logs.json  # Full history
└── user-profiles.json      # Learned profiles
```

## 🔧 Configuration

**Environment (.env):**
```env
LLM_API_KEY=your_nvidia_key
LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
LLM_MODEL=meta/llama-3.1-8b-instruct
```

**Conversation Preferences (in knowledge base):**
- `response_style`: thoughtful | concise | conversational | analytical
- `intellectual_depth`: adaptive | surface | moderate | deep
- `conversation_mode`: intellectual_companion | assistant | creative_partner

## 🔒 Privacy & Security

- **Local-only data** - Nothing leaves your machine except LLM API calls
- **No conversation logging** to external services
- **User profiles** stored locally in `data/user-profiles.json`
- **WhatsApp session** in `auth_info/` (standard Baileys)
- **Delete everything** by removing `data/` and `auth_info/` folders

## ⚠️ Important Notes

- **Use a secondary WhatsApp number** - Baileys connects to WhatsApp Web, not official API
- **LLM costs** - NVIDIA Nemotron has generous free tier, monitor usage
- **Not for emergencies** - Intelligent but not a substitute for professional help
- **Beta software** - Expect occasional quirks, report issues

## 📄 License

MIT - Free to use, modify, distribute.

---

**Built for people who think in conversations.** The kind where you hang up and realize you understand something you didn't before.