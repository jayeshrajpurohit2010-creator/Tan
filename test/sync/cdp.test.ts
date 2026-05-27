import { describe, expect, it } from 'vitest';
import { decodeCdpBody } from '../../src/main/sync/cdp';

describe('decodeCdpBody', () => {
  it('decodes base64 CDP bodies without transformation', () => {
    const original = Buffer.from([0, 1, 2, 3, 254, 255]);
    const decoded = decodeCdpBody({
      body: original.toString('base64'),
      base64Encoded: true
    });

    expect(decoded.equals(original)).toBe(true);
  });

  it('encodes plain CDP bodies as UTF-8 bytes', () => {
    const decoded = decodeCdpBody({
      body: '{"ok":true}',
      base64Encoded: false
    });

    expect(decoded.equals(Buffer.from('{"ok":true}', 'utf8'))).toBe(true);
  });
});
