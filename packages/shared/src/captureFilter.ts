/**
 * URL and MIME filtering logic shared between Desktop and Mobile capture engines.
 * Determines which responses are worth persisting.
 */

import type { CaptureMediaType } from './types';

const CAPTURE_MIME_PREFIXES = [
  'video/',
  'audio/',
  'image/',
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/dash+xml',
  'application/octet-stream',
];

const SKIP_MIME_PATTERNS = [
  'text/html',
  'text/css',
  'application/javascript',
  'text/javascript',
];

const SEGMENT_EXTENSIONS = new Set(['.ts', '.m4s', '.aac', '.mp4', '.m4v', '.m4a', '.fmp4']);
const MEDIA_EXTENSIONS   = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.m3u8', '.mpd']);
const IMAGE_EXTENSIONS   = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);

function extractPathExtension(url: string): string {
  try {
    const path = new URL(url).pathname;
    const dot  = path.lastIndexOf('.');
    if (dot > 0) return path.slice(dot).toLowerCase().split('?')[0];
  } catch {}
  return '';
}

export function shouldCapture(mimeType: string, url: string, minBytes = 1024): boolean {
  const mime = mimeType.split(';')[0].trim().toLowerCase();

  if (SKIP_MIME_PATTERNS.some((p) => mime.startsWith(p))) return false;
  if (CAPTURE_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;

  const ext = extractPathExtension(url);
  return SEGMENT_EXTENSIONS.has(ext) || MEDIA_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext);
}

export function classifyMediaType(mimeType: string, url: string): CaptureMediaType {
  const mime = mimeType.split(';')[0].trim().toLowerCase();
  const ext  = extractPathExtension(url);

  if (mime.includes('mpegurl') || mime.includes('m3u8') || ext === '.m3u8') return 'hls';
  if (mime.includes('dash')     || ext === '.mpd')                           return 'dash';
  if (ext === '.ts' || ext === '.m4s' || ext === '.fmp4')                    return mime.startsWith('video') ? 'hls' : 'dash';
  if (mime.startsWith('video/') || MEDIA_EXTENSIONS.has(ext))                return 'video';
  if (mime.startsWith('audio/'))                                              return 'audio';
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext))                return 'image';
  if (mime.startsWith('text/')  || mime.includes('json') || mime.includes('javascript')) return 'document';
  return 'binary';
}
