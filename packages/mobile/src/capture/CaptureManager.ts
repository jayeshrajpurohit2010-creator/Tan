/**
 * CaptureManager — coordinates downloading and persisting captured media on Android.
 *
 * When the WebView intercept script detects a media URL, this manager:
 *   1. Deduplicates (same URL seen twice → skip)
 *   2. Filters by shouldCapture()
 *   3. Downloads the file using react-native-fs
 *   4. Emits a CaptureEvent to subscribers
 *
 * Storage path: <RNFS.ExternalDirectoryPath>/Tan/<YYYY>/<MM>/<DD>/<host>/<file>
 */

import RNFS from 'react-native-fs';
import { shouldCapture, classifyMediaType } from '@tan/shared';
import type { CaptureEvent } from '@tan/shared';

type WebViewMessage = {
  type:        'capture';
  url:         string;
  contentType: string;
  byteLength:  number;
  timestamp:   string;
};

type Subscriber = (event: CaptureEvent) => void;

function sanitize(segment: string): string {
  return segment.replace(/[^a-z0-9._-]/gi, '_').slice(0, 60) || 'payload';
}

const MIME_TO_EXT: Record<string, string> = {
  'video/mp2t':                    'ts',
  'video/mp4':                     'mp4',
  'video/webm':                    'webm',
  'video/ogg':                     'ogv',
  'audio/mpeg':                    'mp3',
  'audio/aac':                     'aac',
  'audio/ogg':                     'ogg',
  'audio/mp4':                     'm4a',
  'audio/opus':                    'opus',
  'image/jpeg':                    'jpg',
  'image/png':                     'png',
  'image/webp':                    'webp',
  'image/gif':                     'gif',
  'image/avif':                    'avif',
  'application/vnd.apple.mpegurl': 'm3u8',
  'application/x-mpegurl':         'm3u8',
  'application/dash+xml':          'mpd',
  'application/octet-stream':      'bin',
};

const KNOWN_MEDIA_EXTS = new Set([
  'ts', 'm4s', 'fmp4', 'mp4', 'm4v', 'm4a', 'webm', 'mov',
  'mp3', 'aac', 'ogg', 'opus', 'm3u8', 'mpd', 'jpg', 'jpeg',
  'png', 'webp', 'gif', 'avif', 'svg',
]);

function buildSavePath(url: string, mimeType: string, date: Date): string {
  const host = (() => { try { return new URL(url).hostname; } catch { return 'unknown'; } })();
  const rawName = url.split('/').pop()?.split('?')[0] ?? '';
  const urlExt  = rawName.includes('.') ? rawName.split('.').pop()!.toLowerCase() : '';
  // Use the URL's extension when it's a known media type; otherwise derive from MIME.
  const ext = KNOWN_MEDIA_EXTS.has(urlExt)
    ? urlExt
    : (MIME_TO_EXT[mimeType.split(';')[0].trim().toLowerCase()] ?? 'bin');
  // Strip the URL's extension from the filename to avoid double-extension.
  const stem = KNOWN_MEDIA_EXTS.has(urlExt) && rawName.includes('.')
    ? rawName.slice(0, rawName.lastIndexOf('.'))
    : rawName;
  const name = sanitize(stem || 'payload');
  const base = RNFS.ExternalDirectoryPath || RNFS.DocumentDirectoryPath;
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const dd   = String(date.getDate()).padStart(2, '0');
  return `${base}/Tan/${yyyy}/${mm}/${dd}/${sanitize(host)}/${name}.${ext}`;
}

export class CaptureManager {
  private seen        = new Set<string>();
  private subscribers = new Set<Subscriber>();
  private active      = false;
  private queueDepth  = 0;

  start(): void  { this.active = true; }
  stop():  void  { this.active = false; }

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  /** Called by the WebView's onMessage handler with parsed JSON. */
  async handleWebViewMessage(raw: string): Promise<void> {
    if (!this.active) return;

    let msg: WebViewMessage;
    try {
      msg = JSON.parse(raw) as WebViewMessage;
    } catch {
      return;
    }

    if (msg.type !== 'capture') return;
    if (this.seen.has(msg.url))  return;
    if (!shouldCapture(msg.contentType, msg.url)) return;

    this.seen.add(msg.url);
    this.queueDepth++;

    void this.download(msg)
      .catch(() => {
        // Remove from seen on failure so transient network errors allow a retry.
        this.seen.delete(msg.url);
      })
      .finally(() => {
        this.queueDepth = Math.max(0, this.queueDepth - 1);
      });
  }

  get depth(): number { return this.queueDepth; }

  private async download(msg: WebViewMessage): Promise<void> {
    const date     = new Date(msg.timestamp);
    const savePath = buildSavePath(msg.url, msg.contentType, date);
    const dir      = savePath.slice(0, savePath.lastIndexOf('/'));

    try {
      await RNFS.mkdir(dir);

      const result = await RNFS.downloadFile({
        fromUrl:   msg.url,
        toFile:    savePath,
        headers:   { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36' },
      }).promise;

      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const event: CaptureEvent = {
        id,
        url:       msg.url,
        status:    result.statusCode,
        mediaType: classifyMediaType(msg.contentType, msg.url),
        mimeType:  msg.contentType,
        bytes:     result.bytesWritten,
        savedPath: savePath,
        encrypted: false,
        timestamp: msg.timestamp,
      };

      for (const sub of this.subscribers) {
        sub(event);
      }
    } catch (error) {
      const id = `err_${Date.now()}`;
      const event: CaptureEvent = {
        id,
        url:       msg.url,
        mediaType: classifyMediaType(msg.contentType, msg.url),
        mimeType:  msg.contentType,
        bytes:     0,
        encrypted: false,
        timestamp: msg.timestamp,
        error:     error instanceof Error ? error.message : String(error),
      };

      for (const sub of this.subscribers) {
        sub(event);
      }
    }
  }

  clearHistory(): void {
    this.seen.clear();
  }
}
