/**
 * ASS Subtitle Styles — CapCut-like styled subtitles
 * Each style generates a complete .ASS file with formatted dialogue lines
 */

import { msToAss, type TranscriptionSegment } from './whisper-transcriber';

export interface SubtitleStyle {
  id: string;
  name: string;
  description: string;
  preview: string; // emoji/icon preview
  colors: {
    primary: string;
    outline: string;
    bg: string;
  };
}

export const SUBTITLE_STYLES: SubtitleStyle[] = [
  {
    id: 'classic',
    name: 'Clássico',
    description: 'Branco com contorno preto — universal',
    preview: '🎬',
    colors: { primary: '#FFFFFF', outline: '#000000', bg: 'transparent' },
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Roxo brilhante com glow — estilo TikTok',
    preview: '💜',
    colors: { primary: '#B366FF', outline: '#6600CC', bg: 'transparent' },
  },
  {
    id: 'bold',
    name: 'Negrito',
    description: 'Amarelo forte com fundo escuro — alto contraste',
    preview: '⚡',
    colors: { primary: '#FFD700', outline: '#000000', bg: '#000000B0' },
  },
  {
    id: 'minimal',
    name: 'Minimalista',
    description: 'Branco limpo sem contorno — elegante',
    preview: '✨',
    colors: { primary: '#FFFFFF', outline: '#00000000', bg: 'transparent' },
  },
  {
    id: 'fire',
    name: 'Fogo',
    description: 'Laranja e vermelho — impacto máximo',
    preview: '🔥',
    colors: { primary: '#FF6600', outline: '#CC0000', bg: 'transparent' },
  },
];

// Convert hex color to ASS color format (&HBBGGRR&)
function hexToAss(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length === 8) {
    // Has alpha: RRGGBBAA -> &HAABBGGRR
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
  fontSize = 48,
  position = 'bottom',
  resX = 1080,
  resY = 1920,
}: GenerateAssOptions): string {
  const style = SUBTITLE_STYLES.find(s => s.id === styleId) || SUBTITLE_STYLES[0];

  const primaryColor = hexToAss(style.colors.primary);
  const outlineColor = hexToAss(style.colors.outline);
  const bgColor = style.colors.bg === 'transparent' ? '&H00000000' : hexToAss(style.colors.bg);

  // Position: alignment in ASS (2=bottom-center, 5=center, 8=top-center)
  const alignment = position === 'top' ? 8 : position === 'center' ? 5 : 2;
  const marginV = position === 'bottom' ? 80 : position === 'top' ? 80 : 0;

  // Style-specific tweaks
  const bold = styleId === 'bold' ? -1 : 0;
  const outlineSize = styleId === 'minimal' ? 0 : styleId === 'neon' ? 4 : 3;
  const shadow = styleId === 'neon' ? 3 : styleId === 'minimal' ? 0 : 1;
  const borderStyle = style.colors.bg !== 'transparent' ? 3 : 1; // 3 = opaque box bg

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
      const text = seg.text.replace(/\n/g, '\\N');
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
