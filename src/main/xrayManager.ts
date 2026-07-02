/**
 * Xray-core TLS Fingerprint Manager
 *
 * Downloads and runs Xray-core as a local SOCKS5/HTTP proxy with uTLS
 * to rewrite TLS fingerprints. Routes Electron traffic through it so
 * destination servers see Safari's TLS ClientHello instead of Chromium's.
 *
 * Architecture: Xray-core runs locally → Electron connects via SOCKS5 →
 * Xray-core makes outbound connection with uTLS parroted ClientHello.
 */
import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const XRAY_PORT = 10808;
const XRAY_API_PORT = 10809;

let xrayProcess: ChildProcess | null = null;
let isRunning = false;
let xrayDir = '';
let xrayConfigPath = '';

function ensureDirs(): void {
  if (!xrayDir) {
    try {
      xrayDir = join(app.getPath('userData'), 'xray-core');
    } catch {
      xrayDir = join(tmpdir(), 'tan-xray-core');
    }
    xrayConfigPath = join(xrayDir, 'config.json');
  }
}

type XrayConfig = {
  inbound: {
    port: number;
    protocol: string;
    settings: Record<string, unknown>;
  }[];
  outbound: {
    protocol: string;
    settings: {
      vnext?: Array<{
        address: string;
        port: number;
        users: Array<{ id: string; encryption: string }>;
      }>;
    };
    streamSettings?: {
      security: string;
      tlsSettings?: {
        fingerprint: string;
        alpn: string[];
        allowInsecure: boolean;
      };
    };
  }[];
};

function generateXrayConfig(safariFingerprint = true): XrayConfig {
  return {
    inbound: [
      {
        port: XRAY_PORT,
        protocol: 'socks',
        settings: {
          auth: 'noauth',
          udp: true,
        },
      },
      {
        port: XRAY_API_PORT,
        protocol: 'dokodemo-door',
        settings: {
          address: '127.0.0.1',
        },
      },
    ],
    outbound: [
      {
        protocol: 'freedom',
        settings: {},
        streamSettings: {
          security: 'tls',
          tlsSettings: {
            fingerprint: safariFingerprint ? 'safari' : 'chrome',
            alpn: ['h2', 'http/1.1'],
            allowInsecure: false,
          },
        },
      },
    ],
  };
}

function writeConfigFile(config: XrayConfig): void {
  ensureDirs();
  if (!existsSync(xrayDir)) {
    mkdirSync(xrayDir, { recursive: true });
  }
  writeFileSync(xrayConfigPath, JSON.stringify(config, null, 2), 'utf8');
}

function resolveXrayBinary(): string | null {
  ensureDirs();
  const platform = process.platform;
  const binaryName = platform === 'win32' ? 'xray.exe' : 'xray';
  const localPath = join(xrayDir, binaryName);
  if (existsSync(localPath)) {
    return localPath;
  }
  return null;
}

async function downloadXrayBinary(): Promise<string> {
  ensureDirs();
  const platform = process.platform;
  const ext = '.zip';

  const platformMap: Record<string, string> = {
    win32: 'windows',
    darwin: 'macos',
    linux: 'linux',
  };

  const osName = platformMap[platform] || 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const fileName = `Xray-${osName}-${arch}${ext}`;
  const downloadUrl = `https://github.com/XTLS/Xray-core/releases/latest/download/${fileName}`;

  if (!existsSync(xrayDir)) {
    mkdirSync(xrayDir, { recursive: true });
  }

  const { execSync } = await import('node:child_process');
  const zipPath = join(xrayDir, fileName);
  const binaryName = platform === 'win32' ? 'xray.exe' : 'xray';
  const binaryPath = join(xrayDir, binaryName);

  // Download
  try {
    if (platform === 'win32') {
      execSync(`curl -L -o "${zipPath}" "${downloadUrl}"`, { timeout: 60000 });
      execSync(`tar -xf "${zipPath}" -C "${xrayDir}"`, { timeout: 30000 });
    } else {
      execSync(`curl -L -o "${zipPath}" "${downloadUrl}"`, { timeout: 60000 });
      execSync(`unzip -o "${zipPath}" -d "${xrayDir}"`, { timeout: 30000 });
      execSync(`chmod +x "${binaryPath}"`, { timeout: 5000 });
    }
    unlinkSync(zipPath);
    return binaryPath;
  } catch (error) {
    throw new Error(`Failed to download Xray-core: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function waitForPort(port: number, timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = require('node:net').createConnection(port, '127.0.0.1');
        socket.on('connect', () => { socket.destroy(); resolve(); });
        socket.on('error', () => { socket.destroy(); reject(); });
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return false;
}

export async function startXrayCore(): Promise<{ socksPort: number; apiPort: number }> {
  if (isRunning) {
    return { socksPort: XRAY_PORT, apiPort: XRAY_API_PORT };
  }

  ensureDirs();
  const binary = resolveXrayBinary() || await downloadXrayBinary();
  const config = generateXrayConfig(true);
  writeConfigFile(config);

  return new Promise((resolve, reject) => {
    xrayProcess = spawn(binary, ['run', '-c', xrayConfigPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: xrayDir,
    });

    let started = false;

    xrayProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (!started && msg.includes('listening')) {
        started = true;
        waitForPort(XRAY_PORT).then((ready) => {
          if (ready) {
            isRunning = true;
            resolve({ socksPort: XRAY_PORT, apiPort: XRAY_API_PORT });
          } else {
            reject(new Error('Xray-core started but port not reachable'));
          }
        });
      }
    });

    xrayProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('fatal') || msg.includes('error')) {
        if (!started) {
          reject(new Error(`Xray-core error: ${msg.trim()}`));
        }
      }
    });

    xrayProcess.on('exit', (code) => {
      isRunning = false;
      xrayProcess = null;
      if (!started) {
        reject(new Error(`Xray-core exited with code ${code}`));
      }
    });

    // Timeout
    setTimeout(() => {
      if (!started) {
        xrayProcess?.kill();
        reject(new Error('Xray-core startup timeout'));
      }
    }, 15000);
  });
}

export function stopXrayCore(): void {
  if (xrayProcess) {
    xrayProcess.kill();
    xrayProcess = null;
  }
  isRunning = false;
}

export function getXrayStatus(): {
  running: boolean;
  socksPort: number;
  apiPort: number;
  configPath: string;
} {
  ensureDirs();
  return {
    running: isRunning,
    socksPort: XRAY_PORT,
    apiPort: XRAY_API_PORT,
    configPath: xrayConfigPath,
  };
}

export function getSocksProxyUrl(): string {
  return `socks5://127.0.0.1:${XRAY_PORT}`;
}
