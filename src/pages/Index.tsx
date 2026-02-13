import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { VideoUploadZone } from '@/components/VideoUploadZone';
import { CombinationList } from '@/components/CombinationList';
import { ProcessingSettingsPanel } from '@/components/ProcessingSettings';
import {
  generateCombinations,
  processQueue,
  defaultSettings,
  revokeBlobUrls,
  type VideoFile,
  type Combination,
  type ProcessingSettings,
} from '@/lib/video-processor';
import { processQueueCloud } from '@/lib/cloud-processor';
import { Sparkles, Zap, Square, Clapperboard, Home, Download, HelpCircle, LogOut, Type } from 'lucide-react';
import { toast } from 'sonner';

const Index = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [videoCount, setVideoCount] = useState(0);
  const [isFirstMonth, setIsFirstMonth] = useState(true);
  const [hooks, setHooks] = useState<VideoFile[]>([]);
  const [bodies, setBodies] = useState<VideoFile[]>([]);
  const [ctas, setCtas] = useState<VideoFile[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [settings, setSettings] = useState<ProcessingSettings>(defaultSettings);
  const abortRef = useRef<AbortController | null>(null);
  const [showExtras, setShowExtras] = useState(false);

  // Load user plan data
  useEffect(() => {
    if (!user) return;
    const loadUsage = async () => {
      const monthYear = new Date().toISOString().substring(0, 7);
      const { data } = await supabase
        .from('video_usage')
        .select('*')
        .eq('user_id', user.id)
        .eq('month_year', monthYear)
        .single();
      if (data) {
        setCurrentPlan(data.plan);
        setVideoCount(data.video_count);
      }
      // Check if first month by comparing account creation
      const { data: profile } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('user_id', user.id)
        .single();
      if (profile) {
        const createdAt = new Date(profile.created_at);
        const now = new Date();
        const monthsDiff = (now.getFullYear() - createdAt.getFullYear()) * 12 + now.getMonth() - createdAt.getMonth();
        setIsFirstMonth(monthsDiff === 0);
      }
    };
    loadUsage();
  }, [user]);

  // Revoke blob URLs when combinations change or on unmount to prevent memory leaks
  const prevCombosRef = useRef<Combination[]>([]);
  useEffect(() => {
    return () => {
      revokeBlobUrls(prevCombosRef.current);
    };
  }, []);

  const totalCombinations = hooks.length * bodies.length * ctas.length;
  const canProcess = hooks.length > 0 && bodies.length > 0 && ctas.length > 0;

  const handleProcess = useCallback(async () => {
    if (!canProcess) return;

    // Check usage limits
    if (currentPlan === 'free' && !isFirstMonth) {
      toast.error('Seu período gratuito expirou. Faça upgrade para continuar.');
      navigate('/plans');
      return;
    }
    if (currentPlan !== 'enterprise') {
      const remaining = 100 - videoCount;
      if (totalCombinations > remaining) {
        toast.error(`Você tem apenas ${remaining} vídeos restantes. Reduza as combinações ou faça upgrade.`);
        return;
      }
    }

    // Revoke old blob URLs before starting new batch
    revokeBlobUrls(combinations);

    const combos = generateCombinations(hooks, bodies, ctas);
    setCombinations(combos);
    prevCombosRef.current = combos;
    setIsProcessing(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const processFn = settings.useCloud ? processQueueCloud : processQueue;

    try {
      await processFn(
        combos,
        settings,
        (updated) => setCombinations([...updated]),
        (p) => setCurrentProgress(p),
        controller.signal
      );
    } catch (err) {
      console.group('%c❌ ERRO GERAL NO PROCESSAMENTO', 'color: #ef4444; font-weight: bold; font-size: 14px;');
      console.error('Tipo:', settings.useCloud ? 'Cloud' : 'Local');
      console.error('Mensagem:', err instanceof Error ? err.message : String(err));
      console.error('Stack:', err instanceof Error ? err.stack : 'N/A');
      console.error('Total combinações:', combos.length);
      console.error('Concluídos:', combos.filter(c => c.status === 'done').length);
      console.error('Com erro:', combos.filter(c => c.status === 'error').length);
      console.groupEnd();
    }

    // Only update state if this controller is still active (not replaced by a new run)
    if (abortRef.current === controller) {
      setIsProcessing(false);
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
    }
  }, [canProcess, hooks, bodies, ctas, settings, combinations, currentPlan, isFirstMonth, videoCount, totalCombinations, navigate]);

  const handleCancel = () => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    setIsProcessing(false);
    setCurrentProgress(0);
    toast.info('Cancelamento solicitado...');
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
                EscalaX
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
              <p className="font-bold text-foreground">
                {currentPlan === 'enterprise' ? 'Empresarial' : currentPlan === 'professional' ? 'Profissional' : 'Gratuito'}
              </p>
              <p className="text-xs text-muted-foreground">
                {currentPlan === 'enterprise' 
                  ? `● Vídeos ilimitados (${videoCount} usados)`
                  : currentPlan === 'free' && !isFirstMonth
                    ? '● Período gratuito expirado'
                    : `● ${videoCount}/100 vídeos usados`
                }
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-primary/40 text-primary"
            onClick={() => navigate('/plans')}
          >
            {currentPlan === 'free' ? 'Fazer Upgrade' : 'Gerenciar Plano'}
          </Button>
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

        {/* Feedback offer banner */}
        <div className="max-w-2xl mx-auto rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-accent/5 to-primary/10 p-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-primary/10 rounded-full px-4 py-1.5 mx-auto">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-wide">Oferta Exclusiva</span>
          </div>
          <h3 className="text-xl font-extrabold text-foreground">
            🎁 Ganhe 6 meses de acesso gratuito e ilimitado!
          </h3>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Compartilhe sua experiência com o EscalaX enviando um vídeo depoimento e desbloqueie <strong className="text-foreground">6 meses de acesso gratuito</strong> a todas as funcionalidades do aplicativo!
          </p>
          <ul className="text-left text-sm text-muted-foreground max-w-md mx-auto space-y-2">
            <li className="flex items-start gap-2"><span className="text-primary font-bold">1.</span> Grave um vídeo curto contando como o EscalaX ajudou você</li>
            <li className="flex items-start gap-2"><span className="text-primary font-bold">2.</span> Envie pelo botão abaixo (upload via Google Drive)</li>
            <li className="flex items-start gap-2"><span className="text-primary font-bold">3.</span> Após aprovação, seus 6 meses serão ativados automaticamente</li>
          </ul>
          <a
            href="https://drive.google.com/drive/folders/YOUR_FOLDER_ID?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              className="mt-2 px-6 py-3 text-sm font-bold bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-full hover:opacity-90 uppercase tracking-wide"
            >
              🎬 Enviar feedback e ganhar 6 meses grátis!
            </Button>
          </a>
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
