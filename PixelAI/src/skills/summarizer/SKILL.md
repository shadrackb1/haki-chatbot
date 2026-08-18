# Summarizer Skill

Summarize text, URLs, and documents into concise WhatsApp-friendly summaries via LLM.

## Triggers

`summarize` · `summary` · `tldr` · `short version` · `brief` · `gist` · `condense` · `quick version` · `sum up`

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_API_KEY` | Yes | — | NVIDIA NIM API key |
| `LLM_API_URL` | No | `https://integrate.api.nvidia.com/v1/chat/completions` | Chat completions endpoint |
| `LLM_MODEL` | No | `meta/llama-3.1-8b-instruct` | Model to use for summarization |

## How It Works

1. **Input detection** — the skill classifies the message as a URL, long text (200+ chars), or short text.
2. **URL handling** — fetches the page with `fetch()`, extracts readable text via cheerio (strips scripts/nav/footer), truncates to 12k chars.
3. **LLM call** — sends the extracted content to the NVIDIA NIM API with a summarization system prompt (temp 0.3, max 600 tokens).
4. **Length preference** — detects keywords like "brief" (2-3 sentences) or "detailed" (full summary with sections) and adjusts the system prompt accordingly.
5. **Formatting** — returns a `📝 *Summary:*` prefixed message formatted for WhatsApp readability with bullet points.

## Examples

```
User: summarize https://example.com/article
Bot: 📝 *Summary:*
     • Key point 1
     • Key point 2
     ...

User: tldr <long pasted text>
Bot: 📝 *Summary:*
     • Condensed version of the text

User: give me a brief summary of this article https://...
Bot: 📝 *Summary:*
     Two or three sentence summary.

User: summarize
Bot: Please send me some text or a URL to summarize.
```

## API Contract

```js
import summarizer from './skills/summarizer/index.js';

// Execute
const result = await summarizer.execute('summarize https://example.com', {});
// result: { response: '📝 *Summary:*\n\n...' }

// Availability
const ready = summarizer.isAvailable(); // boolean
```

## Dependencies

- **cheerio** — HTML parsing and text extraction from fetched URLs
- **NVIDIA NIM API** — LLM inference endpoint for text summarization

## Error Handling

- URL fetch failures → user-friendly "couldn't fetch" message
- LLM timeout (30s) → timeout error surfaced to user
- Missing `LLM_API_KEY` → `isAvailable()` returns `false`; execute returns graceful error
- Unparseable URL content → "couldn't extract meaningful content" message
