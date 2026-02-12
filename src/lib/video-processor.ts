import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

export interface VideoFile {
  file: File;
  name: string;
  url: string;
}

export interface Combination {
  id: number;
  hook: VideoFile;
  body: VideoFile;
  cta: VideoFile;
  status: 'pending' | 'processing' | 'done' | 'error';
  outputUrl?: string;
  outputName: string;
}

export function generateCombinations(
  hooks: VideoFile[],
  bodies: VideoFile[],
  ctas: VideoFile[]
): Combination[] {
  const combinations: Combination[] = [];
  let id = 1;

  for (const hook of hooks) {
    for (const body of bodies) {
      for (const cta of ctas) {
        combinations.push({
          id,
          hook,
          body,
          cta,
          status: 'pending',
          outputName: `video_${id}_H${hooks.indexOf(hook) + 1}_B${bodies.indexOf(body) + 1}_C${ctas.indexOf(cta) + 1}.mp4`,
        });
        id++;
      }
    }
  }

  return combinations;
}

export async function concatenateVideos(
  combination: Combination,
  onProgress?: (progress: number) => void
): Promise<string> {
  const ff = await getFFmpeg();

  const hookData = await fetchFile(combination.hook.file);
  const bodyData = await fetchFile(combination.body.file);
  const ctaData = await fetchFile(combination.cta.file);

  await ff.writeFile('hook.mp4', hookData);
  await ff.writeFile('body.mp4', bodyData);
  await ff.writeFile('cta.mp4', ctaData);

  // Create concat file
  const concatList = "file 'hook.mp4'\nfile 'body.mp4'\nfile 'cta.mp4'\n";
  await ff.writeFile('concat.txt', concatList);

  ff.on('progress', ({ progress }) => {
    onProgress?.(Math.round(progress * 100));
  });

  await ff.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'concat.txt',
    '-c', 'copy',
    '-y',
    'output.mp4',
  ]);

  const data = await ff.readFile('output.mp4');
  const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
  return URL.createObjectURL(blob);
}
