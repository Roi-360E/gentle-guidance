/**
 * Legendas Automáticas em Massa
 * 
 * Fluxo: Upload (3 seções: Ganchos 10, Corpos 5, CTAs 2) → Transcrever → Estilo → Download
 * Segue a mesma lógica de seções do concatenador (Index.tsx)
 * Cada vídeo passa por: extração de áudio → transcrição IA → burn de legendas com FFmpeg
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Sparkles, ArrowLeft, Upload, Wand2, Download, Loader2, Type,
  Lock, Eye, CheckCircle2, X, Film, Play, Square,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  extractAudioAsFile,
  transcribeAudio,
  type TranscriptionResult,
  type TranscriptionSegment,
} from '@/lib/whisper-transcriber';
import { SUBTITLE_STYLES, splitSegmentsIntoWordGroups, type WordGroup } from '@/lib/subtitle-styles';
import { burnSubtitlesIntoVideo } from '@/lib/subtitle-burner';
import {
  getFFmpeg,
  preProcessBatch,
  defaultSettings,
  type ProcessingSettings,
} from '@/lib/video-processor';

/* ───────────── Types ───────────── */

/** Status de cada vídeo no pipeline */
type VideoStatus = 'idle' | 'transcribing' | 'transcribed' | 'burning' | 'done' | 'error';

/** Cada vídeo rastreado no batch */
interface BatchVideo {
  file: File;
  name: string;
  previewUrl: string;
  status: VideoStatus;
  progress: number;
  statusText: string;
  transcription: TranscriptionResult | null;
  outputUrl: string | null;
  /** Dimensões do vídeo (detectadas no upload) */
  dimensions: { width: number; height: number } | null;
}

/** Seção do batch (Ganchos, Corpos, CTAs) */
interface BatchSection {
  label: string;
  description: string;
  maxFiles: number;
  videos: BatchVideo[];
  accentColor: string;
}

/** Steps do fluxo principal */
type MainStep = 'upload' | 'transcribing' | 'style' | 'burning' | 'done';

/* ───────────── Helpers ───────────── */

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Detecta dimensões de um arquivo de vídeo via elemento <video>
 */
function detectVideoDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      resolve({ width: 1080, height: 1920 }); // fallback vertical
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
  });
}

/* ───────────── Component ───────────── */

