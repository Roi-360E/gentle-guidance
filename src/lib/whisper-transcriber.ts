/**
 * Audio/Video Transcriber — uses Gemini via edge function for fast transcription
 * 
 * Envia o vídeo diretamente ao Gemini sem extração de áudio no cliente,
 * reduzindo o tempo de transcrição para < 3 segundos por arquivo.
 */

import { supabase } from '@/integrations/supabase/client';

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

// Format seconds to SRT timestamp "HH:MM:SS,mmm"
function secondsToSrt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
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
 * Simple async mutex to serialize FFmpeg access.
 * FFmpeg WASM is single-threaded — concurrent execs corrupt file I/O.
 */
let _ffmpegMutex: Promise<void> = Promise.resolve();
function withFFmpegLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const next = new Promise<void>(r => { release = r; });
  const prev = _ffmpegMutex;
  _ffmpegMutex = next;
  return prev.then(async () => {
    try {
      return await fn();
    } finally {
      release!();
    }
  });
}

/**
 * Extract audio from video as a lightweight WAV (mono 16kHz, ~200KB)
 * Used to avoid memory limits on the edge function.
 * Serialized via mutex to prevent concurrent FFmpeg corruption.
 */
export async function extractAudioAsFile(videoFile: File): Promise<File> {
  return withFFmpegLock(async () => {
    const { getFFmpeg } = await import('@/lib/video-processor');
    const { fetchFile } = await import('@ffmpeg/util');

    const ffmpeg = await getFFmpeg();
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inputName = `in_audio_${uid}.mp4`;
    const outputName = `out_audio_${uid}.wav`;

    await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

    // Extract mono 16kHz WAV
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
  });
}

/**
 * Transcreve um vídeo extraindo áudio leve (mono 16kHz) antes de enviar ao Gemini.
 * Isso evita "Memory limit exceeded" na edge function.
 */
export async function transcribeVideo(
  videoFile: File,
  onProgress?: (pct: number, status: string) => void,
): Promise<TranscriptionResult> {
  onProgress?.(5, 'Extraindo áudio do vídeo...');

  // Extrair áudio leve (~200KB) via FFmpeg.wasm (já pré-carregado)
  const audioFile = await extractAudioAsFile(videoFile);
  const formData = new FormData();
  formData.append('audio', audioFile);

  const { data: { session } } = await supabase.auth.getSession();

  const MAX_ATTEMPTS = 2;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      onProgress?.(30, attempt === 1 ? 'Enviando áudio para nuvem...' : 'Tentando novamente na nuvem...');

      response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: formData,
          signal: controller.signal,
        },
      );

      if (response.ok) {
        break;
      }

      const errText = await response.text();
      const canRetry = response.status === 546 || response.status >= 500;

      if (!canRetry || attempt === MAX_ATTEMPTS) {
        console.error('Transcription API error:', errText);
        throw new Error(`Transcription failed: ${response.status}`);
      }

      await new Promise((r) => setTimeout(r, 600));
    } catch (err) {
      const canRetry = attempt < MAX_ATTEMPTS;
      if (!canRetry) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('Transcription timeout');
        }
        throw err;
      }
      await new Promise((r) => setTimeout(r, 600));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!response || !response.ok) {
    throw new Error('Transcription failed');
  }

  onProgress?.(80, 'Processando resultado...');

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error);
  }

  const segments: TranscriptionSegment[] = (result.segments || []).map((seg: any) => {
    const fromMs = Math.round((seg.start || 0) * 1000);
    const toMs = Math.round((seg.end || 0) * 1000);
    return {
      text: (seg.text || '').trim(),
      from: secondsToSrt(seg.start || 0),
      to: secondsToSrt(seg.end || 0),
      fromMs,
      toMs,
    };
  });

  const fullText = segments.map(s => s.text).join(' ');
  onProgress?.(100, 'Transcrição concluída!');

  return {
    language: result.language || 'pt',
    segments,
    fullText,
  };
}

/**
 * Transcribe audio using Gemini via edge function
 * @deprecated Use transcribeVideo() para melhor performance
 */
export async function transcribeAudio(
  audioFile: File,
  onProgress?: (pct: number, status: string) => void,
): Promise<TranscriptionResult> {
  onProgress?.(30, 'Enviando áudio para transcrição...');

  const formData = new FormData();
  formData.append('audio', audioFile);

  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error('Transcription API error:', errText);
    throw new Error(`Transcription failed: ${response.status}`);
  }

  onProgress?.(80, 'Processando resultado...');

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error);
  }

  const segments: TranscriptionSegment[] = (result.segments || []).map((seg: any) => {
    const fromMs = Math.round((seg.start || 0) * 1000);
    const toMs = Math.round((seg.end || 0) * 1000);
    return {
      text: (seg.text || '').trim(),
      from: secondsToSrt(seg.start || 0),
      to: secondsToSrt(seg.end || 0),
      fromMs,
      toMs,
    };
  });

  const fullText = segments.map(s => s.text).join(' ');
  onProgress?.(100, 'Transcrição concluída!');

  return {
    language: result.language || 'pt',
    segments,
    fullText,
  };
}
