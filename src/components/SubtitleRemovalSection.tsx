/**
 * SubtitleRemovalSection — Componente dedicado para remoção de legendas existentes
 * 
 * Extraído do AutoSubtitles.tsx para manter isolamento e manutenibilidade.
 * Recebe os vídeos das seções e executa a remoção via VPS + fallback local.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Eraser, Loader2, CheckCircle2, X, Clock, Sliders,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { removeSubtitlesAdvanced } from '@/lib/subtitle-remover';

/* ───────────── Types ───────────── */

interface VideoItem {
  file: File;
  name: string;
  previewUrl: string;
  status: string;
  progress: number;
  statusText: string;
  dimensions: { width: number; height: number } | null;
}

interface SectionItem {
  label: string;
  videos: VideoItem[];
}

interface RemovalResult {
  beforeUrl: string;
  afterUrl: string;
  name: string;
  elapsed: string;
}

interface SubtitleRemovalSectionProps {
  sections: SectionItem[];
  totalVideos: number;
  allPreprocessed: boolean;
  onUpdateVideo: (sectionIdx: number, videoIdx: number, patch: Partial<VideoItem>) => void;
  onReplaceVideo: (sectionIdx: number, videoIdx: number, newFile: File, newUrl: string, statusText: string) => void;
}

/* ───────────── Component ───────────── */

