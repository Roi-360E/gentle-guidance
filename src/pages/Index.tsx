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
    <div className="min-h-screen bg-background p-4 flex flex-col items-center justify-center">
      <div className="bg-card border p-6 rounded-xl shadow-xl max-w-lg w-full text-center space-y-4 mb-8">
        <Rocket className="w-12 h-12 text-primary mx-auto" />
        <h1 className="text-2xl font-bold text-primary uppercase tracking-tight">
          TESTE DE CARREGAMENTO
        </h1>
        <p className="text-muted-foreground">
          Se você está vendo esta mensagem, o aplicativo carregou corretamente no editor do Lovable.
        </p>
        <Button onClick={() => window.location.reload()} className="w-full">
          Recarregar para Verificar
        </Button>
      </div>

      <div className="opacity-10 pointer-events-none select-none max-w-6xl w-full mx-auto space-y-8 blur-[1px]">
        {/* Header (Simplified Mock) */}
        <header className="border-b border-border py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-extrabold text-primary uppercase">{t('auth.brand')}</h1>
          </div>
        </header>

        <main className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-64 rounded-xl border border-dashed border-border bg-card/50"></div>
            <div className="h-64 rounded-xl border border-dashed border-border bg-card/50"></div>
            <div className="h-64 rounded-xl border border-dashed border-border bg-card/50"></div>
          </div>
          <div className="h-48 max-w-md mx-auto rounded-xl border border-border bg-card/50"></div>
          <div className="h-16 max-w-xs mx-auto rounded-full bg-primary/20"></div>
        </main>
      </div>

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
