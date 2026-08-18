import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import sharp from 'sharp';

const MAX_FILE_SIZE_DEFAULT = 10 * 1024 * 1024;

const MEDIA_EXTENSIONS = {
  imageMessage: 'jpg',
  audioMessage: 'ogg',
  videoMessage: 'mp4',
  documentMessage: null,
  stickerMessage: 'webp',
};

const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/plain': 'txt',
};

const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const WHATSAPP_IMAGE_MAX = 1024;

export class MediaHandler {
  #dataDir;
  #maxFileSize;

  constructor(config = {}) {
    this.#dataDir = path.resolve(config.dataDir || 'data/media');
    this.#maxFileSize = config.maxFileSize || MAX_FILE_SIZE_DEFAULT;
    this.#ensureDataDir();
  }

  #ensureDataDir() {
    if (!fs.existsSync(this.#dataDir)) {
      fs.mkdirSync(this.#dataDir, { recursive: true });
    }
  }

  getMessageType(message) {
    const msg = message?.message;
    if (!msg) return null;

    if (msg.imageMessage) return 'imageMessage';
    if (msg.audioMessage) return 'audioMessage';
    if (msg.videoMessage) return 'videoMessage';
    if (msg.documentMessage) return 'documentMessage';
    if (msg.stickerMessage) return 'stickerMessage';

    const proto = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message;
    if (proto) return this.getMessageType({ message: proto });

    return null;
  }

  #getExtension(mediaType, mimeType, fileName) {
    if (mediaType === 'documentMessage' && fileName) {
      return path.extname(fileName).slice(1) || MIME_TO_EXTENSION[mimeType] || 'bin';
    }
    if (mediaType === 'stickerMessage') return 'webp';
    if (MIME_TO_EXTENSION[mimeType]) return MIME_TO_EXTENSION[mimeType].replace('.', '');
    return MEDIA_EXTENSIONS[mediaType] || 'bin';
  }

  #getMediaData(message) {
    const msg = message?.message;
    if (!msg) return null;

    const mediaMsg = msg.imageMessage || msg.audioMessage || msg.videoMessage ||
      msg.documentMessage || msg.stickerMessage ||
      msg.ephemeralMessage?.message?.imageMessage ||
      msg.ephemeralMessage?.message?.audioMessage ||
      msg.ephemeralMessage?.message?.videoMessage ||
      msg.ephemeralMessage?.message?.documentMessage ||
      msg.ephemeralMessage?.message?.stickerMessage ||
      msg.viewOnceMessage?.message?.imageMessage ||
      msg.viewOnceMessage?.message?.audioMessage ||
      msg.viewOnceMessage?.message?.videoMessage ||
      msg.viewOnceMessage?.message?.documentMessage ||
      msg.viewOnceMessage?.message?.stickerMessage;

