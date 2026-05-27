import { useEffect, useMemo, useRef, useState } from 'react';
import type { EngineStatus, SyncEvent } from '../../shared/ipc';

const initialStatus: EngineStatus = {
  active: false,
  mode: 'idle',
  queueDepth: 0
};

function App(): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState('https://example.com');
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState<EngineStatus>(initialStatus);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [error, setError] = useState<string | undefined>();

  const isBusy = status.mode === 'arming' || status.mode === 'flushing';
  const latestBytes = useMemo(() => events.reduce((total, event) => total + event.bytes, 0), [events]);

  useEffect(() => {
    const removeStatus = window.tan.onStatus(setStatus);
    const removeSyncEvent = window.tan.onSyncEvent((event) => {
      setEvents((current) => [event, ...current].slice(0, 80));
    });

    return () => {
      removeStatus();
      removeSyncEvent();
    };
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }

    const publishBounds = (): void => {
      const rect = element.getBoundingClientRect();
      window.tan.setViewportBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      });
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

  async function handleToggle(): Promise<void> {
    setError(undefined);

    try {
      if (status.active) {
        const nextStatus = await window.tan.deactivate();
        setStatus(nextStatus);
        return;
      }

      const nextStatus = await window.tan.activate({
        url,
        encryption: {
          enabled: encryptionEnabled,
          passphrase: encryptionEnabled ? passphrase : undefined
        }
      });
      setStatus(nextStatus);
      setPassphrase('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setStatus((current) => ({ ...current, active: false, mode: 'error', message }));
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-tanBlack text-slate-100">
      <div className="crt-scanlines pointer-events-none fixed inset-0 z-50" />
      <div className="crt-flicker pointer-events-none fixed inset-0 z-40" />

      <section className="relative grid min-h-screen grid-cols-[360px_minmax(420px,1fr)_380px] gap-6 px-8 py-7">
        <ControlPanel
          url={url}
          setUrl={setUrl}
          encryptionEnabled={encryptionEnabled}
          setEncryptionEnabled={setEncryptionEnabled}
          passphrase={passphrase}
          setPassphrase={setPassphrase}
          status={status}
          isBusy={isBusy}
          error={error}
          onToggle={handleToggle}
          onOpenVault={() => void window.tan.openVault()}
        />

        <section className="flex min-w-0 flex-col items-center justify-center gap-5">
          <div className="w-full max-w-[520px]">
            <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.32em] text-cyan-200/80">
              <span>Mobile Desktop Hybrid</span>
              <span>{status.active ? 'CDP Bridge Online' : 'Viewport Standby'}</span>
            </div>
            <div className="mobile-shell relative mx-auto aspect-[9/19.5] w-full max-w-[430px] overflow-hidden rounded-[28px] border border-fuchsia-400/45 bg-black shadow-neonPurple">
              <div className="absolute inset-x-16 top-2 z-20 h-5 rounded-b-2xl bg-black/90 shadow-neonCyan" />
              <div
                ref={viewportRef}
                className="absolute inset-[18px] overflow-hidden rounded-[20px] border border-cyan-300/35 bg-black/85"
              >
                <div className="flex h-full items-center justify-center px-8 text-center text-xs uppercase tracking-[0.26em] text-fuchsia-200/50">
                  {status.active ? 'Native WebContentsView' : 'Activate engine to mount target viewport'}
                </div>
              </div>
            </div>
          </div>
        </section>

        <TelemetryPanel status={status} events={events} latestBytes={latestBytes} />
      </section>
    </main>
  );
}

type ControlPanelProps = {
  url: string;
  setUrl(value: string): void;
  encryptionEnabled: boolean;
  setEncryptionEnabled(value: boolean): void;
  passphrase: string;
  setPassphrase(value: string): void;
  status: EngineStatus;
  isBusy: boolean;
  error?: string;
  onToggle(): Promise<void>;
  onOpenVault(): void;
};

