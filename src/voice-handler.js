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

  // Transcribe audio using Whisper API
  async transcribe(audioPath, language = 'sw') {
    if (!this.enabled) {
      return { text: '', error: 'Whisper API not configured' };
    }

    try {
      // Convert to MP3 if needed
      const mp3Path = audioPath.replace(/\.(ogg|opus)$/i, '.mp3');
      await this.convertAudio(audioPath, mp3Path);

      const formData = new FormData();
      formData.append('file', fs.createReadStream(mp3Path));
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

      // Clean up temp files
      try { fs.unlinkSync(mp3Path); } catch {}

      return { text: text.trim(), error: null };
    } catch (error) {
      return { text: '', error: error.message };
    }
  }

  // Process voice message from WhatsApp
  async processVoiceMessage(msg, sock) {
    try {
      // Download the audio
      const buffer = await sock.downloadMediaMessage(msg);
      const tempDir = path.join(__dirname, '..', 'temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const audioPath = path.join(tempDir, `voice_${Date.now()}.ogg`);
      fs.writeFileSync(audioPath, buffer);

      // Detect language from user
      const userLang = 'sw'; // Default to Swahili

      // Transcribe
      const result = await this.transcribe(audioPath, userLang);

      // Clean up
      try { fs.unlinkSync(audioPath); } catch {}

      return result;
    } catch (error) {
      return { text: '', error: error.message };
    }
  }
}

export default VoiceHandler;