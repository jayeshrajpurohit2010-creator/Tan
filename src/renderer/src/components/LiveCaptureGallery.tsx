import { useState, useCallback, useMemo } from 'react';
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
  compact?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mimeLabel(mimeType: string): string {
  const m = mimeType.split(';')[0].trim().toLowerCase();
  if (m.startsWith('image/')) return 'IMG';
  if (m === 'video/mp2t' || m.startsWith('video/')) return 'VID';
  if (m === 'application/x-mpegurl' || m === 'application/vnd.apple.mpegurl' || m.includes('m3u8')) return 'HLS';
  if (m.includes('dash') || m.includes('mpd') || m === 'video/mp4' && false) return 'DASH';
  if (m.startsWith('audio/')) return 'AUD';
  if (m.startsWith('text/') || m.includes('javascript') || m.includes('json')) return 'DOC';
  if (m.includes('woff') || m.includes('font')) return 'FNT';
  if (m === 'application/wasm') return 'WASM';
  return 'BIN';
}

function mimeLabelColor(label: string): string {
  switch (label) {
    case 'VID': return 'border-fuchsia-400/50 text-fuchsia-300';
    case 'HLS': return 'border-cyan-400/50 text-cyan-300';
    case 'DASH': return 'border-cyan-400/50 text-cyan-300';
    case 'IMG': return 'border-green-400/50 text-green-300';
    case 'AUD': return 'border-amber-400/50 text-amber-300';
    case 'DOC': return 'border-blue-400/40 text-blue-300';
    default:     return 'border-cyan-300/25 text-cyan-200/70';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[i]}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

function LiveCaptureGallery({
  events,
  reconstitutionEvents,
  reconstitutionProgress,
  onOpenFile,
  compact = false,
}: LiveCaptureGalleryProps): JSX.Element {
  const [filter, setFilter] = useState<string>('all');

  const latestArchive = useMemo(
    () => reconstitutionEvents.find((e) => !e.error && e.outputPath),
    [reconstitutionEvents],
  );

  const progressMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of reconstitutionProgress) map.set(p.streamId, p.percent);
    for (const e of reconstitutionEvents) map.delete(e.streamId);
    return map;
  }, [reconstitutionProgress, reconstitutionEvents]);

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
    ...reconstitutionEvents.map((e) => ({
      id: `recon_${e.streamId}_${e.timestamp}`,
      url: e.outputPath,
      mimeType: 'video/mp4',
      bytes: e.totalBytes,
      savedPath: e.outputPath,
      timestamp: e.timestamp,
      isReconstituted: true,
      streamId: e.streamId,
      segments: e.segments,
      error: e.error,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filtered = filter === 'all' ? galleryItems : galleryItems.filter((item) => {
    if (filter === 'video') return item.mimeType.startsWith('video/') || item.isReconstituted;
    if (filter === 'image') return item.mimeType.startsWith('image/');
    if (filter === 'hls') return item.mimeType.includes('mpegurl') || item.mimeType.includes('m3u8') || item.isReconstituted;
    if (filter === 'reconstituted') return item.isReconstituted;
    return true;
  });

  const truncate = useCallback((v: string, max = 44): string =>
    v.length <= max ? v : `${v.slice(0, max - 3)}...`, []);

  const inProgress = Array.from(progressMap.entries());

  // ── Compact mode (strip in the center panel) ──────────────────────────────
  if (compact) {
    const recentItems = galleryItems.slice(0, 20);
    return (
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-fuchsia-100/60">
            Live Capture
            {galleryItems.length > 0 && (
              <span className="ml-1.5 text-cyan-300/50">({galleryItems.length})</span>
            )}
          </span>
          {inProgress.length > 0 && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-fuchsia-300 blink">
              ⚙ {inProgress.length} reconstituting
            </span>
          )}
        </div>

        <div className="flex flex-1 gap-1.5 overflow-x-auto scrollbar-thin pb-1">
          {latestArchive && (
            <button
              onClick={() => onOpenFile(latestArchive.outputPath)}
              className="flex shrink-0 flex-col justify-between border border-cyan-400/50 bg-cyan-950/30 p-2 hover:bg-cyan-950/50"
              style={{ width: '140px' }}
            >
              <div className="text-[9px] font-mono uppercase tracking-wider text-cyan-300">▶ MP4 Ready</div>
              <div className="mt-1 truncate font-mono text-[9px] text-cyan-100/70">{latestArchive.streamId}</div>
              <div className="mt-1 font-mono text-[9px] text-cyan-200/50">{formatBytes(latestArchive.totalBytes)}</div>
            </button>
          )}
          {recentItems.filter((i) => !i.isReconstituted).slice(0, 15).map((item) => {
            const label = mimeLabel(item.mimeType);
            const labelColor = mimeLabelColor(label);
            return (
              <button
                key={item.id}
                onClick={() => item.savedPath && onOpenFile(item.savedPath)}
                className={`flex shrink-0 flex-col justify-between border p-2 transition ${
                  item.error
                    ? 'border-red-400/30 bg-red-950/20'
                    : 'border-fuchsia-400/20 bg-fuchsia-950/10 hover:bg-fuchsia-950/25'
                }`}
                style={{ width: '100px' }}
              >
                <span className={`border px-1 py-0.5 font-mono text-[8px] uppercase tracking-wide self-start ${labelColor}`}>
                  {label}
                </span>
                <div className="mt-1.5 font-mono text-[8px] text-cyan-200/50">{formatBytes(item.bytes)}</div>
              </button>
            );
          })}
          {recentItems.length === 0 && (
            <div className="flex flex-1 items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-100/25">
              No captures yet
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Full mode ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Latest completed archive — hero card */}
      {latestArchive && (
        <article
          className="mb-3 cursor-pointer border border-cyan-300/50 bg-cyan-950/30 p-3 transition hover:border-cyan-200/70 hover:bg-cyan-950/50"
          onClick={() => onOpenFile(latestArchive.outputPath)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-cyan-100">Archive Complete</div>
            <span className="border border-cyan-300/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-cyan-200">MP4</span>
          </div>
          <div className="mt-1.5 truncate font-mono text-xs text-cyan-50">{latestArchive.streamId}</div>
          <div className="mt-1 flex flex-wrap gap-2 font-mono text-[9px] text-cyan-200/55">
            <span>{latestArchive.segments} segs</span>
            <span>{formatBytes(latestArchive.totalBytes)}</span>
            <span>{new Date(latestArchive.timestamp).toLocaleTimeString()}</span>
            <span className="ml-auto text-cyan-300/70">▶ Open</span>
          </div>
        </article>
      )}

      {/* In-progress reconstitution cards */}
      {inProgress.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {inProgress.map(([streamId, percent]) => (
            <div key={streamId} className="border border-fuchsia-400/40 bg-fuchsia-950/20 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-fuchsia-200 blink">⚙ Reconstituting</span>
                <span className="shrink-0 font-mono text-[10px] text-fuchsia-300">{percent}%</span>
              </div>
              <div className="mt-1 truncate font-mono text-[9px] text-fuchsia-100/55">{streamId}</div>
              <div className="mt-1.5 h-0.5 w-full overflow-hidden bg-black/50">
                <div className="progress-bar-fill h-full transition-all duration-300" style={{ width: `${Math.max(2, percent)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-fuchsia-100/70">
          <span>Gallery</span>
          <span className="text-cyan-300/45">({filtered.length})</span>
        </div>
        <div className="flex gap-0.5">
          {(['all', 'video', 'image', 'hls', 'reconstituted'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition ${
                filter === value
                  ? 'border border-fuchsia-400/50 bg-fuchsia-500/25 text-fuchsia-100'
                  : 'text-cyan-300/45 hover:text-cyan-200'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {/* Items list */}
      <div className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-100/25">
            Awaiting captured payloads...
          </div>
        ) : (
          filtered.slice(0, 60).map((item) => {
            const label = mimeLabel(item.mimeType);
            const labelColor = mimeLabelColor(label);
            return (
              <div
                key={item.id}
                className={`cursor-pointer border p-2.5 transition ${
                  item.isReconstituted
                    ? 'border-cyan-400/35 bg-cyan-950/15 hover:bg-cyan-950/30'
                    : item.error
                      ? 'border-red-400/30 bg-red-950/15 hover:bg-red-950/25'
                      : 'border-fuchsia-400/18 bg-fuchsia-950/8 hover:bg-fuchsia-950/18'
                }`}
                onClick={() => item.savedPath && onOpenFile(item.savedPath)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`shrink-0 border px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider ${labelColor}`}>
                      {label}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[10px] text-cyan-100/85">
                        {item.isReconstituted
                          ? <span className="text-cyan-300">▶ {item.streamId}</span>
                          : truncate(item.url)}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] text-cyan-100/35">
                        <span>{item.mimeType.split(';')[0]}</span>
                        <span>·</span>
                        <span>{formatBytes(item.bytes)}</span>
                        {item.segments && <><span>·</span><span className="text-cyan-300/55">{item.segments}s</span></>}
                      </div>
                    </div>
                  </div>
                  {item.isReconstituted && (
                    <span className="shrink-0 border border-cyan-400/40 bg-cyan-950/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-cyan-300">
                      MP4
                    </span>
                  )}
                </div>
                {item.error && (
                  <div className="mt-1 truncate font-mono text-[9px] text-red-300/65">{item.error}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default LiveCaptureGallery;