function ControlPanel(props: ControlPanelProps): JSX.Element {
  return (
    <aside className="flex min-w-0 flex-col justify-between border-r border-fuchsia-400/20 pr-6">
      <div>
        <div className="mb-10">
          <div className="pixel-logo text-[54px] font-black leading-none tracking-[0.08em] text-tanPurple">) TAN</div>
          <p className="mt-3 text-xs uppercase tracking-[0.32em] text-cyan-200/80">Verification Vault Interface</p>
        </div>

        <label className="block text-[11px] uppercase tracking-[0.28em] text-fuchsia-200/80" htmlFor="endpoint">
          Target Endpoint
        </label>
        <input
          id="endpoint"
          value={props.url}
          disabled={props.status.active || props.isBusy}
          onChange={(event) => props.setUrl(event.target.value)}
          className="mt-3 w-full border border-cyan-300/35 bg-black/70 px-4 py-3 font-mono text-sm text-cyan-50 outline-none shadow-neonCyan transition focus:border-cyan-200 disabled:opacity-55"
          placeholder="https://endpoint.example"
        />

        <div className="mt-6 border border-fuchsia-400/25 bg-fuchsia-950/10 p-4">
          <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-fuchsia-100">
            <span>AES-256-GCM encryption</span>
            <input
              type="checkbox"
              checked={props.encryptionEnabled}
              disabled={props.status.active || props.isBusy}
              onChange={(event) => props.setEncryptionEnabled(event.target.checked)}
              className="h-5 w-5 accent-tanPurple"
            />
          </label>
          {props.encryptionEnabled ? (
            <input
              value={props.passphrase}
              disabled={props.status.active || props.isBusy}
              onChange={(event) => props.setPassphrase(event.target.value)}
              type="password"
              className="mt-4 w-full border border-fuchsia-300/35 bg-black/70 px-4 py-3 font-mono text-sm text-fuchsia-50 outline-none transition focus:border-fuchsia-200 disabled:opacity-55"
              placeholder="Session passphrase"
            />
          ) : null}
        </div>

        {props.error ? (
          <div className="mt-5 border border-red-400/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">{props.error}</div>
        ) : null}

        <button
          onClick={() => void props.onToggle()}
          disabled={props.isBusy || (props.encryptionEnabled && !props.passphrase && !props.status.active)}
          className="mt-8 w-full border border-fuchsia-300 bg-fuchsia-500/20 px-5 py-5 text-left font-mono text-base font-black uppercase tracking-[0.16em] text-fuchsia-50 shadow-neonPurple transition hover:bg-fuchsia-400/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {props.status.active ? 'DEACTIVATE SYNC ENGINE' : 'ACTIVATE SYNC ENGINE'}
        </button>

        <button
          onClick={props.onOpenVault}
          className="mt-4 w-full border border-cyan-300/40 bg-cyan-500/10 px-5 py-3 text-left font-mono text-xs font-bold uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-cyan-400/20"
        >
          Open Verification Vault
        </button>
      </div>

      <div className="terminal-readout mt-8 border border-cyan-300/20 bg-black/50 p-4 text-xs text-cyan-100/80">
        <p>mode: {props.status.mode}</p>
        <p>queue: {props.status.queueDepth}</p>
        <p>vault: {props.status.vaultRoot ?? 'pending'}</p>
      </div>
    </aside>
  );
}

function TelemetryPanel({
  status,
  events,
  latestBytes
}: {
  status: EngineStatus;
  events: SyncEvent[];
  latestBytes: number;
}): JSX.Element {
  return (
    <aside className="flex min-w-0 flex-col border-l border-cyan-300/20 pl-6">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Payloads" value={events.length.toString()} />
        <Metric label="Bytes" value={formatBytes(latestBytes)} />
        <Metric label="Queue" value={status.queueDepth.toString()} />
        <Metric label="State" value={status.mode} />
      </div>

      <div className="mt-6 flex-1 overflow-hidden border border-fuchsia-400/25 bg-black/60">
        <div className="border-b border-fuchsia-400/25 px-4 py-3 text-[11px] uppercase tracking-[0.28em] text-fuchsia-100/80">
          Payload Stream
        </div>
        <div className="h-[calc(100vh-244px)] overflow-y-auto p-4 font-mono text-xs">
          {events.length === 0 ? (
            <div className="text-cyan-100/45">Awaiting intercepted response payloads...</div>
          ) : (
            events.map((event) => (
              <article key={`${event.id}-${event.timestamp}`} className="mb-4 border-b border-cyan-300/10 pb-4">
                <div className="mb-1 flex items-center justify-between gap-3 text-cyan-100">
                  <span className="truncate">{event.mimeType || 'application/octet-stream'}</span>
                  <span>{formatBytes(event.bytes)}</span>
                </div>
                <div className="truncate text-fuchsia-100/75">{event.url}</div>
                <div className="mt-1 flex justify-between gap-3 text-cyan-100/55">
                  <span>{event.status ?? 'ERR'}</span>
                  <span>{event.encrypted ? 'encrypted' : 'raw'}</span>
                </div>
                {event.error ? <div className="mt-2 text-red-200">{event.error}</div> : null}
              </article>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="border border-cyan-300/25 bg-cyan-950/10 p-4">
      <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-100/55">{label}</div>
      <div className="mt-2 truncate font-mono text-lg font-bold text-cyan-50">{value}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

export default App;
