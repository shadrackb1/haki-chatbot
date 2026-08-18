# Translation Skill

Translate text between 40+ languages using the LLM translation engine.

## What It Does

Accepts natural-language translation requests and returns clean translations
via the NVIDIA NIM API. Supports automatic source-language detection and
targets any of the supported languages by name.

## Triggers

| Trigger | Example |
|---------|---------|
| `translate` | `translate hello to Swahili` |
| `in <language>` | `good morning in French` |
| `how do you say … in …` | `how do you say thank you in Japanese` |
| `what is … in …` | `what is goodbye in Korean` |

Any message containing `translate`, `in swahili`, `in french`, `in spanish`,
`in arabic`, `in hindi`, `in chinese`, `in japanese`, `in korean`,
`in portuguese`, `in german`, `in italian`, `in russian`, or `in english`
will activate this skill.

## Supported Languages

Swahili, English, French, Spanish, Arabic, Hindi, Chinese, Japanese, Korean,
Portuguese, German, Italian, Russian, Turkish, Thai, Vietnamese, Indonesian,
Malay, Tagalog, Dutch, Polish, Ukrainian, Greek, Hebrew, Urdu, Bengali,
Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Farsi,
Pashto, Kurdish, Somali, Amharic, Yoruba, Igbo, Zulu, Xhosa, Afrikaans.

Common aliases are also recognised (e.g. *Mandarin* → Chinese, *Persian* → Farsi,
*Filipino* → Tagalog, *Deutsch* → German).

## Examples

```
User: translate hello to swahili
Bot: 🌐 Swahili:
     Habari

User: how do you say thank you in french
Bot: 🌐 French:
     Merci

User: good morning in spanish
Bot: 🌐 Spanish:
     Buenos días

User: what is i love you in japanese
Bot: 🌐 Japanese:
     愛してる

User: in arabic
Bot: What would you like me to translate to Arabic?
     Send me the text and I'll translate it for you.
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_KEY` | — | **Required.** NVIDIA NIM API key |
| `LLM_API_URL` | `https://integrate.api.nvidia.com/v1/chat/completions` | Chat completions endpoint |
| `LLM_MODEL` | `meta/llama-3.1-8b-instruct` | Model used for translation |

The skill is unavailable (and will not be loaded) when `LLM_API_KEY` is not set.

## API

```js
import translation from './skills/translation/index.js';

// Execute
const { response } = await translation.execute('translate hello to swahili', {});

// Availability check
translation.isAvailable(); // true when LLM_API_KEY is set
```

### `execute(message, context)` → `{ response: string }`

Parses the message for a target language and translatable text, calls the
LLM, and returns a formatted response string.

### `isAvailable()` → `boolean`

Returns `true` if `LLM_API_KEY` is configured.
