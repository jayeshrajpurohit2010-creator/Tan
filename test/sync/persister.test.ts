import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptBuffer } from '../../src/main/sync/crypto';
import { PayloadPersister } from '../../src/main/sync/persister';
import type { CapturedResponse } from '../../src/main/sync/types';

const tempRoot = join(process.cwd(), '.tmp-tests');
let root: string;

beforeEach(async () => {
  root = join(tempRoot, `persister-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('PayloadPersister', () => {
  it('writes raw payload bytes and a manifest record', async () => {
    const persister = new PayloadPersister({
      root,
      endpointUrl: 'https://api.example.test/docs',
      encryption: { enabled: false }
    });
    const body = Buffer.from([0, 1, 2, 3, 254, 255]);
    const record = await persister.persist(responseFixture('image/png'), body);
    const saved = await readFile(record.savedPath);
    const manifest = await readFile(record.savedPath.replace(/[^\\/]+$/, 'manifest.jsonl'), 'utf8');

    expect(saved.equals(body)).toBe(true);
    expect(record.bytes).toBe(body.length);
    expect(record.mimeType).toBe('image/png');
    expect(manifest).toContain(record.sha256);
  });

  it('encrypts payload bytes when enabled while preserving manifest metadata', async () => {
    const persister = new PayloadPersister({
      root,
      endpointUrl: 'https://api.example.test/docs',
      encryption: { enabled: true, passphrase: 'vault-passphrase' }
    });
    const body = Buffer.from('high fidelity body');
    const record = await persister.persist(responseFixture('application/json'), body);
    const saved = await readFile(record.savedPath);
    const decrypted = decryptBuffer(saved, 'vault-passphrase');
    const manifest = await readFile(record.savedPath.replace(/[^\\/]+$/, 'manifest.jsonl'), 'utf8');

    expect(record.encrypted).toBe(true);
    expect(record.savedPath.endsWith('.json.enc')).toBe(true);
    expect(saved.equals(body)).toBe(false);
    expect(decrypted.equals(body)).toBe(true);
    expect(manifest).toContain('"algorithm":"aes-256-gcm"');
  });
});

function responseFixture(mimeType: string): CapturedResponse {
  return {
    requestId: '1234.56',
    url: 'https://cdn.example.test/payload',
    method: 'GET',
    status: 200,
    statusText: 'OK',
    mimeType,
    headers: { 'content-type': mimeType },
    timestamp: '2026-05-27T12:34:56.789Z'
  };
}
