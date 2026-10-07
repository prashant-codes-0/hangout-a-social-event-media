import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import {
  attachmentKindFor,
  isAllowedMimeType,
  MAX_ATTACHMENT_BYTES,
  UploadedAttachment,
} from './media.util';

// Keep stored file names readable but harmless (no path bits, control chars, or Windows-illegal characters)
function sanitizeFileName(name?: string): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  let cleaned = '';
  for (const ch of base) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || '<>:"|?*'.includes(ch)) continue;
    cleaned += ch;
  }
  return cleaned.trim().slice(0, 120) || 'file';
}

// Cloudinary groups audio (and video) under the "video" resource type
function resourceTypeFor(mimeType?: string): 'image' | 'video' | 'raw' {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'video';
  return 'raw';
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = config.get<string>('CLOUDINARY_API_SECRET');
    this.configured = Boolean(cloudName && apiKey && apiSecret);
    if (this.configured) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    } else {
      this.logger.warn('CLOUDINARY_* variables are not set - chat file uploads are disabled');
    }
  }

  // Validates the file (type + 2 MB cap; multer already rejects oversized bodies) and
  // stores it under hangout/chat/<userId>/ on Cloudinary.
  async uploadChatAttachment(file: Express.Multer.File, userId: string): Promise<UploadedAttachment> {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('No file was provided');
    }
    const size = file.buffer.length;
    if (size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException('Files must be 2 MB or smaller');
    }
    const mimeType = (file.mimetype || '').toLowerCase();
    if (!isAllowedMimeType(mimeType)) {
      throw new UnsupportedMediaTypeException(
        'This file type is not supported (images, audio, PDF, text and zip files are)',
      );
    }
    if (!this.configured) {
      throw new InternalServerErrorException(
        'File storage is not configured on this server (missing Cloudinary credentials)',
      );
    }

    const result = await this.toCloudinary(file.buffer, userId);
    return {
      url: result.secure_url,
      publicId: result.public_id,
      name: sanitizeFileName(file.originalname),
      mimeType,
      size,
      kind: attachmentKindFor(mimeType),
    };
  }

  // Best-effort removal of a stored file (e.g. when its message is deleted)
  async destroy(publicId?: string, mimeType?: string): Promise<void> {
    if (!publicId || !this.configured) return;
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceTypeFor(mimeType) });
    } catch (err) {
      this.logger.warn(`Could not delete Cloudinary asset ${publicId}: ${String(err)}`);
    }
  }

  private toCloudinary(buffer: Buffer, userId: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `hangout/chat/${userId}`,
          resource_type: 'auto',
          overwrite: false,
          use_filename: false,
        },
        (err, result) => {
          if (err || !result) {
            reject(new InternalServerErrorException('The upload could not be stored'));
          } else {
            resolve(result as UploadApiResponse);
          }
        },
      );
      stream.end(buffer);
    });
  }
}
