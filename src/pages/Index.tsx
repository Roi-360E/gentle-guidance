import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProcessing } from '@/hooks/useProcessing';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { VideoUploadZone, type VideoFileWithProgress } from '@/components/VideoUploadZone';
import { CombinationList } from '@/components/CombinationList';
import { ProcessingSettingsPanel } from '@/components/ProcessingSettings';
import {
  defaultSettings,
  getFFmpeg,
  terminateFFmpeg,
  preProcessInputCached,
  preProcessBatch,
  type Combination,
  type ProcessingSettings,
  type VideoFormat,
} from '@/lib/video-processor';
import { cloudPreprocessFiles } from '@/lib/cloud-preprocess';
import type { FFmpeg } from '@ffmpeg/ffmpeg';

import { calculateTokenCost, hasEnoughTokens, TOKEN_PLANS } from '@/lib/token-calculator';
import { Sparkles, Zap, Square, Clapperboard, Home, Download, HelpCircle, LogOut, Type, Loader2, Smartphone, Monitor, LayoutGrid, Coins, Menu, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { TestimonialUploadDialog } from '@/components/TestimonialUploadDialog';

const Index = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { isProcessing, currentProgress, processingPhase, combinations, startProcessing, cancelProcessing, setCombinations } = useProcessing();
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [videoCount, setVideoCount] = useState(0);
  const [isFirstMonth, setIsFirstMonth] = useState(true);
  const [hooks, setHooks] = useState<VideoFileWithProgress[]>([]);
  const [bodies, setBodies] = useState<VideoFileWithProgress[]>([]);
  const [ctas, setCtas] = useState<VideoFileWithProgress[]>([]);
  const [settings, setSettings] = useState<ProcessingSettings>(defaultSettings);
  const [showExtras, setShowExtras] = useState(false);
  const [showTestimonialDialog, setShowTestimonialDialog] = useState(false);
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('9:16');
  const [tokenBalance, setTokenBalance] = useState<number>(50);
  const [preprocessingSection, setPreprocessingSection] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hooksPreprocessed, setHooksPreprocessed] = useState(false);
  const [bodiesPreprocessed, setBodiesPreprocessed] = useState(false);
  const [ctasPreprocessed, setCtasPreprocessed] = useState(false);
  const [hooksStarted, setHooksStarted] = useState(false);
  const [bodiesStarted, setBodiesStarted] = useState(false);
  const [ctasStarted, setCtasStarted] = useState(false);

  // Load user plan data and profile name
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
        setTokenBalance((data as any).token_balance ?? 50);
      }
      // Check for active testimonial access (skip for admin to allow plan testing)
      if (user.email !== 'matheuslaurindo900@gmail.com') {
        const { data: testimonial } = await supabase
          .from('testimonial_submissions')
          .select('expires_at')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        if (testimonial && new Date(testimonial.expires_at) > new Date()) {
          setCurrentPlan('enterprise');
          if (data && data.plan !== 'enterprise') {
            await supabase
              .from('video_usage')
              .update({ plan: 'enterprise' })
              .eq('user_id', user.id)
              .eq('month_year', monthYear);
          }
        }
      }
      // Load profile name and check if first month
      const { data: profile } = await supabase
        .from('profiles')
        .select('created_at, name')
        .eq('user_id', user.id)
        .single();
      if (profile) {
        setUserName(profile.name || user.email?.split('@')[0] || 'Usuário');
        const createdAt = new Date(profile.created_at);
        const now = new Date();
        const monthsDiff = (now.getFullYear() - createdAt.getFullYear()) * 12 + now.getMonth() - createdAt.getMonth();
        setIsFirstMonth(monthsDiff === 0);
      } else {
        setUserName(user.email?.split('@')[0] || 'Usuário');
      }
    };
    loadUsage();
  }, [user]);

  // Note: blob URL cleanup is handled by the ProcessingProvider

  // Reset preprocessing state when files change
  useEffect(() => {
    setHooksPreprocessed(false);
    setHooksStarted(false);
  }, [hooks.length]);
  useEffect(() => {
    setBodiesPreprocessed(false);
    setBodiesStarted(false);
  }, [bodies.length]);
  useEffect(() => {
    setCtasPreprocessed(false);
    setCtasStarted(false);
  }, [ctas.length]);

  // Eagerly pre-load FFmpeg on first file upload (so it's ready when user clicks preprocess)
  useEffect(() => {
    const totalFiles = hooks.length + bodies.length + ctas.length;
    if (totalFiles > 0 && !settings.useCloud) {
      getFFmpeg().then(() => {
        console.log('[Index] 🔥 FFmpeg eagerly pre-loaded for fast preprocessing');
      }).catch(() => {});
    }
  }, [hooks.length > 0 || bodies.length > 0 || ctas.length > 0, settings.useCloud]);

  // Sync videoFormat into settings
  useEffect(() => {
    setSettings(prev => ({ ...prev, videoFormat }));
  }, [videoFormat]);

  const totalCombinations = hooks.length * bodies.length * ctas.length;
  const canProcess = hooks.length > 0 && bodies.length > 0 && ctas.length > 0;
  const preprocessingDone = hooksPreprocessed && bodiesPreprocessed && ctasPreprocessed;

  // Pre-process a single section using optimized batch processing
  const handlePreprocessSection = useCallback(async (
    sectionLabel: string,
    files: VideoFileWithProgress[],
    setter: React.Dispatch<React.SetStateAction<VideoFileWithProgress[]>>,
    setDone: React.Dispatch<React.SetStateAction<boolean>>,
    setStarted: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (files.length === 0) return;
    setStarted(true);
    setPreprocessingSection(sectionLabel);

    const sectionStart = performance.now();

    try {
      // ─── Cloud pre-processing (server-side, much faster) ───
      if (settings.useCloud) {
        console.log(`[Preprocess] ☁️ Using cloud pre-processing for ${sectionLabel}`);
        
        setter(prev => prev.map(f => ({ ...f, preprocessStatus: 'processing' as const, preprocessProgress: 10 })));

        const rawFiles = files.map(f => f.file);
        const results = await cloudPreprocessFiles(rawFiles, settings, (fileIndex, status, pct) => {
          setter(prev => {
            const updated = [...prev];
            const progressMap = { uploading: 10 + pct * 0.3, processing: 40 + pct * 0.4, downloading: 80 + pct * 0.15, done: 100 };
            const progress = Math.round(progressMap[status] ?? pct);
            updated[fileIndex] = { ...updated[fileIndex], preprocessProgress: progress };
            if (status === 'done') {
              updated[fileIndex] = { ...updated[fileIndex], preprocessStatus: 'done', preprocessProgress: 100 };
            }
            return updated;
          });
        });

        setter(prev => {
          const updated = [...prev];
          for (const result of results) {
            const idx = updated.findIndex(f => f.file === result.originalFile);
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                file: result.normalizedFile,
                preprocessStatus: 'done',
                preprocessProgress: 100,
              };
            }
          }
          return updated;
        });

        setDone(true);
        const elapsed = ((performance.now() - sectionStart) / 1000).toFixed(1);
        toast.success(`${sectionLabel}: normalização na nuvem concluída em ${elapsed}s! ⚡`);
        return;
      }

      // ─── Local: optimized batch preprocessing (parallel I/O + sequential FFmpeg) ───
      // Mark all files as processing immediately
      setter(prev => prev.map(f => ({ ...f, preprocessStatus: 'processing' as const, preprocessProgress: 5 })));

      const rawFiles = files.map(f => f.file);
      await preProcessBatch(rawFiles, sectionLabel, settings, (fileIndex, status, pct) => {
        setter(prev => {
          const updated = [...prev];
          if (status === 'done') {
            updated[fileIndex] = { ...updated[fileIndex], preprocessStatus: 'done', preprocessProgress: 100 };
          } else {
            updated[fileIndex] = { ...updated[fileIndex], preprocessProgress: pct };
          }
          return updated;
        });
      });

      setDone(true);
      const elapsed = ((performance.now() - sectionStart) / 1000).toFixed(1);
      toast.success(`${sectionLabel}: ${files.length} vídeo(s) processados em ${elapsed}s! ✅`);
    } catch (err) {
      console.error('Preprocessing failed:', err);
      // Force completion even on error
      setter(prev => prev.map(f => ({ ...f, preprocessStatus: 'done' as const, preprocessProgress: 100 })));
      setDone(true);
      toast.warning(`${sectionLabel}: processamento concluído com avisos.`);
    } finally {
      setPreprocessingSection(null);
    }
  }, [settings]);

  const handleProcess = useCallback(() => {
    if (!canProcess || !user) return;

    const cost = calculateTokenCost(totalCombinations, settings);
    if (!hasEnoughTokens(currentPlan, tokenBalance, cost.total)) {
      toast.error(`Tokens insuficientes! Custo: ${cost.total} tokens, saldo: ${tokenBalance}. Faça upgrade ou reduza as combinações.`);
      navigate('/plans');
      return;
    }

    startProcessing({
      hooks, bodies, ctas, settings, currentPlan, tokenBalance, videoCount,
      userId: user.id,
      onTokenUpdate: (newBalance, newCount) => {
        setTokenBalance(newBalance);
        setVideoCount(newCount);
      },
    });
  }, [canProcess, hooks, bodies, ctas, settings, currentPlan, tokenBalance, videoCount, totalCombinations, navigate, user, startProcessing]);

  const handleCancel = () => {
    cancelProcessing();
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
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
            <div>
              <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-primary uppercase">
                EscalaX
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                Feito para escalar seus criativos de vídeo
              </p>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 rounded-full border-border">
              <Home className="w-4 h-4" /> Home
            </Button>
            <Button variant="outline" size="sm" className="gap-2 rounded-full border-border" onClick={() => navigate('/plans')}>
              <Zap className="w-4 h-4" /> Planos
            </Button>
            <Button variant="outline" size="sm" className="gap-2 rounded-full border-border" onClick={() => navigate('/downloads')}>
              <Download className="w-4 h-4" /> Meus Downloads
              {isProcessing && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
            </Button>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => signOut()}>
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          </nav>

          {/* Mobile hamburger */}
          <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 py-3 space-y-1 animate-in slide-in-from-top-2 duration-200">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => setMobileMenuOpen(false)}>
              <Home className="w-4 h-4" /> Home
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => { navigate('/plans'); setMobileMenuOpen(false); }}>
              <Zap className="w-4 h-4" /> Planos
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => { navigate('/downloads'); setMobileMenuOpen(false); }}>
              <Download className="w-4 h-4" /> Meus Downloads
              {isProcessing && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => { navigate('/subtitles'); setMobileMenuOpen(false); }}>
              <Type className="w-4 h-4" /> Legendas IA
            </Button>
            <div className="border-t border-border pt-1 mt-1">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-destructive" onClick={() => { signOut(); setMobileMenuOpen(false); }}>
                <LogOut className="w-4 h-4" /> Sair
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Welcome message */}
        {userName && (
          <div className="max-w-2xl mx-auto rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
            <div className="bg-primary/20 rounded-full p-2.5 sm:p-3 shrink-0">
              <span className="text-xl sm:text-2xl font-bold text-primary uppercase">
                {userName.charAt(0)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-foreground text-base sm:text-lg truncate">
                Olá, {userName}! 👋
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Bem-vindo(a) de volta ao EscalaX. Pronto(a) para escalar seus criativos?
              </p>
            </div>
          </div>
        )}

        {/* Hero text */}
        <div className="text-center space-y-2">
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Otimize sua produção de criativos em vídeo. Faça upload das peças e gere todas as
            combinações possíveis automaticamente.
          </p>
        </div>

        {/* Plan card */}
        <div className="max-w-2xl mx-auto rounded-2xl border border-border bg-card p-4 sm:p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="bg-primary/20 rounded-xl p-2.5 sm:p-3 shrink-0">
              <Coins className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground">
                {currentPlan === 'enterprise' ? 'Empresarial' : currentPlan === 'professional' ? 'Profissional' : 'Gratuito'}
              </p>
              <p className="text-xs text-muted-foreground">
                {currentPlan === 'enterprise' 
                  ? '● Tokens ilimitados'
                  : `● ${tokenBalance} tokens restantes`
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

        {/* Video Format Selector */}
        <div className="max-w-2xl mx-auto rounded-2xl border border-border bg-card p-5 space-y-3">
          <p className="font-bold text-foreground text-center">Formato do Vídeo</p>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: '9:16' as const, label: 'Vertical', sub: '9:16', icon: Smartphone },
              { value: '16:9' as const, label: 'Horizontal', sub: '16:9', icon: Monitor },
              { value: '1:1' as const, label: 'Feed', sub: '1:1', icon: LayoutGrid },
            ]).map((fmt) => {
              const isActive = videoFormat === fmt.value;
              const Icon = fmt.icon;
              return (
                <button
                  key={fmt.value}
                  onClick={() => setVideoFormat(fmt.value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-sm font-semibold">{fmt.label}</span>
                  <span className="text-xs opacity-70">{fmt.sub}</span>
                </button>
              );
            })}
          </div>
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
            isPreprocessing={preprocessingSection === 'Gancho'}
            preprocessStarted={hooksStarted}
            onPreprocess={() => handlePreprocessSection('Gancho', hooks, setHooks, setHooksPreprocessed, setHooksStarted)}
            preprocessLabel="Pré-processando ganchos..."
          />
          <VideoUploadZone
            label="Corpo"
            description="Até 5 vídeos de conteúdo"
            maxFiles={5}
            files={bodies}
            onFilesChange={setBodies}
            accentColor="bg-accent"
            isPreprocessing={preprocessingSection === 'Corpo'}
            preprocessStarted={bodiesStarted}
            onPreprocess={() => handlePreprocessSection('Corpo', bodies, setBodies, setBodiesPreprocessed, setBodiesStarted)}
            preprocessLabel="Pré-processando corpos..."
          />
          <VideoUploadZone
            label="CTA"
            description="Até 2 vídeos de chamada"
            maxFiles={2}
            files={ctas}
            onFilesChange={setCtas}
            accentColor="bg-primary"
            isPreprocessing={preprocessingSection === 'CTA'}
            preprocessStarted={ctasStarted}
            onPreprocess={() => handlePreprocessSection('CTA', ctas, setCtas, setCtasPreprocessed, setCtasStarted)}
            preprocessLabel="Pré-processando CTAs..."
          />
        </div>

        {/* Generate section - always visible when files exist */}
        {canProcess && (
          <div className="max-w-md mx-auto space-y-5">
            {/* Total card */}
            <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Total de Criativos que serão gerados:</p>
              <p className="text-5xl font-extrabold text-primary">{totalCombinations}</p>
              <p className="text-sm text-muted-foreground">
                {hooks.length} gancho(s) × {bodies.length} corpo(s) × {ctas.length} CTA(s)
              </p>
              {(() => {
                const cost = calculateTokenCost(totalCombinations, settings);
                const enough = hasEnoughTokens(currentPlan, tokenBalance, cost.total);
                return (
                  <div className={`flex items-center justify-center gap-2 text-xs pt-1 ${enough ? 'text-muted-foreground' : 'text-destructive'}`}>
                    <Coins className="w-3.5 h-3.5" />
                    <span>
                      Custo: {cost.total} tokens
                      {currentPlan !== 'enterprise' && ` · Saldo: ${tokenBalance}`}
                      {!enough && ' · Insuficiente!'}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Processing Settings */}
            {preprocessingDone && (
              <ProcessingSettingsPanel
                settings={settings}
                onChange={setSettings}
                disabled={isProcessing}
              />
            )}

            {/* Generate / Cancel buttons */}
            <div className="flex flex-col items-center gap-3">
              <Button
                size="lg"
                className="w-full px-12 py-6 text-base font-bold bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 rounded-xl gap-2 disabled:opacity-40"
                disabled={!preprocessingDone || isProcessing}
                onClick={handleProcess}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Clapperboard className="w-5 h-5" />
                    Gerar Criativos
                  </>
                )}
              </Button>
              {!preprocessingDone && canProcess && (
                <p className="text-xs text-muted-foreground text-center">
                  Pré-processe todas as seções acima para habilitar a geração
                </p>
              )}
              {isProcessing && (
                <Button
                  size="lg"
                  variant="destructive"
                  className="rounded-xl w-full"
                  onClick={handleCancel}
                >
                  <Square className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Immediate processing phase indicator */}
        {isProcessing && combinations.length > 0 && !combinations.some(c => c.status === 'processing') && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="font-medium text-primary">{processingPhase || 'Preparando...'}</span>
            </div>
            <Progress value={undefined} className="h-2 animate-pulse" />
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
            <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-4 sm:p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <h3 className="text-lg font-bold text-foreground text-center">Funcionalidades Extras</h3>
              <ul className="space-y-3">
                <li className="flex flex-col sm:flex-row items-start gap-2 sm:gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-start gap-2 sm:gap-3 w-full">
                    <Type className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground text-sm">Editor de Legendas com IA</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Geração automática de legendas usando IA, com personalização de estilo e formato.</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 rounded-full w-full sm:w-auto" onClick={() => navigate('/subtitles')}>Acessar</Button>
                </li>
                <li className="flex flex-col sm:flex-row items-start gap-2 sm:gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-start gap-2 sm:gap-3 w-full">
                    <Clapperboard className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground text-sm">Dashboard de Resultados</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Painel com métricas, gráficos e análise de ROI dos criativos.</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground border border-border rounded-full px-3 py-1 shrink-0 self-start sm:self-auto">Em breve</span>
                </li>
                <li className="flex flex-col sm:flex-row items-start gap-2 sm:gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-start gap-2 sm:gap-3 w-full">
                    <Zap className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground text-sm">Andromeda META ADS</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Integração com Meta Ads para upload e gestão de criativos publicitários.</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground border border-border rounded-full px-3 py-1 shrink-0 self-start sm:self-auto">Em breve</span>
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
            <li className="flex items-start gap-2"><span className="text-primary font-bold">2.</span> Clique no botão abaixo e envie seu vídeo</li>
            <li className="flex items-start gap-2"><span className="text-primary font-bold">3.</span> Seus 6 meses serão ativados automaticamente!</li>
          </ul>
          <Button
            onClick={async () => {
              if (!user) {
                toast.error('Faça login para participar da oferta!');
                return;
              }
              const { data: existing } = await supabase
                .from('testimonial_submissions')
                .select('id, expires_at')
                .eq('user_id', user.id)
                .maybeSingle();
              if (existing) {
                toast.info(`Você já participou! Acesso gratuito até ${new Date(existing.expires_at).toLocaleDateString('pt-BR')}`);
                return;
              }
              setShowTestimonialDialog(true);
            }}
            className="mt-2 px-6 py-3 text-sm font-bold bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-full hover:opacity-90 uppercase tracking-wide"
          >
            🎬 Enviar feedback e ganhar 6 meses grátis!
          </Button>
        </div>

        {user && (
          <TestimonialUploadDialog
            open={showTestimonialDialog}
            onOpenChange={setShowTestimonialDialog}
            userId={user.id}
            onSuccess={() => setCurrentPlan('enterprise')}
          />
        )}

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
