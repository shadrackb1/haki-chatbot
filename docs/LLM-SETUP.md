# LLM Setup Guide - Make AgriShield Intelligent

## Option 1: NVIDIA NIM (Recommended - Free Tier Available)

### Step 1: Get API Key
1. Go to https://build.nvidia.com
2. Sign up with your email (Google/GitHub login works)
3. Navigate to "API Keys" section
4. Create a new API key
5. Copy the key (starts with `nvapi-...`)

### Step 2: Configure Bot
1. Open `.env` file in the Haki-Chatbot folder
2. Uncomment these lines:
   ```
   LLM_API_KEY=your-nvidia-api-key-here
   LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
   LLM_MODEL=nvidia/stepfun-ai/step-3.7-flash
   ```
3. Replace `your-nvidia-api-key-here` with your actual key

### Step 3: Restart Bot
```bash
npm start
```

You should see:
```
🧠 AI Engine: LLM-powered (NVIDIA step-3.7-flash)
```

---

## Option 2: OpenAI (Paid)

### Step 1: Get API Key
1. Go to https://platform.openai.com
2. Sign up and add payment method
3. Go to API Keys section
4. Create new key

### Step 2: Configure Bot
1. Open `.env` file
2. Uncomment OpenAI lines:
   ```
   LLM_API_KEY=your-openai-api-key
   LLM_API_URL=https://api.openai.com/v1/chat/completions
   LLM_MODEL=gpt-4o-mini
   ```
3. Replace with your actual key

---

## Option 3: OpenRouter (Free Tier Available)

### Step 1: Get API Key
1. Go to https://openrouter.ai
2. Sign up
3. Go to Keys section
4. Create new key

### Step 2: Configure Bot
1. Open `.env` file
2. Uncomment OpenRouter lines:
   ```
   LLM_API_KEY=your-openrouter-api-key
   LLM_API_URL=https://openrouter.ai/api/v1/chat/completions
   LLM_MODEL=meta-llama/llama-4-maverick:free
   ```
3. Replace with your actual key

---

## Without LLM (Rule-Based Mode)

If you don't configure an LLM API key, the bot works in **rule-based mode**:
- Fast and free
- Uses keyword matching
- Still provides accurate legal information
- Less conversational but fully functional

---

## Verify LLM is Working

After setup, restart the bot and look for:
```
🧠 AI Engine: LLM-powered (NVIDIA step-3.7-flash)
```

If you see:
```
🧠 AI Engine: Rule-based (fallback)
```

Then the LLM is not configured. Check your API key in `.env`.

---

## What LLM Adds

| Feature | Without LLM | With LLM |
|---------|-------------|----------|
| Intent classification | Rule-based keywords | AI understands context |
| Response generation | Template-based | Conversational, human-like |
| Situation reasoning | Simple keyword matching | Deep understanding |
| Conversation flow | Linear | Context-aware |
| Language detection | Word counting | Natural language understanding |

---

## Cost Estimate

| Provider | Free Tier | Paid Cost |
|----------|-----------|-----------|
| NVIDIA NIM | Yes (limited) | ~$0.001 per 1K tokens |
| OpenAI | No | ~$0.15 per 1K tokens |
| OpenRouter | Yes (limited) | ~$0.001 per 1K tokens |

For a hackathon demo, the free tiers are more than enough.