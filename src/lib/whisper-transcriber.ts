/**
 * Whisper WASM Transcriber — runs entirely in the browser
 * Uses @transcribe/transcriber + @transcribe/shout (whisper.cpp compiled to WASM)
 */

export interface TranscriptionSegment {
  text: string;
  from: string; // "00:00:01,000"
  to: string;   // "00:00:05,000"
  fromMs: number;
  toMs: number;
}

export interface TranscriptionResult {
  language: string;
  segments: TranscriptionSegment[];
  fullText: string;
}

// Parse timestamp string "HH:MM:SS,mmm" to milliseconds
function timestampToMs(ts: string): number {
  const [time, ms] = ts.split(',');
  const [h, m, s] = time.split(':').map(Number);
  return (h * 3600 + m * 60 + s) * 1000 + Number(ms || 0);
}

// Format ms to ASS timestamp "H:MM:SS.cc" (centiseconds)
export function msToAss(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/**
 * Extract audio from video as a WAV File object using FFmpeg.wasm
 */
export async function extractAudioAsFile(videoFile: File): Promise<File> {
  const { getFFmpeg } = await import('@/lib/video-processor');
  const { fetchFile } = await import('@ffmpeg/util');

  const ffmpeg = await getFFmpeg();
  const inputName = 'input_audio_extract' + Date.now() + '.mp4';
  const outputName = 'output_audio' + Date.now() + '.wav';

  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  // Extract mono 16kHz WAV (required by Whisper)
  await ffmpeg.exec([
    '-i', inputName,
    '-ar', '16000',
    '-ac', '1',
    '-f', 'wav',
    '-y', outputName,
  ]);

  const wavData = await ffmpeg.readFile(outputName);
  const wavBytes = wavData instanceof Uint8Array ? wavData : new Uint8Array(wavData as unknown as ArrayBuffer);

  // Clean up
  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
  } catch { /* ignore */ }

  return new File([new Uint8Array(wavBytes).buffer as ArrayBuffer], 'audio.wav', { type: 'audio/wav' });
}

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin';

/**
 * Transcribe audio using @transcribe/transcriber (Whisper WASM)
 */
export async function transcribeAudio(
  audioFile: File,
  onProgress?: (pct: number, status: string) => void,
): Promise<TranscriptionResult> {
  onProgress?.(10, 'Carregando modelo Whisper...');

  // Dynamic imports
  const { FileTranscriber } = await import('@transcribe/transcriber');
  const createModule = (await import('@transcribe/shout')).default;

  const transcriber = new FileTranscriber({
    createModule,
    model: MODEL_URL,
    onProgress: (progress: number) => {
      onProgress?.(10 + progress * 0.8, 'Transcrevendo...');
    },
  });

  await transcriber.init();
  onProgress?.(15, 'Modelo carregado. Transcrevendo...');

  const result = await transcriber.transcribe(audioFile, {
    lang: 'auto',
    suppress_non_speech: true,
    token_timestamps: true,
  });

  onProgress?.(95, 'Transcrição concluída!');

  const segments: TranscriptionSegment[] = (result.transcription || []).map((seg: any) => ({
    text: (seg.text || '').trim(),
    from: seg.timestamps?.from || '00:00:00,000',
    to: seg.timestamps?.to || '00:00:00,000',
    fromMs: timestampToMs(seg.timestamps?.from || '00:00:00,000'),
    toMs: timestampToMs(seg.timestamps?.to || '00:00:00,000'),
  }));

  const fullText = segments.map(s => s.text).join(' ');
  onProgress?.(100, 'Pronto!');

  return {
    language: result.result?.language || 'pt',
    segments,
    fullText,
  };
}
