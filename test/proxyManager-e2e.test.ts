import { describe, expect, it, beforeEach, vi } from 'vitest';
import { getProxyConfig, setProxyConfig, isProxyActive, buildProxyInfo, applyProxyToSession } from '../src/main/proxyManager';

function createMockSession() {
  return {
    setProxy: vi.fn().mockResolvedValue(undefined),
  } as unknown as Electron.Session;
}

describe('proxyManager E2E', () => {
  let session: ReturnType<typeof createMockSession>;

  beforeEach(() => {
    setProxyConfig(null);
    session = createMockSession();
  });

  it('1. Direct mode when no proxy', async () => {
    await applyProxyToSession(session);
    expect(session.setProxy).toHaveBeenCalledWith({ mode: 'direct' });
  });

  it('2. SOCKS5 proxy applied correctly', async () => {
    setProxyConfig({ enabled: true, server: 'socks5://127.0.0.1:1080' });
    await applyProxyToSession(session);
    expect(session.setProxy).toHaveBeenCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'socks5://127.0.0.1:1080',
      proxyBypassRules: 'localhost,127.0.0.1',
    });
  });

  it('3. HTTP proxy applied correctly', async () => {
    setProxyConfig({ enabled: true, server: 'http://proxy.example.com:8080' });
    await applyProxyToSession(session);
    expect(session.setProxy).toHaveBeenCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'http://proxy.example.com:8080',
      proxyBypassRules: 'localhost,127.0.0.1',
    });
  });

  it('4. Default port applied for SOCKS5', async () => {
    setProxyConfig({ enabled: true, server: 'socks5://127.0.0.1' });
    await applyProxyToSession(session);
    expect(session.setProxy).toHaveBeenCalledWith(
      expect.objectContaining({ proxyRules: 'socks5://127.0.0.1:1080' }),
    );
  });

  it('5. Default port applied for HTTP', async () => {
    setProxyConfig({ enabled: true, server: 'http://proxy.example.com' });
    await applyProxyToSession(session);
    expect(session.setProxy).toHaveBeenCalledWith(
      expect.objectContaining({ proxyRules: 'http://proxy.example.com:8080' }),
    );
  });

  it('6. Disabled proxy falls back to direct', async () => {
    setProxyConfig({ enabled: false, server: 'socks5://127.0.0.1:1080' });
    await applyProxyToSession(session);
    expect(session.setProxy).toHaveBeenCalledWith({ mode: 'direct' });
  });

  it('7. Proxy without server falls back to direct', async () => {
    setProxyConfig({ enabled: true });
    await applyProxyToSession(session);
    expect(session.setProxy).toHaveBeenCalledWith({ mode: 'direct' });
  });

  it('8. Credentials preserved in buildProxyInfo', () => {
    setProxyConfig({ enabled: true, server: 'socks5://127.0.0.1:1080', username: 'user', password: 'pass' });
    const info = buildProxyInfo();
    expect(info).toEqual({ server: 'socks5://127.0.0.1:1080', username: 'user', password: 'pass' });
  });

  it('9. Full lifecycle: set -> check active -> apply -> clear -> verify direct', async () => {
    setProxyConfig({ enabled: true, server: 'socks5://127.0.0.1:1080' });
    expect(isProxyActive()).toBe(true);

    await applyProxyToSession(session);
    expect(session.setProxy).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'fixed_servers' }),
    );

    setProxyConfig(null);
    expect(isProxyActive()).toBe(false);
    expect(buildProxyInfo()).toBeNull();

    vi.mocked(session.setProxy).mockClear();
    await applyProxyToSession(session);
    expect(session.setProxy).toHaveBeenCalledWith({ mode: 'direct' });
  });

  it('10. Real-world residential proxy format', async () => {
    setProxyConfig({
      enabled: true,
      server: 'socks5://us-wa.proxymesh.com:1080',
      username: 'tan_user',
      password: 'secure_pass_123',
    });
    await applyProxyToSession(session);
    expect(session.setProxy).toHaveBeenCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'socks5://us-wa.proxymesh.com:1080',
      proxyBypassRules: 'localhost,127.0.0.1',
    });
    expect(buildProxyInfo()?.username).toBe('tan_user');
  });
});
