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
import { ArrowLeft, Plus, Trash2, Save, Loader2, GripVertical, Users, CreditCard, Search, MessageSquare, Coins, ShieldBan, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

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
}

interface UserRow {
  user_id: string;
  name: string | null;
  email: string | null;
  plan: string;
  token_balance: number;
  month_year: string;
  is_blocked: boolean;
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
      .order('sort_order');

    if (error) {
      toast.error('Erro ao carregar planos');
      console.error(error);
    } else if (data) {
      setPlans((data as any[]).map((p: any) => ({
        ...p,
        features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
        has_ai_chat: p.has_ai_chat ?? false,
      })));
    }
    setLoading(false);
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    const monthYear = new Date().toISOString().substring(0, 7);

    // Load profiles and usage data
    const [profilesRes, usageRes] = await Promise.all([
      supabase.from('profiles').select('user_id, name, email, is_blocked'),
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
      };
    });

    setUsers(merged);
    setUsersLoading(false);
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
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/plans')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Painel Administrativo</h1>
              <p className="text-sm text-muted-foreground">Planos, usuários e permissões</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Tabs defaultValue="plans" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="plans" className="gap-2">
              <CreditCard className="w-4 h-4" /> Planos
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" /> Usuários
            </TabsTrigger>
          </TabsList>

          {/* ===== PLANS TAB ===== */}
          <TabsContent value="plans" className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Gerencie seus planos de pagamento e permissões de Chat IA.</p>
              <div className="flex gap-2">
                <Button onClick={addPlan} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1" /> Novo Plano
                </Button>
                <Button onClick={saveAll} disabled={saving} size="sm">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  Salvar Tudo
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

                    <div className="flex flex-wrap items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Ícone:</Label>
                        <select
                          value={plan.icon}
                          onChange={e => updatePlan(index, 'icon', e.target.value)}
                          className="text-sm bg-background border border-input rounded px-2 py-1"
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
                          className="text-sm bg-background border border-input rounded px-2 py-1"
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
                          <MessageSquare className="w-3 h-3" /> Chat RoteiroPRO IA
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
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por e-mail ou nome..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
              <Button variant="outline" size="sm" onClick={loadUsers} disabled={usersLoading}>
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
                          <TableHead className="text-xs text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
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
        </Tabs>
      </main>
    </div>
  );
}
