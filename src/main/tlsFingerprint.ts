import { createHash } from 'node:crypto';
import type { WebContents } from 'electron';

export type TLSFingerprintInfo = {
  ja3: string;
  ja3Hash: string;
  isChromium: boolean;
  isSafari: boolean;
  cipherSuites: number[];
  extensions: number[];
  supportedGroups: number[];
  signatureAlgorithms: string[];
};

const CHROMIUM_CIPHER_SUITES = [4865, 4866, 4867, 49195, 49199, 49196, 49200, 52393, 52392, 49171, 49172, 156, 157, 47, 53];
const SAFARI_CIPHER_SUITES = [4865, 4867, 4866, 49195, 49199, 49196, 49200, 52393, 52392, 49171, 49172, 156, 157, 47, 53];

export function analyzeCipherSuites(ciphers: number[]): TLSFingerprintInfo {
  const isChromium = ciphers[0] === 4865 && ciphers[1] === 4866 && ciphers[2] === 4867;
  const isSafari = ciphers[0] === 4865 && ciphers[1] === 4867 && ciphers[2] === 4866;

  const ja3 = `771,${ciphers.join('-')},0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0`;
  const ja3Hash = createHash('md5').update(ja3).digest('hex');

  return {
    ja3: ja3Hash,
    ja3Hash,
    isChromium,
    isSafari,
    cipherSuites: ciphers,
    extensions: [0, 23, 65281, 10, 11, 35, 16, 5, 13, 18, 51, 45, 43, 27, 21],
    supportedGroups: [29, 23, 24],
    signatureAlgorithms: ['ecdsa_secp256r1_sha256', 'rsa_pss_rsae_sha256', 'rsa_pkcs1_sha256'],
  };
}

export function getChromiumFingerprint(): TLSFingerprintInfo {
  return analyzeCipherSuites(CHROMIUM_CIPHER_SUITES);
}

export function getSafariFingerprint(): TLSFingerprintInfo {
  return analyzeCipherSuites(SAFARI_CIPHER_SUITES);
}

export function isChromiumFingerprint(ciphers: number[]): boolean {
  return ciphers[0] === 4865 && ciphers[1] === 4866 && ciphers[2] === 4867;
}

export function isSafariFingerprint(ciphers: number[]): boolean {
  return ciphers[0] === 4865 && ciphers[1] === 4867 && ciphers[2] === 4866;
}

export async function getCurrentTLSFingerprint(webContents: WebContents): Promise<TLSFingerprintInfo | null> {
  try {
    const result = await webContents.debugger.sendCommand('Network.enable', {
      maxTotalBufferSize: 1024 * 1024,
      maxResourceBufferSize: 1024 * 1024,
      maxPostDataSize: 1024 * 1024,
    });
    return getChromiumFingerprint();
  } catch {
    return null;
  }
}

export const TLS_WARN_MESSAGE = `
Tan currently uses Chromium's TLS fingerprint (JA3: 771,4865-4866-4867,...).
This differs from Safari's fingerprint (JA3: 771,4865-4867-4866,...).
Server-side TLS fingerprinting may detect this mismatch.

To fix this, use a TLS-rewriting proxy:
- SOCKS5 proxy that rewrites TLS ClientHello (e.g., mitmproxy, gost, sing-box)
- Configure the proxy in Tan's Proxy Settings panel
- The proxy should forward traffic with Safari-like TLS fingerprints

Recommended proxy configurations:
1. sing-box with TLS sniffing (free, open source)
2. gost with TLS rewrite plugin (free, open source)
3. Commercial residential proxies with TLS fingerprint rotation
`.trim();

export function getTLSMismatchWarning(): string {
  return TLS_WARN_MESSAGE;
}
