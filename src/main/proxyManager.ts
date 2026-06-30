import type { ProxyConfig } from '../shared/ipc';

let currentProxy: ProxyConfig | null = null;

export function getProxyConfig(): ProxyConfig | null {
  return currentProxy;
}

export function setProxyConfig(config: ProxyConfig | null): void {
  currentProxy = config;
}

export async function applyProxyToSession(session: Electron.Session): Promise<void> {
  if (!currentProxy || !currentProxy.enabled || !currentProxy.server) {
    await session.setProxy({ mode: 'direct' });
    return;
  }

  const proxyRules: string[] = [];

  if (currentProxy.server) {
    const url = new URL(currentProxy.server);
    const protocol = url.protocol.replace(':', '');
    const host = url.hostname;
    const port = url.port || (protocol === 'socks5' ? '1080' : '8080');
    proxyRules.push(`${protocol}://${host}:${port}`);
  }

  await session.setProxy({
    mode: 'fixed_servers',
    proxyRules: proxyRules.join(','),
    proxyBypassRules: 'localhost,127.0.0.1',
  });
}

export function buildProxyInfo(): { server: string; username?: string; password?: string } | null {
  if (!currentProxy || !currentProxy.enabled || !currentProxy.server) {
    return null;
  }

  return {
    server: currentProxy.server,
    username: currentProxy.username || undefined,
    password: currentProxy.password || undefined,
  };
}

export function isProxyActive(): boolean {
  return Boolean(currentProxy?.enabled && currentProxy?.server);
}
