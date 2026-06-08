import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  preProcessBatch,
  type Combination,
  type ProcessingSettings,
  type VideoFormat,
} from '@/lib/video-processor';

import { calculateTokenCost, hasEnoughTokens } from '@/lib/token-calculator';
import { Rocket, Zap, Square, Clapperboard, Home, Download, HelpCircle, LogOut, Type, Loader2, Smartphone, Monitor, LayoutGrid, Coins, Menu, X, Mic, Lock } from 'lucide-react';
import { ScriptChatFloat } from '@/components/ScriptChat';
import { FeatureUpsellDialog } from '@/components/FeatureUpsellDialog';
import { InstagramConnect } from '@/components/InstagramConnect';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { trackPixelEvent, trackCustomEvent } from '@/lib/pixel-tracker';
import { useUtmCapture } from '@/hooks/useUtmCapture';
import { NewUserWelcomePopup } from '@/components/NewUserWelcomePopup';
import { usePowerUserTracking } from '@/hooks/useAudienceEvents';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const Index = () => {
  const [activeStat, setActiveStat] = useState<'toGenerate' | 'sent' | 'processed' | null>(null);
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useUtmCapture(user?.id);

  // Fallback: if user returns from MercadoPago to root with ?payment=success
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      navigate('/obrigado', { replace: true });
    }
  }, [searchParams, navigate]);
  const { isProcessing, currentProgress, processingPhase, combinations, startProcessing, cancelProcessing, setCombinations } = useProcessing();
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [videoCount, setVideoCount] = useState(0);
  usePowerUserTracking(videoCount, user?.id);
  const [isFirstMonth, setIsFirstMonth] = useState(true);
  const [hooks, setHooks] = useState<VideoFileWithProgress[]>([]);
  const [bodies, setBodies] = useState<VideoFileWithProgress[]>([]);
  const [ctas, setCtas] = useState<VideoFileWithProgress[]>([]);
  const [settings, setSettings] = useState<ProcessingSettings>(defaultSettings);

  // Check admin role
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' })
      .then(({ data }) => setIsAdmin(data === true));
  }, [user]);


  const [videoFormat, setVideoFormat] = useState<VideoFormat>('9:16');
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [planName, setPlanName] = useState<string>('Gratuito');
  const [hasAiChat, setHasAiChat] = useState(false);
  const [hasAutoSubtitles, setHasAutoSubtitles] = useState(false);
  const [hasVoiceRewrite, setHasVoiceRewrite] = useState(false);
  const [hasShortsReels, setHasShortsReels] = useState(false);
  const [preprocessingSection, setPreprocessingSection] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hooksPreprocessed, setHooksPreprocessed] = useState(false);
  const [bodiesPreprocessed, setBodiesPreprocessed] = useState(false);
  const [ctasPreprocessed, setCtasPreprocessed] = useState(false);
  const [hooksStarted, setHooksStarted] = useState(false);
  const [bodiesStarted, setBodiesStarted] = useState(false);
  const [ctasStarted, setCtasStarted] = useState(false);
  const [upsellFeature, setUpsellFeature] = useState<{ key: 'has_ai_chat' | 'has_auto_subtitles' | 'has_voice_rewrite' | 'has_shorts_reels'; name: string } | null>(null);

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
        setTokenBalance((data as any).token_balance ?? 0);
      }
      // Load plan features from admin-configured plans
      const planKey = data?.plan || 'free';
      const { data: planData } = await supabase
        .from('subscription_plans')
        .select('name, has_ai_chat, has_auto_subtitles, has_voice_rewrite, has_shorts_reels')
        .eq('plan_key', planKey)
        .eq('is_active', true)
        .maybeSingle();
      if (planData) {
        setPlanName(planData.name);
        setHasAiChat((planData as any).has_ai_chat === true);
        setHasAutoSubtitles((planData as any).has_auto_subtitles === true);
        setHasVoiceRewrite((planData as any).has_voice_rewrite === true);
        setHasShortsReels((planData as any).has_shorts_reels === true);
      } else {
        setHasAiChat(false);
        setHasAutoSubtitles(false);
        setHasVoiceRewrite(false);
        setHasShortsReels(false);
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

  // Eagerly pre-load FFmpeg only when the user disabled turbo pre-processing.
  // Turbo mode uses the VPS fast path; loading WASM here competes for bandwidth/CPU.
  useEffect(() => {
    const totalFiles = hooks.length + bodies.length + ctas.length;
    if (totalFiles > 0 && !settings.preProcess) {
      getFFmpeg().then(() => {
        console.log('[Index] 🔥 FFmpeg eagerly pre-loaded for fast preprocessing');
      }).catch(() => {});
    }
  }, [hooks.length > 0 || bodies.length > 0 || ctas.length > 0, settings.preProcess]);

  useEffect(() => {
    if (settings.preProcess && settings.resolution !== 'original') {
      setSettings(prev => ({ ...prev, resolution: 'original' }));
    }
  }, [settings.preProcess, settings.resolution]);

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
      toast.success(t('dashboard.actions.preprocessSuccess', { section: sectionLabel, count: files.length, time: elapsed }));
    } catch (err) {
      console.error('Preprocessing failed:', err);
      // Force completion even on error
      setter(prev => prev.map(f => ({ ...f, preprocessStatus: 'done' as const, preprocessProgress: 100 })));
      setDone(true);
      toast.warning(t('dashboard.actions.preprocessWarning', { section: sectionLabel }));
    } finally {
      setPreprocessingSection(null);
    }
  }, [settings]);

  // Pré-processamento só acontece quando o usuário clica no botão de cada seção.

  const handleProcess = useCallback(() => {
    if (!canProcess || !user) return;

    const cost = calculateTokenCost(totalCombinations, settings);
    if (!hasEnoughTokens(currentPlan, tokenBalance, cost.total)) {
      toast.error(t('dashboard.actions.insufficientTokens', { cost: cost.total, balance: tokenBalance }));
      return;
    }

    // Track StartTrial on first processing
    trackCustomEvent('StartTrial', {
      content_name: 'Video Processing',
      combinations: totalCombinations,
      plan: currentPlan,
    }, user.id);

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
    <div className="min-h-screen bg-background pb-32">
      {/* Navbar principal */}
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4 px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <Rocket className="w-8 h-8 text-primary animate-pulse" />
            <div className="flex flex-col">
              <span className="text-xl font-black text-primary uppercase tracking-tighter leading-none">
                {t('auth.brand')}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-[0.2em]">
                Creative Engine
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <div className="hidden md:flex items-center gap-2 bg-muted/50 border border-border rounded-full px-3 py-1.5 shadow-sm">
              <Zap className="w-4 h-4 text-primary fill-primary" />
              <div className="flex flex-col items-start mr-2">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">{t('dashboard.header.currentBalance')}</span>
                <span className="text-sm font-black text-foreground leading-none">{tokenBalance} {t('dashboard.header.tokens')}</span>
              </div>
              <Button 
                variant="default" 
                size="sm" 
                className="h-7 rounded-full text-[10px] font-bold uppercase tracking-wider px-3"
                onClick={() => navigate('/planos')}
              >
                {t('dashboard.header.upgrade')}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </Button>

            <div className="hidden md:flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-primary/10 hover:text-primary transition-colors"
                onClick={() => navigate('/subtitles')}
              >
                <Type className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-primary/10 hover:text-primary transition-colors text-red-500 hover:text-red-400"
                onClick={() => signOut()}
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Menu mobile */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 z-40 bg-background border-b border-border p-4 animate-in slide-in-from-top duration-200">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-xl border border-border">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground uppercase font-bold">{t('dashboard.header.currentBalance')}</span>
                <span className="text-lg font-black text-foreground">{tokenBalance} {t('dashboard.header.tokens')}</span>
              </div>
              <Button onClick={() => navigate('/planos')} size="sm" className="rounded-full uppercase font-bold text-[10px]">
                {t('dashboard.header.upgrade')}
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate('/subtitles')}>
                <Type className="w-4 h-4" /> {t('dashboard.nav.subtitles')}
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate('/voice-rewrite')}>
                <Mic className="w-4 h-4" /> {t('dashboard.nav.voiceRewrite')}
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate('/shorts-reels')}>
                <Smartphone className="w-4 h-4" /> {t('dashboard.nav.shortsReels')}
              </Button>
              <Button variant="outline" className="justify-start gap-2 text-red-500 hover:text-red-400" onClick={() => signOut()}>
                <LogOut className="w-4 h-4" /> {t('dashboard.nav.logout')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="container max-w-7xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-2 border border-primary/20">
              <Zap className="w-3 h-3 fill-primary" />
              {planName} Plan
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tighter leading-tight">
              {t('dashboard.welcome.title', { name: userName })}
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              {t('dashboard.welcome.description')}
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button 
            variant={activeStat === 'toGenerate' ? 'default' : 'secondary'}
            className="h-28 flex flex-col items-center justify-center gap-1 rounded-2xl border border-border shadow-sm transition-all"
            onClick={() => setActiveStat(activeStat === 'toGenerate' ? null : 'toGenerate')}
          >
            <span className="text-4xl font-black">{totalCombinations}</span>
            <span className="text-xs font-bold uppercase tracking-widest opacity-70">{t('dashboard.stats.toGenerate')}</span>
          </Button>
          <Button 
            variant={activeStat === 'sent' ? 'default' : 'secondary'}
            className="h-28 flex flex-col items-center justify-center gap-1 rounded-2xl border border-border shadow-sm transition-all"
            onClick={() => setActiveStat(activeStat === 'sent' ? null : 'sent')}
          >
            <span className="text-4xl font-black">{hooks.length + bodies.length + ctas.length}</span>
            <span className="text-xs font-bold uppercase tracking-widest opacity-70">{t('dashboard.stats.sent')}</span>
          </Button>
          <Button 
            variant={activeStat === 'processed' ? 'default' : 'secondary'}
            className="h-28 flex flex-col items-center justify-center gap-1 rounded-2xl border border-border shadow-sm transition-all"
            onClick={() => setActiveStat(activeStat === 'processed' ? null : 'processed')}
          >
            <span className="text-4xl font-black">{combinations.filter(c => c.status === 'done').length}</span>
            <span className="text-xs font-bold uppercase tracking-widest opacity-70">{t('dashboard.stats.processed')}</span>
          </Button>
        </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className={`rounded-xl h-12 gap-2 border-primary/20 hover:bg-primary/5 transition-all ${videoFormat === '9:16' ? 'bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]' : ''}`}
              onClick={() => setVideoFormat('9:16')}
            >
              <Smartphone className="w-4 h-4" />
              <span className="font-bold">9:16</span>
            </Button>
            <Button
              variant="outline"
              className={`rounded-xl h-12 gap-2 border-primary/20 hover:bg-primary/5 transition-all ${videoFormat === '1:1' ? 'bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]' : ''}`}
              onClick={() => setVideoFormat('1:1')}
            >
              <Square className="w-4 h-4" />
              <span className="font-bold">1:1</span>
            </Button>
            <Button
              variant="outline"
              className={`rounded-xl h-12 gap-2 border-primary/20 hover:bg-primary/5 transition-all ${videoFormat === '16:9' ? 'bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]' : ''}`}
              onClick={() => setVideoFormat('16:9')}
            >
              <Monitor className="w-4 h-4" />
              <span className="font-bold">16:9</span>
            </Button>
          </div>
        </div>

        {/* Feature Grid Quick Access */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button 
            variant="secondary" 
            className="group h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border hover:border-primary/50 transition-all hover:bg-primary/5 relative overflow-hidden"
            onClick={() => navigate('/subtitles')}
          >
            {!hasAutoSubtitles && <Lock className="absolute top-2 right-2 w-3 h-3 text-muted-foreground/50" />}
            <Type className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-wider">{t('dashboard.features.subtitles')}</span>
          </Button>
          <Button 
            variant="secondary" 
            className="group h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border hover:border-primary/50 transition-all hover:bg-primary/5 relative overflow-hidden"
            onClick={() => {
              if (hasVoiceRewrite || isAdmin) navigate('/voice-rewrite');
              else setUpsellFeature({ key: 'has_voice_rewrite', name: t('dashboard.features.voiceRewrite') });
            }}
          >
            {(!hasVoiceRewrite && !isAdmin) && <Lock className="absolute top-2 right-2 w-3 h-3 text-muted-foreground/50" />}
            <Mic className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-wider">{t('dashboard.features.voiceRewrite')}</span>
          </Button>
          <Button 
            variant="secondary" 
            className="group h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border hover:border-primary/50 transition-all hover:bg-primary/5 relative overflow-hidden"
            onClick={() => {
              if (hasShortsReels || isAdmin) navigate('/shorts-reels');
              else setUpsellFeature({ key: 'has_shorts_reels', name: t('dashboard.features.shortsReels') });
            }}
          >
            {(!hasShortsReels && !isAdmin) && <Lock className="absolute top-2 right-2 w-3 h-3 text-muted-foreground/50" />}
            <Smartphone className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-wider">{t('dashboard.features.shortsReels')}</span>
          </Button>
          <Button 
            variant="secondary" 
            className="group h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border hover:border-primary/50 transition-all hover:bg-primary/5"
            onClick={() => navigate('/downloads')}
          >
            <Download className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-wider">{t('dashboard.features.library')}</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4">
          <div className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <VideoUploadZone
                label={t('dashboard.upload.hooks.label')}
                description={t('dashboard.upload.hooks.description')}
                maxFiles={10}
                files={hooks}
                onFilesChange={setHooks}
                accentColor="bg-blue-500"
                isPreprocessing={preprocessingSection === t('dashboard.upload.hooks.label')}
                preprocessStarted={hooksStarted}
                onPreprocess={() => handlePreprocessSection(t('dashboard.upload.hooks.label'), hooks, setHooks, setHooksPreprocessed, setHooksStarted)}
              />
              <VideoUploadZone
                label={t('dashboard.upload.bodies.label')}
                description={t('dashboard.upload.bodies.description')}
                maxFiles={10}
                files={bodies}
                onFilesChange={setBodies}
                accentColor="bg-purple-500"
                isPreprocessing={preprocessingSection === t('dashboard.upload.bodies.label')}
                preprocessStarted={bodiesStarted}
                onPreprocess={() => handlePreprocessSection(t('dashboard.upload.bodies.label'), bodies, setBodies, setBodiesPreprocessed, setBodiesStarted)}
              />
              <VideoUploadZone
                label={t('dashboard.upload.ctas.label')}
                description={t('dashboard.upload.ctas.description')}
                maxFiles={10}
                files={ctas}
                onFilesChange={setCtas}
                accentColor="bg-pink-500"
                isPreprocessing={preprocessingSection === t('dashboard.upload.ctas.label')}
                preprocessStarted={ctasStarted}
                onPreprocess={() => handlePreprocessSection(t('dashboard.upload.ctas.label'), ctas, setCtas, setCtasPreprocessed, setCtasStarted)}
              />
            </div>

            {combinations.length > 0 && (
              <div className="space-y-4 pt-4 animate-in slide-in-from-bottom duration-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                    <LayoutGrid className="w-6 h-6 text-primary" />
                    {t('dashboard.output.title')}
                  </h2>
                  <Button
                    variant="outline"
                    onClick={handleDownloadAll}
                    className="rounded-full font-bold uppercase text-xs"
                    disabled={!combinations.some((c) => c.status === 'done')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {t('dashboard.output.downloadAll')}
                  </Button>
                </div>
                <CombinationList
                  combinations={combinations}
                  currentProgress={currentProgress}
                  onDownload={handleDownload}
                  onDownloadAll={handleDownloadAll}
                  isProcessing={isProcessing}
                />
              </div>
            )}
          </div>

          <div className="lg:col-span-4">
            <div className="sticky top-24 space-y-6">
              <ProcessingSettingsPanel
                settings={settings}
                onChange={setSettings}
                disabled={isProcessing}
                preProcess={settings.preProcess}
              />

              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-muted-foreground uppercase tracking-wider">{t('dashboard.processing.estimatedTokens')}</span>
                  <div className="flex items-center gap-1 font-black text-primary">
                    <Coins className="w-4 h-4" />
                    {calculateTokenCost(totalCombinations, settings).total}
                  </div>
                </div>

                {!isProcessing ? (
                  <Button
                    className="w-full h-16 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg uppercase tracking-widest shadow-[0_10px_20px_-10px_rgba(var(--primary-rgb),0.5)] transition-all hover:scale-[1.02] active:scale-[0.98] group"
                    disabled={!canProcess}
                    onClick={handleProcess}
                  >
                    <Rocket className="w-6 h-6 mr-3 group-hover:animate-bounce" />
                    {t('dashboard.processing.startBtn')}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm font-bold uppercase">
                        <span className="text-primary animate-pulse">{processingPhase}</span>
                        <span>{Math.round(currentProgress)}%</span>
                      </div>
                      <Progress value={currentProgress} className="h-3 rounded-full" />
                    </div>
                    <Button
                      variant="outline"
                      className="w-full h-12 rounded-xl font-bold uppercase tracking-wider border-red-500/20 text-red-500 hover:bg-red-500/10"
                      onClick={handleCancel}
                    >
                      <X className="w-4 h-4 mr-2" />
                      {t('dashboard.processing.cancelBtn')}
                    </Button>
                  </div>
                )}

                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-xl border border-border text-[11px] text-muted-foreground leading-relaxed">
                  <HelpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {t('dashboard.processing.disclaimer')}
                </div>
              </div>

              {isAdmin && (
                <Button
                  variant="outline"
                  className="w-full h-12 rounded-xl border-dashed font-bold uppercase tracking-wider gap-2 opacity-50 hover:opacity-100"
                  onClick={() => navigate('/admin/plans')}
                >
                  <Lock className="w-4 h-4" />
                  Admin: Gerenciar Planos
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>

      <ScriptChatFloat />
      <FeatureUpsellDialog
        open={!!upsellFeature}
        onOpenChange={(open) => !open && setUpsellFeature(null)}
        featureKey={upsellFeature?.key || 'has_shorts_reels'}
        featureName={upsellFeature?.name || ''}
      />
      <NewUserWelcomePopup userId={user?.id} currentPlan={currentPlan} tokenBalance={tokenBalance} />
    </div>
  );
};

export default Index;
