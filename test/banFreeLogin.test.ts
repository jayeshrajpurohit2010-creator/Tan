import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/tan-test' },
  BrowserWindow: vi.fn(),
  session: {},
}));

const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => Buffer.alloc(0));
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
vi.mock('node:fs', () => ({
  existsSync: (...args: []) => mockExistsSync(...args),
  readFileSync: (...args: []) => mockReadFileSync(...args),
  writeFileSync: (...args: []) => mockWriteFileSync(...args),
  mkdirSync: (...args: []) => mockMkdirSync(...args),
}));

import {
  saveSessionTokens,
  loadSessionTokens,
  hasStoredSession,
  getSessionStatus,
} from '../src/main/banFreeLogin';

describe('banFreeLogin', () => {
  it('1. saveSessionTokens calls writeFileSync with encrypted data', () => {
    mockExistsSync.mockReturnValue(false);
    const tokens = {
      cookies: [],
      localStorage: {},
      capturedAt: '2026-06-15T00:00:00Z',
      expiresAt: '2026-06-22T00:00:00Z',
    };
    saveSessionTokens(tokens);
    expect(mockWriteFileSync).toHaveBeenCalled();
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(Buffer.isBuffer(written)).toBe(true);
  });

  it('2. loadSessionTokens returns null when file missing', () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadSessionTokens()).toBeNull();
  });

  it('3. hasStoredSession returns false when no tokens', () => {
    mockExistsSync.mockReturnValue(false);
    expect(hasStoredSession()).toBe(false);
  });

  it('4. getSessionStatus returns none when no tokens', () => {
    mockExistsSync.mockReturnValue(false);
    expect(getSessionStatus()).toBe('none');
  });

  it('5. loadSessionTokens returns null for garbage data', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('not-encrypted-data'));
    expect(loadSessionTokens()).toBeNull();
  });

  it('6. loadSessionTokens returns null for corrupted data', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.alloc(100));
    expect(loadSessionTokens()).toBeNull();
  });

  it('7. saveSessionTokens produces encrypted binary output', () => {
    const tokens = {
      cookies: [{ name: 'x', value: 'y', domain: '.test.com', path: '/', expires: 9999999999, httpOnly: true, secure: true, sameSite: 'lax' as const }],
      localStorage: { k: 'v' },
      capturedAt: '2026-06-15T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z',
    };
    saveSessionTokens(tokens);
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(Buffer.isBuffer(written)).toBe(true);
    // Verify it starts with the TSENV1 magic header (encrypted, not plaintext)
    expect(written[0]).toBe(0x54); // 'T'
    expect(written[1]).toBe(0x53); // 'S'
    expect(written[2]).toBe(0x45); // 'E'
    expect(written[3]).toBe(0x4E); // 'N'
    expect(written[4]).toBe(0x56); // 'V'
    expect(written[5]).toBe(0x31); // '1'
  });
});
