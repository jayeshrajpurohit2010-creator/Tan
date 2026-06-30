import { describe, expect, it } from 'vitest';
import {
  analyzeCipherSuites,
  getChromiumFingerprint,
  getSafariFingerprint,
  isChromiumFingerprint,
  isSafariFingerprint,
  getTLSMismatchWarning,
} from '../src/main/tlsFingerprint';

describe('tlsFingerprint', () => {
  it('1. Chromium fingerprint has correct cipher order', () => {
    const fp = getChromiumFingerprint();
    expect(fp.cipherSuites[0]).toBe(4865);
    expect(fp.cipherSuites[1]).toBe(4866);
    expect(fp.cipherSuites[2]).toBe(4867);
    expect(fp.isChromium).toBe(true);
    expect(fp.isSafari).toBe(false);
  });

  it('2. Safari fingerprint has correct cipher order', () => {
    const fp = getSafariFingerprint();
    expect(fp.cipherSuites[0]).toBe(4865);
    expect(fp.cipherSuites[1]).toBe(4867);
    expect(fp.cipherSuites[2]).toBe(4866);
    expect(fp.isSafari).toBe(true);
    expect(fp.isChromium).toBe(false);
  });

  it('3. isChromiumFingerprint detects Chromium', () => {
    expect(isChromiumFingerprint([4865, 4866, 4867])).toBe(true);
    expect(isChromiumFingerprint([4865, 4867, 4866])).toBe(false);
  });

  it('4. isSafariFingerprint detects Safari', () => {
    expect(isSafariFingerprint([4865, 4867, 4866])).toBe(true);
    expect(isSafariFingerprint([4865, 4866, 4867])).toBe(false);
  });

  it('5. JA3 hash is consistent', () => {
    const fp1 = getChromiumFingerprint();
    const fp2 = getChromiumFingerprint();
    expect(fp1.ja3Hash).toBe(fp2.ja3Hash);
  });

  it('6. Chromium and Safari have different JA3', () => {
    const chromium = getChromiumFingerprint();
    const safari = getSafariFingerprint();
    expect(chromium.ja3Hash).not.toBe(safari.ja3Hash);
  });

  it('7. Warning message contains proxy instructions', () => {
    const warning = getTLSMismatchWarning();
    expect(warning).toContain('SOCKS5 proxy');
    expect(warning).toContain('TLS fingerprint');
    expect(warning).toContain('sing-box');
  });

  it('8. analyzeCipherSuites handles custom input', () => {
    const fp = analyzeCipherSuites([123, 456, 789]);
    expect(fp.cipherSuites).toEqual([123, 456, 789]);
    expect(fp.isChromium).toBe(false);
    expect(fp.isSafari).toBe(false);
  });
});
