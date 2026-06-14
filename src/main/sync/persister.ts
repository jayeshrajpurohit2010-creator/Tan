import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { encryptBuffer } from './crypto';
import { appendManifest } from './manifest';
import type { CapturedResponse, EncryptionSettings, ManifestRecord, PersistedError, PersistedPayload } from './types';
import { buildPayloadPath, buildSnapchatPayloadPath, sha256 } from './vault';
import { detectSnapchatMedia } from '../snapchat-detector';

export type PayloadPersisterOptions = {
  root: string;
  endpointUrl: string;
  encryption: EncryptionSettings;
};

export class PayloadPersister {
  constructor(private readonly options: PayloadPersisterOptions) {}

  async persist(response: CapturedResponse, body: Buffer): Promise<PersistedPayload> {
    const hash = sha256(body);
    const encrypted = this.options.encryption.enabled;
    const payloadDate = new Date(response.timestamp);
    
    // Detect if this is Snapchat media and use Snapchat-specific vault organization
    const snapchatMediaInfo = detectSnapchatMedia(response.url, response.mimeType);
    const isSnapchat = snapchatMediaInfo.type !== 'unknown';
    
    const savedPath = isSnapchat
      ? buildSnapchatPayloadPath({
          root: this.options.root,
          mediaInfo: snapchatMediaInfo,
          responseUrl: response.url,
          mimeType: response.mimeType,
          sha256: hash,
          requestId: response.requestId,
          encrypted,
          date: payloadDate
        })
      : buildPayloadPath({
          root: this.options.root,
          endpointUrl: this.options.endpointUrl,
          responseUrl: response.url,
          mimeType: response.mimeType,
          sha256: hash,
          requestId: response.requestId,
          encrypted,
          date: payloadDate
        });

    const encryptedPayload = encrypted ? encryptBuffer(body, this.options.encryption.passphrase ?? '') : undefined;
    const bytesToWrite = encryptedPayload?.bytes ?? body;
    await mkdir(dirname(savedPath), { recursive: true });
    await writeFile(savedPath, bytesToWrite);

    const record: PersistedPayload = {
      id: `${hash.slice(0, 16)}_${response.requestId}`,
      url: response.url,
      method: response.method,
      status: response.status,
      mimeType: response.mimeType,
      bytes: body.length,
      sha256: hash,
      savedPath,
      encrypted,
      timestamp: response.timestamp,
      headers: response.headers,
      requestId: response.requestId
    };

    await appendManifest(this.options.root, this.options.endpointUrl, {
      ...record,
      ...(encryptedPayload
        ? {
            encryption: {
              algorithm: encryptedPayload.algorithm,
              salt: encryptedPayload.salt,
              iv: encryptedPayload.iv,
              authTag: encryptedPayload.authTag
            }
          }
        : {}),
      // Add Snapchat-specific metadata
      ...(isSnapchat
        ? {
            snapchatMedia: {
              type: snapchatMediaInfo.type,
              friendUsername: snapchatMediaInfo.friendUsername,
              isFriendStory: snapchatMediaInfo.isFriendStory,
              isDiscover: snapchatMediaInfo.isDiscover,
              isEphemeral: snapchatMediaInfo.isEphemeral,
            }
          }
        : {})
    } as ManifestRecord);

    return record;
  }

  async persistError(response: CapturedResponse, error: unknown): Promise<PersistedError> {
    const message = error instanceof Error ? error.message : String(error);
    const record: PersistedError = {
      id: `error_${response.requestId}`,
      url: response.url,
      method: response.method,
      status: response.status,
      mimeType: response.mimeType,
      bytes: 0,
      encrypted: this.options.encryption.enabled,
      timestamp: response.timestamp,
      headers: response.headers,
      requestId: response.requestId,
      error: message
    };

    await appendManifest(this.options.root, this.options.endpointUrl, record);
    return record;
  }
}
