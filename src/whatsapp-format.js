// Convert common LLM markdown to WhatsApp-friendly formatting.
// WhatsApp only understands *bold*, _italic_, ~strike~ and ```code``` —
// raw **double asterisks** and ### headers show up as literal junk.

export function toWhatsApp(text = '') {
  if (!text || typeof text !== 'string') return text;

  let inCode = false;
  const lines = text.split('\n').map((line) => {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      return line;
    }
    if (inCode) return line;

    return line
      .replace(/\*\*(.+?)\*\*/g, '*$1*')
      .replace(/__(.+?)__/g, '_$1_')
      .replace(/^#{1,6}\s+(.*)$/, '*$1*')
      .replace(/^(\s*)[-*]\s+/, '$1• ');
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export default toWhatsApp;
