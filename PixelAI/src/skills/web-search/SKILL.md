# Web Search Skill

Real-time internet search for the WhatsApp chatbot. Returns top results for any query with titles, snippets, and source URLs.

## Triggers

`search for`, `look up`, `google`, `find me`, `what is`, `who is`, `when did`, `latest news`, `current events`, `tell me about`

## Configuration

| Env Variable | Required | Description |
|---|---|---|
| `FIRECRAWL_API_KEY` | No | Firecrawl API key for premium search. Falls back to free DuckDuckGo scraping if absent. |

## Dependencies

- `cheerio` — HTML parsing for DuckDuckGo fallback scraping

## How It Works

1. **Query extraction** — strips trigger phrases and polite prefixes from the user message
2. **Primary source** — Firecrawl search API (if `FIRECRAWL_API_KEY` is set)
3. **Fallback** — free DuckDuckGo HTML scraping via cheerio
4. **Formatting** — results are formatted for WhatsApp with numbered entries, bold titles, snippets, and clickable links
5. **Limit** — top 5 results only

## Output Format

```
🔍 *Search: {query}*

1. *{title}*
{snippet}
🔗 {url}

2. *{title}*
{snippet}
🔗 {url}
```

## Error Handling

- Missing query → asks the user what to search for
- No results → returns "I couldn't find anything for that query"
- Firecrawl failure → silently falls back to DuckDuckGo
- Both failures → returns no-results message

## Usage Examples

| User Message | Extracted Query |
|---|---|
| `search for react hooks` | `react hooks` |
| `what is quantum computing` | `quantum computing` |
| `latest news about AI` | `about AI` |
| `tell me about the history of Ghana` | `the history of Ghana` |
| `google node.js best practices` | `node.js best practices` |
