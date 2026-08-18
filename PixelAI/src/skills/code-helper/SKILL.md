# Code Helper Skill

WhatsApp chatbot skill for generating, explaining, debugging, and refactoring code in any programming language.

## Overview

The code-helper skill uses an LLM (NVIDIA NIM by default) to assist users with programming tasks directly in WhatsApp conversations. It detects the user's intent, extracts embedded code, identifies the programming language, and produces well-formatted responses with fenced code blocks.

## Capabilities

| Intent | Trigger Examples |
|--------|-----------------|
| **Write** | "write a Python function to sort a list", "code a REST API endpoint in Express" |
| **Debug** | "debug this code: ```", "fix my JavaScript function", "why is this broken" |
| **Explain** | "explain how async/await works", "what does this function do" |
| **Refactor** | "refactor this to be cleaner", "optimize my Python code" |
| **Convert** | "convert this Python to JavaScript", "port this to TypeScript" |
| **Review** | "review my code", "check this function for issues" |

## Supported Languages

JavaScript, Python, Java, Rust, TypeScript, Go, C++, SQL, HTML/CSS, PHP, Ruby, Swift, Kotlin.

Language is auto-detected from message context or extracted from fenced code blocks.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_KEY` | — | **Required.** API key for the LLM provider (NVIDIA NIM). |
| `LLM_API_URL` | `https://integrate.api.nvidia.com/v1/chat/completions` | Chat completions endpoint. |
| `LLM_MODEL` | `meta/llama-3.1-8b-instruct` | Model identifier. |

## Interface

```js
export default {
  name: 'code-helper',
  description: 'Generate, explain, debug, and refactor code in any programming language',
  triggers: [/* ... */],
  async execute(message, context) {
    // Returns { response: string }
  },
  isAvailable() { return !!process.env.LLM_API_KEY; }
}
```

## Execution Flow

1. **Intent detection** — Classifies the request as write, debug, explain, refactor, convert, or review using keyword heuristics.
2. **Code extraction** — If the message contains fenced code blocks (` ``` `), they are extracted separately and the request is reclassified (e.g., generic write → debug).
3. **Language detection** — Identifies the programming language from the message text or from the language tag in fenced blocks.
4. **Prompt construction** — Builds a user prompt that includes the extracted code, detected language, and the user's original request.
5. **LLM call** — Sends the system prompt + user prompt to the configured LLM API with `temperature: 0.4` and `max_tokens: 1500`.
6. **Formatting** — Cleans up the response for WhatsApp readability (validates code fences, removes double backticks).

## LLM Parameters

- **Temperature:** 0.4 (low for precise, deterministic code output)
- **Max tokens:** 1500 (sufficient for most code snippets and explanations)
- **Top-p:** 0.9
- **System prompt:** Expert programmer persona with formatting rules

## Error Handling

- If `LLM_API_KEY` is missing, `isAvailable()` returns `false` and the skill returns a configuration error message.
- If the LLM API call fails, the skill returns a friendly error message without crashing.
- API errors are logged to the console for debugging.

## Examples

```
User: write a Python function to sort a list
→ Detects: intent=write, language=python
→ Calls LLM with write request
→ Returns: function definition with explanation

User: debug this code: ```js\nconst x = null; console.log(x.foo)\n```
→ Detects: intent=debug (has code), language=javascript
→ Extracts code block, reclassifies as debug
→ Returns: error explanation + fix

User: explain how async/await works in JavaScript
→ Detects: intent=explain, language=javascript
→ Returns: concise explanation with code example

User: convert this Python to JavaScript: ```python\ndef hello(): print("hi")\n```
→ Detects: intent=convert, language=python (source)
→ Returns: JavaScript equivalent with comparison
```
