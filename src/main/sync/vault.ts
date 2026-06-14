import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import type { SnapchatMediaInfo } from '../snapchat-detector';

const MIME_EXTENSIONS: Record<string, string> = {
  'application/javascript': 'js',
  'application/json': 'json',
  'application/octet-stream': 'bin',
  'application/pdf': 'pdf',
  'application/vnd.apple.mpegurl': 'm3u8',
  'application/wasm': 'wasm',
  'application/x-mpegurl': 'm3u8',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'text/css': 'css',
  'text/html': 'html',
  'text/javascript': 'js',
  'text/plain': 'txt',
  'video/mp2t': 'ts',
  'video/mp4': 'mp4',
  'video/webm': 'webm'
};

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function endpointSlug(endpointUrl: string): string {
  try {
    const url = new URL(endpointUrl);
    return sanitizeSegment(`${url.hostname}${url.port ? `-${url.port}` : ''}`);
  } catch {
    return sanitizeSegment(endpointUrl);
  }
}

export function extensionFromMime(mimeType: string, responseUrl?: string): string {
  const normalizedMime = mimeType.split(';', 1)[0].trim().toLowerCase();
  if (normalizedMime in MIME_EXTENSIONS) {
    return MIME_EXTENSIONS[normalizedMime];
  }

  if (responseUrl) {
    try {
      const pathName = new URL(responseUrl).pathname;
      const fileName = basename(pathName);
      const dotIndex = fileName.lastIndexOf('.');
      if (dotIndex > 0 && dotIndex < fileName.length - 1) {
        const ext = fileName.slice(dotIndex + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (ext.length > 0 && ext.length <= 8) {
          return ext;
        }
      }
    } catch {
      // Fall through to binary default.
    }
  }

  if (normalizedMime.startsWith('image/')) {
    return normalizedMime.replace('image/', '').replace(/[^a-z0-9]/g, '') || 'img';
  }

  if (normalizedMime.startsWith('video/')) {
    return normalizedMime.replace('video/', '').replace(/[^a-z0-9]/g, '') || 'video';
  }

  return normalizedMime.startsWith('text/') ? 'txt' : 'bin';
}

export function compactTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '_').replace('Z', '');
}

export function buildVaultDirectory(root: string, endpointUrl: string, date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return join(root, year, month, day, endpointSlug(endpointUrl));
}

export function buildPayloadPath(options: {
  root: string;
  endpointUrl: string;
  responseUrl: string;
  mimeType: string;
  sha256: string;
  requestId: string;
  encrypted: boolean;
  date?: Date;
}): string {
  const date = options.date ?? new Date();
  const directory = buildVaultDirectory(options.root, options.endpointUrl, date);
  const extension = extensionFromMime(options.mimeType, options.responseUrl);
  const identifier = `${options.sha256.slice(0, 16)}_${sanitizeSegment(options.requestId).slice(0, 18)}`;
  const fileName = `${compactTimestamp(date)}_${identifier}.${extension}${options.encrypted ? '.enc' : ''}`;
  return join(directory, fileName);
}

// Snapchat-specific vault organization
export function buildSnapchatVaultDirectory(root: string, mediaInfo: SnapchatMediaInfo, date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  // Use friend username or 'unknown' if not available
  const friendUsername = mediaInfo.friendUsername || 'unknown';
  const safeFriend = sanitizeSegment(friendUsername);
  
  // Use media type (snap, story, spotlight, chat) or 'other'
  const mediaType = mediaInfo.type === 'unknown' ? 'other' : mediaInfo.type;
  
  return join(root, year, month, day, safeFriend, mediaType);
}

export function buildSnapchatPayloadPath(options: {
  root: string;
  mediaInfo: SnapchatMediaInfo;
  responseUrl: string;
  mimeType: string;
  sha256: string;
  requestId: string;
  encrypted: boolean;
  date?: Date;
}): string {
  const date = options.date ?? new Date();
  const directory = buildSnapchatVaultDirectory(options.root, options.mediaInfo, date);
  const extension = extensionFromMime(options.mimeType, options.responseUrl);
  const identifier = `${options.sha256.slice(0, 16)}_${sanitizeSegment(options.requestId).slice(0, 18)}`;
  const fileName = `${compactTimestamp(date)}_${identifier}.${extension}${options.encrypted ? '.enc' : ''}`;
  return join(directory, fileName);
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'endpoint';
}
