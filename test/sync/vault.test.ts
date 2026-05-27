import { describe, expect, it } from 'vitest';
import { buildPayloadPath, buildVaultDirectory, endpointSlug, extensionFromMime, sha256 } from '../../src/main/sync/vault';

describe('vault paths', () => {
  it('creates endpoint day directories', () => {
    const directory = buildVaultDirectory('vault', 'https://api.example.test:8443/docs', new Date('2026-05-27T12:00:00.000Z'));

    expect(directory.replace(/\\/g, '/')).toBe('vault/2026/05/27/api.example.test-8443');
  });

  it('creates timestamped payload paths with identifiers and extensions', () => {
    const path = buildPayloadPath({
      root: 'vault',
      endpointUrl: 'https://api.example.test/docs',
      responseUrl: 'https://cdn.example.test/chunk',
      mimeType: 'video/mp2t',
      sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      requestId: '1234.56',
      encrypted: true,
      date: new Date('2026-05-27T12:34:56.789Z')
    });

    expect(path.replace(/\\/g, '/')).toContain('vault/2026/05/27/api.example.test/20260527_123456.789_abcdef1234567890_1234.56.ts.enc');
  });

  it('maps known MIME types and safely falls back', () => {
    expect(extensionFromMime('image/png')).toBe('png');
    expect(extensionFromMime('application/vnd.apple.mpegurl')).toBe('m3u8');
    expect(extensionFromMime('application/unknown', 'https://example.test/file.custom')).toBe('custom');
    expect(extensionFromMime('application/unknown')).toBe('bin');
  });

  it('sanitizes endpoint names and hashes payloads', () => {
    expect(endpointSlug('https://API.Example.test/a b')).toBe('api.example.test');
    expect(sha256(Buffer.from('tan'))).toHaveLength(64);
  });
});
