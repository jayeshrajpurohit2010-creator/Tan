import type { CdpResponseBody } from './types';

export function decodeCdpBody(responseBody: CdpResponseBody): Buffer {
  if (responseBody.base64Encoded) {
    return Buffer.from(responseBody.body, 'base64');
  }

  return Buffer.from(responseBody.body, 'utf8');
}
