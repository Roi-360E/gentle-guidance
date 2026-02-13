import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { VideoUploadZone } from '@/components/VideoUploadZone';
import { VideoGrid } from '@/components/VideoGrid';
import { CombinationList } from '@/components/CombinationList';
import { ProcessingSettingsPanel } from '@/components/ProcessingSettings';
import {
  generateCombinations,
  processQueue,
  preloadFFmpeg,
  preProcessFiles,
  defaultSettings,
  type VideoFile,
  type Combination,
  type ProcessingSettings,
} from '@/lib/video-processor';
import { Sparkles, Zap, Square, Clapperboard, Home, Download, LogOut, Type, Upload } from 'lucide-react';
import { toast } from 'sonner';

const Index = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [hooks, setHooks] = useState<VideoFile[]>([]);
  const [bodies, setBodies] = useState<VideoFile[]>([]);
  const [ctas, setCtas] = useState<VideoFile[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProcessingSettings>(defaultSettings);
  const abortRef = useRef<AbortController | null>(null);
  const [showExtras, setShowExtras] = useState(false);

  // Per-section pre-processing state
  const [hooksPreProcessed, setHooksPreProcessed] = useState(false);
  const [bodiesPreProcessed, setBodiesPreProcessed] = useState(false);
  const [ctasPreProcessed, setCtasPreProcessed] = useState(false);
  const [preProcessingSection, setPreProcessingSection] = useState<string | null>(null);

  // Show the video grid view (after clicking "Enviar Vídeos para Processamento")
  const [showVideoGrid, setShowVideoGrid] = useState(false);

  const totalCombinations = hooks.length * bodies.length * ctas.length;
  const canUpload = hooks.length > 0 && bodies.length > 0 && ctas.length > 0;
  const allPreProcessed = hooksPreProcessed && bodiesPreProcessed && ctasPreProcessed;
  const canGenerate = allPreProcessed && totalCombinations > 0;

  // Check if any video exceeds 1 minute
  const hasLongVideos = [...hooks, ...bodies, ...ctas].some(f => f.duration !== undefined && f.duration > 60);

  const handleSubmitVideos = () => {
    if (hasLongVideos) {
      toast.error('Alguns vídeos excedem 1 minuto de duração. Remova-os antes de prosseguir.');
      return;
    }
    setShowVideoGrid(true);
    preloadFFmpeg();
  };

  const handlePreProcessSection = useCallback(async (section: 'hooks' | 'bodies' | 'ctas') => {
    const files = section === 'hooks' ? hooks : section === 'bodies' ? bodies : ctas;
    const label = section === 'hooks' ? 'Ganchos' : section === 'bodies' ? 'Corpos' : 'CTAs';
    
    setPreProcessingSection(section);
    try {
      await preProcessFiles(files, settings.resolution, (msg, pct) => {
        setPhaseMessage(`${label}: ${msg} (${pct}%)`);
      });
      
      if (section === 'hooks') setHooksPreProcessed(true);
      if (section === 'bodies') setBodiesPreProcessed(true);
      if (section === 'ctas') setCtasPreProcessed(true);
      
      toast.success(`${label} pré-processados com sucesso!`);
    } catch (err) {
      toast.error(`Erro ao pré-processar ${label}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    } finally {
      setPreProcessingSection(null);
      setPhaseMessage(null);
    }
  }, [hooks, bodies, ctas, settings.resolution]);

  const handlePositionChange = (section: 'hooks' | 'bodies' | 'ctas', index: number, position: number) => {
    const setter = section === 'hooks' ? setHooks : section === 'bodies' ? setBodies : setCtas;
    const files = section === 'hooks' ? hooks : section === 'bodies' ? bodies : ctas;
    const updated = [...files];
    updated[index] = { ...updated[index], position };
    setter(updated);
  };

  const handleProcess = useCallback(async () => {
    if (!canGenerate) return;

    const combos = generateCombinations(hooks, bodies, ctas);
    setCombinations(combos);
    setIsProcessing(true);
    setPhaseMessage('Iniciando geração…');

    const controller = new AbortController();
    abortRef.current = controller;

    // Skip pre-processing in processQueue since it's already done
    const settingsForQueue = { ...settings, preProcess: true };

    await processQueue(
      combos,
      settingsForQueue,
      (updated) => setCombinations([...updated]),
      (p) => setCurrentProgress(p),
      controller.signal,
      (phase) => setPhaseMessage(phase)
    );

    setIsProcessing(false);
    setPhaseMessage(null);
    abortRef.current = null;

    if (!controller.signal.aborted) {
      const doneCount = combos.filter(c => c.status === 'done').length;
      const errorCount = combos.filter(c => c.status === 'error').length;
      if (errorCount > 0) {
        toast.error(`Processamento concluído com ${errorCount} erro(s). ${doneCount} vídeo(s) gerado(s).`);
      } else {
        toast.success(`Todos os ${doneCount} vídeos foram gerados com sucesso!`);
      }
    } else {
      toast.info('Processamento cancelado.');
    }
  }, [canGenerate, hooks, bodies, ctas, settings]);

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleDownload = (combo: Combination) => {
    if (!combo.outputUrl) return;
    const a = document.createElement('a');
    a.href = combo.outputUrl;
    a.download = combo.outputName;
    a.click();
  };

  const handleDownloadAll = () => {
    combinations
      .filter((c) => c.status === 'done' && c.outputUrl)
      .forEach((c) => handleDownload(c));
  };

  // Reset pre-processing state when files change
  const handleHooksChange = (f: VideoFile[]) => {
    setHooks(f);
    setHooksPreProcessed(false);
    setShowVideoGrid(false);
    if (f.length > 0) preloadFFmpeg();
  };
  const handleBodiesChange = (f: VideoFile[]) => {
    setBodies(f);
    setBodiesPreProcessed(false);
    setShowVideoGrid(false);
    if (f.length > 0) preloadFFmpeg();
  };
  const handleCtasChange = (f: VideoFile[]) => {
    setCtas(f);
    setCtasPreProcessed(false);
    setShowVideoGrid(false);
    if (f.length > 0) preloadFFmpeg();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-primary uppercase">
                Escala de Criativo
              </h1>
              <p className="text-xs text-muted-foreground">
                Feito para escalar seus criativos de vídeo
              </p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 rounded-full border-border">
              <Home className="w-4 h-4" /> Home
            </Button>
            <Button variant="outline" size="sm" className="gap-2 rounded-full border-border" onClick={() => navigate('/subtitles')}>
              <Type className="w-4 h-4" /> Legendas IA ✨
            </Button>
            <Button variant="outline" size="sm" className="gap-2 rounded-full border-border">
              <Download className="w-4 h-4" /> Meus Downloads
            </Button>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => signOut()}>
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Hero text */}
        <div className="text-center space-y-2">
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Otimize sua produção de criativos em vídeo. Faça upload das peças e gere todas as
            combinações possíveis automaticamente.
          </p>
        </div>

        {/* Plan card */}
        <div className="max-w-2xl mx-auto rounded-2xl border border-border bg-card p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-primary/20 rounded-xl p-3">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground">Créditos Ilimitados</p>
              <p className="text-xs text-primary">● Acesso Total</p>
            </div>
          </div>
          <span className="text-xs border border-primary/40 text-primary rounded-full px-3 py-1">
            ● Acesso completo ao app
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="bg-primary/10 rounded-lg p-2.5">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalCombinations}</p>
              <p className="text-sm text-muted-foreground">Vídeos a gerar</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="bg-accent/10 rounded-lg p-2.5">
              <Zap className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {hooks.length + bodies.length + ctas.length}
              </p>
              <p className="text-sm text-muted-foreground">Vídeos enviados</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="bg-primary/10 rounded-lg p-2.5">
              <Clapperboard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {combinations.filter((c) => c.status === 'done').length}
              </p>
              <p className="text-sm text-muted-foreground">Processados</p>
            </div>
          </div>
        </div>

        {/* Upload zones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <VideoUploadZone
            label="Ganchos"
            description="Até 10 vídeos de abertura (máx. 1 min)"
            maxFiles={10}
            files={hooks}
            onFilesChange={handleHooksChange}
            accentColor="bg-primary"
          />
          <VideoUploadZone
            label="Corpo"
            description="Até 5 vídeos de conteúdo (máx. 1 min)"
            maxFiles={5}
            files={bodies}
            onFilesChange={handleBodiesChange}
            accentColor="bg-accent"
          />
          <VideoUploadZone
            label="CTA"
            description="Até 2 vídeos de chamada (máx. 1 min)"
            maxFiles={2}
            files={ctas}
            onFilesChange={handleCtasChange}
            accentColor="bg-destructive"
          />
        </div>

        {/* Submit videos button */}
        {canUpload && !showVideoGrid && (
          <div className="flex justify-center">
            <Button
              size="lg"
              className="px-12 text-base font-semibold bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 rounded-full"
              onClick={handleSubmitVideos}
              disabled={hasLongVideos}
            >
              <Upload className="w-5 h-5 mr-2" />
              Enviar Vídeos para Processamento
            </Button>
          </div>
        )}

        {hasLongVideos && (
          <p className="text-center text-sm text-destructive font-semibold">
            ⚠️ Alguns vídeos excedem 1 minuto. Remova-os para continuar.
          </p>
        )}

        {/* Video Grid with per-section pre-processing */}
        {showVideoGrid && (
          <div className="space-y-8 rounded-xl border border-border bg-card p-6">
            {/* Phase message */}
            {phaseMessage && !isProcessing && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary font-medium text-center">
                {phaseMessage}
              </div>
            )}

            {/* Ganchos Grid */}
            <VideoGrid
              label="Ganchos"
              files={hooks}
              onPositionChange={(i, pos) => handlePositionChange('hooks', i, pos)}
              onPreProcess={() => handlePreProcessSection('hooks')}
              isPreProcessing={preProcessingSection === 'hooks'}
              isPreProcessed={hooksPreProcessed}
              accentColor="bg-primary"
            />

            {/* Corpos Grid */}
            <VideoGrid
              label="Corpos"
              files={bodies}
              onPositionChange={(i, pos) => handlePositionChange('bodies', i, pos)}
              onPreProcess={() => handlePreProcessSection('bodies')}
              isPreProcessing={preProcessingSection === 'bodies'}
              isPreProcessed={bodiesPreProcessed}
              accentColor="bg-accent"
            />

            {/* CTAs Grid */}
            <VideoGrid
              label="CTAs"
              files={ctas}
              onPositionChange={(i, pos) => handlePositionChange('ctas', i, pos)}
              onPreProcess={() => handlePreProcessSection('ctas')}
              isPreProcessing={preProcessingSection === 'ctas'}
              isPreProcessed={ctasPreProcessed}
              accentColor="bg-destructive"
            />
          </div>
        )}

        {/* Processing Settings */}
        {showVideoGrid && (
          <ProcessingSettingsPanel
            settings={settings}
            onChange={setSettings}
            disabled={isProcessing}
          />
        )}

        {/* Generate / Cancel buttons */}
        {showVideoGrid && (
          <div className="flex justify-center gap-3">
            <Button
              size="lg"
              className="px-12 text-base font-semibold bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 rounded-full"
              disabled={!canGenerate || isProcessing}
              onClick={handleProcess}
            >
              {isProcessing ? (
                <>Processando...</>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2" />
                  Gerar {totalCombinations} Vídeos
                </>
              )}
            </Button>
            {isProcessing && (
              <Button
                size="lg"
                variant="destructive"
                className="rounded-full"
                onClick={handleCancel}
              >
                <Square className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
            )}
            {!allPreProcessed && showVideoGrid && (
              <p className="text-sm text-muted-foreground self-center">
                Pré-processe todas as seções para habilitar
              </p>
            )}
          </div>
        )}

        {/* Funcionalidades extras */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => setShowExtras((v) => !v)}
            className="bg-gradient-to-r from-primary/30 to-accent/30 border border-primary/20 rounded-full px-6 py-3 flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm uppercase tracking-wide">Funcionalidades extras</span>
            <span className="bg-destructive text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-full">NOVO</span>
          </button>

          {showExtras && (
            <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <h3 className="text-lg font-bold text-foreground text-center">Funcionalidades Extras</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Type className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Editor de Legendas com IA</p>
                    <p className="text-sm text-muted-foreground">Geração automática de legendas usando IA, com personalização de estilo e formato.</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => navigate('/subtitles')}>Acessar</Button>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Clapperboard className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Dashboard de Resultados</p>
                    <p className="text-sm text-muted-foreground">Painel com métricas, gráficos e análise de ROI dos criativos.</p>
                  </div>
                  <span className="text-xs text-muted-foreground border border-border rounded-full px-3 py-1 shrink-0">Em breve</span>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Zap className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Andromeda META ADS</p>
                    <p className="text-sm text-muted-foreground">Integração com Meta Ads para upload e gestão de criativos publicitários.</p>
                  </div>
                  <span className="text-xs text-muted-foreground border border-border rounded-full px-3 py-1 shrink-0">Em breve</span>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Results */}
        {combinations.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6">
            <CombinationList
              combinations={combinations}
              currentProgress={currentProgress}
              onDownload={handleDownload}
              onDownloadAll={handleDownloadAll}
              isProcessing={isProcessing}
              phaseMessage={phaseMessage}
            />
          </div>
        )}

        {/* Info footer */}
        <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-2 text-center">
          <p className="text-sm text-muted-foreground">
            <strong>Legendas automáticas:</strong> Para gerar legendas sincronizadas, ative o Lovable Cloud
            para utilizar transcrição por IA.
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Processamento no servidor:</strong> Para produções com muitos vídeos, considere migrar
            para processamento em nuvem com FFmpeg nativo para maior velocidade.
          </p>
        </div>

        {/* CTA banner */}
        <div className="flex justify-center pb-8">
          <Button className="bg-gradient-to-r from-primary via-accent to-primary text-primary-foreground font-bold text-sm px-10 py-6 rounded-full hover:opacity-90 uppercase tracking-wide">
            🔥 Indique e ganhe 40% de comissão $$
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Index;
