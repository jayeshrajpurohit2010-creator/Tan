import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const FFMPEG_BINARY = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

function unpackedFfmpegPath(): string {
  return join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', FFMPEG_BINARY);
}

function devFfmpegPath(): string {
  return join(app.getAppPath(), 'node_modules', 'ffmpeg-static', FFMPEG_BINARY);
}

export function resolveFfmpegPath(): string {
  if (app.isPackaged) {
    const productionPath = unpackedFfmpegPath();
    if (existsSync(productionPath)) {
      return productionPath;
    }
  } else {
    const localPath = devFfmpegPath();
    if (existsSync(localPath)) {
      return localPath;
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static') as string | null;
    if (ffmpegStatic && existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
  } catch {
    // Fall through to system ffmpeg.
  }

  return FFMPEG_BINARY;
}
