import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { VideoUploadZone } from '@/components/VideoUploadZone';
import { CombinationList } from '@/components/CombinationList';
import { ProcessingSettingsPanel } from '@/components/ProcessingSettings';
import {
  generateCombinations,
  processQueue,
  defaultSettings,
  type VideoFile,
  type Combination,
  type ProcessingSettings,
} from '@/lib/video-processor';
import { Sparkles, Zap, Square, Clapperboard, Home, Download, HelpCircle, LogOut, Type } from 'lucide-react';
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
  const [settings, setSettings] = useState<ProcessingSettings>(defaultSettings);
  const abortRef = useRef<AbortController | null>(null);
  const [showExtras, setShowExtras] = useState(false);

  const totalCombinations = hooks.length * bodies.length * ctas.length;
  const canProcess = hooks.length > 0 && bodies.length > 0 && ctas.length > 0;

  const handleProcess = useCallback(async () => {
    if (!canProcess) return;

    const combos = generateCombinations(hooks, bodies, ctas);
    setCombinations(combos);
    setIsProcessing(true);

    const controller = new AbortController();
    abortRef.current = controller;

    await processQueue(
      combos,
      settings,
      (updated) => setCombinations([...updated]),
      (p) => setCurrentProgress(p),
      controller.signal
    );

    setIsProcessing(false);
    abortRef.current = null;

    if (!controller.signal.aborted) {
      toast.success('Processamento concluído!');
    } else {
      toast.info('Processamento cancelado.');
    }
  }, [canProcess, hooks, bodies, ctas, settings]);

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
            description="Até 10 vídeos de abertura"
            maxFiles={10}
            files={hooks}
            onFilesChange={setHooks}
            accentColor="bg-primary"
          />
          <VideoUploadZone
            label="Corpo"
            description="Até 5 vídeos de conteúdo"
            maxFiles={5}
            files={bodies}
            onFilesChange={setBodies}
            accentColor="bg-accent"
          />
          <VideoUploadZone
            label="CTA"
            description="Até 2 vídeos de chamada"
            maxFiles={2}
            files={ctas}
            onFilesChange={setCtas}
            accentColor="bg-destructive"
          />
        </div>

        {/* Processing Settings */}
        <ProcessingSettingsPanel
          settings={settings}
          onChange={setSettings}
          disabled={isProcessing}
        />

        {/* Process / Cancel buttons */}
        <div className="flex justify-center gap-3">
          <Button
            size="lg"
            className="px-12 text-base font-semibold bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 rounded-full"
            disabled={!canProcess || isProcessing}
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
        </div>

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
