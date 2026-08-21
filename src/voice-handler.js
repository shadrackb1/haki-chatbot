import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// VOICE MESSAGE HANDLER
// Transcribes voice notes using Whisper API
// ============================================

class VoiceHandler {
  constructor() {
    this.whisperApiUrl = process.env.WHISPER_API_URL || 'https://api.openai.com/v1/audio/transcriptions';
    this.whisperApiKey = process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY || '';
    this.enabled = !!this.whisperApiKey;
  }

  // Convert WhatsApp audio (OGG/OPUS) to MP3 for Whisper
  async convertAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-ar', '16000',
        '-ac', '1',
        '-y', outputPath
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) resolve(outputPath);
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });

      ffmpeg.on('error', reject);
    });
  }

  // Transcribe audio buffer using Whisper API
  async transcribe(audioBuffer, language = 'en') {
    if (!this.enabled) {
      return { text: '', error: 'Whisper API not configured' };
    }

    let mp3Path = null;

    try {
      // Convert to MP3 via ffmpeg (expects a file on disk)
      const tempDir = path.join(__dirname, '..', 'temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const inputPath = path.join(tempDir, `in_${Date.now()}.ogg`);
      mp3Path = path.join(tempDir, `out_${Date.now()}.mp3`);
      fs.writeFileSync(inputPath, audioBuffer);
      await this.convertAudio(inputPath, mp3Path);
      try { fs.unlinkSync(inputPath); } catch {}

      const mp3Data = fs.readFileSync(mp3Path);

      const formData = new FormData();
      formData.append('file', new Blob([mp3Data], { type: 'audio/mpeg' }), 'audio.mp3');
      formData.append('model', 'whisper-1');
      formData.append('language', language);
      formData.append('response_format', 'text');

      const response = await fetch(this.whisperApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.whisperApiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Whisper API error: ${response.status}`);
      }

      const text = await response.text();

      return { text: text.trim(), error: null };
    } catch (error) {
      return { text: '', error: error.message };
    } finally {
      if (mp3Path) { try { fs.unlinkSync(mp3Path); } catch {} }
    }
  }

  // Process voice message from WhatsApp
  async processVoiceMessage(msg, sock) {
    try {
      // Download the audio
      const buffer = await sock.downloadMediaMessage(msg);
      if (!buffer) return { text: '', error: 'Could not download audio' };

      // Transcribe
      const result = await this.transcribe(buffer);

      return result;
    } catch (error) {
      return { text: '', error: error.message };
    }
  }
}

export default VoiceHandler;