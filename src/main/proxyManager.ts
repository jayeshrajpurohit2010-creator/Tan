import type { ProxyConfig } from '../shared/ipc';

let currentProxy: ProxyConfig | null = null;
let authHandlerAttached = false;

export function getProxyConfig(): ProxyConfig | null {
  return currentProxy;
}

export function setProxyConfig(config: ProxyConfig | null): void {
  currentProxy = config;
}

type AuthCallback = (response: { authCredentials?: { username: string; password: string } }) => void;

export async function applyProxyToSession(session: Electron.Session): Promise<void> {
  if (!currentProxy || !currentProxy.enabled || !currentProxy.server) {
    await session.setProxy({ mode: 'direct' });
    if (authHandlerAttached) {
      (session.webRequest as unknown as { onAuthRequired: (handler: null) => void }).onAuthRequired(null);
      authHandlerAttached = false;
    }
    return;
  }

  const url = new URL(currentProxy.server);
  const protocol = url.protocol.replace(':', '');
  const host = url.hostname;
  const port = url.port || (protocol === 'socks5' ? '1080' : '8080');
  const proxyRule = `${protocol}://${host}:${port}`;

  await session.setProxy({
    mode: 'fixed_servers',
    proxyRules: proxyRule,
    proxyBypassRules: 'localhost,127.0.0.1',
  });

  if (currentProxy.username && currentProxy.password) {
    const username = currentProxy.username;
    const password = currentProxy.password;
    (session.webRequest as unknown as {
      onAuthRequired: (handler: (details: unknown, callback: AuthCallback) => void) => void;
    }).onAuthRequired((_details: unknown, callback: AuthCallback) => {
      callback({
        authCredentials: { username, password },
      });
    });
    authHandlerAttached = true;
  } else if (authHandlerAttached) {
    (session.webRequest as unknown as { onAuthRequired: (handler: null) => void }).onAuthRequired(null);
    authHandlerAttached = false;
  }
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
