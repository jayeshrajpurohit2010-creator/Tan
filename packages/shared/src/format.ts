/**
 * Platform-agnostic formatting utilities.
 */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function compactTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '_').replace('Z', '');
}

export function relativeTime(timestamp: string): string {
  const delta = Date.now() - new Date(timestamp).getTime();
  if (delta < 1000)  return 'just now';
  if (delta < 60000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  return `${Math.floor(delta / 3600000)}h ago`;
}

/** Classify a MIME type into a short label for UI display. */
export function mimeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/'))                          return 'IMG';
  if (mimeType.startsWith('video/') || mimeType === 'video/mp2t') return 'VID';
  if (mimeType.startsWith('audio/'))                          return 'AUD';
  if (mimeType.includes('mpegurl') || mimeType.includes('m3u8')) return 'HLS';
  if (mimeType.includes('dash+xml'))                          return 'DASH';
  if (mimeType.startsWith('text/') || mimeType.includes('javascript') || mimeType.includes('json')) return 'DOC';
  if (mimeType.includes('font') || mimeType.includes('woff')) return 'FNT';
  if (mimeType === 'application/wasm')                        return 'WASM';
  return 'BIN';
}
