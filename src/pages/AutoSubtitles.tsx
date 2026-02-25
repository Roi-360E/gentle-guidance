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
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, ArrowLeft, Upload, Wand2, Download, Loader2, Type, Trash2, Lock, Pencil, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { extractAudioAsFile, transcribeAudio, type TranscriptionResult, type TranscriptionSegment } from '@/lib/whisper-transcriber';
import { SUBTITLE_STYLES, splitSegmentsIntoWordGroups, type WordGroup } from '@/lib/subtitle-styles';
import { burnSubtitlesIntoVideo } from '@/lib/subtitle-burner';

type Step = 'upload' | 'transcribing' | 'style' | 'burning' | 'done';

const AutoSubtitles = () => {
  const { user } = useAuth();
  const [plan, setPlan] = useState<string>('free');

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
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [editableSegments, setEditableSegments] = useState<TranscriptionSegment[]>([]);
  const [selectedStyle, setSelectedStyle] = useState('classic');
  const [subtitlePosition, setSubtitlePosition] = useState<'bottom' | 'center' | 'top'>('bottom');
  const [fontSizePct, setFontSizePct] = useState(5);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showLivePreview, setShowLivePreview] = useState(true);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  // Build word groups for live preview
  const wordGroups = useMemo(() => {
    if (editableSegments.length === 0) return [];
    return splitSegmentsIntoWordGroups(editableSegments, 4);
  }, [editableSegments]);

  // Current word group for live preview (with highlight info)
  const currentWordGroup = useMemo((): WordGroup | null => {
    if (!showLivePreview || wordGroups.length === 0) return null;
    const timeMs = currentTime * 1000;
    return wordGroups.find(g => timeMs >= g.fromMs && timeMs <= g.toMs) || null;
  }, [currentTime, wordGroups, showLivePreview]);

  const selectedStyleObj = SUBTITLE_STYLES.find(s => s.id === selectedStyle);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Selecione um arquivo de vídeo');
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      if (video.duration > 120) {
        URL.revokeObjectURL(video.src);
        toast.error('Vídeo muito longo. Máximo: 2 minutos.');
        return;
      }
      setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      setVideoFile(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
      setTranscription(null);
      setEditableSegments([]);
      setOutputUrl(null);
      setStep('upload');
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
  }, []);

  const handleTranscribe = useCallback(async () => {
    if (!videoFile) return;
    setStep('transcribing');
    setProgress(0);
    setStatusText('Extraindo áudio do vídeo...');
    try {
      const audioFile = await extractAudioAsFile(videoFile);
      setProgress(20);
      setStatusText('Áudio extraído. Iniciando transcrição...');
      const result = await transcribeAudio(audioFile, (pct, status) => {
        setProgress(20 + pct * 0.8);
        setStatusText(status);
      });
      if (result.segments.length === 0) {
        toast.error('Nenhuma fala detectada no vídeo. Tente com outro arquivo.');
        setStep('upload');
        return;
      }
      setTranscription(result);
      setEditableSegments([...result.segments]);
      setStep('style');
      toast.success(`Transcrição concluída! ${result.segments.length} segmentos detectados.`);
    } catch (err) {
      console.error('Transcription error:', err);
      toast.error('Erro na transcrição. Tente novamente.');
      setStep('upload');
    }
  }, [videoFile]);

  const handleSegmentTextChange = useCallback((index: number, newText: string) => {
    setEditableSegments(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], text: newText };
      return updated;
    });
  }, []);

  const handleBurnSubtitles = useCallback(async () => {
    if (!videoFile || editableSegments.length === 0) return;
    setStep('burning');
    setProgress(0);
    setStatusText('Preparando legendas...');
    try {
      const style = SUBTITLE_STYLES.find(s => s.id === selectedStyle) || SUBTITLE_STYLES[0];
      const burnOptions = {
        segments: editableSegments,
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
      const outputBlob = await burnSubtitlesIntoVideo(videoFile, burnOptions, (pct, status) => {
        setProgress(pct);
        setStatusText(status);
      });
      const url = URL.createObjectURL(outputBlob);
      setOutputUrl(url);
      setStep('done');
      toast.success('Legendas gravadas com sucesso! 🎉');
    } catch (err) {
      console.error('Burn subtitles error:', err);
      toast.error('Erro ao gravar legendas. Tente novamente.');
      setStep('style');
    }
  }, [videoFile, editableSegments, selectedStyle, fontSizePct, subtitlePosition]);

  const handleDownload = () => {
    if (!outputUrl || !videoFile) return;
    const a = document.createElement('a');
    a.href = outputUrl;
    a.download = `legendado_${videoFile.name}`;
    a.click();
  };

  const handleReset = () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setTranscription(null);
    setEditableSegments([]);
    setOutputUrl(null);
    setStep('upload');
    setProgress(0);
    setStatusText('');
    setCurrentTime(0);
    setVideoDimensions(null);
  };

  // Get text shadow/stroke style based on selected style
  const getTextEffects = useCallback((styleId: string, colors: typeof SUBTITLE_STYLES[0]['colors']) => {
    const isMinimal = styleId === 'minimal';
    const isNeon = styleId === 'neon';
    const isFire = styleId === 'fire';
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
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Type className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-primary uppercase">
                Legendas Automáticas
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Profissional & Empresarial • Destaque palavra por palavra
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 text-sm">
          {[
            { key: 'upload', label: '1. Upload' },
            { key: 'transcribing', label: '2. Transcrever' },
            { key: 'style', label: '3. Estilo' },
            { key: 'done', label: '4. Download' },
          ].map((s, i) => {
            const steps: Step[] = ['upload', 'transcribing', 'style', 'done'];
            const currentIdx = steps.indexOf(step === 'burning' ? 'done' : step);
            const isActive = i <= currentIdx;
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <div className={`w-8 h-0.5 ${isActive ? 'bg-primary' : 'bg-border'}`} />}
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Upload step */}
        {step === 'upload' && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" /> Envie seu vídeo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              {!videoFile ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 transition-colors"
                >
                  <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-foreground font-medium">Clique para selecionar um vídeo</p>
                  <p className="text-sm text-muted-foreground mt-1">MP4, MOV, WebM • Máx. 2 minutos</p>
                </button>
              ) : (
                <div className="space-y-4">
                  {videoPreviewUrl && (
                    <div className="flex justify-center">
                      <video
                        src={videoPreviewUrl}
                        controls
                        className="rounded-xl bg-black"
                        style={{
                          maxHeight: '400px',
                          maxWidth: '100%',
                          aspectRatio: videoDimensions ? `${videoDimensions.width}/${videoDimensions.height}` : 'auto',
                        }}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground truncate">{videoFile.name}</p>
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                      <Trash2 className="w-4 h-4 mr-1" /> Trocar vídeo
                    </Button>
                  </div>
                  <Button
                    onClick={handleTranscribe}
                    className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-full"
                    size="lg"
                  >
                    <Wand2 className="w-5 h-5 mr-2" /> Transcrever Áudio com IA
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Transcribing step */}
        {step === 'transcribing' && (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center space-y-6">
              <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
              <div className="space-y-2">
                <p className="text-foreground font-medium">{statusText}</p>
                <Progress value={progress} className="max-w-md mx-auto" />
                <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Style selection step */}
        {step === 'style' && editableSegments.length > 0 && (
          <div className="space-y-6">
            {/* Live video preview with word-by-word subtitle overlay */}
            {videoPreviewUrl && (
              <Card className="border-border bg-card overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Eye className="w-5 h-5 text-primary" /> Preview ao Vivo
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowLivePreview(!showLivePreview)}
                      className={showLivePreview ? 'text-primary' : 'text-muted-foreground'}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      {showLivePreview ? 'ON' : 'OFF'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex justify-center bg-muted/30">
                  <div
                    className="relative"
                    style={{
                      maxHeight: '500px',
                      maxWidth: '100%',
                      aspectRatio: videoDimensions ? `${videoDimensions.width}/${videoDimensions.height}` : 'auto',
                    }}
                  >
                    <video
                      ref={videoPreviewRef}
                      src={videoPreviewUrl}
                      controls
                      className="w-full h-full rounded-none"
                      style={{ display: 'block' }}
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    />
                    {/* Word-by-word subtitle overlay - positioned inside video bounds */}
                    {currentWordGroup && selectedStyleObj && (
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
                              ? selectedStyleObj.colors.bg
                              : 'transparent',
                            padding: selectedStyleObj.colors.bg !== 'transparent' ? '4px 14px' : '2px 4px',
                            borderRadius: selectedStyleObj.colors.bg !== 'transparent' ? '8px' : '0',
                          }}
                        >
                          {currentWordGroup.words.map((word, i) => {
                            const isHighlighted = i === currentWordGroup.highlightIndex;
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
                                  marginRight: i < currentWordGroup.words.length - 1 ? '0.3em' : '0',
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
                </CardContent>
              </Card>
            )}

            {/* Editable transcription */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-primary" />
                  Editar Transcrição ({editableSegments.length} segmentos)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-60 overflow-y-auto rounded-lg bg-muted/30 p-3 space-y-3">
                  {editableSegments.map((seg, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-[10px] text-muted-foreground font-mono mt-2 min-w-[70px] shrink-0">
                        {seg.from.split(',')[0]}
                      </span>
                      <Textarea
                        value={seg.text}
                        onChange={(e) => handleSegmentTextChange(i, e.target.value)}
                        className="min-h-[36px] h-9 py-1.5 text-sm resize-none bg-background border-border"
                        rows={1}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  ✏️ Clique em qualquer segmento para corrigir o texto antes de gravar
                </p>
              </CardContent>
            </Card>

            {/* Style picker */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> Estilo das Legendas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
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

                {/* Static style preview */}
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
                        {['achar', 'que', 'precisa', 'saber'].map((word, i) => {
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
                              {word.toUpperCase()}
                            </span>
                          );
                        })}
                      </span>
                    </div>
                  </div>
                )}

                {/* Position & Size */}
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
                  onClick={handleBurnSubtitles}
                  className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-full"
                  size="lg"
                >
                  <Wand2 className="w-5 h-5 mr-2" /> Gravar Legendas no Vídeo
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Burning step */}
        {step === 'burning' && (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center space-y-6">
              <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
              <div className="space-y-2">
                <p className="text-foreground font-medium">{statusText}</p>
                <Progress value={progress} className="max-w-md mx-auto" />
                <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Done step */}
        {step === 'done' && outputUrl && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg text-center">🎉 Vídeo legendado pronto!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <video
                  src={outputUrl}
                  controls
                  autoPlay
                  className="rounded-xl bg-black"
                  style={{
                    maxHeight: '400px',
                    maxWidth: '100%',
                    aspectRatio: videoDimensions ? `${videoDimensions.width}/${videoDimensions.height}` : 'auto',
                  }}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={handleDownload}
                  className="flex-1 bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-full"
                  size="lg"
                >
                  <Download className="w-5 h-5 mr-2" /> Baixar Vídeo
                </Button>
                <Button variant="outline" onClick={handleReset} className="rounded-full" size="lg">
                  Novo Vídeo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default AutoSubtitles;
