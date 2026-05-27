import { mkdir, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ManifestRecord } from './types';
import { buildVaultDirectory } from './vault';

export async function appendManifest(root: string, endpointUrl: string, record: ManifestRecord): Promise<string> {
  const manifestPath = join(buildVaultDirectory(root, endpointUrl, new Date(record.timestamp)), 'manifest.jsonl');
  await mkdir(dirname(manifestPath), { recursive: true });
  await appendFile(manifestPath, `${JSON.stringify(record)}\n`, 'utf8');
  return manifestPath;
}
