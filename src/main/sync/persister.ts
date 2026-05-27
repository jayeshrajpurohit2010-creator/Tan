import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { encryptBuffer } from './crypto';
import { appendManifest } from './manifest';
import type { CapturedResponse, EncryptionSettings, ManifestRecord, PersistedError, PersistedPayload } from './types';
import { buildPayloadPath, sha256 } from './vault';

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
    const savedPath = buildPayloadPath({
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
