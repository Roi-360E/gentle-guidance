import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, Save, Loader2, GripVertical, Users, CreditCard, Search, MessageSquare, Coins, ShieldBan, ShieldCheck, Crosshair, Copy, BarChart3, Globe, CheckCircle2, AlertCircle, Pencil } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

interface Plan {
  id?: string;
  plan_key: string;
  name: string;
  price: number;
  tokens: number;
  features: string[];
  icon: string;
  color: string;
  bg_color: string;
  is_popular: boolean;
  sort_order: number;
  is_active: boolean;
  has_ai_chat: boolean;
  has_auto_subtitles: boolean;
  has_voice_rewrite: boolean;
}

interface UserRow {
  user_id: string;
  name: string | null;
  email: string | null;
  plan: string;
  token_balance: number;
  month_year: string;
  is_blocked: boolean;
  has_ai_chat: boolean;
}

const ICON_OPTIONS = ['Sparkles', 'Zap', 'Crown'];
const COLOR_OPTIONS = [
  { label: 'Cinza', value: 'text-muted-foreground', bg: 'bg-muted/50' },
  { label: 'Primária', value: 'text-primary', bg: 'bg-primary/10' },
  { label: 'Destaque', value: 'text-accent', bg: 'bg-accent/10' },
];

export default function AdminPlans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // User management state
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [tokenEditUser, setTokenEditUser] = useState<string | null>(null);
  const [tokenEditValue, setTokenEditValue] = useState('');

  // Pixel state
  const [pixelName, setPixelName] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [pixelAccessToken, setPixelAccessToken] = useState('');
  const [pixelDedupKey, setPixelDedupKey] = useState('');
  const [pixelSnippet, setPixelSnippet] = useState('');
  const [pixelActive, setPixelActive] = useState(false);
  const [pixelLoading, setPixelLoading] = useState(false);
  const [pixelSaving, setPixelSaving] = useState(false);
  const [savedPixels, setSavedPixels] = useState<any[]>([]);
  const [editingPixelId, setEditingPixelId] = useState<string | null>(null);
  const [deletingPixelId, setDeletingPixelId] = useState<string | null>(null);
  const [testingPixelId, setTestingPixelId] = useState<string | null>(null);
  const [firingRealPurchase, setFiringRealPurchase] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testDialogPixel, setTestDialogPixel] = useState<any>(null);
  const [testEventCode, setTestEventCode] = useState('');
  const [lastTestResult, setLastTestResult] = useState<{ pixelName: string; code: string; success: boolean; error?: string } | null>(null);

  // Funnel state
  const [funnelData, setFunnelData] = useState<{ event_name: string; count: number }[]>([]);
  const [funnelLoading, setFunnelLoading] = useState(false);

  // DevTools toggle
  const [devToolsEnabled, setDevToolsEnabled] = useState(() => localStorage.getItem('devtools_unlocked') === '1');

  // Domain verification state
  const [domainVerifHtml, setDomainVerifHtml] = useState('');
  const [domainVerifSaving, setDomainVerifSaving] = useState(false);
  const [domainVerifStatus, setDomainVerifStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [savedDomainFiles, setSavedDomainFiles] = useState<{ id: string; pixel_id: string; pixel_snippet: string }[]>([]);
  const [domainMetaTag, setDomainMetaTag] = useState('');
  const [domainMetaSaving, setDomainMetaSaving] = useState(false);
  const [domainMetaStatus, setDomainMetaStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const loadDomainFiles = async () => {
    const { data } = await supabase
      .from('facebook_pixel_config')
      .select('id, pixel_id, pixel_snippet')
      .eq('name', '__domain_verification__');
    if (data) setSavedDomainFiles(data);
  };

  const deleteDomainFile = async (id: string) => {
    await supabase.from('facebook_pixel_config').delete().eq('id', id);
    setSavedDomainFiles(prev => prev.filter(f => f.id !== id));
    toast.success('Arquivo de verificação removido.');
  };

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_roles' as any)
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .then(({ data }) => {
        if (data && (data as any[]).length > 0) {
          setIsAdmin(true);
          loadPlans();
          loadUsers();
          loadPixelConfig();
          loadFunnelData();
          loadDomainFiles();
        } else {
          toast.error('Acesso negado. Apenas administradores.');
          navigate('/');
        }
      });
  }, [user]);

  const loadPlans = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('subscription_plans' as any)
      .select('*')
      .order('price', { ascending: true });

    if (error) {
      toast.error('Erro ao carregar planos');
      console.error(error);
    } else if (data) {
      setPlans((data as any[]).map((p: any) => ({
        ...p,
        features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
        has_ai_chat: p.has_ai_chat ?? false,
        has_auto_subtitles: p.has_auto_subtitles ?? false,
        has_voice_rewrite: p.has_voice_rewrite ?? false,
      })));
    }
    setLoading(false);
  };

  const loadPixelConfig = async () => {
    setPixelLoading(true);
    const { data, error } = await supabase
      .from('facebook_pixel_config' as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading pixels:', error);
      toast.error('Erro ao carregar pixels: ' + error.message);
    } else if (data) {
      setSavedPixels(data as any[]);
    }
    setPixelLoading(false);
  };

  const FUNNEL_EVENTS = ['PageView', 'ViewContent', 'Lead', 'CompleteRegistration', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'StartTrial', 'ScrollDepth'];

  const loadFunnelData = async () => {
    setFunnelLoading(true);
    const { data, error } = await supabase
      .from('pixel_events_log' as any)
      .select('event_name')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (!error && data) {
      const counts: Record<string, number> = {};
      (data as any[]).forEach((row: any) => {
        counts[row.event_name] = (counts[row.event_name] || 0) + 1;
      });
      const result = FUNNEL_EVENTS.map(name => ({
        event_name: name,
        count: counts[name] || 0,
      }));
      Object.keys(counts).forEach(name => {
        if (!FUNNEL_EVENTS.includes(name)) {
          result.push({ event_name: name, count: counts[name] });
        }
      });
      setFunnelData(result);
    }
    setFunnelLoading(false);
  };

  const savePixelConfig = async () => {
    if (!pixelName.trim() || !pixelId.trim() || !pixelAccessToken.trim()) {
      toast.error('Preencha o nome, Pixel ID e Token de Acesso.');
      return;
    }
    setPixelSaving(true);
    const payload = { name: pixelName, pixel_id: pixelId, access_token: pixelAccessToken, dedup_key: pixelDedupKey.trim(), pixel_snippet: pixelSnippet.trim(), is_active: pixelActive, updated_at: new Date().toISOString() };

    let error;
    if (editingPixelId) {
      ({ error } = await supabase.from('facebook_pixel_config' as any).update(payload as any).eq('id', editingPixelId));
    } else {
      ({ error } = await supabase.from('facebook_pixel_config' as any).insert(payload as any));
    }

    if (error) {
      toast.error('Erro ao salvar Pixel: ' + error.message);
    } else {
      toast.success(editingPixelId ? 'Pixel atualizado com sucesso!' : 'Pixel salvo com sucesso!');
      setPixelName('');
      setPixelId('');
      setPixelAccessToken('');
      setPixelDedupKey('');
      setPixelSnippet('');
      setPixelActive(false);
      setEditingPixelId(null);
      await loadPixelConfig();
    }
    setPixelSaving(false);
  };

  const deletePixel = async (id: string) => {
    setDeletingPixelId(id);
    const { error } = await supabase.from('facebook_pixel_config' as any).delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir Pixel: ' + error.message);
    } else {
      toast.success('Pixel excluído!');
      setSavedPixels(prev => prev.filter(p => p.id !== id));
    }
    setDeletingPixelId(null);
  };

  const fireRealPurchase = async () => {
    setFiringRealPurchase(true);
    try {
      // Fire browser-side fbq
      const fbq = (window as any).fbq;
      if (fbq && typeof fbq === 'function') {
        fbq('track', 'Purchase', { currency: 'BRL', value: 38.00, content_name: 'Starter', content_type: 'product', content_ids: ['starter'] });
      }

      // Get Facebook cookies for better matching
      const getCookie = (name: string) => {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : undefined;
      };
      const fbc = getCookie('_fbc');
      const fbp = getCookie('_fbp');

      // Fire CAPI via edge function with enriched user data
      const { data, error } = await supabase.functions.invoke('fire-purchase-event', {
        body: {
          plan_name: 'Starter',
          plan_value: 38.00,
          plan_key: 'starter',
          user_id: user?.id || null,
          event_source_url: window.location.origin + '/obrigado',
          fbc: fbc || undefined,
          fbp: fbp || undefined,
          client_user_agent: navigator.userAgent,
        },
      });

      if (error) {
        toast.error('Erro ao disparar evento: ' + error.message);
      } else if (data?.success) {
        // Check if any pixel returned an error
        const hasErrors = data.results?.some((r: any) => r.result?.error);
        if (hasErrors) {
          const errorMsg = data.results.find((r: any) => r.result?.error)?.result?.error?.error_user_msg || 'Erro desconhecido';
          toast.error('⚠️ Evento enviado mas com erro: ' + errorMsg);
        } else {
          toast.success('✅ Evento de compra REAL disparado com sucesso via Browser + CAPI!');
        }
      } else {
        toast.error('Falha: ' + JSON.stringify(data));
      }
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
    setFiringRealPurchase(false);
  };

  const openTestDialog = (pixel: any) => {
    setTestDialogPixel(pixel);
    setTestEventCode('');
    setLastTestResult(null);
    setTestDialogOpen(true);
  };

  const testPixelPurchase = async () => {
    if (!testDialogPixel) return;
    const pixel = testDialogPixel;
    setTestingPixelId(pixel.id);
    setLastTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('test-pixel-event', {
        body: {
          pixel_id: pixel.pixel_id,
          access_token: pixel.access_token,
          pixel_name: pixel.name,
          dedup_key: pixel.dedup_key || '',
          test_event_code: testEventCode.trim() || undefined,
        },
      });

      if (error) {
        const msg = error.message || 'Erro desconhecido';
        setLastTestResult({ pixelName: pixel.name, code: '', success: false, error: msg });
      } else if (data?.error) {
        setLastTestResult({ pixelName: pixel.name, code: data.test_event_code || '', success: false, error: data.error });
      } else if (data?.success) {
        const code = data.test_event_code;
        setLastTestResult({ pixelName: pixel.name, code, success: true });
        try { await navigator.clipboard.writeText(code); } catch {}
      }
    } catch (err: any) {
      setLastTestResult({ pixelName: pixel.name, code: '', success: false, error: err.message });
    }
    setTestingPixelId(null);
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    const monthYear = new Date().toISOString().substring(0, 7);

    // Load profiles and usage data
    const [profilesRes, usageRes] = await Promise.all([
      supabase.from('profiles').select('user_id, name, email, is_blocked, has_ai_chat'),
      supabase.from('video_usage').select('user_id, plan, token_balance, month_year').eq('month_year', monthYear),
    ]);

    const profiles = (profilesRes.data || []) as any[];
    const usages = (usageRes.data || []) as any[];

    const usageMap = new Map(usages.map((u: any) => [u.user_id, u]));

    const merged: UserRow[] = profiles.map((p: any) => {
      const usage = usageMap.get(p.user_id);
      return {
        user_id: p.user_id,
        name: p.name,
        email: p.email,
        plan: usage?.plan || 'free',
        token_balance: usage?.token_balance ?? 0,
        month_year: monthYear,
        is_blocked: p.is_blocked ?? false,
        has_ai_chat: p.has_ai_chat ?? false,
      };
    });

    setUsers(merged);
    setUsersLoading(false);
  };

  const toggleUserAiChat = async (userId: string, currentValue: boolean) => {
    setUpdatingUser(userId);
    const newValue = !currentValue;
    const { error } = await supabase
      .from('profiles')
      .update({ has_ai_chat: newValue } as any)
      .eq('user_id', userId);

    if (error) {
      toast.error('Erro: ' + error.message);
    } else {
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, has_ai_chat: newValue } : u));
      toast.success(newValue ? 'Chat IA ativado para o usuário!' : 'Chat IA desativado para o usuário!');
    }
    setUpdatingUser(null);
  };

  const changeUserPlan = async (userId: string, newPlanKey: string) => {
    setUpdatingUser(userId);
    const monthYear = new Date().toISOString().substring(0, 7);
    const plan = plans.find(p => p.plan_key === newPlanKey);
    const tokenBalance = plan ? (plan.tokens >= 999999 ? 999999 : plan.tokens) : 0;

    // Try update first
    const { data: updateData, error: updateError } = await supabase
      .from('video_usage')
      .update({ plan: newPlanKey, token_balance: tokenBalance } as any)
      .eq('user_id', userId)
      .eq('month_year', monthYear)
      .select();

    if (updateError) {
      toast.error('Erro: ' + updateError.message);
      setUpdatingUser(null);
      return;
    }

    if (!updateData || updateData.length === 0) {
      const { error: insertError } = await supabase
        .from('video_usage')
        .insert({ user_id: userId, month_year: monthYear, plan: newPlanKey, token_balance: tokenBalance, video_count: 0 } as any);
      if (insertError) {
        toast.error('Erro: ' + insertError.message);
        setUpdatingUser(null);
        return;
      }
    }

    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, plan: newPlanKey, token_balance: tokenBalance } : u));
    toast.success('Plano do usuário atualizado!');
    setUpdatingUser(null);
  };

  const updateUserTokens = async (userId: string, newTokens: number) => {
    setUpdatingUser(userId);
    const monthYear = new Date().toISOString().substring(0, 7);

    const { data: updateData, error: updateError } = await supabase
      .from('video_usage')
      .update({ token_balance: newTokens } as any)
      .eq('user_id', userId)
      .eq('month_year', monthYear)
      .select();

    if (updateError) {
      toast.error('Erro: ' + updateError.message);
      setUpdatingUser(null);
      return;
    }

    if (!updateData || updateData.length === 0) {
      const { error: insertError } = await supabase
        .from('video_usage')
        .insert({ user_id: userId, month_year: monthYear, plan: 'free', token_balance: newTokens, video_count: 0 } as any);
      if (insertError) {
        toast.error('Erro: ' + insertError.message);
        setUpdatingUser(null);
        return;
      }
    }

    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, token_balance: newTokens } : u));
    toast.success(`Tokens atualizados para ${newTokens}!`);
    setTokenEditUser(null);
    setTokenEditValue('');
    setUpdatingUser(null);
  };

  const toggleBlockUser = async (userId: string, currentlyBlocked: boolean) => {
    setUpdatingUser(userId);
    const newValue = !currentlyBlocked;
    const { error } = await supabase
      .from('profiles')
      .update({ is_blocked: newValue } as any)
      .eq('user_id', userId);

    if (error) {
      toast.error('Erro: ' + error.message);
    } else {
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, is_blocked: newValue } : u));
      toast.success(newValue ? 'Usuário bloqueado!' : 'Usuário desbloqueado!');
    }
    setUpdatingUser(null);
  };

  // Plan editor helpers
  const addPlan = () => {
    const newPlan: Plan = {
      plan_key: `plan-${Date.now()}`,
      name: 'Novo Plano',
      price: 0,
      tokens: 0,
      features: ['Benefício 1'],
      icon: 'Sparkles',
      color: 'text-muted-foreground',
      bg_color: 'bg-muted/50',
      is_popular: false,
      sort_order: plans.length,
      is_active: true,
      has_ai_chat: false,
      has_auto_subtitles: false,
      has_voice_rewrite: false,
    };
    setPlans([...plans, newPlan]);
  };

  const removePlan = (index: number) => {
    const plan = plans[index];
    if (plan.plan_key === 'free') {
      toast.error('O plano Gratuito não pode ser removido.');
      return;
    }
    setPlans(plans.filter((_, i) => i !== index));
  };

  const updatePlan = (index: number, field: keyof Plan, value: any) => {
    const updated = [...plans];
    (updated[index] as any)[field] = value;
    if (field === 'color') {
      const match = COLOR_OPTIONS.find(c => c.value === value);
      if (match) updated[index].bg_color = match.bg;
    }
    setPlans(updated);
  };

  const updateFeature = (planIndex: number, featureIndex: number, value: string) => {
    const updated = [...plans];
    updated[planIndex].features[featureIndex] = value;
    setPlans(updated);
  };

  const addFeature = (planIndex: number) => {
    const updated = [...plans];
    updated[planIndex].features.push('Novo benefício');
    setPlans(updated);
  };

  const removeFeature = (planIndex: number, featureIndex: number) => {
    const updated = [...plans];
    updated[planIndex].features.splice(featureIndex, 1);
    setPlans(updated);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const keys = plans.map(p => p.plan_key);
      if (new Set(keys).size !== keys.length) {
        toast.error('Cada plano precisa ter um identificador único.');
        setSaving(false);
        return;
      }

      for (let i = 0; i < plans.length; i++) {
        const plan = plans[i];
        const payload = {
          plan_key: plan.plan_key,
          name: plan.name,
          price: plan.price,
          tokens: plan.tokens,
          features: plan.features,
          icon: plan.icon,
          color: plan.color,
          bg_color: plan.bg_color,
          is_popular: plan.is_popular,
          sort_order: i,
          is_active: plan.is_active,
          has_ai_chat: plan.has_ai_chat,
          has_auto_subtitles: plan.has_auto_subtitles,
          has_voice_rewrite: plan.has_voice_rewrite,
        };

        if (plan.id) {
          const { error } = await supabase
            .from('subscription_plans' as any)
            .update(payload as any)
            .eq('id', plan.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('subscription_plans' as any)
            .insert(payload as any)
            .select()
            .single();
          if (error) throw error;
          if (data) plans[i].id = (data as any).id;
        }
      }

      const { data: dbPlans } = await supabase
        .from('subscription_plans' as any)
        .select('id');
      const currentIds = plans.filter(p => p.id).map(p => p.id);
      const toDelete = (dbPlans as any[] || []).filter((dp: any) => !currentIds.includes(dp.id));

      for (const dp of toDelete) {
        await supabase.from('subscription_plans' as any).delete().eq('id', dp.id);
      }

      toast.success('Planos salvos com sucesso!');
      await loadPlans();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter(u => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (u.email?.toLowerCase().includes(term)) || (u.name?.toLowerCase().includes(term));
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/plans')} className="shrink-0 px-2 sm:px-3">
              <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Voltar</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-foreground truncate">Painel Administrativo</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Planos, usuários e permissões</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <Tabs defaultValue="plans" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="plans" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Planos
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Usuários
            </TabsTrigger>
            <TabsTrigger value="pixel" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Crosshair className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Pixel
            </TabsTrigger>
            <TabsTrigger value="funnel" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Funil
            </TabsTrigger>
            <TabsTrigger value="domain" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Domínio
            </TabsTrigger>
          </TabsList>

          {/* ===== PLANS TAB ===== */}
          <TabsContent value="plans" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs sm:text-sm text-muted-foreground">Gerencie planos e permissões de Chat IA.</p>
              <div className="flex gap-2 shrink-0">
                <Button onClick={addPlan} variant="outline" size="sm" className="text-xs sm:text-sm">
                  <Plus className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Novo</span> Plano
                </Button>
                <Button onClick={saveAll} disabled={saving} size="sm" className="text-xs sm:text-sm">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  Salvar
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              plans.map((plan, index) => (
                <Card key={plan.id || index} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-lg">{plan.name || 'Sem nome'}</CardTitle>
                        {!plan.is_active && <Badge variant="outline">Inativo</Badge>}
                        {plan.is_popular && <Badge className="bg-primary text-primary-foreground">Popular</Badge>}
                        {plan.has_ai_chat && (
                          <Badge variant="secondary" className="gap-1">
                            <MessageSquare className="w-3 h-3" /> Chat IA
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePlan(index)}
                        className="text-destructive hover:text-destructive"
                        disabled={plan.plan_key === 'free'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Identificador (único)</Label>
                        <Input
                          value={plan.plan_key}
                          onChange={e => updatePlan(index, 'plan_key', e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                          placeholder="ex: professional"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nome do Plano</Label>
                        <Input
                          value={plan.name}
                          onChange={e => updatePlan(index, 'name', e.target.value)}
                          placeholder="Ex: Profissional"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Preço (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={plan.price}
                          onChange={e => updatePlan(index, 'price', parseFloat(e.target.value) || 0)}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tokens</Label>
                        <Input
                          type="number"
                          min="0"
                          value={plan.tokens}
                          onChange={e => updatePlan(index, 'tokens', parseInt(e.target.value) || 0)}
                          className="text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Ícone:</Label>
                        <select
                          value={plan.icon}
                          onChange={e => updatePlan(index, 'icon', e.target.value)}
                          className="text-xs sm:text-sm bg-background border border-input rounded px-2 py-1"
                        >
                          {ICON_OPTIONS.map(icon => (
                            <option key={icon} value={icon}>{icon}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Cor:</Label>
                        <select
                          value={plan.color}
                          onChange={e => updatePlan(index, 'color', e.target.value)}
                          className="text-xs sm:text-sm bg-background border border-input rounded px-2 py-1"
                        >
                          {COLOR_OPTIONS.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={plan.is_popular}
                          onCheckedChange={v => updatePlan(index, 'is_popular', v)}
                        />
                        <Label className="text-xs">Popular</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={plan.is_active}
                          onCheckedChange={v => updatePlan(index, 'is_active', v)}
                        />
                        <Label className="text-xs">Ativo</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={plan.has_ai_chat}
                          onCheckedChange={v => updatePlan(index, 'has_ai_chat', v)}
                        />
                        <Label className="text-xs flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> Chat IA
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={plan.has_auto_subtitles}
                          onCheckedChange={v => updatePlan(index, 'has_auto_subtitles', v)}
                        />
                        <Label className="text-xs flex items-center gap-1">
                          Legendas Auto
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={plan.has_voice_rewrite}
                          onCheckedChange={v => updatePlan(index, 'has_voice_rewrite', v)}
                        />
                        <Label className="text-xs flex items-center gap-1">
                          Voice Rewrite
                        </Label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Benefícios</Label>
                        <Button variant="ghost" size="sm" onClick={() => addFeature(index)} className="h-7 text-xs">
                          <Plus className="w-3 h-3 mr-1" /> Benefício
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {plan.features.map((feature, fIndex) => (
                          <div key={fIndex} className="flex items-center gap-2">
                            <Input
                              value={feature}
                              onChange={e => updateFeature(index, fIndex, e.target.value)}
                              className="text-sm h-8"
                              placeholder="Descreva o benefício"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removeFeature(index, fIndex)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            <div className="text-center text-sm text-muted-foreground p-4">
              <p>💡 Ao salvar, os preços serão atualizados automaticamente no Mercado Pago quando um cliente iniciar o pagamento.</p>
            </div>
          </TabsContent>

          {/* ===== USERS TAB ===== */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por e-mail ou nome..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
              <Button variant="outline" size="sm" onClick={loadUsers} disabled={usersLoading} className="shrink-0">
                {usersLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Atualizar'}
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                {usersLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">E-mail</TableHead>
                          <TableHead className="text-xs">Nome</TableHead>
                          <TableHead className="text-xs">Plano Atual</TableHead>
                          <TableHead className="text-xs">Tokens</TableHead>
                          <TableHead className="text-xs text-right">Alterar Plano</TableHead>
                          <TableHead className="text-xs text-center">Chat IA</TableHead>
                          <TableHead className="text-xs text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                              Nenhum usuário encontrado.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredUsers.map(u => (
                            <TableRow key={u.user_id}>
                              <TableCell className="text-sm font-medium">{u.email || '—'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{u.name || '—'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs capitalize">{u.plan}</Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                <div className="flex items-center gap-1">
                                  <span>{u.token_balance}</span>
                                  <Popover
                                    open={tokenEditUser === u.user_id}
                                    onOpenChange={(open) => {
                                      if (open) {
                                        setTokenEditUser(u.user_id);
                                        setTokenEditValue(String(u.token_balance));
                                      } else {
                                        setTokenEditUser(null);
                                      }
                                    }}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <Coins className="w-3 h-3" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-56 p-3 space-y-2" align="start">
                                      <Label className="text-xs font-semibold">Editar Tokens</Label>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={tokenEditValue}
                                        onChange={e => setTokenEditValue(e.target.value)}
                                        className="h-8 text-sm"
                                        placeholder="Quantidade"
                                      />
                                      <Button
                                        size="sm"
                                        className="w-full h-7 text-xs"
                                        disabled={updatingUser === u.user_id}
                                        onClick={() => updateUserTokens(u.user_id, parseInt(tokenEditValue) || 0)}
                                      >
                                        {updatingUser === u.user_id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                                        Salvar
                                      </Button>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Select
                                  value={u.plan}
                                  onValueChange={val => changeUserPlan(u.user_id, val)}
                                  disabled={updatingUser === u.user_id}
                                >
                                  <SelectTrigger className="w-[160px] h-8 text-xs ml-auto">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="free">Gratuito</SelectItem>
                                    {plans.filter(p => p.is_active).map(p => (
                                      <SelectItem key={p.plan_key} value={p.plan_key}>{p.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-center">
                                <Switch
                                  checked={u.has_ai_chat}
                                  onCheckedChange={() => toggleUserAiChat(u.user_id, u.has_ai_chat)}
                                  disabled={updatingUser === u.user_id}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant={u.is_blocked ? 'destructive' : 'outline'}
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  disabled={updatingUser === u.user_id}
                                  onClick={() => toggleBlockUser(u.user_id, u.is_blocked)}
                                >
                                  {u.is_blocked ? (
                                    <><ShieldBan className="w-3 h-3" /> Bloqueado</>
                                  ) : (
                                    <><ShieldCheck className="w-3 h-3" /> Ativo</>
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              {filteredUsers.length} usuário(s) • Altere o plano para liberar ou revogar acessos instantaneamente.
            </p>
          </TabsContent>

          {/* ===== PIXEL TAB ===== */}
          <TabsContent value="pixel" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Crosshair className="w-5 h-5" /> Facebook Pixel & Conversions API
                </CardTitle>
              </CardHeader>
               <CardContent className="space-y-5">
                {pixelLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="pixel-name">Nome do Pixel</Label>
                      <Input
                        id="pixel-name"
                        placeholder="Ex: Campanha Principal"
                        value={pixelName}
                        onChange={e => setPixelName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pixel-id">Pixel ID</Label>
                      <Input
                        id="pixel-id"
                        placeholder="Ex: 123456789012345"
                        value={pixelId}
                        onChange={e => setPixelId(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pixel-token">Token de Acesso (Conversions API)</Label>
                      <Textarea
                        id="pixel-token"
                        placeholder="Cole aqui o token de acesso gerado no Gerenciador de Eventos"
                        value={pixelAccessToken}
                        onChange={e => setPixelAccessToken(e.target.value)}
                        className="font-mono text-xs min-h-[80px]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pixel-dedup">Chave de Deduplicação (event_id)</Label>
                      <Input
                        id="pixel-dedup"
                        placeholder="Ex: escalax_pixel1 (prefixo único para evitar eventos duplicados)"
                        value={pixelDedupKey}
                        onChange={e => setPixelDedupKey(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Essa chave é usada como prefixo do <code className="bg-muted px-1 rounded">event_id</code> enviado ao Facebook, evitando que o mesmo evento seja contado duas vezes.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pixel-snippet">Código do Meta Pixel (Snippet)</Label>
                      <Textarea
                        id="pixel-snippet"
                        placeholder="Cole aqui o código completo do Meta Pixel fornecido pelo Facebook (<!-- Meta Pixel Code --> ... <!-- End Meta Pixel Code -->)"
                        value={pixelSnippet}
                        onChange={e => setPixelSnippet(e.target.value)}
                        className="font-mono text-xs min-h-[160px]"
                      />
                      <p className="text-xs text-muted-foreground">
                        Cole o snippet completo do Meta Pixel. Ele será injetado automaticamente em todas as páginas do site para rastrear <code className="bg-muted px-1 rounded">PageView</code> e outros eventos do browser.
                      </p>
                    </div>

                    <div className="flex items-center justify-between border rounded-lg p-4">
                      <div>
                        <p className="font-medium text-sm">Ativar rastreamento</p>
                        <p className="text-xs text-muted-foreground">
                          Envia evento <code className="bg-muted px-1 rounded">Purchase</code> via Conversions API a cada compra confirmada.
                        </p>
                      </div>
                      <Switch checked={pixelActive} onCheckedChange={setPixelActive} />
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={savePixelConfig} disabled={pixelSaving} className="flex-1 gap-2">
                        {pixelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {editingPixelId ? 'Atualizar Pixel' : 'Salvar Configuração'}
                      </Button>
                      {editingPixelId && (
                        <Button variant="outline" onClick={() => {
                          setEditingPixelId(null);
                          setPixelName('');
                          setPixelId('');
                          setPixelAccessToken('');
                          setPixelDedupKey('');
                          setPixelSnippet('');
                          setPixelActive(false);
                        }}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Saved Pixels List */}
            {savedPixels.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Pixels Salvos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {savedPixels.map((px) => (
                    <div key={px.id} className="flex items-center justify-between border rounded-lg p-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{px.name || 'Sem nome'}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">ID: {px.pixel_id}</p>
                        <Badge variant={px.is_active ? 'default' : 'outline'} className="mt-1 text-xs">
                          {px.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div className="flex gap-2 shrink-0 ml-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingPixelId(px.id);
                            setPixelName(px.name || '');
                            setPixelId(px.pixel_id || '');
                            setPixelAccessToken(px.access_token || '');
                            setPixelDedupKey(px.dedup_key || '');
                            setPixelSnippet(px.pixel_snippet || '');
                            setPixelActive(px.is_active ?? false);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="gap-1"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openTestDialog(px)}
                          disabled={testingPixelId === px.id}
                          className="gap-1"
                        >
                          {testingPixelId === px.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
                          Testar Compra
                        </Button>
                        <Button
                          size="sm"
                          onClick={fireRealPurchase}
                          disabled={firingRealPurchase || !px.is_active}
                          className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                        >
                          {firingRealPurchase ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                          Compra Real
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deletePixel(px.id)}
                          disabled={deletingPixelId === px.id}
                          className="gap-1"
                        >
                          {deletingPixelId === px.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Fire Real Purchase Button */}
            {savedPixels.some(p => p.is_active) && (
              <Card className="border-2 border-green-500/40 bg-green-500/5">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-green-600" />
                    Disparar Compra Real
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Este botão dispara um evento de <strong>Purchase real</strong> (Plano Starter — R$ 38,00) em <strong>todos os pixels ativos</strong>, tanto via Browser (fbq) quanto via Conversions API (CAPI). Não é um evento de teste.
                  </p>
                  <Button
                    onClick={fireRealPurchase}
                    disabled={firingRealPurchase}
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                    size="lg"
                  >
                    {firingRealPurchase ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                    {firingRealPurchase ? 'Disparando...' : '🚀 Disparar Evento de Compra Real'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Test Event Section */}
            {savedPixels.length > 0 && (
              <Card className="border-dashed border-2 border-primary/30">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Crosshair className="w-5 h-5 text-primary" />
                    Eventos de Teste
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="test-event-code">Test Event Code (opcional)</Label>
                    <Input
                      id="test-event-code"
                      placeholder="Ex: TEST12345 — obtenha no Gerenciador de Eventos do Facebook"
                      value={testEventCode}
                      onChange={e => setTestEventCode(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Acesse o <strong>Gerenciador de Eventos do Facebook</strong> → seu Pixel → <strong>Eventos de Teste</strong> para obter o código.
                      Se deixar vazio, um código será gerado automaticamente.
                    </p>
                  </div>

                  {lastTestResult && (
                    <div className={`rounded-lg p-4 space-y-2 ${lastTestResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-destructive/10 border border-destructive/30'}`}>
                      <p className="font-medium text-sm">
                        {lastTestResult.success ? '✅ Evento enviado com sucesso!' : '❌ Erro no envio'}
                      </p>
                      <p className="text-xs text-muted-foreground">Pixel: {lastTestResult.pixelName}</p>
                      {lastTestResult.code && (
                        <div className="flex items-center gap-2 mt-2">
                          <code className="bg-background border rounded px-3 py-1.5 text-sm font-mono flex-1">{lastTestResult.code}</code>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(lastTestResult.code);
                                toast.success('Código copiado!');
                              } catch { toast.error('Erro ao copiar'); }
                            }}
                          >
                            Copiar
                          </Button>
                        </div>
                      )}
                      {lastTestResult.error && (
                        <p className="text-xs text-destructive">{lastTestResult.error}</p>
                      )}
                      {lastTestResult.success && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Cole o código acima em <strong>Gerenciador de Eventos → Eventos de Teste</strong> no Facebook para visualizar este evento.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground text-center">
              O evento de compra será enviado automaticamente via Conversions API do Facebook sempre que um pagamento for confirmado pelo Mercado Pago.
            </p>
          </TabsContent>

          {/* ===== FUNNEL TAB ===== */}
          <TabsContent value="funnel" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Funil de Conversão (últimos 30 dias)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {funnelLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      const maxCount = Math.max(...funnelData.map(f => f.count), 1);
                      return funnelData.map((item, i) => {
                        const pct = Math.round((item.count / maxCount) * 100);
                        const prevCount = i > 0 ? funnelData[i - 1].count : 0;
                        const convRate = prevCount > 0 ? ((item.count / prevCount) * 100).toFixed(1) : null;
                        return (
                          <div key={item.event_name} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{item.event_name}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground">{item.count}</span>
                                {convRate && i > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {convRate}%
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Progress value={pct} className="h-3" />
                          </div>
                        );
                      });
                    })()}
                    {funnelData.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum evento registrado ainda. Os eventos começarão a aparecer conforme os usuários interagem com o site.
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-border">
                  <Button variant="outline" size="sm" onClick={loadFunnelData} disabled={funnelLoading}>
                    {funnelLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Atualizar Dados
                  </Button>
                </div>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              📊 Todos os eventos do Pixel (browser + server) são registrados automaticamente. As taxas de conversão mostram a % em relação ao evento anterior no funil.
            </p>
          </TabsContent>

           {/* ===== DOMAIN VERIFICATION TAB ===== */}
          <TabsContent value="domain" className="space-y-6">
            {/* DevTools Toggle */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> DevTools / Console
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Desbloquear DevTools</p>
                    <p className="text-xs text-muted-foreground">Permite abrir o console (F12) e inspecionar elementos no site de produção</p>
                  </div>
                  <Switch
                    checked={devToolsEnabled}
                    onCheckedChange={(checked) => {
                      setDevToolsEnabled(checked);
                      if (checked) {
                        localStorage.setItem('devtools_unlocked', '1');
                      } else {
                        localStorage.removeItem('devtools_unlocked');
                      }
                      toast.success(checked ? 'DevTools desbloqueado! Recarregue a página.' : 'DevTools bloqueado. Recarregue a página.');
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Method 1: HTML File */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  Método 1 — Arquivo HTML
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">📋 Como verificar por arquivo HTML:</p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>No <strong>Gerenciador de Negócios do Facebook</strong>, vá em <strong>Configurações → Segurança da Marca → Domínios</strong>.</li>
                    <li>Clique em <strong>"Adicionar"</strong> e insira seu domínio.</li>
                    <li>Selecione o método <strong>"Carregar arquivo HTML"</strong>.</li>
                    <li>O Facebook vai fornecer o conteúdo do arquivo HTML. <strong>Cole-o abaixo</strong>.</li>
                    <li>Após publicar o site, volte ao Facebook e clique em <strong>"Verificar domínio"</strong>.</li>
                  </ol>
                  <p className="text-xs">⏳ A verificação pode levar até 72 horas.</p>
                </div>

                {savedDomainFiles.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Arquivos salvos</Label>
                    {savedDomainFiles.map((file) => (
                      <div key={file.id} className="flex items-center justify-between bg-muted/30 border border-border rounded-lg px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono truncate">{file.pixel_id}</p>
                          <p className="text-xs text-muted-foreground truncate">{file.pixel_snippet.substring(0, 80)}...</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive ml-2 shrink-0"
                          onClick={() => deleteDomainFile(file.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <Label htmlFor="domain-verif-html" className="text-sm font-medium">
                    Cole o arquivo HTML para pasta raiz do domínio
                  </Label>
                  <Textarea
                    id="domain-verif-html"
                    placeholder="Cole aqui todo o conteúdo do arquivo HTML fornecido pelo Facebook"
                    value={domainVerifHtml}
                    onChange={(e) => {
                      setDomainVerifHtml(e.target.value);
                      setDomainVerifStatus('idle');
                    }}
                    rows={5}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={async () => {
                      const content = domainVerifHtml.trim();
                      if (!content) {
                        toast.error('Cole o conteúdo do arquivo HTML.');
                        return;
                      }

                      setDomainVerifSaving(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('domain-verify', {
                          body: { filename: 'domain-verification.html', verification_content: content }
                        });

                        if (error) throw error;

                        setDomainVerifStatus('saved');
                        setDomainVerifHtml('');
                        loadDomainFiles();
                        toast.success('Arquivo de verificação salvo!');
                      } catch (err: any) {
                        console.error('Error saving verification:', err);
                        setDomainVerifStatus('error');
                        toast.error('Erro ao salvar: ' + (err.message || 'Tente novamente'));
                      } finally {
                        setDomainVerifSaving(false);
                      }
                    }}
                    disabled={domainVerifSaving || !domainVerifHtml.trim()}
                    className="gap-2"
                  >
                    {domainVerifSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Adicionar Arquivo
                  </Button>

                  {domainVerifStatus === 'saved' && (
                    <div className="flex items-center gap-1.5 text-sm text-primary">
                      <CheckCircle2 className="w-4 h-4" />
                      Salvo com sucesso
                    </div>
                  )}
                  {domainVerifStatus === 'error' && (
                    <div className="flex items-center gap-1.5 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      Erro ao salvar
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Method 2: Meta Tag */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  Método 2 — Meta Tag
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">📋 Como verificar por Meta Tag:</p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>No <strong>Gerenciador de Negócios do Facebook</strong>, vá em <strong>Configurações → Segurança da Marca → Domínios</strong>.</li>
                    <li>Selecione o método <strong>"Adicionar meta tag"</strong>.</li>
                    <li>O Facebook vai fornecer uma meta tag como: <code className="bg-muted px-1 rounded text-xs">&lt;meta name="facebook-domain-verification" content="abc123" /&gt;</code></li>
                    <li>Cole o <strong>conteúdo (content)</strong> abaixo. A tag será adicionada automaticamente ao seu site.</li>
                    <li>Publique o site e volte ao Facebook para verificar.</li>
                  </ol>
                </div>

                {(() => {
                  const metaTag = document.querySelector('meta[name="facebook-domain-verification"]');
                  const currentContent = metaTag?.getAttribute('content');
                  return currentContent ? (
                    <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-4 py-3">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Meta tag ativa</p>
                        <p className="text-xs text-muted-foreground font-mono">{currentContent}</p>
                      </div>
                    </div>
                  ) : null;
                })()}

                <div className="space-y-3">
                  <Label htmlFor="domain-meta-content" className="text-sm font-medium">
                    Cole o valor do content da meta tag
                  </Label>
                  <Input
                    id="domain-meta-content"
                    placeholder="Ex: ripyzu7jxb6g3e15krg2r5jat9apbs"
                    value={domainMetaTag}
                    onChange={(e) => {
                      setDomainMetaTag(e.target.value);
                      setDomainMetaStatus('idle');
                    }}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Você pode colar a tag inteira ou apenas o valor do <code>content</code>. Ex: <code>ripyzu7jxb6g3e15krg2r5jat9apbs</code>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={async () => {
                      let content = domainMetaTag.trim();
                      if (!content) {
                        toast.error('Cole o conteúdo da meta tag.');
                        return;
                      }
                      // Extract content value if full tag was pasted
                      const match = content.match(/content=["']([^"']+)["']/);
                      if (match) content = match[1];

                      setDomainMetaSaving(true);
                      try {
                        const { error } = await supabase.functions.invoke('domain-verify', {
                          body: { filename: '__meta_tag__', verification_content: content, type: 'meta_tag' }
                        });
                        if (error) throw error;

                        setDomainMetaStatus('saved');
                        setDomainMetaTag('');
                        loadDomainFiles();
                        toast.success('Meta tag de verificação salva! Publique o site para ativar.');
                      } catch (err: any) {
                        console.error('Error saving meta tag:', err);
                        setDomainMetaStatus('error');
                        toast.error('Erro ao salvar: ' + (err.message || 'Tente novamente'));
                      } finally {
                        setDomainMetaSaving(false);
                      }
                    }}
                    disabled={domainMetaSaving || !domainMetaTag.trim()}
                    className="gap-2"
                  >
                    {domainMetaSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Salvar Meta Tag
                  </Button>

                  {domainMetaStatus === 'saved' && (
                    <div className="flex items-center gap-1.5 text-sm text-primary">
                      <CheckCircle2 className="w-4 h-4" />
                      Salvo com sucesso
                    </div>
                  )}
                  {domainMetaStatus === 'error' && (
                    <div className="flex items-center gap-1.5 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      Erro ao salvar
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Method 3: DNS TXT Record */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  Método 3 — Registro DNS TXT
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">📋 Como verificar por registro DNS TXT:</p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>No <strong>Gerenciador de Negócios do Facebook</strong>, vá em <strong>Configurações → Segurança da Marca → Domínios</strong>.</li>
                    <li>Selecione o método <strong>"Adicionar registro TXT ao DNS"</strong>.</li>
                    <li>O Facebook vai fornecer um valor TXT como: <code className="bg-muted px-1 rounded text-xs">facebook-domain-verification=abc123</code></li>
                    <li>Acesse o painel do seu <strong>provedor de domínio</strong> (ex: Cloudflare, GoDaddy, Hostinger).</li>
                    <li>Adicione um novo registro <strong>TXT</strong> com:
                      <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                        <li><strong>Nome/Host:</strong> <code className="bg-muted px-1 rounded">@</code></li>
                        <li><strong>Valor:</strong> o texto fornecido pelo Facebook</li>
                      </ul>
                    </li>
                    <li>Aguarde a propagação DNS e clique em <strong>"Verificar"</strong> no Facebook.</li>
                  </ol>
                  <p className="text-xs">⏳ A propagação DNS pode levar até 72 horas.</p>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                  <p className="text-sm text-amber-200 font-medium">⚠️ Este método requer acesso ao painel DNS do seu domínio</p>
                  <p className="text-xs text-amber-200/70 mt-1">
                    Você precisa acessar o painel do seu provedor de domínio (Cloudflare, GoDaddy, Hostinger, etc.) para adicionar o registro TXT. 
                    Esse método não pode ser feito diretamente pelo painel admin.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      {/* Test Pixel Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-primary" />
              Testar Evento de Compra
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {testDialogPixel && (
              <div className="text-sm">
                <span className="text-muted-foreground">Pixel:</span>{' '}
                <strong>{testDialogPixel.name || 'Sem nome'}</strong>
                <span className="text-muted-foreground ml-2 font-mono text-xs">({testDialogPixel.pixel_id})</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="dialog-test-code">Test Event Code do Facebook</Label>
              <Input
                id="dialog-test-code"
                placeholder="Ex: TEST12345"
                value={testEventCode}
                onChange={e => setTestEventCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Acesse o <strong>Gerenciador de Eventos do Facebook</strong> → seu Pixel → <strong>Eventos de Teste</strong> para obter o código. Se deixar vazio, um código será gerado automaticamente.
              </p>
            </div>

            {lastTestResult && (
              <div className={`rounded-lg p-4 space-y-2 ${lastTestResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-destructive/10 border border-destructive/30'}`}>
                <p className="font-medium text-sm">
                  {lastTestResult.success ? '✅ Evento enviado com sucesso!' : '❌ Erro no envio'}
                </p>
                {lastTestResult.code && (
                  <div className="flex items-center gap-2 mt-2">
                    <code className="bg-muted border rounded px-3 py-1.5 text-sm font-mono flex-1 truncate">{lastTestResult.code}</code>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(lastTestResult.code);
                          toast.success('Código copiado!');
                        } catch { toast.error('Erro ao copiar'); }
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                {lastTestResult.error && (
                  <p className="text-xs text-destructive">{lastTestResult.error}</p>
                )}
                {lastTestResult.success && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Cole o código acima em <strong>Gerenciador de Eventos → Eventos de Teste</strong> no Facebook para visualizar este evento.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>Fechar</Button>
            <Button
              onClick={testPixelPurchase}
              disabled={testingPixelId !== null}
              className="gap-2"
            >
              {testingPixelId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
              Enviar Evento de Teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
