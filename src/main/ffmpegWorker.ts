import { parentPort, workerData } from 'node:worker_threads';
import { createConcatFile } from './stream-reconstitution';
import { resolveFfmpegPath } from './paths';

interface WorkerInput {
  segments: string[];
  outputPath: string;
}

async function run(): Promise<void> {
  try {
    const { segments, outputPath } = workerData as WorkerInput;
    const ffmpegPath = resolveFfmpegPath();
    const ffmpeg = await import('fluent-ffmpeg');
    ffmpeg.default.setFfmpegPath(ffmpegPath);

    const concatFile = await createConcatFile(segments);

    await new Promise<void>((resolve, reject) => {
      ffmpeg.default()
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '18',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    const { unlink } = await import('node:fs/promises');
    await unlink(concatFile).catch(() => {});

    parentPort?.postMessage({ success: true });
  } catch (error) {
    parentPort?.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

run();
