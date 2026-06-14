export type CapturedResponse = {
  requestId: string;
  url: string;
  method?: string;
  status?: number;
  statusText?: string;
  mimeType: string;
  headers: Record<string, unknown>;
  encodedDataLength?: number;
  timestamp: string;
};

export type CdpResponseBody = {
  body: string;
  base64Encoded: boolean;
};

export type PersistedPayload = {
  id: string;
  url: string;
  method?: string;
  status?: number;
  mimeType: string;
  bytes: number;
  sha256: string;
  savedPath: string;
  encrypted: boolean;
  timestamp: string;
  headers: Record<string, unknown>;
  requestId: string;
  encryption?: {
    algorithm: 'aes-256-gcm';
    salt: string;
    iv: string;
    authTag: string;
  };
  snapchatMedia?: {
    type: 'snap' | 'story' | 'spotlight' | 'chat' | 'unknown';
    friendUsername?: string;
    isFriendStory: boolean;
    isDiscover: boolean;
    isEphemeral: boolean;
  };
};

export type PersistedError = {
  id: string;
  url: string;
  method?: string;
  status?: number;
  mimeType: string;
  bytes: 0;
  encrypted: boolean;
  timestamp: string;
  headers: Record<string, unknown>;
  requestId: string;
  error: string;
};

export type ManifestRecord = PersistedPayload | PersistedError;

export type EncryptionSettings = {
  enabled: boolean;
  passphrase?: string;
};
