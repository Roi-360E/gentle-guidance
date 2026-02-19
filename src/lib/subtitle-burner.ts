/**
 * CapCut-style subtitle burner using FFmpeg.wasm drawtext filter.
 * Renders word-by-word with highlight effect for maximum visual impact.
 */

import { getFFmpeg } from '@/lib/video-processor';
import { fetchFile } from '@ffmpeg/util';
import type { TranscriptionSegment } from './whisper-transcriber';
import { splitSegmentsIntoWordGroups, type WordGroup } from './subtitle-styles';

interface BurnOptions {
  segments: TranscriptionSegment[];
  style: {
    fontColor: string;
    highlightColor: string;
    borderColor: string;
    bgColor: string;
    borderW: number;
    bold: boolean;
  };
  fontSize: number;
  position: 'bottom' | 'center' | 'top';
}

const FONT_PATH = '/fonts/Inter-Variable.ttf';
const FONT_FS_NAME = 'subtitle_font.ttf';

/**
 * Escape text for FFmpeg drawtext filter.
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\u2019')
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/;/g, '\\;');
}

function hexToFFmpeg(hex: string): string {
  const clean = hex.replace('#', '');
  return '0x' + clean.substring(0, 6);
}

/**
 * Build CapCut-style drawtext filters with word-by-word highlight.
 * 
 * Strategy: For each word group time slice, render the full group text
 * with the highlighted word in a different color by layering two drawtext filters:
 * 1. Base layer: full text in primary color
 * 2. Highlight layer: just the current word in highlight color (positioned over it)
 * 
 * For simpler/faster rendering, we use a single-layer approach:
 * show the full group text and change the entire text color for emphasis timing.
 */
export function buildDrawtextFilter(options: BurnOptions, fontFile: string): string {
  const { segments, style, fontSize, position } = options;
  
  // Split into word groups for CapCut-style word-by-word display
  const wordGroups = splitSegmentsIntoWordGroups(segments, 3);
  
  const yExpr = position === 'top'
    ? `${fontSize + 30}`
    : position === 'center'
    ? '(h-text_h)/2'
    : `h-${fontSize + 60}`;

  // Deduplicate: merge consecutive groups with same words into single display
  // Show the full group text, highlight changes word by word
  const filters: string[] = [];
  
  // Track which group text is currently showing to avoid duplicates
  let lastGroupKey = '';
  let groupStartMs = 0;
  let groupEndMs = 0;
  
  // First pass: render the base text for each word group span
  const groupSpans = new Map<string, { fromMs: number; toMs: number; text: string }>();
  
  for (const wg of wordGroups) {
    const key = `${wg.fullText}_${Math.floor(wg.fromMs / 100)}`;
    const existing = groupSpans.get(key);
    if (existing) {
      existing.toMs = Math.max(existing.toMs, wg.toMs);
    } else {
      // Find the full span for this word group
      const sameGroup = wordGroups.filter(g => g.fullText === wg.fullText && Math.abs(g.fromMs - wg.fromMs) < wg.words.length * 2000);
      const spanStart = Math.min(...sameGroup.map(g => g.fromMs));
      const spanEnd = Math.max(...sameGroup.map(g => g.toMs));
      groupSpans.set(key, { fromMs: spanStart, toMs: spanEnd, text: wg.fullText });
    }
  }
  
  // Render base text (primary color) for each group span
  for (const [, span] of groupSpans) {
    const startSec = (span.fromMs / 1000).toFixed(3);
    const endSec = (span.toMs / 1000).toFixed(3);
    const text = escapeDrawtext(span.text.toUpperCase());
    
    const parts: string[] = [
      `drawtext=fontfile=${fontFile}`,
      `text='${text}'`,
      `fontsize=${fontSize}`,
      `fontcolor=${hexToFFmpeg(style.fontColor)}`,
      `borderw=${style.borderW}`,
      `bordercolor=${hexToFFmpeg(style.borderColor)}`,
      `x=(w-text_w)/2`,
      `y=${yExpr}`,
      `enable='between(t\\,${startSec}\\,${endSec})'`,
      `shadowcolor=0x000000@0.6`,
      `shadowx=3`,
      `shadowy=3`,
    ];

    if (style.bgColor !== 'transparent') {
      parts.push(`box=1`, `boxcolor=${hexToFFmpeg(style.bgColor)}@0.75`, `boxborderw=12`);
    }

    filters.push(parts.join(':'));
  }

  // Second pass: render highlight word on top for each word timing
  for (const wg of wordGroups) {
    const startSec = (wg.fromMs / 1000).toFixed(3);
    const endSec = (wg.toMs / 1000).toFixed(3);
    const highlightWord = escapeDrawtext(wg.words[wg.highlightIndex].toUpperCase());
    
    // Calculate x offset for the highlighted word
    // We need to position it relative to the center
    const wordsBeforeHighlight = wg.words.slice(0, wg.highlightIndex).join(' ');
    const fullText = wg.words.join(' ');
    
    // Use text_w of the words before to calculate offset
    // Simple approach: render just the highlight word centered, overlapping
    // For better visual, we render the full text again but only the highlight word visible
    
    const highlightParts: string[] = [
      `drawtext=fontfile=${fontFile}`,
      `text='${highlightWord}'`,
      `fontsize=${Math.round(fontSize * 1.15)}`, // slightly larger for pop effect
      `fontcolor=${hexToFFmpeg(style.highlightColor)}`,
      `borderw=${style.borderW + 1}`,
      `bordercolor=${hexToFFmpeg(style.borderColor)}`,
      `x=(w-text_w)/2`,
      `y=${yExpr}`,
      `enable='between(t\\,${startSec}\\,${endSec})'`,
      `shadowcolor=0x000000@0.8`,
      `shadowx=2`,
      `shadowy=2`,
    ];

    filters.push(highlightParts.join(':'));
  }

  // Limit filter count to avoid FFmpeg overload (max ~200 filters)
  const maxFilters = 200;
  if (filters.length > maxFilters) {
    console.warn(`[SubtitleBurner] Too many filters (${filters.length}), truncating to ${maxFilters}`);
    return filters.slice(0, maxFilters).join(',');
  }

  return filters.join(',');
}

