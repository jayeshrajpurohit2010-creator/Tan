import { useState, useCallback, useMemo } from 'react';
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

function mimeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'IMG';
  if (mimeType.startsWith('video/') || mimeType === 'video/mp2t') return 'VID';
  if (mimeType.startsWith('text/') || mimeType.includes('javascript') || mimeType.includes('json')) return 'DOC';
  if (mimeType.includes('font') || mimeType.includes('woff')) return 'FNT';
  if (mimeType === 'application/wasm') return 'WASM';
  return 'BIN';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function LiveCaptureGallery({ events, reconstitutionEvents, onOpenFile }: LiveCaptureGalleryProps): JSX.Element {
  const [filter, setFilter] = useState<string>('all');

  const latestArchive = useMemo(
    () => reconstitutionEvents.find((event) => !event.error && event.outputPath),
    [reconstitutionEvents],
  );

  const galleryItems: GalleryItem[] = [
    ...events.map((event) => ({
      id: event.id,
      url: event.url,
      mimeType: event.mimeType,
      bytes: event.bytes,
      savedPath: event.savedPath,
      timestamp: event.timestamp,
      error: event.error,
    })),
    ...reconstitutionEvents.map((event) => ({
      id: `recon_${event.streamId}_${event.timestamp}`,
      url: event.outputPath,
      mimeType: 'video/mp4',
      bytes: event.totalBytes,
      savedPath: event.outputPath,
      timestamp: event.timestamp,
      isReconstituted: true,
      streamId: event.streamId,
      segments: event.segments,
      error: event.error,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filtered = filter === 'all' ? galleryItems : galleryItems.filter((item) => {
    if (filter === 'image') return item.mimeType.startsWith('image/');
    if (filter === 'video') return item.mimeType.startsWith('video/') || item.isReconstituted;
    if (filter === 'document') return item.mimeType.startsWith('text/') || item.mimeType.includes('json');
    if (filter === 'reconstituted') return item.isReconstituted;
    return true;
  });

  const truncateUrl = useCallback((value: string, maxLen = 40): string => {
    if (value.length <= maxLen) return value;
    return `${value.slice(0, maxLen - 3)}...`;
  }, []);

  return (
    <div className="flex h-full flex-col">
      {latestArchive ? (
        <article
          className="mb-3 cursor-pointer border border-cyan-300/50 bg-cyan-950/35 p-4 transition hover:border-cyan-200/70 hover:bg-cyan-950/50"
          onClick={() => onOpenFile(latestArchive.outputPath)}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-black uppercase tracking-[0.34em] text-cyan-100">
              Archive Completed
            </div>
            <span className="border border-cyan-300/40 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-cyan-200">
              Forensic MP4
            </span>
          </div>
          <div className="mt-2 font-mono text-sm text-cyan-50">Stream: {latestArchive.streamId}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-cyan-100/75">{latestArchive.outputPath}</div>
          <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wider text-cyan-200/60">
            <span>{latestArchive.segments} segments</span>
            <span>{formatBytes(latestArchive.totalBytes)}</span>
            <span>{new Date(latestArchive.timestamp).toLocaleTimeString()}</span>
          </div>
        </article>
      ) : null}

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-fuchsia-100/80">
          <span>Live Capture Gallery</span>
          <span className="text-cyan-300/50">({filtered.length})</span>
        </div>
        <div className="flex gap-1">
          {['all', 'image', 'video', 'document', 'reconstituted'].map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                filter === value
                  ? 'border border-fuchsia-400/50 bg-fuchsia-500/30 text-fuchsia-100'
                  : 'border border-transparent text-cyan-300/50 hover:text-cyan-100'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-100/30">
            Awaiting captured payloads...
          </div>
        ) : (
          filtered.slice(0, 60).map((item) => (
            <div
              key={item.id}
              className={`group relative cursor-pointer border p-3 transition ${
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
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex-shrink-0 border border-cyan-300/25 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan-200/80">
                    {mimeLabel(item.mimeType)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-cyan-100/90">
                      {item.isReconstituted ? (
                        <span className="text-cyan-300">▶ Reconstituted: {item.streamId}</span>
                      ) : (
                        truncateUrl(item.url)
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-cyan-100/40">
                      <span>{item.mimeType.split(';')[0]}</span>
                      <span>•</span>
                      <span>{formatBytes(item.bytes)}</span>
                      {item.isReconstituted && item.segments ? (
                        <>
                          <span>•</span>
                          <span className="text-cyan-300/60">{item.segments} segments</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
                {item.isReconstituted ? (
                  <span className="flex-shrink-0 border border-cyan-400/40 bg-cyan-950/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan-300">
                    MP4
                  </span>
                ) : null}
              </div>
              {item.error ? (
                <div className="mt-1.5 truncate font-mono text-[10px] text-red-200/70">{item.error}</div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default LiveCaptureGallery;
