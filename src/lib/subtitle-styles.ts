/**
 * Subtitle Styles — CapCut-inspired styled subtitles
 * Each style is designed for maximum visual impact with word-by-word display
 */

import { msToAss, type TranscriptionSegment } from './whisper-transcriber';

export interface SubtitleStyle {
  id: string;
  name: string;
  description: string;
  preview: string;
  colors: {
    primary: string;
    highlight: string;
    outline: string;
    bg: string;
  };
}

export const SUBTITLE_STYLES: SubtitleStyle[] = [
  {
    id: 'greenbox',
    name: 'Green Box',
    description: 'Fundo escuro com destaque verde — estilo anúncio',
    preview: '💚',
    colors: { primary: '#FFFFFF', highlight: '#00FF66', outline: '#000000', bg: '#000000DD' },
  },
];

/**
 * Split transcription segments into word-level timing.
 * Each word gets an even slice of its parent segment's duration.
 * Words are grouped into chunks of 2-4 for display.
 */
export interface WordGroup {
  words: string[];
  highlightIndex: number; // which word in the group is currently highlighted
  fromMs: number;
  toMs: number;
  fullText: string;
}

/**
 * Max characters per line to ensure subtitles fit the screen.
 * Based on typical 1080px width with Inter Bold at ~5% font size.
 */
const MAX_CHARS_PER_LINE = 20;

/**
 * Format a group of words into the specified number of lines,
 * splitting evenly by word count when text exceeds MAX_CHARS_PER_LINE.
 */
function formatLines(words: string[], maxLines: number = 2): string {
  const full = words.join(' ');
  if (maxLines <= 1 || full.length <= MAX_CHARS_PER_LINE) return full;

  // Split words evenly across the allowed number of lines
  const linesCount = Math.min(maxLines, words.length);
  const wordsPerLine = Math.ceil(words.length / linesCount);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(' '));
  }
  return lines.filter(Boolean).join('\n');
}

export function splitSegmentsIntoWordGroups(
  segments: TranscriptionSegment[],
  wordsPerGroup: number = 3,
  maxLines: number = 2,
): WordGroup[] {
  const groups: WordGroup[] = [];

  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const segDuration = seg.toMs - seg.fromMs;
    const wordDuration = segDuration / words.length;

    // Create groups of N words
    for (let gi = 0; gi < words.length; gi += wordsPerGroup) {
      const groupWords = words.slice(gi, gi + wordsPerGroup);
      const groupStartMs = seg.fromMs + gi * wordDuration;
      const groupEndMs = seg.fromMs + Math.min(gi + wordsPerGroup, words.length) * wordDuration;

      // Within each group, create a sub-entry for each word highlight
      for (let wi = 0; wi < groupWords.length; wi++) {
        const wordStartMs = groupStartMs + wi * wordDuration;
        const wordEndMs = groupStartMs + (wi + 1) * wordDuration;

        groups.push({
          words: groupWords,
          highlightIndex: wi,
          fromMs: wordStartMs,
          toMs: wordEndMs,
          fullText: formatLines(groupWords, maxLines),
        });
      }
    }
  }

  return groups;
}

// Convert hex color to ASS color format (&HBBGGRR&)
function hexToAss(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length === 8) {
    const r = clean.substring(0, 2);
    const g = clean.substring(2, 4);
    const b = clean.substring(4, 6);
    const a = clean.substring(6, 8);
    return `&H${a}${b}${g}${r}`;
  }
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H00${b}${g}${r}`;
}

interface GenerateAssOptions {
  segments: TranscriptionSegment[];
  styleId: string;
  fontSize?: number;
  position?: 'bottom' | 'center' | 'top';
  resX?: number;
  resY?: number;
}

export function generateAssFile({
  segments,
  styleId,
  fontSize = 96,
  position = 'bottom',
  resX = 1080,
  resY = 1920,
}: GenerateAssOptions): string {
  const style = SUBTITLE_STYLES.find(s => s.id === styleId) || SUBTITLE_STYLES[0];

  const primaryColor = hexToAss(style.colors.primary);
  const outlineColor = hexToAss(style.colors.outline);
  const bgColor = style.colors.bg === 'transparent' ? '&H00000000' : hexToAss(style.colors.bg);

  const alignment = position === 'top' ? 8 : position === 'center' ? 5 : 2;
  const marginV = position === 'bottom' ? 80 : position === 'top' ? 80 : 0;

  const bold = -1; // always bold for impact
  const outlineSize = styleId === 'minimal' ? 0 : styleId === 'neon' ? 5 : 4;
  const shadow = styleId === 'neon' ? 4 : styleId === 'minimal' ? 0 : 2;
  const borderStyle = style.colors.bg !== 'transparent' ? 3 : 1;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${resX}
PlayResY: ${resY}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${primaryColor},${primaryColor},${outlineColor},${bgColor},${bold},0,0,0,100,100,0,0,${borderStyle},${outlineSize},${shadow},${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const dialogues = segments
    .filter(seg => seg.text.trim())
    .map(seg => {
      const start = msToAss(seg.fromMs);
      const end = msToAss(seg.toMs);
      // Ensure max 2 lines: split long text at midpoint
      let text = seg.text.trim();
      const words = text.split(/\s+/);
      if (!text.includes('\n') && text.length > MAX_CHARS_PER_LINE && words.length > 1) {
        const mid = Math.ceil(words.length / 2);
        text = words.slice(0, mid).join(' ') + '\n' + words.slice(mid).join(' ');
      }
      // Limit to 2 lines max
      const lines = text.split('\n');
      if (lines.length > 2) {
        text = lines.slice(0, 2).join('\n');
      }
      text = text.replace(/\n/g, '\\N');
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    })
    .join('\n');

  return `${header}\n${dialogues}\n`;
}

export function generateSrtFile(segments: TranscriptionSegment[]): string {
  return segments
    .filter(seg => seg.text.trim())
    .map((seg, i) => {
      return `${i + 1}\n${seg.from} --> ${seg.to}\n${seg.text}\n`;
    })
    .join('\n');
}
