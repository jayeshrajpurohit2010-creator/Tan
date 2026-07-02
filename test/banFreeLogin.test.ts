import { describe, expect, it, vi } from 'vitest';

// Mock electron before importing the module
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/tan-test' },
  BrowserWindow: vi.fn(),
  session: {},
}));

// Mock fs
const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => '');
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
  it('1. saveSessionTokens calls writeFileSync', () => {
    mockExistsSync.mockReturnValue(false);
    const tokens = {
      cookies: [],
      localStorage: {},
      capturedAt: '2026-06-15T00:00:00Z',
      expiresAt: '2026-06-22T00:00:00Z',
    };
    saveSessionTokens(tokens);
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('2. loadSessionTokens returns null when file missing', () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadSessionTokens();
    expect(result).toBeNull();
  });

  it('3. hasStoredSession returns false when no tokens', () => {
    mockExistsSync.mockReturnValue(false);
    expect(hasStoredSession()).toBe(false);
  });

  it('4. getSessionStatus returns none when no tokens', () => {
    mockExistsSync.mockReturnValue(false);
    expect(getSessionStatus()).toBe('none');
  });

  it('5. loadSessionTokens parses valid JSON', () => {
    mockExistsSync.mockReturnValue(true);
    const data = {
      cookies: [{ name: 'token', value: 'abc', domain: '.snapchat.com', path: '/', expires: 9999999999, httpOnly: true, secure: true, sameSite: 'lax' }],
      localStorage: { key: 'value' },
      capturedAt: '2026-06-15T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z',
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(data));
    const result = loadSessionTokens();
    expect(result).not.toBeNull();
    expect(result?.cookies).toHaveLength(1);
    expect(result?.cookies[0].name).toBe('token');
  });

  it('6. loadSessionTokens returns null for expired tokens', () => {
    mockExistsSync.mockReturnValue(true);
    const data = {
      cookies: [],
      localStorage: {},
      capturedAt: '2020-01-01T00:00:00Z',
      expiresAt: '2020-01-02T00:00:00Z',
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(data));
    const result = loadSessionTokens();
    expect(result).toBeNull();
  });

  it('7. getSessionStatus returns valid for non-expired tokens', () => {
    mockExistsSync.mockReturnValue(true);
    const data = {
      cookies: [],
      localStorage: {},
      capturedAt: '2026-06-15T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z',
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(data));
    expect(getSessionStatus()).toBe('valid');
  });
});
