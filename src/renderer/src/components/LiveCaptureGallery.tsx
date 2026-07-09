import { useState, useCallback, useMemo, memo } from 'react';
import type { SyncEvent, ReconstitutionEvent, ReconstitutionProgressEvent } from '../../../shared/ipc';

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
  reconstitutionProgress: ReconstitutionProgressEvent[];
  onOpenFile: (path: string) => void;
}

function mimeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'IMG';
  if (mimeType.startsWith('video/') || mimeType === 'video/mp2t') return 'VID';
  if (mimeType.startsWith('text/') || mimeType.includes('javascript') || mimeType.includes('json')) return 'DOC';
  if (mimeType.includes('font') || mimeType.includes('woff')) return 'FNT';
  if (mimeType === 'application/wasm') return 'WASM';
  if (mimeType.includes('mpegurl') || mimeType.includes('m3u8')) return 'HLS';
  if (mimeType.includes('dash') || mimeType.includes('mpd')) return 'DASH';
  return 'BIN';
}

function mimeColor(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'border-cyan-400/40 bg-cyan-950/20';
  if (mimeType.startsWith('video/')) return 'border-fuchsia-400/30 bg-fuchsia-950/15';
  if (mimeType.includes('mpegurl') || mimeType.includes('m3u8')) return 'border-amber-400/30 bg-amber-950/15';
  return 'border-fuchsia-400/20 bg-fuchsia-950/10';
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

function ProgressBar({ percent }: { percent: number }): JSX.Element {
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/50 border border-cyan-300/20">
      <div
        className="progress-bar-fill h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.max(2, percent)}%` }}
      />
    </div>
  );
}

// Memoized gallery item to prevent unnecessary re-renders
const GalleryItemRow = memo(function GalleryItemRow({
  item,
  onOpenFile,
}: {
  item: GalleryItem;
  onOpenFile: (path: string) => void;
}): JSX.Element {
  const handleClick = useCallback(() => {
    if (item.savedPath) onOpenFile(item.savedPath);
  }, [item.savedPath, onOpenFile]);

  return (
    <div
      className={`group relative cursor-pointer border p-3 transition ${
        item.isReconstituted
          ? 'border-cyan-400/40 bg-cyan-950/20 hover:bg-cyan-950/40'
          : item.error
            ? 'border-red-400/30 bg-red-950/20 hover:bg-red-950/30'
            : mimeColor(item.mimeType)
      }`}
      onClick={handleClick}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex-shrink-0 border border-cyan-300/25 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan-200/80">
            {mimeLabel(item.mimeType)}
          </span>
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-cyan-100/90">
              {item.isReconstituted ? (
                <span className="text-cyan-300">▶ {item.streamId}</span>
              ) : (
                item.url.length > 40 ? `${item.url.slice(0, 37)}...` : item.url
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-cyan-100/40">
              <span>{item.mimeType.split(';')[0]}</span>
              <span>•</span>
              <span>{formatBytes(item.bytes)}</span>
              {item.isReconstituted && item.segments ? (
                <>
                  <span>•</span>
                  <span className="text-cyan-300/60">{item.segments} segs</span>
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
  );
});

function LiveCaptureGallery({
  events,
  reconstitutionEvents,
  reconstitutionProgress,
  onOpenFile,
}: LiveCaptureGalleryProps): JSX.Element {
  const [filter, setFilter] = useState<string>('all');

  const latestArchive = useMemo(
    () => reconstitutionEvents.find((event) => !event.error && event.outputPath),
    [reconstitutionEvents],
  );

  const progressMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of reconstitutionProgress) {
      map.set(p.streamId, p.percent);
    }
    for (const e of reconstitutionEvents) {
      map.delete(e.streamId);
    }
    return map;
  }, [reconstitutionProgress, reconstitutionEvents]);

  const filtered = useMemo(() => {
    const items: GalleryItem[] = [
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

    if (filter === 'all') return items;
    if (filter === 'image') return items.filter((item) => item.mimeType.startsWith('image/'));
    if (filter === 'video') return items.filter((item) => item.mimeType.startsWith('video/') || item.isReconstituted);
    if (filter === 'document') return items.filter((item) => item.mimeType.startsWith('text/') || item.mimeType.includes('json'));
    if (filter === 'reconstituted') return items.filter((item) => item.isReconstituted);
    return items;
  }, [events, reconstitutionEvents, filter]);

  const inProgressEntries = Array.from(progressMap.entries());

  return (
    <div className="flex h-full flex-col">
      {/* Latest completed archive — hero card */}
      {latestArchive ? (
        <article
          className="mb-3 cursor-pointer border border-cyan-300/50 bg-cyan-950/35 p-4 transition hover:border-cyan-200/70 hover:bg-cyan-950/50"
          onClick={() => onOpenFile(latestArchive.outputPath)}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-black uppercase tracking-[0.34em] text-cyan-100">
              Archive Complete
            </div>
            <span className="border border-cyan-300/40 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-cyan-200">
              Forensic MP4
            </span>
          </div>
          <div className="mt-2 font-mono text-sm text-cyan-50 truncate">
            {latestArchive.streamId}
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-cyan-100/75">
            {latestArchive.outputPath}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wider text-cyan-200/60">
            <span>{latestArchive.segments} segs</span>
            <span>{formatBytes(latestArchive.totalBytes)}</span>
            <span>{new Date(latestArchive.timestamp).toLocaleTimeString()}</span>
            <span className="ml-auto text-cyan-300/80">▶ Open</span>
          </div>
        </article>
      ) : null}

      {/* In-progress reconstitution cards */}
      {inProgressEntries.length > 0 ? (
        <div className="mb-3 space-y-2">
          {inProgressEntries.map(([streamId, percent]) => (
            <div
              key={streamId}
              className="border border-fuchsia-400/40 bg-fuchsia-950/25 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.26em] text-fuchsia-200 blink">
                  ⚙ Reconstituting
                </span>
                <span className="font-mono text-[11px] text-fuchsia-300">{percent}%</span>
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-fuchsia-100/60">{streamId}</div>
              <ProgressBar percent={percent} />
            </div>
          ))}
        </div>
      ) : null}

      {/* Filter tabs */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-fuchsia-100/80">
          <span>Live Capture Gallery</span>
          <span className="text-cyan-300/50">({filtered.length})</span>
        </div>
        <div className="flex gap-1">
          {(['all', 'image', 'video', 'document', 'reconstituted'] as const).map((value) => (
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

      {/* Gallery items list — limited to 60 for performance */}
      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-100/30">
            Awaiting captured payloads...
          </div>
        ) : (
          filtered.slice(0, 60).map((item) => (
            <GalleryItemRow key={item.id} item={item} onOpenFile={onOpenFile} />
          ))
        )}
      </div>
    </div>
  );
}

export default LiveCaptureGallery;
