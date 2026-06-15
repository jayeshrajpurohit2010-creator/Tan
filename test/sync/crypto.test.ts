import { describe, expect, it } from 'vitest';
import { decryptBuffer, encryptBuffer } from '../../src/main/sync/crypto';

describe('AES-256-GCM payload encryption', () => {
  it('round-trips raw buffers with the provided passphrase', () => {
    const original = Buffer.from([0, 1, 2, 99, 200, 255]);
    const encrypted = encryptBuffer(original, 'correct horse battery staple');
    const decrypted = decryptBuffer(encrypted.bytes, 'correct horse battery staple');

    expect(encrypted.algorithm).toBe('aes-256-gcm');
    expect(encrypted.bytes.equals(original)).toBe(false);
    expect(decrypted.equals(original)).toBe(true);
  });

  it('rejects the wrong passphrase', () => {
    const encrypted = encryptBuffer(Buffer.from('tan'), 'correcthorse');

    expect(() => decryptBuffer(encrypted.bytes, 'wrongpass')).toThrow();
  });
});
