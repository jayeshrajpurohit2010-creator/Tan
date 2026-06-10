import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type {
  EngineStatus,
  NavigationState,
  SyncEvent,
  ReconstitutionEvent,
  ReconstitutionProgressEvent,
  StealthConfig,
} from '../../shared/ipc';
import { DEFAULT_STEALTH_CONFIG, PRIMARY_AUDIT_ENDPOINT } from '../../shared/ipc';
import Logo from './components/Logo';
import LiveCaptureGallery from './components/LiveCaptureGallery';

const initialStatus: EngineStatus = {
  active: false,
  mode: 'idle',
  queueDepth: 0,
  stealthEnabled: true,
  reconstitutionEnabled: true,
  cdpAttached: false,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[i]}`;
}

// ─── Root ────────────────────────────────────────────────────────────────────

function App(): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState(PRIMARY_AUDIT_ENDPOINT);
  const [navState, setNavState] = useState<NavigationState>({
    url: PRIMARY_AUDIT_ENDPOINT,
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  });
  const [addressBarInput, setAddressBarInput] = useState('');
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState<EngineStatus>(initialStatus);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [reconstitutionEvents, setReconstitutionEvents] = useState<ReconstitutionEvent[]>([]);
  const [reconstitutionProgress, setReconstitutionProgress] = useState<ReconstitutionProgressEvent[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [stealthConfig, setStealthConfig] = useState<StealthConfig>(DEFAULT_STEALTH_CONFIG);
  const [showStealthPanel, setShowStealthPanel] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [activityPulse, setActivityPulse] = useState(false);

  const isBusy = status.mode === 'arming' || status.mode === 'flushing';
  const syncEngineLive = status.active && status.cdpAttached && status.mode === 'active';
  const latestBytes = useMemo(() => events.reduce((t, e) => t + e.bytes, 0), [events]);

  // ── Bootstrap config
  useEffect(() => {
    void window.tan.getConfig().then((config) => {
      setUrl(config.primaryAuditEndpoint);
      setAddressBarInput(config.primaryAuditEndpoint);
    });
  }, []);

  // ── Auto-activate on mount
  useEffect(() => {
    if (bootstrapped || isBusy) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const nextStatus = await window.tan.activate({
            url,
            encryption: { enabled: encryptionEnabled, passphrase: encryptionEnabled ? passphrase : undefined },
            stealth: stealthConfig,
          });
          setStatus(nextStatus);
          setPassphrase('');
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
          setBootstrapped(true);
        }
      })();
    }, 600);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped]);

  // ── Subscribe to IPC events
  useEffect(() => {
    const subs = [
      window.tan.onStatus(setStatus),
      window.tan.onSyncEvent((event) => {
        setEvents((cur) => [event, ...cur].slice(0, 120));
        // Flash the activity pulse on each captured payload
        setActivityPulse(true);
        window.setTimeout(() => setActivityPulse(false), 600);
      }),
      window.tan.onReconstitutionEvent((event) => {
        setReconstitutionEvents((cur) => [event, ...cur].slice(0, 30));
        setReconstitutionProgress((cur) => cur.filter((p) => p.streamId !== event.streamId));
      }),
      window.tan.onReconstitutionProgress((event) => {
        setReconstitutionProgress((cur) => {
          const idx = cur.findIndex((p) => p.streamId === event.streamId);
          if (idx === -1) return [...cur, event].slice(-20);
          const next = [...cur];
          next[idx] = event;
          return next;
        });
      }),
      window.tan.onNavigationState((state) => {
        setNavState(state);
        if (state.url && state.url !== 'about:blank') {
          setAddressBarInput(state.url);
        }
      }),
    ];
    return () => subs.forEach((unsub) => unsub());
  }, []);

  // ── Viewport bounds tracking
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const publishBounds = (): void => {
      const rect = element.getBoundingClientRect();
      window.tan.setViewportBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    };

    const resizeObserver = new ResizeObserver(publishBounds);
    resizeObserver.observe(element);
    window.addEventListener('resize', publishBounds);
    publishBounds();
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', publishBounds);
    };
  }, []);

  const handleToggle = useCallback(async (): Promise<void> => {
    setError(undefined);
    try {
      if (status.active) {
        setStatus(await window.tan.deactivate());
        return;
      }
      const nextStatus = await window.tan.activate({
        url,
        encryption: { enabled: encryptionEnabled, passphrase: encryptionEnabled ? passphrase : undefined },
        stealth: stealthConfig,
      });
      setStatus(nextStatus);
      setPassphrase('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setStatus((cur) => ({ ...cur, active: false, mode: 'error', message, stealthEnabled: true, reconstitutionEnabled: true, cdpAttached: false }));
    }
  }, [url, encryptionEnabled, passphrase, status.active, stealthConfig]);

  const handleNavigate = useCallback(async (destination: string): Promise<void> => {
    if (!destination.trim()) return;
    await window.tan.navigate(destination);
  }, []);

  const handleAddressBarSubmit = useCallback(async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    await handleNavigate(addressBarInput);
  }, [addressBarInput, handleNavigate]);

  const handleOpenFile = useCallback(async (filePath: string) => {
    await window.tan.openFile(filePath);
  }, []);

  return (
    <main className="flex min-h-screen flex-col overflow-hidden bg-tanBlack text-slate-100">
      {/* CRT overlays */}
      <div className="crt-scanlines pointer-events-none fixed inset-0 z-50" />
      <div className="crt-flicker pointer-events-none fixed inset-0 z-40" />

      {/* ── Header ── */}
      <header className="relative z-10 flex shrink-0 items-center justify-between border-b border-fuchsia-400/20 bg-black/60 px-5 py-2.5 backdrop-blur-sm">
        <Logo compact />
        <div className="flex items-center gap-2">
          <StatusPill label="Archive Engine" active={syncEngineLive} pending={status.active && !status.cdpAttached} />
          <StatusPill label="Reconstitution" active={status.reconstitutionEnabled && status.active} />
          <StatusPill label="Compliance" active={status.stealthEnabled} />
          {activityPulse && (
            <span className="activity-dot ml-1 h-2 w-2 rounded-full bg-fuchsia-400" />
          )}
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] text-cyan-100/40">
          <span>v1.0</span>
          <span className="truncate max-w-[280px]">{navState.url || url}</span>
        </div>
      </header>

      {/* ── Body: 3-column grid ── */}
      <div className="relative grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_380px]">

        {/* ── LEFT: Control Panel ── */}
        <aside className="flex flex-col gap-3 overflow-y-auto border-r border-fuchsia-400/20 bg-black/30 p-4 scrollbar-thin">

          {/* ─ Archive Mode Button (hero CTA) ─ */}
          <button
            onClick={() => void handleToggle()}
            disabled={isBusy || (encryptionEnabled && !passphrase && !status.active)}
            className={`archive-cta-btn relative w-full overflow-hidden border px-5 py-5 font-mono text-sm font-black uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
              status.active
                ? 'archive-btn-active border-red-400/70 bg-red-950/40 text-red-100 hover:bg-red-900/50'
                : 'archive-btn-idle border-fuchsia-300/80 bg-fuchsia-950/40 text-fuchsia-50 shadow-neonPurple hover:bg-fuchsia-900/50'
            }`}
          >
            <span className="relative z-10 flex items-center justify-center gap-3">
              {isBusy ? (
                <><SpinnerIcon />{status.mode === 'arming' ? 'Arming...' : 'Flushing...'}</>
              ) : status.active ? (
                <><span className="text-base">■</span> Abort Archive Session</>
              ) : (
                <><span className="text-base">▶</span> Activate Archive Mode</>
              )}
            </span>
            {/* Corner bracket decorations */}
            <span className="bracket-tl" /><span className="bracket-tr" />
            <span className="bracket-bl" /><span className="bracket-br" />
          </button>

          {/* ─ Target endpoint ─ */}
          <div>
            <label className="block text-[10px] uppercase tracking-[0.3em] text-fuchsia-200/70" htmlFor="endpoint">
              Target Endpoint
            </label>
            <input
              id="endpoint"
              value={url}
              disabled={status.active || isBusy}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-2 w-full border border-cyan-300/30 bg-black/60 px-3 py-2.5 font-mono text-xs text-cyan-50 outline-none transition focus:border-cyan-300/70 disabled:opacity-50"
              placeholder="https://target.example"
            />
          </div>

          {/* ─ Encryption ─ */}
          <div className="border border-fuchsia-400/20 bg-fuchsia-950/10 p-3">
            <label className="flex cursor-pointer items-center justify-between text-xs text-fuchsia-100">
              <span className="font-mono uppercase tracking-[0.18em]">AES-256-GCM Encryption</span>
              <input
                type="checkbox"
                checked={encryptionEnabled}
                disabled={status.active || isBusy}
                onChange={(e) => setEncryptionEnabled(e.target.checked)}
                className="h-4 w-4 accent-fuchsia-500"
              />
            </label>
            {encryptionEnabled && (
              <input
                value={passphrase}
                disabled={status.active || isBusy}
                onChange={(e) => setPassphrase(e.target.value)}
                type="password"
                className="mt-3 w-full border border-fuchsia-300/30 bg-black/60 px-3 py-2 font-mono text-xs text-fuchsia-50 outline-none focus:border-fuchsia-300/70 disabled:opacity-50"
                placeholder="Session passphrase"
              />
            )}
          </div>

          {/* ─ Compliance layer ─ */}
          <div className="border border-cyan-300/15 bg-cyan-950/10">
            <button
              onClick={() => setShowStealthPanel(!showStealthPanel)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100/70 transition hover:bg-cyan-950/20"
            >
              <span>Compliance Layer</span>
              <span className={showStealthPanel ? 'text-cyan-300' : 'text-cyan-100/35'}>
                {showStealthPanel ? '▲' : '▼'}
              </span>
            </button>
            {showStealthPanel && (
              <div className="space-y-2 border-t border-cyan-300/15 px-3 py-3">
                {([
                  ['spoofWebdriver',         'Spoof navigator.webdriver'],
                  ['spoofHardwareConcurrency','Spoof hardwareConcurrency'],
                  ['spoofWebgl',             'Spoof WebGL vendor'],
                  ['spoofPlugins',           'Spoof plugins array'],
                  ['spoofPlatform',          'Spoof platform string'],
                  ['enabled',                'Enable stealth layer'],
                ] as [keyof StealthConfig, string][]).map(([key, label]) => (
                  <StealthToggle
                    key={key}
                    label={label}
                    checked={stealthConfig[key] as boolean}
                    disabled={status.active || isBusy}
                    onChange={(v) => setStealthConfig({ ...stealthConfig, [key]: v })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ─ Error ─ */}
          {error && (
            <div className="border border-red-400/40 bg-red-950/25 px-3 py-2.5 font-mono text-xs text-red-200">
              {error}
            </div>
          )}

          {/* ─ Open vault ─ */}
          <button
            onClick={() => void window.tan.openVault()}
            className="w-full border border-cyan-300/30 bg-cyan-950/15 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em] text-cyan-200/80 transition hover:bg-cyan-950/30"
          >
            Open Verification Vault
          </button>

          {/* ─ Terminal readout ─ */}
          <div className="mt-auto terminal-readout border border-cyan-300/15 bg-black/50 p-3 font-mono text-[11px]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-cyan-100/45">mode</span>
              <span className="text-fuchsia-300">{status.mode}</span>
              <span className="text-cyan-100/45">queue</span>
              <span className="text-cyan-200">{status.queueDepth}</span>
              <span className="text-cyan-100/45">cdp</span>
              <span className={status.cdpAttached ? 'text-green-300' : 'text-amber-300'}>
                {status.cdpAttached ? 'attached' : 'detached'}
              </span>
              <span className="text-cyan-100/45">payloads</span>
              <span className="text-cyan-200">{events.length}</span>
              <span className="text-cyan-100/45">captured</span>
              <span className="text-cyan-200">{formatBytes(latestBytes)}</span>
            </div>
            <div className="mt-2 truncate text-[10px] text-cyan-100/30">
              {status.vaultRoot ?? 'vault: pending'}
            </div>
          </div>
        </aside>

        {/* ── CENTER: Browser Frame ── */}
        <section className="flex min-w-0 flex-col border-r border-fuchsia-400/20">
          {/* Address bar */}
          <div className={`browser-nav-bar flex items-center gap-2 border-b px-3 py-2 ${
            syncEngineLive
              ? 'border-fuchsia-400/40 bg-fuchsia-950/20'
              : 'border-cyan-300/15 bg-black/40'
          }`}>
            <button
              onClick={() => window.tan.goBack()}
              disabled={!navState.canGoBack}
              className="nav-btn px-2 py-1 font-mono text-xs text-cyan-300/60 hover:text-cyan-200 disabled:opacity-30"
              title="Back"
            >
              ←
            </button>
            <button
              onClick={() => window.tan.goForward()}
              disabled={!navState.canGoForward}
              className="nav-btn px-2 py-1 font-mono text-xs text-cyan-300/60 hover:text-cyan-200 disabled:opacity-30"
              title="Forward"
            >
              →
            </button>
            <button
              onClick={() => window.tan.reload()}
              className="nav-btn px-2 py-1 font-mono text-xs text-cyan-300/60 hover:text-cyan-200"
              title="Reload"
            >
              {navState.isLoading ? '✕' : '↺'}
            </button>

            <form className="flex flex-1" onSubmit={(e) => void handleAddressBarSubmit(e)}>
              <input
                value={addressBarInput}
                onChange={(e) => setAddressBarInput(e.target.value)}
                className="address-bar w-full bg-transparent px-2 py-1 font-mono text-xs text-cyan-100/80 outline-none placeholder:text-cyan-100/25"
                placeholder="Navigate to URL..."
                spellCheck={false}
              />
            </form>

            {syncEngineLive && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-fuchsia-300">
                <span className="recording-dot h-2 w-2 rounded-full bg-red-400" />
                REC
              </div>
            )}
            {navState.isLoading && (
              <div className="loading-bar-container">
                <div className="loading-bar" />
              </div>
            )}
          </div>

          {/* Viewport area */}
          <div
            className={`viewport-frame relative flex-1 ${
              syncEngineLive ? 'viewport-active' : ''
            }`}
          >
            {/* Corner bracket overlays */}
            <span className="viewport-corner tl" />
            <span className="viewport-corner tr" />
            <span className="viewport-corner bl" />
            <span className="viewport-corner br" />

            {/* The actual WebContentsView positions itself here */}
            <div
              ref={viewportRef}
              className="absolute inset-0"
            />

            {/* Status overlay when not yet active */}
            {!status.active && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="font-mono text-xs uppercase tracking-[0.3em] text-fuchsia-200/35">
                  Activate Archive Mode to Begin Capture
                </div>
              </div>
            )}
            {status.active && !status.cdpAttached && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="font-mono text-xs uppercase tracking-[0.3em] text-amber-300/60 blink">
                  Establishing CDP attachment...
                </div>
              </div>
            )}
          </div>

          {/* Gallery strip below viewport */}
          <div className="shrink-0 border-t border-fuchsia-400/15 bg-black/40 p-3" style={{ height: '200px' }}>
            <LiveCaptureGallery
              events={events}
              reconstitutionEvents={reconstitutionEvents}
              reconstitutionProgress={reconstitutionProgress}
              onOpenFile={handleOpenFile}
              compact
            />
          </div>
        </section>

        {/* ── RIGHT: Monitor Panel ── */}
        <aside className="flex min-w-0 flex-col overflow-hidden bg-black/20 p-4">
          {/* Metrics grid */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <MetricCard label="Payloads" value={events.length.toString()} color="cyan" />
            <MetricCard label="Bytes" value={formatBytes(latestBytes)} color="cyan" />
            <MetricCard label="Queue" value={status.queueDepth.toString()} color={status.queueDepth > 0 ? 'amber' : 'cyan'} />
            <MetricCard label="Streams" value={reconstitutionEvents.filter((e) => !e.error).length.toString()} color="purple" />
            <MetricCard label="Recon MB" value={formatBytes(reconstitutionEvents.reduce((t, e) => t + e.totalBytes, 0))} color="purple" />
            <MetricCard label="State" value={status.mode} color={syncEngineLive ? 'green' : 'cyan'} />
          </div>

          {/* In-progress reconstitution */}
          {reconstitutionProgress.length > 0 && (
            <div className="mb-3 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-200/60">Reconstituting</div>
              {reconstitutionProgress.slice(0, 3).map(({ streamId, percent }) => (
                <div key={streamId} className="border border-fuchsia-400/35 bg-fuchsia-950/20 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[10px] text-fuchsia-300 blink">⚙ {streamId}</span>
                    <span className="shrink-0 font-mono text-[10px] text-fuchsia-400">{percent}%</span>
                  </div>
                  <div className="mt-1.5 h-0.5 w-full overflow-hidden bg-black/50">
                    <div className="progress-bar-fill h-full transition-all duration-300" style={{ width: `${Math.max(2, percent)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payload stream log */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-fuchsia-400/20 bg-black/50">
            <div className="flex items-center justify-between border-b border-fuchsia-400/20 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-fuchsia-100/70">Payload Stream</span>
              {reconstitutionEvents.length > 0 && (
                <span className="border border-cyan-400/40 bg-cyan-950/30 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300">
                  {reconstitutionEvents.filter((e) => !e.error).length} streams
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
              {events.length === 0 && reconstitutionEvents.length === 0 ? (
                <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-100/25">
                  Awaiting intercepted payloads...
                </div>
              ) : (
                <>
                  {reconstitutionEvents.slice(0, 5).map((event) => (
                    <article
                      key={`recon-${event.streamId}-${event.timestamp}`}
                      className="mb-2 border-l-2 border-cyan-400/50 bg-cyan-950/10 pl-2.5 pr-2 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[10px] text-cyan-300">▶ {event.streamId}</span>
                        <span className="shrink-0 font-mono text-[10px] text-cyan-200">{formatBytes(event.totalBytes)}</span>
                      </div>
                      <div className="mt-0.5 font-mono text-[9px] text-fuchsia-200/50">
                        {event.segments} segs → .mp4
                      </div>
                      {event.error && (
                        <div className="mt-0.5 truncate font-mono text-[9px] text-red-300/70">{event.error}</div>
                      )}
                    </article>
                  ))}

                  {events.slice(0, 50).map((syncEvent) => (
                    <article
                      key={`${syncEvent.id}-${syncEvent.timestamp}`}
                      className="mb-2 border-b border-fuchsia-400/10 pb-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[10px] text-cyan-100/80">
                          {syncEvent.mimeType.split(';')[0] || 'application/octet-stream'}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-cyan-200">{formatBytes(syncEvent.bytes)}</span>
                      </div>
                      <div className="truncate font-mono text-[9px] text-fuchsia-100/55">{syncEvent.url}</div>
                      <div className="mt-0.5 flex justify-between gap-2 font-mono text-[9px] text-cyan-100/35">
                        <span>{syncEvent.status ?? 'ERR'}</span>
                        <span>{syncEvent.encrypted ? 'enc' : 'raw'}</span>
                      </div>
                      {syncEvent.error && (
                        <div className="mt-0.5 truncate font-mono text-[9px] text-red-300/70">{syncEvent.error}</div>
                      )}
                    </article>
                  ))}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SpinnerIcon(): JSX.Element {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function StatusPill({
  label,
  active,
  pending = false,
}: {
  label: string;
  active: boolean;
  pending?: boolean;
}): JSX.Element {
  const tone = active
    ? 'border-green-400/40 bg-green-950/30 text-green-200'
    : pending
      ? 'border-amber-400/40 bg-amber-950/20 text-amber-300 blink'
      : 'border-cyan-300/15 bg-black/30 text-cyan-100/35';
  return (
    <span className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${tone}`}>
      {label}
    </span>
  );
}

function StealthToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange(v: boolean): void;
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 font-mono text-[10px] text-cyan-100/65">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-cyan-400"
      />
    </label>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'cyan' | 'purple' | 'amber' | 'green';
}): JSX.Element {
  const valueColor = {
    cyan: 'text-cyan-100',
    purple: 'text-fuchsia-300',
    amber: 'text-amber-300',
    green: 'text-green-300',
  }[color];

  return (
    <div className="border border-cyan-300/15 bg-black/40 p-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-100/40">{label}</div>
      <div className={`mt-1 truncate font-mono text-sm font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}

export default App;