export default function SubtitleRemovalSection({
  sections,
  totalVideos,
  allPreprocessed,
  onUpdateVideo,
  onReplaceVideo,
}: SubtitleRemovalSectionProps) {
  const [removeExistingSubs, setRemoveExistingSubs] = useState(false);
  const [subtitleRegionPct, setSubtitleRegionPct] = useState(15);
  const [isRemovingSubs, setIsRemovingSubs] = useState(false);
  const [removalResults, setRemovalResults] = useState<RemovalResult[]>([]);
  const [removalCarouselIdx, setRemovalCarouselIdx] = useState(0);

  const handleRemoveExistingSubs = useCallback(async () => {
    if (!removeExistingSubs) return;
    setIsRemovingSubs(true);
    setRemovalResults([]);
    const results: RemovalResult[] = [];

    for (let si = 0; si < sections.length; si++) {
      const section = sections[si];
      for (let vi = 0; vi < section.videos.length; vi++) {
        const video = section.videos[vi];
        const dims = video.dimensions || { width: 1080, height: 1920 };
        const beforeUrl = video.previewUrl;
        const startTime = performance.now();

        onUpdateVideo(si, vi, { statusText: 'Removendo legendas...', progress: 5 });

        try {
          const cleanFile = await removeSubtitlesAdvanced(video.file, subtitleRegionPct, dims, (pct, status) => {
            onUpdateVideo(si, vi, { progress: pct, statusText: status });
          });
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
          const newUrl = URL.createObjectURL(cleanFile);

          results.push({ beforeUrl, afterUrl: newUrl, name: video.name, elapsed });
          onReplaceVideo(si, vi, cleanFile, newUrl, `Removido em ${elapsed}s ⚡`);
        } catch (err) {
          console.error(`Delogo error [${section.label} #${vi + 1}]:`, err);
          onUpdateVideo(si, vi, { statusText: 'Erro ao remover legendas' });
        }
      }
    }

    setRemovalResults(results);
    setRemovalCarouselIdx(0);
    setIsRemovingSubs(false);
    toast.success('Legendas existentes removidas dos vídeos!');
  }, [sections, removeExistingSubs, subtitleRegionPct, onUpdateVideo, onReplaceVideo]);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Eraser className="w-5 h-5 text-primary" /> Remover Legendas Existentes
          </CardTitle>
          <Switch checked={removeExistingSubs} onCheckedChange={setRemoveExistingSubs} />
        </div>
        <CardDescription className="text-muted-foreground">
          Reconstrução de fundo por <strong>mediana temporal</strong>: analisa múltiplos frames para eliminar o texto e restaurar o fundo original. 100% local, sem APIs externas.
        </CardDescription>
      </CardHeader>
      {removeExistingSubs && (
        <CardContent className="space-y-4">
          {/* Per-video removal progress */}
          {isRemovingSubs && (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {sections.map((section, si) =>
                section.videos.map((v, vi) => (
                  <div key={`${si}-${vi}`} className="flex items-center gap-2 text-xs rounded-lg bg-muted/30 p-2">
                    {v.statusText?.includes('✅') || v.statusText?.includes('⚡') ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : v.statusText?.includes('Removendo') || v.statusText?.includes('Extraindo') || v.statusText?.includes('Calculando') || v.statusText?.includes('Carregando') || v.statusText?.includes('Tentando') || v.statusText?.includes('Gerando') || v.statusText?.includes('Compositing') || v.statusText?.includes('Enviando') || v.statusText?.includes('Processando') || v.statusText?.includes('Recebendo') ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                    ) : v.statusText?.includes('Erro') ? (
                      <X className="w-4 h-4 text-destructive shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate flex-1 text-foreground">{v.name}</span>
                    <span className="text-muted-foreground text-[10px]">{v.statusText}</span>
                    {v.progress > 0 && v.progress < 100 && (
                      <span className="text-primary font-semibold">{Math.round(v.progress)}%</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Slider de região */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm">
                <Sliders className="w-4 h-4 text-muted-foreground" />
                Região a limpar (de baixo para cima)
              </Label>
              <span className="text-sm font-mono font-semibold text-primary">{subtitleRegionPct}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={40}
              step={1}
              value={subtitleRegionPct}
              onChange={(e) => setSubtitleRegionPct(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5% (legendas pequenas)</span>
              <span>40% (legendas grandes)</span>
            </div>
          </div>

          {/* Preview visual da região */}
          <div className="rounded-lg overflow-hidden border border-border bg-muted/30 relative" style={{ height: '120px' }}>
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              Área do vídeo
            </div>
            <div
              className="absolute bottom-0 left-0 right-0 bg-destructive/20 border-t-2 border-dashed border-destructive/50 flex items-center justify-center"
              style={{ height: `${subtitleRegionPct}%` }}
            >
              <span className="text-[10px] font-semibold text-destructive">Região removida</span>
            </div>
          </div>

          <Button
            className="w-full rounded-full bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground font-semibold"
            disabled={isRemovingSubs || !allPreprocessed}
            onClick={handleRemoveExistingSubs}
          >
            {isRemovingSubs ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Removendo legendas...
              </>
            ) : (
              <>
                <Eraser className="w-4 h-4 mr-2" />
                Remover Legendas de {totalVideos} Vídeos
              </>
            )}
          </Button>
          {!allPreprocessed && (
            <p className="text-xs text-muted-foreground text-center">
              Pré-processe todas as seções primeiro
            </p>
          )}

          {/* Before/After Carousel */}
          {removalResults.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Resultado: 100% Removido
                </h4>
                <span className="text-xs text-muted-foreground font-mono">
                  {removalCarouselIdx + 1}/{removalResults.length}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Before */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-destructive uppercase tracking-wide text-center">Antes</p>
                  <div className="rounded-lg overflow-hidden border border-destructive/30 bg-black aspect-[9/16]">
                    <video
                      src={removalResults[removalCarouselIdx]?.beforeUrl}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  </div>
                </div>
                {/* After */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-green-500 uppercase tracking-wide text-center">Depois</p>
                  <div className="rounded-lg overflow-hidden border border-green-500/30 bg-black aspect-[9/16]">
                    <video
                      src={removalResults[removalCarouselIdx]?.afterUrl}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground truncate flex-1">
                  {removalResults[removalCarouselIdx]?.name} — <span className="text-primary font-semibold">{removalResults[removalCarouselIdx]?.elapsed}s</span>
                </p>
                {removalResults.length > 1 && (
                  <div className="flex gap-1">
                    <Button
                      variant="outline" size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => setRemovalCarouselIdx(i => (i - 1 + removalResults.length) % removalResults.length)}
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="outline" size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => setRemovalCarouselIdx(i => (i + 1) % removalResults.length)}
                    >
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
