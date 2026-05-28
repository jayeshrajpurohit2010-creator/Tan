import { useState, useCallback } from 'react';
import type { SyncEvent, ReconstitutionEvent } from '../../../shared/ipc';

interface GalleryItem {
  id: string;
  url: string;
  mimeType: string;
  bytes: number;
  savedPath?: string;
  timestamp: string;
  isReconstituted?: boolean;
  streamId?: string;
  segments?: number;
  error?: string;
}

interface LiveCaptureGalleryProps {
  events: SyncEvent[];
  reconstitutionEvents: ReconstitutionEvent[];
  onOpenFile: (path: string) => void;
}

function mimeIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType.startsWith('video/') || mimeType === 'video/mp2t') return '🎬';
  if (mimeType.startsWith('text/') || mimeType.includes('javascript') || mimeType.includes('json')) return '📄';
  if (mimeType.includes('font') || mimeType.includes('woff')) return '🔤';
  if (mimeType === 'application/wasm') return '⚙';
  return '📦';
}

function LiveCaptureGallery({ events, reconstitutionEvents, onOpenFile }: LiveCaptureGalleryProps): JSX.Element {
  const [filter, setFilter] = useState<string>('all');

  const galleryItems: GalleryItem[] = [
    ...events.map((e) => ({
      id: e.id,
      url: e.url,
      mimeType: e.mimeType,
      bytes: e.bytes,
      savedPath: e.savedPath,
      timestamp: e.timestamp,
      error: e.error,
    })),
    ...reconstitutionEvents.map((r) => ({
      id: `recon_${r.streamId}_${r.timestamp}`,
      url: r.outputPath,
      mimeType: 'video/mp4',
      bytes: r.totalBytes,
      savedPath: r.outputPath,
      timestamp: r.timestamp,
      isReconstituted: true,
      streamId: r.streamId,
      segments: r.segments,
      error: r.error,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filtered = filter === 'all' ? galleryItems : galleryItems.filter((item) => {
    if (filter === 'image') return item.mimeType.startsWith('image/');
    if (filter === 'video') return item.mimeType.startsWith('video/') || item.isReconstituted;
    if (filter === 'document') return item.mimeType.startsWith('text/') || item.mimeType.includes('json');
    if (filter === 'reconstituted') return item.isReconstituted;
    return true;
  });

  const formatBytes = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
  }, []);

  const truncateUrl = (url: string, maxLen = 40): string => {
    if (url.length <= maxLen) return url;
    return url.slice(0, maxLen - 3) + '...';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-fuchsia-100/80">
          <span>Live Capture Gallery</span>
          <span className="text-cyan-300/50">({filtered.length})</span>
        </div>
        <div className="flex gap-1">
          {['all', 'image', 'video', 'document', 'reconstituted'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-[10px] uppercase tracking-wider font-mono transition ${
                filter === f
                  ? 'bg-fuchsia-500/30 text-fuchsia-100 border border-fuchsia-400/50'
                  : 'text-cyan-300/50 hover:text-cyan-100 border border-transparent'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[0.2em] text-cyan-100/30 font-mono">
            Awaiting captured payloads...
          </div>
        ) : (
          filtered.slice(0, 60).map((item) => (
            <div
              key={item.id}
              className={`group relative border p-3 cursor-pointer transition ${
                item.isReconstituted
                  ? 'border-cyan-400/40 bg-cyan-950/20 hover:bg-cyan-950/40'
                  : item.error
                  ? 'border-red-400/30 bg-red-950/20 hover:bg-red-950/30'
                  : 'border-fuchsia-400/20 bg-fuchsia-950/10 hover:bg-fuchsia-950/20'
              }`}
              onClick={() => {
                if (item.savedPath) onOpenFile(item.savedPath);
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm flex-shrink-0">{mimeIcon(item.mimeType)}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-cyan-100/90 truncate">
                      {item.isReconstituted ? (
                        <span className="text-cyan-300">
                          ▶ Reconstituted: {item.streamId}
                        </span>
                      ) : (
                        truncateUrl(item.url)
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-100/40 mt-0.5">
                      <span>{item.mimeType.split(';')[0]}</span>
                      <span>•</span>
                      <span>{formatBytes(item.bytes)}</span>
                      {item.isReconstituted && item.segments && (
                        <>
                          <span>•</span>
                          <span className="text-cyan-300/60">{item.segments} segments</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {item.isReconstituted && (
                  <span className="flex-shrink-0 px-2 py-0.5 text-[9px] uppercase tracking-wider font-mono border border-cyan-400/40 text-cyan-300 bg-cyan-950/40">
                    MP4
                  </span>
                )}
              </div>
              {item.error && (
                <div className="mt-1.5 text-[10px] font-mono text-red-200/70 truncate">
                  {item.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default LiveCaptureGallery;
