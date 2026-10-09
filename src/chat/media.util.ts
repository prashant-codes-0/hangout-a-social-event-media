import { BadRequestException } from '@nestjs/common';
import { MessageAttachment } from './schemas/message.schema';

// Chat attachments (images, files, voice notes) are capped at 2 MB
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

// What the upload endpoint accepts; anything else (SVG, HTML, executables) is refused
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export function isAllowedMimeType(mimeType: string): boolean {
  // Parameters like "; codecs=opus" are not part of the allow-list check
  return ALLOWED_MIME.has((mimeType || '').toLowerCase().split(';')[0].trim());
}

// How the client renders it: images inline, audio as a player, everything else as a file chip
export function attachmentKindFor(
  mimeType: string,
): 'image' | 'file' | 'voice' {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'voice';
  return 'file';
}

export interface UploadedAttachment {
  url: string;
  publicId: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'file' | 'voice';
}

// Validates an attachment from the HTTP DTO or a raw socket payload (sockets skip the
// ValidationPipe, so the shape is re-checked here either way). Throws on a bad shape;
// returns undefined when the message has no attachment.
export function sanitizeAttachment(
  raw: unknown,
): MessageAttachment | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== 'object') {
    throw new BadRequestException('Attachment must be an object');
  }

  const a = raw as Record<string, unknown>;
  const url = typeof a.url === 'string' ? a.url.trim() : '';
  const publicId = typeof a.publicId === 'string' ? a.publicId.trim() : '';
  const name = typeof a.name === 'string' ? a.name.trim() : '';
  const mimeType =
    typeof a.mimeType === 'string' ? a.mimeType.trim().toLowerCase() : '';
  const size = Number(a.size);

  if (!url || !publicId || !name || !mimeType) {
    throw new BadRequestException('Attachment is missing required fields');
  }
  if (
    url.length > 500 ||
    publicId.length > 200 ||
    name.length > 120 ||
    mimeType.length > 120
  ) {
    throw new BadRequestException('Attachment fields are too long');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Attachment URL is not valid');
  }
  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('Attachment URL must use https');
  }
  if (!parsed.hostname.endsWith('.cloudinary.com')) {
    throw new BadRequestException('Attachment must be hosted on Cloudinary');
  }

  if (!Number.isInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) {
    throw new BadRequestException(
      'Attachments must be between 1 byte and 2 MB',
    );
  }
  if (!isAllowedMimeType(mimeType)) {
    throw new BadRequestException('This file type is not supported');
  }

  const durationMs =
    a.durationMs === undefined || a.durationMs === null
      ? undefined
      : Number(a.durationMs);
  if (
    durationMs !== undefined &&
    (!Number.isInteger(durationMs) ||
      durationMs < 0 ||
      durationMs > 60 * 60 * 1000)
  ) {
    throw new BadRequestException('Attachment duration is not valid');
  }

  return {
    url,
    publicId,
    name: name.slice(0, 120),
    mimeType,
    size,
    kind: attachmentKindFor(mimeType),
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

// The first http(s) URL in a message, without trailing sentence punctuation
const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi;

export function firstUrlIn(text?: string | null): string | undefined {
  if (!text) return undefined;
  const match = text.match(URL_IN_TEXT);
  if (!match?.[0]) return undefined;
  return match[0].replace(/[.,;:!?"')\]]+$/, '');
}
