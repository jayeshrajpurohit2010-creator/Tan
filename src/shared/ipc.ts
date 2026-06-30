export type EncryptionRequest = {
  enabled: boolean;
  passphrase?: string;
};

export type ProxyConfig = {
  enabled: boolean;
  server?: string;
  username?: string;
  password?: string;
};

export type ActivationRequest = {
  url: string;
  encryption: EncryptionRequest;
  stealth: StealthConfig;
  proxy?: ProxyConfig;
};

export type ViewportBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const PRIMARY_AUDIT_ENDPOINT = 'https://web.snapchat.com';

export function isHighFidelityEndpoint(url: string, designated = PRIMARY_AUDIT_ENDPOINT): boolean {
  try {
    const current = new URL(url.trim());
    const target = new URL(designated.trim());
    return current.origin === target.origin && current.pathname.startsWith(target.pathname.replace(/\/$/, '') || '/');
  } catch {
    return false;
  }
}

export type EngineStatus = {
  active: boolean;
  mode: 'idle' | 'arming' | 'active' | 'flushing' | 'error';
  url?: string;
  vaultRoot?: string;
  queueDepth: number;
  message?: string;
  stealthEnabled: boolean;
  reconstitutionEnabled: boolean;
  cdpAttached: boolean;
};

export type SyncEvent = {
  id: string;
  url: string;
  method?: string;
  status?: number;
  mimeType: string;
  bytes: number;
  sha256?: string;
  savedPath?: string;
  encrypted: boolean;
  timestamp: string;
  queueDepth: number;
  error?: string;
};

export type ReconstitutionEvent = {
  streamId: string;
  segments: number;
  outputPath: string;
  totalBytes: number;
  duration?: number;
  error?: string;
  timestamp: string;
};

export type ReconstitutionProgressEvent = {
  streamId: string;
  percent: number;
  timestamp: string;
};

export type StealthConfig = {
  enabled: boolean;
  spoofWebdriver: boolean;
  spoofHardwareConcurrency: boolean;
  spoofWebgl: boolean;
  spoofPlugins: boolean;
  spoofPlatform: boolean;
};

export const DEFAULT_STEALTH_CONFIG: StealthConfig = {
  enabled: true,
  spoofWebdriver: true,
  spoofHardwareConcurrency: true,
  spoofWebgl: true,
  spoofPlugins: true,
  spoofPlatform: true,
};

export type GalleryEntry = {
  id: string;
  url: string;
  mimeType: string;
  bytes: number;
  savedPath: string;
  timestamp: string;
  thumbnailPath?: string;
};

export type AppConfig = {
  primaryAuditEndpoint: string;
};

export type TanApi = {
  activate(request: ActivationRequest): Promise<EngineStatus>;
  deactivate(): Promise<EngineStatus>;
  setViewportBounds(bounds: ViewportBounds): void;
  openVault(): Promise<void>;
  getConfig(): Promise<AppConfig>;
  onStatus(callback: (status: EngineStatus) => void): () => void;
  onSyncEvent(callback: (event: SyncEvent) => void): () => void;
  onReconstitutionEvent(callback: (event: ReconstitutionEvent) => void): () => void;
  onReconstitutionProgress(callback: (event: ReconstitutionProgressEvent) => void): () => void;
  onSessionExpired(callback: () => void): () => void;
  openFile(path: string): Promise<void>;
};
