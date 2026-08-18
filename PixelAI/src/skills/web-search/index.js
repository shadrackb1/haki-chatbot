import * as cheerio from 'cheerio';

const TRIGGER_WORDS = [
  'search for',
  'look up',
  'google',
  'find me',
  'what is',
  'who is',
  'when did',
  'latest news',
  'current events',
  'tell me about',
];

function extractQuery(message) {
  const lower = message.toLowerCase();
  for (const trigger of TRIGGER_WORDS) {
    const idx = lower.indexOf(trigger);
    if (idx !== -1) {
      return message.slice(idx + trigger.length).trim();
    }
  }
  return message.replace(/^(can you|please|could you|would you)\s*/i, '').trim();
}

async function searchWithFirecrawl(query) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  const res = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, limit: 5 }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.data?.length) return null;

  return data.data.slice(0, 5).map((r) => ({
    title: r.title || 'Untitled',
    url: r.url || '',
    snippet: r.markdown
      ? r.markdown.slice(0, 200).replace(/\n+/g, ' ').trim()
      : '',
  }));
}

async function searchWithDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  $('.result').each((_, el) => {
    if (results.length >= 5) return false;

    const titleEl = $(el).find('.result__title a, .result__a');
    const snippetEl = $(el).find('.result__snippet');
    const urlEl = $(el).find('.result__url');

    const title = titleEl.text().trim();
    let link = titleEl.attr('href') || '';
    const snippet = snippetEl.text().trim();
    const displayUrl = urlEl.text().trim();

    if (link.startsWith('//')) link = 'https:' + link;

    if (title) {
      results.push({
        title,
        url: displayUrl || link,
        snippet: snippet.slice(0, 200),
      });
    }
  });

  return results.length > 0 ? results : null;
}

function formatResults(query, results) {
  if (!results || results.length === 0) {
    return `I couldn't find anything for that query.`;
  }

  let msg = `🔍 *Search: ${query}*\n\n`;

  results.forEach((r, i) => {
    msg += `${i + 1}. *${r.title}*\n`;
    if (r.snippet) msg += `${r.snippet}\n`;
    if (r.url) msg += `🔗 ${r.url}\n`;
    if (i < results.length - 1) msg += '\n';
  });

  return msg;
}

export default {
  name: 'web-search',
  description:
    'Search the internet for real-time information, news, and current events',
  triggers: [
    'search for',
    'look up',
    'google',
    'find me',
    'what is',
    'who is',
    'when did',
    'latest news',
    'current events',
    'tell me about',
  ],

  async execute(message, context) {
    const query = extractQuery(message);
    if (!query) {
      return { response: 'What would you like me to search for?' };
    }

    let results = null;

    try {
      results = await searchWithFirecrawl(query);
    } catch {
      // Firecrawl unavailable or errored, continue to fallback
    }

    if (!results) {
      try {
        results = await searchWithDuckDuckGo(query);
      } catch {
        // Both methods failed
      }
    }

    const response = formatResults(query, results);
    return { response };
  },

  isAvailable() {
    return true;
  },
};
