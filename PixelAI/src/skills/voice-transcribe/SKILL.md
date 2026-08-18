# Voice Transcription Skill

Transcribe WhatsApp voice messages to text and generate contextual responses, powered by Whisper APIs.

## Trigger

This skill does not activate on text messages. It is invoked by the **media-handler** when a user sends a voice message/audio attachment.

## Behavior

1. Reads the audio buffer from `context.audioBuffer` (Buffer).
2. Sends the audio to the best available Whisper API for transcription (OpenAI or Groq).
3. Passes the transcribed text to the LLM for a contextual response.
4. Returns the transcription prefixed with `🎤 *Transcribed:*` followed by the LLM response.

## Required Environment Variables

| Variable | Purpose | Provider |
|---|---|---|
| `OPENAI_API_KEY` | Auth token for OpenAI Whisper API (`whisper-1`) | OpenAI |
| `GROQ_API_KEY` | Auth token for Groq Whisper API (`whisper-large-v3`) | Groq |

At least one API key is required. If both are present, OpenAI is preferred.

Additional LLM variables for generating responses:

| Variable | Purpose | Default |
|---|---|---|
| `LLM_API_URL` | Chat completions endpoint | NVIDIA NIM |
| `LLM_API_KEY` | Auth token for LLM | — |
| `LLM_MODEL` | Model identifier | `meta/llama-3.1-8b-instruct` |

## Provider Priority

1. **OpenAI** (`OPENAI_API_KEY`) — `whisper-1` model
2. **Groq** (`GROQ_API_KEY`) — `whisper-large-v3` model (free tier available)

## Audio Format

WhatsApp sends voice messages in **OGG/Opus** format. Both OpenAI and Groq accept this format directly — no conversion needed.

## Output Format

**Successful transcription with response:**

```
🎤 *Transcribed:* Hello, what's the weather like in Nairobi?

🌤️ *Weather in Nairobi, KE*
...
```

**Successful transcription, LLM failure:**

```
🎤 *Transcribed:* Can you remind me to call mom tomorrow?

_Couldn't generate a response, but here's what you said._
```

**No API key configured:**

```
🎤 Voice transcription requires an API key. Please add one of the following to your .env file:

• `OPENAI_API_KEY` — for OpenAI Whisper
• `GROQ_API_KEY` — for Groq Whisper (free tier available)
```

**Empty or unintelligible audio:**

```
🎤 The voice message was empty or could not be understood. Please try recording again.
```

## Metadata

The response includes a `metadata` object:

```js
{ transcription: "the original transcribed text" }
```

This allows downstream skills or handlers to use the transcribed text for further processing.

## Error Handling

| Error | Message |
|---|---|
| Missing audio buffer | "Please send a voice message to transcribe." |
| No API keys | Setup instructions with env variable names |
| Empty transcription | "Voice message was empty or could not be understood." |
| Transcription API failure | Logs error, returns user-friendly fallback |
| LLM failure | Returns transcription only with fallback note |
| LLM timeout | Same as LLM failure (30s timeout) |

## Integration

This skill is typically not triggered by text input. The **media-handler** component detects incoming voice messages and dispatches to this skill with the audio buffer in `context.audioBuffer`.
