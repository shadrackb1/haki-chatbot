import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// IMAGE MESSAGE HANDLER
// Describes photos via Google Gemini vision so
// they can flow through the normal LLM pipeline
// ============================================

class ImageHandler {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    this.apiUrl = process.env.GOOGLE_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
    this.model = process.env.GEMINI_VISION_MODEL || 'gemini-flash-latest';
    this.enabled = !!this.apiKey;
  }

  // Ask Gemini what a photo shows, in the context of a workplace rights chat
  async analyze(imageBuffer, caption = '', mimeType = 'image/jpeg') {
    if (!this.enabled) {
      return { description: '', error: 'Vision not configured (set GOOGLE_API_KEY)' };
    }

    try {
      const instruction = `You are the eyes of Haki, a WhatsApp rights-assistant for Kenya's agribusiness workers. A worker sent this photo on WhatsApp${caption ? ` with the message: "${caption}"` : ''}. Look closely and report:
- Scene: setting, location clues, lighting or time-of-day hints.
- People: how many, what they are doing, visible injuries, protective equipment or its absence.
- Text: transcribe ALL legible text verbatim — payslips, contracts, notices, signs, labels. Copy every number, date, name and amount exactly as written. Mark barely-legible parts with [?].
- Hazards: unsafe conditions, chemicals, machinery, weather exposure.
Be precise and complete. Never invent details you cannot see.`;

      const requestBody = JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: instruction },
              { inline_data: { mime_type: mimeType, data: imageBuffer.toString('base64') } }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      let response = null;
      let lastErrorBody = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        response = await fetch(`${this.apiUrl}/${this.model}:generateContent?key=${this.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody
        });
        if (response.ok || ![429, 500, 503].includes(response.status)) break;
        lastErrorBody = await response.text().catch(() => '');
        if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 4000));
      }

      if (!response.ok) {
        const errorBody = lastErrorBody || await response.text().catch(() => 'Unknown error');
        throw new Error(`Gemini API error ${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const description = (candidate?.content?.parts || [])
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join(' ')
        .trim();

      if (!description) {
        const blocked = data.promptFeedback?.blockReason;
        const why = blocked
          ? `blocked: ${blocked}`
          : candidate
            ? `finishReason=${candidate.finishReason || 'unknown'}, parts=${JSON.stringify(candidate.content?.parts ?? null)}`
            : `no candidates, raw=${JSON.stringify(data).slice(0, 300)}`;
        console.error(`[image-handler] Gemini gave no description — ${why}`);
        throw new Error(`Gemini returned no description (${why.slice(0, 150)})`);
      }

      return { description, error: null };
    } catch (error) {
      return { description: '', error: error.message };
    }
  }

  // Process an image message from WhatsApp
  async processImageMessage(msg, sock) {
    try {
      const buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );
      if (!buffer) return { description: '', error: 'Could not download image' };

      const mimeType = msg.message?.imageMessage?.mimetype || 'image/jpeg';
      return await this.analyze(buffer, msg.message?.imageMessage?.caption || '', mimeType);
    } catch (error) {
      return { description: '', error: error.message };
    }
  }
}

export default ImageHandler;
