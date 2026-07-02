import type { ProxyConfig } from '../shared/ipc';
import { startXrayCore, stopXrayCore, getSocksProxyUrl, getXrayStatus } from './xrayManager';

let currentProxy: ProxyConfig | null = null;
let authHandlerAttached = false;
let xrayActive = false;

export function getProxyConfig(): ProxyConfig | null {
  return currentProxy;
}

export function setProxyConfig(config: ProxyConfig | null): void {
  currentProxy = config;
}

type AuthCallback = (response: { authCredentials?: { username: string; password: string } }) => void;

/**
 * Start Xray-core for TLS fingerprint rewriting and apply as proxy.
 */
export async function startXrayProxy(session: Electron.Session): Promise<void> {
  try {
    await startXrayCore();
    xrayActive = true;
    const socksUrl = getSocksProxyUrl();
    await session.setProxy({
      mode: 'fixed_servers',
      proxyRules: socksUrl,
      proxyBypassRules: 'localhost,127.0.0.1',
    });
  } catch (error) {
    console.error('[ProxyManager] Xray-core failed to start:', error);
    xrayActive = false;
    throw error;
  }
}

/**
 * Stop Xray-core and clear proxy.
 */
export async function stopXrayProxy(session: Electron.Session): Promise<void> {
  stopXrayCore();
  xrayActive = false;
  await session.setProxy({ mode: 'direct' });
  if (authHandlerAttached) {
    (session.webRequest as unknown as { onAuthRequired: (handler: null) => void }).onAuthRequired(null);
    authHandlerAttached = false;
  }
}

export function isXrayActive(): boolean {
  return xrayActive;
}

export async function applyProxyToSession(session: Electron.Session): Promise<void> {
  // If Xray is active, it handles everything
  if (xrayActive) {
    return;
  }

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
  if (xrayActive) {
    return { server: getSocksProxyUrl() };
  }

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
  return xrayActive || Boolean(currentProxy?.enabled && currentProxy?.server);
}