const AutoSubtitles = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<string>('free');

  // Carregar plano do usuário
  useEffect(() => {
    if (!user) return;
    const monthYear = new Date().toISOString().slice(0, 7);
    supabase
      .from('video_usage')
      .select('plan')
      .eq('user_id', user.id)
      .eq('month_year', monthYear)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPlan(data.plan);
      });
  }, [user]);

  const hasAccess = plan === 'professional' || plan === 'enterprise';

  /* ──── State central do batch ──── */
  const [sections, setSections] = useState<BatchSection[]>([
    { label: 'Ganchos', description: 'Até 10 vídeos de abertura', maxFiles: 10, videos: [], accentColor: 'bg-primary' },
    { label: 'Corpos', description: 'Até 5 vídeos de conteúdo', maxFiles: 5, videos: [], accentColor: 'bg-accent' },
    { label: 'CTAs', description: 'Até 2 vídeos de chamada', maxFiles: 2, videos: [], accentColor: 'bg-primary' },
  ]);

  const [mainStep, setMainStep] = useState<MainStep>('upload');
  const [selectedStyle, setSelectedStyle] = useState('classic');
  const [subtitlePosition, setSubtitlePosition] = useState<'bottom' | 'center' | 'top'>('bottom');
  const [fontSizePct, setFontSizePct] = useState(5);
  const [overallProgress, setOverallProgress] = useState(0);
  const [overallStatus, setOverallStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const cancelRef = useRef(false);

  // Ref para inputs de file
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);

  /* ──── Pré-processamento por seção (mesma lógica do concatenador) ──── */
  const [preprocessingSection, setPreprocessingSection] = useState<string | null>(null);
  const [sectionPreprocessed, setSectionPreprocessed] = useState<boolean[]>([false, false, false]);
  const [sectionStarted, setSectionStarted] = useState<boolean[]>([false, false, false]);
  // allPreprocessed computed after hasVideos below

  /* ──── Contagens derivadas ──── */
  const allVideos = useMemo(() => sections.flatMap(s => s.videos), [sections]);
  const totalVideos = allVideos.length;
  const transcribedCount = allVideos.filter(v => v.status === 'transcribed' || v.status === 'done').length;
  const doneCount = allVideos.filter(v => v.status === 'done').length;
  const hasVideos = totalVideos > 0;
  const allPreprocessed = sectionPreprocessed.every(Boolean) && hasVideos;

  const selectedStyleObj = SUBTITLE_STYLES.find(s => s.id === selectedStyle);

  /* ──── Carrossel de preview na etapa de estilo ──── */
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Lista flat de vídeos transcritos para o carrossel
  const transcribedVideos = useMemo(() =>
    allVideos.filter(v => v.transcription && v.transcription.segments.length > 0),
    [allVideos]
  );

  // Word groups do vídeo atual no carrossel
  const carouselWordGroups = useMemo(() => {
    const video = transcribedVideos[carouselIndex];
    if (!video?.transcription) return [];
    return splitSegmentsIntoWordGroups(video.transcription.segments, 4);
  }, [transcribedVideos, carouselIndex]);

  // Word group ativo baseado no tempo do preview
  const activeWordGroup = useMemo((): WordGroup | null => {
    if (carouselWordGroups.length === 0) return null;
    const timeMs = previewTime * 1000;
    return carouselWordGroups.find(g => timeMs >= g.fromMs && timeMs <= g.toMs) || null;
  }, [previewTime, carouselWordGroups]);

  // Eagerly pre-load FFmpeg on first file upload
  useEffect(() => {
    if (totalVideos > 0) {
      getFFmpeg().then(() => console.log('[AutoSubtitles] FFmpeg pre-loaded')).catch(() => {});
    }
  }, [totalVideos > 0]);

  /* ──── Handlers de Upload ──── */

  const handleAddFiles = useCallback(async (sectionIndex: number, fileList: FileList | null) => {
    if (!fileList) return;
    const section = sections[sectionIndex];
    const remaining = section.maxFiles - section.videos.length;
    const newFiles = Array.from(fileList).slice(0, remaining);

    // Validar duração (max 2 min) e detectar dimensões em paralelo
    const validated: BatchVideo[] = [];
    for (const file of newFiles) {
      if (!file.type.startsWith('video/')) continue;
      const dims = await detectVideoDimensions(file);
      validated.push({
        file,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        status: 'idle',
        progress: 0,
        statusText: '',
        transcription: null,
        outputUrl: null,
        dimensions: dims,
      });
    }

    setSections(prev => {
      const updated = [...prev];
      updated[sectionIndex] = {
        ...updated[sectionIndex],
        videos: [...updated[sectionIndex].videos, ...validated],
      };
      return updated;
    });
    // Reset preprocessing for this section when files change
    setSectionPreprocessed(prev => { const u = [...prev]; u[sectionIndex] = false; return u; });
    setSectionStarted(prev => { const u = [...prev]; u[sectionIndex] = false; return u; });
  }, [sections]);

  const handleRemoveFile = useCallback((sectionIndex: number, videoIndex: number) => {
    setSections(prev => {
      const updated = [...prev];
      const video = updated[sectionIndex].videos[videoIndex];
      URL.revokeObjectURL(video.previewUrl);
      if (video.outputUrl) URL.revokeObjectURL(video.outputUrl);
      updated[sectionIndex] = {
        ...updated[sectionIndex],
        videos: updated[sectionIndex].videos.filter((_, i) => i !== videoIndex),
      };
      return updated;
    });
    // Reset preprocessing for this section
    setSectionPreprocessed(prev => { const u = [...prev]; u[sectionIndex] = false; return u; });
    setSectionStarted(prev => { const u = [...prev]; u[sectionIndex] = false; return u; });
  }, []);

  /* ──── Pré-processamento por seção (mesma lógica do concatenador) ──── */
  const handlePreprocessSection = useCallback(async (sectionIndex: number) => {
    const section = sections[sectionIndex];
    if (section.videos.length === 0) return;

    setSectionStarted(prev => { const u = [...prev]; u[sectionIndex] = true; return u; });
    setPreprocessingSection(section.label);
    const sectionStart = performance.now();

    try {
      // Marcar todos como processing
      setSections(prev => {
        const updated = [...prev];
        updated[sectionIndex] = {
          ...updated[sectionIndex],
          videos: updated[sectionIndex].videos.map(v => ({
            ...v, status: 'idle' as VideoStatus, progress: 5, statusText: 'Normalizando...',
          })),
        };
        return updated;
      });

      const rawFiles = section.videos.map(v => v.file);
      await preProcessBatch(rawFiles, section.label, defaultSettings, (fileIndex, status, pct) => {
        setSections(prev => {
          const updated = [...prev];
          const videos = [...updated[sectionIndex].videos];
          if (status === 'done') {
            videos[fileIndex] = { ...videos[fileIndex], progress: 100, statusText: 'Normalizado ✅' };
          } else {
            videos[fileIndex] = { ...videos[fileIndex], progress: pct, statusText: 'Normalizando...' };
          }
          updated[sectionIndex] = { ...updated[sectionIndex], videos };
          return updated;
        });
      });

      setSectionPreprocessed(prev => { const u = [...prev]; u[sectionIndex] = true; return u; });
      const elapsed = ((performance.now() - sectionStart) / 1000).toFixed(1);
      toast.success(`${section.label}: normalização concluída em ${elapsed}s! ✅`);
    } catch (err) {
      console.error('Preprocess error:', err);
      setSectionPreprocessed(prev => { const u = [...prev]; u[sectionIndex] = true; return u; });
      toast.warning(`${section.label}: normalização concluída com avisos.`);
    } finally {
      setPreprocessingSection(null);
    }
  }, [sections]);

  /* ──── Helper para atualizar um vídeo específico ──── */
  const updateVideo = useCallback((sectionIdx: number, videoIdx: number, patch: Partial<BatchVideo>) => {
    setSections(prev => {
      const updated = [...prev];
      const videos = [...updated[sectionIdx].videos];
      videos[videoIdx] = { ...videos[videoIdx], ...patch };
      updated[sectionIdx] = { ...updated[sectionIdx], videos };
      return updated;
    });
  }, []);

  /* ──── STEP 2: Transcrição em batch ──── */
  const handleTranscribeAll = useCallback(async () => {
    if (totalVideos === 0) return;
    setMainStep('transcribing');
    setIsProcessing(true);
    cancelRef.current = false;
    setOverallProgress(0);
    setOverallStatus('Iniciando transcrição em lote...');

    let completed = 0;

    // Processar seção por seção, vídeo por vídeo (para não sobrecarregar)
    for (let si = 0; si < sections.length; si++) {
      const section = sections[si];
      for (let vi = 0; vi < section.videos.length; vi++) {
        if (cancelRef.current) break;
        const video = section.videos[vi];
        if (video.status === 'transcribed' || video.status === 'done') {
          completed++;
          continue;
        }

        updateVideo(si, vi, {
          status: 'transcribing',
          progress: 10,
          statusText: 'Extraindo áudio...',
        });

        try {
          // Extrair áudio
          const audioFile = await extractAudioAsFile(video.file);

          if (cancelRef.current) break;

          updateVideo(si, vi, { progress: 30, statusText: 'Transcrevendo com IA...' });

          // Transcrever
          const result = await transcribeAudio(audioFile, (pct, status) => {
            updateVideo(si, vi, {
              progress: 30 + pct * 0.6,
              statusText: status,
            });
          });

          if (result.segments.length === 0) {
            updateVideo(si, vi, {
              status: 'error',
              progress: 100,
              statusText: 'Nenhuma fala detectada',
            });
          } else {
            updateVideo(si, vi, {
              status: 'transcribed',
              progress: 100,
              statusText: `${result.segments.length} segmentos`,
              transcription: result,
            });
          }
        } catch (err) {
          console.error(`Transcription error [${section.label} #${vi + 1}]:`, err);
          updateVideo(si, vi, {
            status: 'error',
            progress: 100,
            statusText: 'Erro na transcrição',
          });
        }

        completed++;
        const pct = Math.round((completed / totalVideos) * 100);
        setOverallProgress(pct);
        setOverallStatus(`Transcrito ${completed}/${totalVideos} vídeos`);
      }
      if (cancelRef.current) break;
    }

    setIsProcessing(false);
    if (!cancelRef.current) {
      setMainStep('style');
      toast.success(`Transcrição concluída! ${completed} vídeos processados.`);
    } else {
      setMainStep('upload');
      toast.info('Transcrição cancelada.');
    }
  }, [sections, totalVideos, updateVideo]);

  /* ──── STEP 4: Burn legendas em batch ──── */
  const handleBurnAll = useCallback(async () => {
    const style = SUBTITLE_STYLES.find(s => s.id === selectedStyle) || SUBTITLE_STYLES[0];
    setMainStep('burning');
    setIsProcessing(true);
    cancelRef.current = false;
    setOverallProgress(0);

    // Filtrar apenas vídeos com transcrição bem-sucedida
    const videosToProcess: { si: number; vi: number; video: BatchVideo }[] = [];
    sections.forEach((sec, si) => {
      sec.videos.forEach((v, vi) => {
        if (v.transcription && v.transcription.segments.length > 0) {
          videosToProcess.push({ si, vi, video: v });
        }
      });
    });

    let completed = 0;

    for (const { si, vi, video } of videosToProcess) {
      if (cancelRef.current) break;

      updateVideo(si, vi, {
        status: 'burning',
        progress: 5,
        statusText: 'Gravando legendas...',
      });

      try {
        const burnOptions = {
          segments: video.transcription!.segments,
          style: {
            fontColor: style.colors.primary,
            highlightColor: style.colors.highlight,
            borderColor: style.colors.outline,
            bgColor: style.colors.bg,
            borderW: selectedStyle === 'minimal' ? 2 : selectedStyle === 'neon' ? 7 : 5,
            bold: true,
          },
          fontSizePct,
          position: subtitlePosition,
          wordsPerGroup: 4,
        };

        const outputBlob = await burnSubtitlesIntoVideo(video.file, burnOptions, (pct, status) => {
          updateVideo(si, vi, { progress: pct, statusText: status });
        });

        const url = URL.createObjectURL(outputBlob);
        updateVideo(si, vi, {
          status: 'done',
          progress: 100,
          statusText: 'Pronto!',
          outputUrl: url,
        });
      } catch (err) {
        console.error(`Burn error [${sections[si].label} #${vi + 1}]:`, err);
        updateVideo(si, vi, {
          status: 'error',
          progress: 100,
          statusText: 'Erro ao gravar legendas',
        });
      }

      completed++;
      const pct = Math.round((completed / videosToProcess.length) * 100);
      setOverallProgress(pct);
      setOverallStatus(`Legendado ${completed}/${videosToProcess.length} vídeos`);
    }

    setIsProcessing(false);
    if (!cancelRef.current) {
      setMainStep('done');
      toast.success(`🎉 Legendas gravadas em ${completed} vídeos!`);
    } else {
      setMainStep('style');
      toast.info('Processamento cancelado.');
    }
  }, [sections, selectedStyle, fontSizePct, subtitlePosition, updateVideo]);

  /* ──── Cancelar processamento ──── */
  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  /* ──── Download individual e em lote ──── */
  const handleDownload = useCallback((video: BatchVideo) => {
    if (!video.outputUrl) return;
    const a = document.createElement('a');
    a.href = video.outputUrl;
    a.download = `legendado_${video.name}`;
    a.click();
  }, []);

  const handleDownloadAll = useCallback(() => {
    allVideos.filter(v => v.outputUrl).forEach(handleDownload);
  }, [allVideos, handleDownload]);

  /* ──── Reset total ──── */
  const handleReset = useCallback(() => {
    allVideos.forEach(v => {
      URL.revokeObjectURL(v.previewUrl);
      if (v.outputUrl) URL.revokeObjectURL(v.outputUrl);
    });
    setSections(prev => prev.map(s => ({ ...s, videos: [] })));
    setMainStep('upload');
    setOverallProgress(0);
    setOverallStatus('');
    setIsProcessing(false);
    cancelRef.current = false;
  }, [allVideos]);

  /* ──── Efeito de estilo para preview ──── */
  const getTextEffects = useCallback((styleId: string, colors: typeof SUBTITLE_STYLES[0]['colors']) => {
    const isNeon = styleId === 'neon';
    const isFire = styleId === 'fire';
    const isMinimal = styleId === 'minimal';
    return {
      WebkitTextStroke: isMinimal ? 'none' : `${isNeon ? 3 : 2}px ${colors.outline}`,
      textShadow: isNeon
        ? `0 0 12px ${colors.primary}, 0 0 24px ${colors.outline}, 3px 3px 8px rgba(0,0,0,0.9)`
        : isFire
        ? `0 0 10px ${colors.highlight}, 3px 3px 8px rgba(0,0,0,0.9)`
        : isMinimal
        ? '0 3px 12px rgba(0,0,0,0.8)'
        : `3px 3px 8px rgba(0,0,0,0.95), -1px -1px 4px rgba(0,0,0,0.5)`,
    };
  }, []);

  /* ──── Tela de bloqueio por plano ──── */
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Recurso Exclusivo</h2>
          <p className="text-muted-foreground">
            As Legendas Automáticas estão disponíveis apenas para os planos <strong>Profissional</strong> e <strong>Empresarial</strong>.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
            <Button onClick={() => navigate('/plans')} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
              Ver Planos
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Type className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-primary uppercase">
                Legendas em Massa
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Ganchos + Corpos + CTAs • Destaque palavra por palavra
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
          {[
            { key: 'upload', label: '1. Upload' },
            { key: 'transcribing', label: '2. Transcrever' },
            { key: 'style', label: '3. Estilo' },
            { key: 'done', label: '4. Download' },
          ].map((s, i) => {
            const steps: MainStep[] = ['upload', 'transcribing', 'style', 'done'];
            const currentIdx = steps.indexOf(mainStep === 'burning' ? 'done' : mainStep);
            const isActive = i <= currentIdx;
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <div className={`w-6 sm:w-8 h-0.5 ${isActive ? 'bg-primary' : 'bg-border'}`} />}
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{totalVideos}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Enviados</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex items-center gap-3">
            <div className="bg-accent/10 rounded-lg p-2">
              <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{transcribedCount}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Transcritos</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{doneCount}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Legendados</p>
            </div>
          </div>
        </div>

        {/* ════════ STEP 1: Upload — 3 seções ════════ */}
        {(mainStep === 'upload') && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sections.map((section, si) => (
              <div key={section.label} className="rounded-xl border border-border bg-card p-5 space-y-4">
                {/* Header da seção */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-card-foreground text-lg flex items-center gap-2">
                      <span className={`inline-block w-3 h-3 rounded-full ${section.accentColor}`} />
                      {section.label}
                    </h3>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">
                    {section.videos.length}/{section.maxFiles}
                  </span>
                </div>

                {/* Lista de arquivos */}
                {section.videos.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {section.videos.map((video, vi) => (
                      <div key={vi} className="rounded-lg bg-muted/50 border border-border p-3 space-y-2 relative group">
                        <div className="flex items-start gap-2">
                          {video.status === 'done' ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                          ) : video.status === 'transcribing' || video.status === 'burning' ? (
                            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0 mt-0.5" />
                          ) : video.status === 'transcribed' ? (
                            <Wand2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                          ) : video.status === 'error' ? (
                            <X className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                          ) : video.statusText === 'Normalizando...' ? (
                            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0 mt-0.5" />
                          ) : sectionPreprocessed[si] ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                          ) : (
                            <Film className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{video.name}</p>
                            {video.statusText && (
                              <p className="text-[10px] text-muted-foreground truncate">{video.statusText}</p>
                            )}
                          </div>
                          {!isProcessing && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={() => handleRemoveFile(si, vi)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="inline-flex items-center bg-background border border-border rounded-md px-2 py-0.5 font-mono text-foreground">
                            {formatFileSize(video.file.size)}
                          </span>
                          <span className="font-mono text-foreground">#{vi + 1}</span>
                        </div>
                        {(video.status === 'transcribing' || video.status === 'burning' || video.statusText === 'Normalizando...') && (
                          <Progress value={video.progress} className="h-1.5" />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Botão de upload */}
                {section.videos.length < section.maxFiles && (
                  <>
                    <button
                      onClick={() => fileInputRefs.current[si]?.click()}
                      className="w-full border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                    >
                      <Upload className="w-7 h-7" />
                      <span className="text-sm font-medium">Enviar vídeos</span>
                      <span className="text-xs">MP4, MOV, WebM</span>
                    </button>
                    <input
                      ref={el => { fileInputRefs.current[si] = el; }}
                      type="file"
                      accept="video/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleAddFiles(si, e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </>
                )}

                {/* Botão de pré-processamento por seção */}
                {section.videos.length > 0 && !sectionPreprocessed[si] && (
                  <Button
                    className="w-full rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
                    disabled={preprocessingSection !== null || sectionStarted[si]}
                    onClick={() => handlePreprocessSection(si)}
                  >
                    {preprocessingSection === section.label || sectionStarted[si] ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Pré-processando {section.label.toLowerCase()}...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Pré-processar {section.label}
                      </>
                    )}
                  </Button>
                )}

                {/* Indicador de seção pronta */}
                {sectionPreprocessed[si] && section.videos.length > 0 && (
                  <div className="flex items-center justify-center gap-2 text-sm font-semibold text-green-500 bg-green-500/10 border border-green-500/20 rounded-full py-2 px-4">
                    <CheckCircle2 className="w-5 h-5" />
                    Pré-processado!
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Botão para iniciar transcrição */}
        {mainStep === 'upload' && hasVideos && (
          <div className="max-w-md mx-auto space-y-3">
            <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Total de vídeos para legendar:</p>
              <p className="text-5xl font-extrabold text-primary">{totalVideos}</p>
              <p className="text-sm text-muted-foreground">
                {sections.map(s => `${s.videos.length} ${s.label.toLowerCase()}`).join(' + ')}
              </p>
            </div>
            <Button
              size="lg"
              className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-xl gap-2"
              onClick={handleTranscribeAll}
              disabled={!allPreprocessed}
            >
              <Wand2 className="w-5 h-5" /> Transcrever Todos com IA
            </Button>
            {!allPreprocessed && (
              <p className="text-xs text-muted-foreground text-center">
                Pré-processe todas as seções acima para habilitar a transcrição
              </p>
            )}
          </div>
        )}

        {/* ════════ STEP 2: Transcrição em andamento ════════ */}
        {mainStep === 'transcribing' && (
          <Card className="border-border bg-card">
            <CardContent className="py-8 space-y-6">
              <div className="text-center space-y-2">
                <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
                <p className="text-foreground font-medium">{overallStatus}</p>
                <Progress value={overallProgress} className="max-w-md mx-auto" />
                <p className="text-xs text-muted-foreground">{overallProgress}%</p>
              </div>

              {/* Grid de status por vídeo */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                {sections.map((section, si) => (
                  <div key={si} className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${section.accentColor}`} />
                      {section.label}
                    </h4>
                    {section.videos.map((v, vi) => (
                      <div key={vi} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/30">
                        {v.status === 'transcribed' || v.status === 'done' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        ) : v.status === 'transcribing' ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                        ) : v.status === 'error' ? (
                          <X className="w-4 h-4 text-destructive shrink-0" />
                        ) : (
                          <Film className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate flex-1 text-foreground">{v.name}</span>
                        {v.status === 'transcribing' && (
                          <span className="text-muted-foreground">{Math.round(v.progress)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="text-center">
                <Button variant="destructive" onClick={handleCancel} className="rounded-xl">
                  <Square className="w-4 h-4 mr-2" /> Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ════════ STEP 3: Seleção de estilo ════════ */}
        {mainStep === 'style' && (
          <div className="space-y-6">
            {/* ── Carrossel de preview dos vídeos com legenda ao vivo ── */}
            {transcribedVideos.length > 0 && selectedStyleObj && (
              <Card className="border-border bg-card overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Eye className="w-5 h-5 text-primary" /> Preview ao Vivo
                    </CardTitle>
                    <span className="text-sm text-muted-foreground font-mono">
                      {carouselIndex + 1}/{transcribedVideos.length}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Player com overlay de legenda */}
                  {(() => {
                    const video = transcribedVideos[carouselIndex];
                    if (!video) return null;
                    return (
                      <div className="flex justify-center">
                        <div
                          className="relative"
                          style={{
                            maxHeight: '450px',
                            maxWidth: '100%',
                            aspectRatio: video.dimensions
                              ? `${video.dimensions.width}/${video.dimensions.height}`
                              : 'auto',
                          }}
                        >
                          <video
                            ref={previewVideoRef}
                            src={video.previewUrl}
                            controls
                            className="w-full h-full rounded-lg"
                            style={{ display: 'block' }}
                            onTimeUpdate={(e) => setPreviewTime(e.currentTarget.currentTime)}
                          />
                          {/* Overlay de legenda sincronizada */}
                          {activeWordGroup && (
                            <div
                              className={`absolute inset-x-0 pointer-events-none px-[5%] text-center ${
                                subtitlePosition === 'top' ? 'top-[8%]'
                                : subtitlePosition === 'center' ? 'top-1/2 -translate-y-1/2'
                                : 'bottom-[8%]'
                              }`}
                            >
                              <span
                                className="inline-block max-w-[90%]"
                                style={{
                                  backgroundColor: selectedStyleObj.colors.bg !== 'transparent'
                                    ? selectedStyleObj.colors.bg : 'transparent',
                                  padding: selectedStyleObj.colors.bg !== 'transparent' ? '4px 14px' : '2px 4px',
                                  borderRadius: selectedStyleObj.colors.bg !== 'transparent' ? '8px' : '0',
                                }}
                              >
                                {activeWordGroup.words.map((word, i) => {
                                  const isHighlighted = i === activeWordGroup.highlightIndex;
                                  const effects = getTextEffects(selectedStyle, selectedStyleObj.colors);
                                  return (
                                    <span
                                      key={i}
                                      className="font-black uppercase tracking-wide transition-colors duration-75"
                                      style={{
                                        color: isHighlighted
                                          ? selectedStyleObj.colors.highlight
                                          : selectedStyleObj.colors.primary,
                                        fontSize: `clamp(14px, ${fontSizePct * 0.6}vw, 42px)`,
                                        ...effects,
                                        marginRight: i < activeWordGroup.words.length - 1 ? '0.3em' : '0',
                                        display: 'inline-block',
                                        transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
                                        transition: 'transform 0.1s ease, color 0.1s ease',
                                      }}
                                    >
                                      {word.toUpperCase()}
                                    </span>
                                  );
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Navegação do carrossel */}
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline" size="sm" className="rounded-full gap-1"
                      disabled={carouselIndex <= 0}
                      onClick={() => { setCarouselIndex(i => i - 1); setPreviewTime(0); }}
                    >
                      <ChevronLeft className="w-4 h-4" /> Anterior
                    </Button>
                    <p className="text-sm text-muted-foreground truncate max-w-[200px] text-center">
                      {transcribedVideos[carouselIndex]?.name}
                    </p>
                    <Button
                      variant="outline" size="sm" className="rounded-full gap-1"
                      disabled={carouselIndex >= transcribedVideos.length - 1}
                      onClick={() => { setCarouselIndex(i => i + 1); setPreviewTime(0); }}
                    >
                      Próximo <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> Estilo das Legendas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Grid de estilos */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {SUBTITLE_STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStyle(s.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                        selectedStyle === s.id
                          ? 'border-primary bg-primary/10 scale-105'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <span className="text-2xl">{s.preview}</span>
                      <span className="text-xs font-medium text-foreground">{s.name}</span>
                    </button>
                  ))}
                </div>

                {/* Preview estático */}
                {selectedStyleObj && (
                  <div
                    className="rounded-xl bg-black relative overflow-hidden flex items-end justify-center"
                    style={{ minHeight: '120px', padding: '16px' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
                    <div className="relative z-10 text-center">
                      <span
                        className="inline-block"
                        style={{
                          backgroundColor: selectedStyleObj.colors.bg !== 'transparent'
                            ? selectedStyleObj.colors.bg : 'transparent',
                          padding: selectedStyleObj.colors.bg !== 'transparent' ? '4px 14px' : '0',
                          borderRadius: '6px',
                        }}
                      >
                        {['ESCALE', 'SEUS', 'CRIATIVOS', 'AGORA'].map((word, i) => {
                          const isHighlighted = i === 0;
                          const effects = getTextEffects(selectedStyle, selectedStyleObj.colors);
                          return (
                            <span
                              key={i}
                              className="font-black uppercase tracking-wide"
                              style={{
                                color: isHighlighted
                                  ? selectedStyleObj.colors.highlight
                                  : selectedStyleObj.colors.primary,
                                fontSize: '28px',
                                ...effects,
                                marginRight: i < 3 ? '6px' : '0',
                              }}
                            >
                              {word}
                            </span>
                          );
                        })}
                      </span>
                    </div>
                  </div>
                )}

                {/* Posição & Tamanho */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Posição</Label>
                    <Select value={subtitlePosition} onValueChange={(v) => setSubtitlePosition(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom">Embaixo</SelectItem>
                        <SelectItem value="center">Centro</SelectItem>
                        <SelectItem value="top">Topo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tamanho da Fonte</Label>
                    <Select value={String(fontSizePct)} onValueChange={(v) => setFontSizePct(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">Pequeno (3%)</SelectItem>
                        <SelectItem value="5">Médio (5%)</SelectItem>
                        <SelectItem value="7">Grande (7%)</SelectItem>
                        <SelectItem value="9">Extra Grande (9%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleBurnAll}
                  className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-full"
                  size="lg"
                >
                  <Wand2 className="w-5 h-5 mr-2" /> Gravar Legendas em {allVideos.filter(v => v.transcription).length} Vídeos
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════════ STEP 3.5: Burning em andamento ════════ */}
        {mainStep === 'burning' && (
          <Card className="border-border bg-card">
            <CardContent className="py-8 space-y-6">
              <div className="text-center space-y-2">
                <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
                <p className="text-foreground font-medium">{overallStatus}</p>
                <Progress value={overallProgress} className="max-w-md mx-auto" />
                <p className="text-xs text-muted-foreground">{overallProgress}%</p>
              </div>

              {/* Status por vídeo */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                {sections.map((section, si) => (
                  <div key={si} className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${section.accentColor}`} />
                      {section.label}
                    </h4>
                    {section.videos.map((v, vi) => (
                      <div key={vi} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/30">
                        {v.status === 'done' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        ) : v.status === 'burning' ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                        ) : v.status === 'error' ? (
                          <X className="w-4 h-4 text-destructive shrink-0" />
                        ) : (
                          <Film className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate flex-1 text-foreground">{v.name}</span>
                        {v.status === 'burning' && (
                          <span className="text-muted-foreground">{Math.round(v.progress)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="text-center">
                <Button variant="destructive" onClick={handleCancel} className="rounded-xl">
                  <Square className="w-4 h-4 mr-2" /> Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ════════ STEP 4: Resultados / Downloads ════════ */}
        {mainStep === 'done' && (
          <div className="space-y-6">
            {/* Botão download all + reset */}
            <div className="flex gap-3 justify-center">
              <Button
                size="lg"
                className="bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-full gap-2"
                onClick={handleDownloadAll}
              >
                <Download className="w-5 h-5" /> Baixar Todos ({doneCount})
              </Button>
              <Button variant="outline" size="lg" className="rounded-full" onClick={handleReset}>
                Novo Lote
              </Button>
            </div>

            {/* Grid de vídeos prontos por seção */}
            {sections.map((section, si) => {
              const doneVideos = section.videos.filter(v => v.status === 'done');
              if (doneVideos.length === 0) return null;
              return (
                <Card key={si} className="border-border bg-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${section.accentColor}`} />
                      {section.label} ({doneVideos.length} legendados)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {section.videos.map((video, vi) => {
                        if (video.status !== 'done' || !video.outputUrl) return null;
                        return (
                          <div key={vi} className="rounded-xl border border-border bg-muted/30 overflow-hidden">
                            <video
                              src={video.outputUrl}
                              controls
                              className="w-full bg-black"
                              style={{
                                maxHeight: '280px',
                                aspectRatio: video.dimensions
                                  ? `${video.dimensions.width}/${video.dimensions.height}`
                                  : 'auto',
                              }}
                            />
                            <div className="p-3 flex items-center justify-between">
                              <p className="text-sm font-medium text-foreground truncate flex-1">{video.name}</p>
                              <Button
                                variant="ghost" size="sm"
                                className="text-primary shrink-0"
                                onClick={() => handleDownload(video)}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default AutoSubtitles;
