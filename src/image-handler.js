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
      const instruction = `You are Haki, a workplace rights assistant for workers in Kenya's agribusiness sector. The user sent this photo in a WhatsApp chat.${caption ? ` Their message with it: "${caption}".` : ''} Describe factually what the photo shows that could matter to a workplace rights issue — people, conditions, injuries, documents, pay records, locations. Be concise and concrete.`;

      const response = await fetch(`${this.apiUrl}/${this.model}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: instruction },
                { inline_data: { mime_type: mimeType, data: imageBuffer.toString('base64') } }
              ]
            }
          ],
          generationConfig: { maxOutputTokens: 400, temperature: 0.3 }
        })
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`Gemini API error ${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const data = await response.json();
      const description = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!description) throw new Error('Gemini returned no description');

      return { description: description.trim(), error: null };
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
