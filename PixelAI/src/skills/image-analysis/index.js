import fs from 'node:fs/promises';
import path from 'node:path';

async function analyzeWithOpenAI(imageBuffer, question) {
  const base64 = imageBuffer.toString('base64');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: question },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'No description returned.';
}

async function analyzeWithGemini(imageBuffer, question) {
  const base64 = imageBuffer.toString('base64');
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const apiUrl = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';

  const response = await fetch(`${apiUrl}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: question },
            { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 500 },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no description.');
  return text;
}

export default {
  name: 'image-analysis',
  description: 'Analyze and describe images sent by users',
  triggers: [],

  async execute(message, context) {
    try {
      let imageBuffer = context?.imageBuffer ?? null;

      if (!imageBuffer && context?.imagePath) {
        imageBuffer = await fs.readFile(context.imagePath);
      }

      if (!imageBuffer) {
        return { response: 'No image was provided. Please send an image to analyze.' };
      }

      const question = (message?.text || '').trim() || 'Describe this image in detail.';

      if (process.env.OPENAI_API_KEY) {
        const analysis = await analyzeWithOpenAI(imageBuffer, question);
        return { response: `🖼️ *Image Analysis:*\n\n${analysis}` };
      }

      if (process.env.GEMINI_API_KEY) {
        const analysis = await analyzeWithGemini(imageBuffer, question);
        return { response: `🖼️ *Image Analysis:*\n\n${analysis}` };
      }

      return {
        response:
          "Image analysis isn't configured yet — add OPENAI_API_KEY or GEMINI_API_KEY to the .env file.",
      };
    } catch (error) {
      console.error('[image-analysis] Error:', error.message);
      return {
        response: 'Something went wrong while analyzing the image. Please try again later.',
      };
    }
  },

  isAvailable() {
    return !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
  },
};
