export type EncryptionRequest = {
  enabled: boolean;
  passphrase?: string;
};

export type ActivationRequest = {
  url: string;
  encryption: EncryptionRequest;
};

export type ViewportBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EngineStatus = {
  active: boolean;
  mode: 'idle' | 'arming' | 'active' | 'flushing' | 'error';
  url?: string;
  vaultRoot?: string;
  queueDepth: number;
  message?: string;
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

export type TanApi = {
  activate(request: ActivationRequest): Promise<EngineStatus>;
  deactivate(): Promise<EngineStatus>;
  setViewportBounds(bounds: ViewportBounds): void;
  openVault(): Promise<void>;
  onStatus(callback: (status: EngineStatus) => void): () => void;
  onSyncEvent(callback: (event: SyncEvent) => void): () => void;
};
