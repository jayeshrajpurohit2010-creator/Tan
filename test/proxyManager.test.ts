import { describe, expect, it, beforeEach } from 'vitest';
import { getProxyConfig, setProxyConfig, isProxyActive, buildProxyInfo } from '../src/main/proxyManager';

describe('proxyManager', () => {
  beforeEach(() => {
    setProxyConfig(null);
  });

  it('1. Returns null when no proxy configured', () => {
    expect(getProxyConfig()).toBeNull();
    expect(isProxyActive()).toBe(false);
    expect(buildProxyInfo()).toBeNull();
  });

  it('2. Sets and gets proxy config', () => {
    const config = { enabled: true, server: 'socks5://127.0.0.1:1080' };
    setProxyConfig(config);
    expect(getProxyConfig()).toEqual(config);
  });

  it('3. isProxyActive returns true when enabled with server', () => {
    setProxyConfig({ enabled: true, server: 'socks5://127.0.0.1:1080' });
    expect(isProxyActive()).toBe(true);
  });

  it('4. isProxyActive returns false when disabled', () => {
    setProxyConfig({ enabled: false, server: 'socks5://127.0.0.1:1080' });
    expect(isProxyActive()).toBe(false);
  });

  it('5. isProxyActive returns false when no server', () => {
    setProxyConfig({ enabled: true });
    expect(isProxyActive()).toBe(false);
  });

  it('6. buildProxyInfo returns server and credentials', () => {
    setProxyConfig({ enabled: true, server: 'socks5://127.0.0.1:1080', username: 'user', password: 'pass' });
    const info = buildProxyInfo();
    expect(info).toEqual({ server: 'socks5://127.0.0.1:1080', username: 'user', password: 'pass' });
  });

  it('7. buildProxyInfo omits undefined credentials', () => {
    setProxyConfig({ enabled: true, server: 'http://proxy:8080' });
    const info = buildProxyInfo();
    expect(info).toEqual({ server: 'http://proxy:8080' });
  });

  it('8. Clearing proxy config', () => {
    setProxyConfig({ enabled: true, server: 'socks5://127.0.0.1:1080' });
    expect(isProxyActive()).toBe(true);
    setProxyConfig(null);
    expect(isProxyActive()).toBe(false);
  });
});
