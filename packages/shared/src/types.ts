/**
 * Platform-agnostic types shared between Tan Desktop (Electron) and Tan Mobile (React Native).
 * No platform-specific imports are allowed in this file.
 */

export type EncryptionRequest = {
  enabled: boolean;
  passphrase?: string;
};

export type ActivationRequest = {
  url: string;
  encryption: EncryptionRequest;
};

/** Media types that Tan can capture. */
export type CaptureMediaType =
  | 'video'       // MP4, WebM, etc.
  | 'hls'         // HLS .ts segments
  | 'dash'        // MPEG-DASH .m4s segments
  | 'image'       // JPEG, PNG, WebP, AVIF, etc.
  | 'audio'       // MP3, AAC, OGG, etc.
  | 'document'    // HTML, JSON, CSS, JS
  | 'binary';     // Other binary

/** A single captured network payload. */
export type CaptureEvent = {
  id: string;
  url: string;
  method?: string;
  status?: number;
  mediaType: CaptureMediaType;
  mimeType: string;
  bytes: number;
  sha256?: string;
  savedPath?: string;
  encrypted: boolean;
  timestamp: string;
  error?: string;
};

/** Status of the capture engine on any platform. */
export type CaptureStatus = {
  active: boolean;
  mode: 'idle' | 'arming' | 'active' | 'flushing' | 'error';
  targetUrl?: string;
  vaultRoot?: string;
  queueDepth: number;
  message?: string;
  stealthEnabled: boolean;
  reconstitutionEnabled: boolean;
};

/** Fired when an HLS/DASH stream has been reconstituted into a single MP4. */
export type ReconstitutionEvent = {
  streamId: string;
  segments: number;
  outputPath: string;
  totalBytes: number;
  duration?: number;
  error?: string;
  timestamp: string;
};

/** Real-time FFmpeg progress for an in-progress reconstitution. */
export type ReconstitutionProgressEvent = {
  streamId: string;
  percent: number;
  timestamp: string;
};

/** Application configuration stored per-device. */
export type TanConfig = {
  primaryAuditEndpoint: string;
  encryptionEnabled: boolean;
  stealthEnabled: boolean;
  reconstitutionEnabled: boolean;
};

export const DEFAULT_TAN_CONFIG: TanConfig = {
  primaryAuditEndpoint: 'https://example.com',
  encryptionEnabled: false,
  stealthEnabled: true,
  reconstitutionEnabled: true,
};

/** Tan cyberpunk design tokens — shared across Desktop and Mobile. */
export const TAN_COLORS = {
  background: '#020106',
  purple:     '#A855F7',
  purpleDim:  '#7C3AED',
  pink:       '#F472B6',
  cyan:       '#22D3EE',
  cyanDim:    '#0891B2',
  green:      '#4ADE80',
  amber:      '#FCD34D',
  red:        '#F87171',
  surface:    '#0D0A14',
  border:     '#1E1830',
} as const;
