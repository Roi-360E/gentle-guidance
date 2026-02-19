/**
 * Audio Transcriber — uses Gemini via edge function for fast, accurate transcription
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
 * Extract audio from video as a WAV File object using FFmpeg.wasm
 */
export async function extractAudioAsFile(videoFile: File): Promise<File> {
  const { getFFmpeg } = await import('@/lib/video-processor');
  const { fetchFile } = await import('@ffmpeg/util');

  const ffmpeg = await getFFmpeg();
  const inputName = 'input_audio_extract' + Date.now() + '.mp4';
  const outputName = 'output_audio' + Date.now() + '.wav';

  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  // Extract mono 16kHz WAV
  await ffmpeg.exec([
    '-i', inputName,
    '-ar', '16000',
    '-ac', '1',
    '-t', '120',
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

/**
 * Transcribe audio using Gemini via edge function
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