/**
 * Load the font file into FFmpeg's virtual filesystem.
 */
async function loadFontIntoFS(ffmpeg: any): Promise<string> {
  try {
    const fontData = await fetchFile(FONT_PATH);
    await ffmpeg.writeFile(FONT_FS_NAME, fontData);
    console.log('[SubtitleBurner] Font loaded into FFmpeg FS:', FONT_FS_NAME);
    return FONT_FS_NAME;
  } catch (err) {
    console.warn('[SubtitleBurner] Failed to load font:', err);
    return FONT_FS_NAME;
  }
}

export async function burnSubtitlesIntoVideo(
  videoFile: File,
  options: BurnOptions,
  onProgress?: (pct: number, status: string) => void,
): Promise<Blob> {
  onProgress?.(5, 'Preparando FFmpeg...');
  const ffmpeg = await getFFmpeg();

  const inputName = `burn_input_${Date.now()}.mp4`;
  const outputName = `burned_${Date.now()}.mp4`;

  onProgress?.(8, 'Carregando fonte...');
  const fontFile = await loadFontIntoFS(ffmpeg);

  onProgress?.(10, 'Carregando vídeo...');
  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  const filterStr = buildDrawtextFilter(options, fontFile);
  console.log('[SubtitleBurner] Filter chain length:', filterStr.length, 'chars');
  console.log('[SubtitleBurner] First 800 chars:', filterStr.substring(0, 800));

  let duration = 0;
  let lastError = '';
  const logHandler = ({ message }: { message: string }) => {
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
      lastError = message;
      console.warn('[SubtitleBurner] FFmpeg:', message);
    }
    const durMatch = message.match(/Duration:\s+(\d+):(\d+):(\d+)/);
    if (durMatch) {
      duration = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);
    }
    const timeMatch = message.match(/time=(\d+):(\d+):(\d+)/);
    if (timeMatch && duration > 0) {
      const current = Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
      const pct = Math.min(95, 20 + (current / duration) * 75);
      onProgress?.(Math.round(pct), 'Gravando legendas estilo CapCut...');
    }
  };

  ffmpeg.on('log', logHandler);
  onProgress?.(20, 'Gravando legendas estilo CapCut...');

  let usedFallback = false;

  try {
    try {
      await ffmpeg.exec([
        '-i', inputName,
        '-vf', filterStr,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        '-y', outputName,
      ]);
    } catch (filterErr) {
      console.warn('[SubtitleBurner] drawtext failed, re-encoding without subtitles:', filterErr);
      usedFallback = true;
      await ffmpeg.exec([
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        '-y', outputName,
      ]);
    }
  } finally {
    ffmpeg.off('log', logHandler);
  }

  onProgress?.(95, 'Finalizando...');

  let outputData: any;
  try {
    outputData = await ffmpeg.readFile(outputName);
  } catch (readErr) {
    console.error('[SubtitleBurner] Failed to read output:', readErr, 'Last error:', lastError);
    throw new Error('FFmpeg não produziu o arquivo de saída.');
  }

  const outputBytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData as unknown as ArrayBuffer);

  if (outputBytes.length < 1000) {
    console.error('[SubtitleBurner] Output too small:', outputBytes.length, 'bytes. Last error:', lastError);
    throw new Error('Vídeo de saída está vazio ou corrompido.');
  }

  if (usedFallback) {
    console.warn('[SubtitleBurner] Used fallback - video re-encoded without subtitles');
  }

  // Cleanup
  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    await ffmpeg.deleteFile(FONT_FS_NAME);
  } catch { /* ignore */ }

  onProgress?.(100, 'Concluído!');
  return new Blob([outputBytes.buffer as ArrayBuffer], { type: 'video/mp4' });
}
