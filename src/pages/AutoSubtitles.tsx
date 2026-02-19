import { useState, useRef, useCallback, useEffect } from 'react';
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
import { Sparkles, ArrowLeft, Upload, Wand2, Download, Loader2, Type, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { extractAudioAsFile, transcribeAudio, type TranscriptionResult } from '@/lib/whisper-transcriber';
import { SUBTITLE_STYLES } from '@/lib/subtitle-styles';
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

  const [step, setStep] = useState<Step>('upload');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [selectedStyle, setSelectedStyle] = useState('classic');
  const [subtitlePosition, setSubtitlePosition] = useState<'bottom' | 'center' | 'top'>('bottom');
  const [fontSize, setFontSize] = useState(48);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error('Selecione um arquivo de vídeo');
      return;
    }

    // Limit 60s
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      if (video.duration > 120) {
        toast.error('Vídeo muito longo. Máximo: 2 minutos.');
        return;
      }
      setVideoFile(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
      setTranscription(null);
      setOutputUrl(null);
      setStep('upload');
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
      setStep('style');
      toast.success(`Transcrição concluída! ${result.segments.length} segmentos detectados.`);
    } catch (err) {
      console.error('Transcription error:', err);
      toast.error('Erro na transcrição. Tente novamente.');
      setStep('upload');
    }
  }, [videoFile]);

  const handleBurnSubtitles = useCallback(async () => {
    if (!videoFile || !transcription) return;

    setStep('burning');
    setProgress(0);
    setStatusText('Preparando legendas...');

    try {
      const style = SUBTITLE_STYLES.find(s => s.id === selectedStyle) || SUBTITLE_STYLES[0];

      const burnOptions = {
        segments: transcription.segments,
        style: {
          fontColor: style.colors.primary,
          highlightColor: style.colors.highlight,
          borderColor: style.colors.outline,
          bgColor: style.colors.bg,
          borderW: selectedStyle === 'minimal' ? 0 : selectedStyle === 'neon' ? 5 : 4,
          bold: true,
        },
        fontSize,
        position: subtitlePosition,
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
  }, [videoFile, transcription, selectedStyle, fontSize, subtitlePosition]);

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
    setOutputUrl(null);
    setStep('upload');
    setProgress(0);
    setStatusText('');
  };

  const selectedStyleObj = SUBTITLE_STYLES.find(s => s.id === selectedStyle);

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
                Profissional & Empresarial • Roda no seu navegador
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
                    <video
                      src={videoPreviewUrl}
                      controls
                      className="w-full max-h-[300px] rounded-xl bg-black object-contain"
                    />
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
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                A transcrição roda 100% no seu navegador. Pode levar de 30s a 2min dependendo do vídeo.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Style selection step */}
        {step === 'style' && transcription && (
          <div className="space-y-6">
            {/* Transcription preview */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Transcrição ({transcription.segments.length} segmentos)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-40 overflow-y-auto rounded-lg bg-muted/30 p-3 text-sm text-foreground space-y-1">
                  {transcription.segments.map((seg, i) => (
                    <p key={i}>
                      <span className="text-xs text-muted-foreground font-mono mr-2">{seg.from.split(',')[0]}</span>
                      {seg.text}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Style picker */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> Escolha o estilo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {SUBTITLE_STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStyle(s.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                        selectedStyle === s.id
                          ? 'border-primary bg-primary/10 scale-105'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <span className="text-2xl">{s.preview}</span>
                      <span className="text-sm font-medium text-foreground">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground text-center leading-tight">{s.description}</span>
                    </button>
                  ))}
                </div>

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
                    <Select value={String(fontSize)} onValueChange={(v) => setFontSize(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="32">Pequeno</SelectItem>
                        <SelectItem value="48">Médio</SelectItem>
                        <SelectItem value="64">Grande</SelectItem>
                        <SelectItem value="80">Extra Grande</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Preview — CapCut style */}
                {selectedStyleObj && (
                  <div
                    className="rounded-xl bg-black relative overflow-hidden"
                    style={{ minHeight: '200px' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
                    
                    <div className={`absolute inset-x-0 ${subtitlePosition === 'top' ? 'top-4' : subtitlePosition === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-3'} px-4 text-center`}>
                      <span
                        className="inline-block px-3 py-1"
                        style={{
                          backgroundColor: selectedStyleObj.colors.bg !== 'transparent'
                            ? selectedStyleObj.colors.bg
                            : 'transparent',
                          borderRadius: selectedStyleObj.colors.bg !== 'transparent' ? '6px' : '0',
                        }}
                      >
                        {['TEMPLATE', 'DESSE', 'ROBOZINHO'].map((word, i) => (
                          <span
                            key={i}
                            className="font-extrabold uppercase tracking-wide"
                            style={{
                              color: i === 1 ? selectedStyleObj.colors.highlight : selectedStyleObj.colors.primary,
                              fontSize: `${Math.min(fontSize / 1.2, 44)}px`,
                              WebkitTextStroke: selectedStyleObj.id === 'minimal'
                                ? 'none'
                                : `${selectedStyleObj.id === 'neon' ? 2.5 : 2}px ${selectedStyleObj.colors.outline}`,
                              textShadow: selectedStyleObj.id === 'neon'
                                ? `0 0 12px ${selectedStyleObj.colors.primary}, 0 0 24px ${selectedStyleObj.colors.outline}`
                                : selectedStyleObj.id === 'fire'
                                ? `0 0 10px ${selectedStyleObj.colors.highlight}, 3px 3px 6px #000`
                                : selectedStyleObj.id === 'minimal'
                                ? '0 3px 10px rgba(0,0,0,0.7)'
                                : `3px 3px 6px rgba(0,0,0,0.95)`,
                              marginRight: '8px',
                              letterSpacing: '0.05em',
                            }}
                          >
                            {word}
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>
                )}

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
              <video
                src={outputUrl}
                controls
                autoPlay
                className="w-full max-h-[400px] rounded-xl bg-black object-contain"
              />
              <div className="flex gap-3">
                <Button
                  onClick={handleDownload}
                  className="flex-1 bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-full"
                  size="lg"
                >
                  <Download className="w-5 h-5 mr-2" /> Baixar Vídeo
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="rounded-full"
                  size="lg"
                >
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
