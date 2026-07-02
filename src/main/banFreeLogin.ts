/**
 * Ban-Free Login (Safe-Passage Flow)
 *
 * Implements hybrid auth: launches an isolated Chromium profile for manual
 * login, captures session cookies and localStorage tokens, then injects
 * them into the stealth instance for subsequent runs.
 *
 * Goal: Zero account bans by avoiding automated credential submission.
 */
import { app, BrowserWindow, session } from 'electron';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const AUTH_PROFILE_DIR = join(app.getPath('userData'), 'tan-auth-profile');
const SESSION_TOKEN_FILE = join(AUTH_PROFILE_DIR, 'session-tokens.json');

export type SessionTokens = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
  }>;
  localStorage: Record<string, string>;
  capturedAt: string;
  expiresAt: string;
};

/**
 * Get the path to the auth profile directory.
 */
export function getAuthProfilePath(): string {
  if (!existsSync(AUTH_PROFILE_DIR)) {
    mkdirSync(AUTH_PROFILE_DIR, { recursive: true });
  }
  return AUTH_PROFILE_DIR;
}

/**
 * Save session tokens to disk.
 */
export function saveSessionTokens(tokens: SessionTokens): void {
  const dir = getAuthProfilePath();
  writeFileSync(SESSION_TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
}

/**
 * Load session tokens from disk.
 */
export function loadSessionTokens(): SessionTokens | null {
  if (!existsSync(SESSION_TOKEN_FILE)) {
    return null;
  }
  try {
    const data = readFileSync(SESSION_TOKEN_FILE, 'utf8');
    const tokens = JSON.parse(data) as SessionTokens;
    if (new Date(tokens.expiresAt) < new Date()) {
      return null; // expired
    }
    return tokens;
  } catch {
    return null;
  }
}

/**
 * Clear stored session tokens.
 */
export function clearSessionTokens(): void {
  if (existsSync(SESSION_TOKEN_FILE)) {
    const { unlinkSync } = require('node:fs');
    unlinkSync(SESSION_TOKEN_FILE);
  }
}

/**
 * Launch an isolated browser window for manual Snapchat login.
 * Returns session tokens after the user logs in and closes the window.
 */
export function launchManualLoginWindow(
  onTokensCaptured: (tokens: SessionTokens) => void,
  onError: (error: string) => void,
): void {
  const authWindow = new BrowserWindow({
    width: 420,
    height: 700,
    title: 'Tan — Manual Snapchat Login',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  authWindow.loadURL('https://web.snapchat.com');

  let captured = false;

  authWindow.webContents.on('did-finish-load', async () => {
    if (captured) return;

    const url = authWindow.webContents.getURL();
    if (url.includes('web.snapchat.com') && !url.includes('login')) {
      // User appears to be logged in — capture tokens
      try {
        const cookies = await authWindow.webContents.session.cookies.get({});
        const localStorage = await authWindow.webContents.executeJavaScript(
          'JSON.stringify(localStorage)',
        );

        const sessionData: SessionTokens = {
          cookies: cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain ?? '',
            path: c.path ?? '/',
            expires: c.expirationDate ?? 0,
            httpOnly: c.httpOnly ?? false,
            secure: c.secure ?? false,
            sameSite: (c.sameSite === 'no_restriction' ? 'none' : (c.sameSite === 'unspecified' ? 'lax' : (c.sameSite ?? 'lax'))) as 'strict' | 'lax' | 'none',
          })),
          localStorage: typeof localStorage === 'string' ? JSON.parse(localStorage) : {},
          capturedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };

        saveSessionTokens(sessionData);
        captured = true;
        onTokensCaptured(sessionData);
        authWindow.close();
      } catch (err) {
        onError(`Token capture failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });

  authWindow.on('closed', () => {
    if (!captured) {
      onError('Login window closed without capturing tokens.');
    }
  });
}

/**
 * Inject stored session tokens into a target session.
 */
export async function injectSessionTokens(
  targetSession: Electron.Session,
): Promise<boolean> {
  const tokens = loadSessionTokens();
  if (!tokens) {
    return false;
  }

  // Inject cookies
  for (const cookie of tokens.cookies) {
    try {
      await targetSession.cookies.set({
        url: `https://${cookie.domain}${cookie.path}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expirationDate: cookie.expires || undefined,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite === 'none' ? 'no_restriction' : cookie.sameSite,
      });
    } catch {
      // Some cookies may fail to set — continue with others
    }
  }

  return true;
}

/**
 * Check if valid session tokens exist.
 */
export function hasStoredSession(): boolean {
  return loadSessionTokens() !== null;
}

/**
 * Get session status for UI display.
 */
export function getSessionStatus(): 'none' | 'valid' | 'expired' {
  const tokens = loadSessionTokens();
  if (!tokens) return 'none';
  if (new Date(tokens.expiresAt) < new Date()) return 'expired';
  return 'valid';
}
