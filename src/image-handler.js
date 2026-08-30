import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// IMAGE + VIDEO MESSAGE HANDLER
// Describes photos and video clips via Google Gemini vision so they can
// flow through the normal LLM pipeline (photos, payslips, accident clips).
// ============================================

class ImageHandler {
  constructor(options = {}) {
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.apiKey = options.googleKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    this.apiUrl = process.env.GOOGLE_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
    this.model = process.env.GEMINI_VISION_MODEL || 'gemini-flash-latest';
    this.enabled = !!this.apiKey;
  }

  // One shared Gemini generateContent call for arbitrary multimodal parts.
  async _generateContent(parts, maxOutputTokens = 2048) {
    try {
      const requestBody = JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens,
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      let response = null;
      let lastErrorBody = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        response = await this.fetchFn(`${this.apiUrl}/${this.model}:generateContent?key=${this.apiKey}`, {
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
        return { ok: false, text: '', error: `Gemini API error ${response.status}: ${errorBody.slice(0, 200)}` };
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
        return { ok: false, text: '', error: `Gemini returned no description (${why.slice(0, 150)})` };
      }

      return { ok: true, text: description, error: null };
    } catch (error) {
      return { ok: false, text: '', error: error.message };
    }
  }

  // Ask Gemini what a photo shows, in the context of a workplace rights chat
  async analyze(imageBuffer, caption = '', mimeType = 'image/jpeg') {
    if (!this.enabled) {
      return { description: '', error: 'Vision not configured (set GOOGLE_API_KEY)' };
    }

    const instruction = `You are the eyes of Haki, a WhatsApp rights-assistant for Kenya's agribusiness workers. A worker sent this photo on WhatsApp${caption ? ` with the message: "${caption}"` : ''}. Look closely and report:
- Scene: setting, location clues, lighting or time-of-day hints.
- People: how many, what they are doing, visible injuries, protective equipment or its absence.
- Text: transcribe ALL legible text verbatim — payslips, contracts, notices, signs, labels. Copy every number, date, name and amount exactly as written. Mark barely-legible parts with [?].
- Hazards: unsafe conditions, chemicals, machinery, weather exposure.
Be precise and complete. Never invent details you cannot see.`;

    const parts = [
      { text: instruction },
      { inline_data: { mime_type: mimeType, data: imageBuffer.toString('base64') } }
    ];
    const res = await this._generateContent(parts);
    return res.ok ? { description: res.text, error: null } : { description: '', error: res.error };
  }

  // Gemini can watch video: hazards, unsafe practices, injuries, spoken words.
  // Videos larger than Gemini's ~18MB inline cap are sampled to key frames.
  async analyzeVideo(videoBuffer, caption = '', mimeType = 'video/mp4') {
    if (!this.enabled) {
      return { description: '', error: 'Vision not configured (set GOOGLE_API_KEY)' };
    }

    const viewerInstruction = `You are the eyes of Haki, a WhatsApp rights-assistant for Kenya's agribusiness workers. A worker sent this video clip on WhatsApp${caption ? ` with the message: "${caption}"` : ''}. Watch carefully and report:
- Scene & location clues (farm, flowerhouse, factory, roadside).
- People & work: what they are doing, visible injuries, protective equipment or its absence.
- Hazards: unsafe machinery, chemicals, weather exposure, child workers, harassment.
- Speech: transcribe any audible dialogue or numbers verbatim (Swahili/Sheng as spoken).
Be precise and complete. Never invent details you cannot see.`;

    // Inline video (Gemini supports video/audio inline data up to ~18MB).
    if (videoBuffer.length <= 18 * 1024 * 1024) {
      const parts = [{ text: viewerInstruction }, { inline_data: { mime_type: mimeType, data: videoBuffer.toString('base64') } }];
      const direct = await this._generateContent(parts);
      if (direct.ok) return { description: direct.text, error: null };
      if (!/18MB|too large|SIZE_LIMIT/i.test(direct.error)) return { description: '', error: direct.error };
      console.warn(`[image-handler] inline video failed (${direct.error}) — sampling frames…`);
    } else {
      console.warn(`[image-handler] video ${Math.round(videoBuffer.length / 1048576)}MB > inline cap — sampling frames…`);
    }

    // Big clip → extract a handful of JPEG frames and send those as images.
    const frames = await this._sampleFrames(videoBuffer);
    if (!frames || frames.length === 0) {
      return { description: '', error: 'Video too large to analyse inline and ffmpeg is unavailable for frame sampling.' };
    }
    const parts = [
      { text: viewerInstruction },
      ...frames.map((f) => ({ inline_data: { mime_type: 'image/jpeg', data: f.toString('base64') } }))
    ];
    const sampled = await this._generateContent(parts);
    return sampled.ok
      ? { description: sampled.text, error: null }
      : { description: '', error: sampled.error };
  }

  // Extract up to `frameCount` JPEG frames from a video buffer via ffmpeg (best effort).
  async _sampleFrames(videoBuffer, frameCount = 6) {
    if (!videoBuffer || videoBuffer.length === 0) return null;

    const tempRoot = path.join(__dirname, '..', 'temp');
    const stamp = Date.now();
    return new Promise((resolve) => {
      try { fs.mkdirSync(tempRoot, { recursive: true }); } catch {}
      const inputPath = path.join(tempRoot, `vid_${stamp}.bin`);
      const outPattern = path.join(tempRoot, `frame_${stamp}_%02d.jpg`);
      try { fs.writeFileSync(inputPath, videoBuffer); } catch (e) { return resolve(null); }

      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-vf', `fps=${frameCount}/12,scale=640:-2`,
        '-frames:v', String(frameCount),
        '-q:v', '5',
        '-y', outPattern
      ], { stdio: 'ignore' });

      ffmpeg.on('error', () => {
        try { fs.unlinkSync(inputPath); } catch {}
        resolve(null);
      });
      ffmpeg.on('close', (code) => {
        const frames = [];
        if (code === 0) {
          for (let i = 1; i <= frameCount; i++) {
            const p = path.join(tempRoot, `frame_${stamp}_${String(i).padStart(2, '0')}.jpg`);
            try {
              if (fs.existsSync(p)) {
                frames.push(fs.readFileSync(p));
                fs.unlinkSync(p);
              }
            } catch {}
          }
        }
        try { fs.unlinkSync(inputPath); } catch {}
        resolve(frames.length > 0 ? frames : null);
      });
    });
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

  // Process a video message from WhatsApp
  async processVideoMessage(msg, sock) {
    try {
      const buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );
      if (!buffer) return { description: '', error: 'Could not download video' };

      const mimeType = msg.message?.videoMessage?.mimetype || 'video/mp4';
      return await this.analyzeVideo(buffer, msg.message?.videoMessage?.caption || '', mimeType);
    } catch (error) {
      return { description: '', error: error.message };
    }
  }
}

export default ImageHandler;