    return mediaMsg || null;
  }

  async downloadMedia(message, sock) {
    try {
      const type = this.getMessageType(message);
      if (!type) {
        throw new Error('NO_MEDIA: Message does not contain media');
      }

      const mediaData = this.#getMediaData(message);
      if (!mediaData) {
        throw new Error('PARSE_ERROR: Could not extract media metadata from message');
      }

      const mimeType = mediaData.mimetype || '';
      const fileName = mediaData.fileName || null;
      const fileSize = mediaData.fileLength || 0;

      if (fileSize > this.#maxFileSize) {
        throw new Error(
          `FILE_TOO_LARGE: File size ${(fileSize / (1024 * 1024)).toFixed(1)}MB exceeds limit ${(this.#maxFileSize / (1024 * 1024)).toFixed(0)}MB`
        );
      }

      const buffer = await downloadMediaMessage(message, 'buffer', {});
      if (!buffer || buffer.length === 0) {
        throw new Error('DOWNLOAD_FAILED: Received empty buffer from WhatsApp');
      }

      const ext = this.#getExtension(type, mimeType, fileName);
      const timestamp = Date.now();
      const randomId = randomUUID().split('-')[0];
      const savedFileName = `${timestamp}-${randomId}.${ext}`;
      const filePath = path.join(this.#dataDir, savedFileName);

      fs.writeFileSync(filePath, buffer);

      const result = {
        buffer,
        type,
        mimeType,
        filePath,
        fileName: savedFileName,
      };

      if (type === 'documentMessage' && fileName) {
        result.originalFileName = fileName;
      }

      return result;
    } catch (error) {
      if (error.message.startsWith('NO_MEDIA:') ||
        error.message.startsWith('FILE_TOO_LARGE:') ||
        error.message.startsWith('PARSE_ERROR:') ||
        error.message.startsWith('DOWNLOAD_FAILED:')) {
        throw error;
      }
      throw new Error(`DOWNLOAD_ERROR: ${error.message}`);
    }
  }

  async sendMedia(chatId, media, sock, caption) {
    try {
      if (!sock) throw new Error('SOCK_MISSING: Socket connection is required');

      const { buffer, type, fileName, mimeType } = media;

      if (!buffer || buffer.length === 0) {
        throw new Error('BUFFER_MISSING: No media buffer provided');
      }

      let messageContent;

      switch (type) {
        case 'imageMessage':
          messageContent = {
            image: buffer,
            caption: caption || media.caption || '',
          };
          break;

        case 'audioMessage':
          messageContent = {
            audio: buffer,
            mimetype: 'audio/ogg; codecs=opus',
          };
          break;

        case 'videoMessage':
          messageContent = {
            video: buffer,
            caption: caption || media.caption || '',
            mimetype: mimeType || 'video/mp4',
          };
          break;

        case 'documentMessage':
          messageContent = {
            document: buffer,
            fileName: media.originalFileName || fileName || 'document',
            mimetype: mimeType || 'application/octet-stream',
            caption: caption || '',
          };
          break;

        case 'stickerMessage':
          messageContent = {
            sticker: buffer,
          };
          break;

        default:
          throw new Error(`UNSUPPORTED_TYPE: Cannot send media of type "${type}"`);
      }

      const result = await sock.sendMessage(chatId, messageContent);
      return result;
    } catch (error) {
      if (error.message.startsWith('SOCK_MISSING:') ||
        error.message.startsWith('BUFFER_MISSING:') ||
        error.message.startsWith('UNSUPPORTED_TYPE:')) {
        throw error;
      }
      throw new Error(`SEND_ERROR: ${error.message}`);
    }
  }

  async processImage(buffer, options = {}) {
    try {
      if (!buffer || buffer.length === 0) {
        throw new Error('BUFFER_MISSING: No image buffer provided');
      }

      const metadata = await sharp(buffer).metadata();
      const { width, height, format } = metadata;

      const shouldResize = width > WHATSAPP_IMAGE_MAX || height > WHATSAPP_IMAGE_MAX;

      let pipeline = sharp(buffer);

      if (shouldResize) {
        pipeline = pipeline.resize(WHATSAPP_IMAGE_MAX, WHATSAPP_IMAGE_MAX, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      const outputFormat = options.format || 'jpeg';
      const quality = options.quality || 80;

      switch (outputFormat) {
        case 'jpeg':
        case 'jpg':
          pipeline = pipeline.jpeg({ quality, mozjpeg: true });
          break;
        case 'png':
          pipeline = pipeline.png({ compressionLevel: 6 });
          break;
        case 'webp':
          pipeline = pipeline.webp({ quality });
          break;
        default:
          pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      }

      const processedBuffer = await pipeline.toBuffer();
      const processedMetadata = await sharp(processedBuffer).metadata();

      return {
        buffer: processedBuffer,
        width: processedMetadata.width,
        height: processedMetadata.height,
        format: outputFormat,
        originalWidth: width,
        originalHeight: height,
        originalFormat: format,
        resized: shouldResize,
        size: processedBuffer.length,
      };
    } catch (error) {
      throw new Error(`IMAGE_PROCESSING_ERROR: ${error.message}`);
    }
  }

  getMediaInfo(message) {
    try {
      const type = this.getMessageType(message);
      if (!type) {
        return { type: null, supported: false };
      }

      const mediaData = this.#getMediaData(message);
      if (!mediaData) {
        return { type, supported: false };
      }

      const info = {
        type,
        mimeType: mediaData.mimetype || null,
        fileSize: mediaData.fileLength || 0,
        fileName: mediaData.fileName || null,
        supported: true,
      };

      if (type === 'imageMessage') {
        info.width = mediaData.width || null;
        info.height = mediaData.height || null;
      }

      if (type === 'videoMessage') {
        info.width = mediaData.width || null;
        info.height = mediaData.height || null;
        info.duration = mediaData.seconds || null;
        info.caption = mediaData.caption || null;
      }

      if (type === 'audioMessage') {
        info.duration = mediaData.seconds || null;
        info.isPtt = mediaData.ptt || false;
      }

      if (type === 'documentMessage') {
        info.pageCount = mediaData.pageCount || null;
      }

      if (info.fileSize > this.#maxFileSize) {
        info.supported = false;
        info.unsupportedReason = 'File exceeds size limit';
      }

      if (type === 'stickerMessage') {
        info.isAnimated = mediaData.isAnimated || false;
      }

      return info;
    } catch {
      return { type: null, supported: false, error: 'Failed to parse media info' };
    }
  }

  cleanupOldFiles(maxAgeHours = 24) {
    try {
      const now = Date.now();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
      let deleted = 0;
      let failed = 0;

      if (!fs.existsSync(this.#dataDir)) return { deleted, failed };

      const files = fs.readdirSync(this.#dataDir);

      for (const file of files) {
        const filePath = path.join(this.#dataDir, file);

        try {
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) continue;

          if (now - stat.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
            deleted++;
          }
        } catch {
          failed++;
        }
      }

      return { deleted, failed };
    } catch (error) {
      throw new Error(`CLEANUP_ERROR: ${error.message}`);
    }
  }
}

export default MediaHandler;
