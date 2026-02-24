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
import { ArrowLeft, Plus, Trash2, Save, Loader2, GripVertical } from 'lucide-react';
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

  useEffect(() => {
    if (!user) return;
    // Check admin role
    supabase
      .from('user_roles' as any)
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .then(({ data }) => {
        if (data && (data as any[]).length > 0) {
          setIsAdmin(true);
          loadPlans();
        } else {
          toast.error('Acesso negado. Apenas administradores.');
          navigate('/');
        }
      });
  }, [user]);

  const loadPlans = async () => {
    setLoading(true);
    // Fetch all plans (including inactive) - admin can see all via RLS
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
      })));
    }
    setLoading(false);
  };

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
    // Sync bg_color with color
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
      // Validate plan_keys are unique
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

      // Delete plans that were removed (compare DB ids)
      const { data: dbPlans } = await supabase
        .from('subscription_plans' as any)
        .select('id');
      const currentIds = plans.filter(p => p.id).map(p => p.id);
      const toDelete = (dbPlans as any[] || []).filter((dp: any) => !currentIds.includes(dp.id));
      
      for (const dp of toDelete) {
        await supabase.from('subscription_plans' as any).delete().eq('id', dp.id);
      }

      toast.success('Planos salvos com sucesso! Os preços no Mercado Pago serão atualizados automaticamente.');
      await loadPlans();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

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
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/plans')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Editor de Planos</h1>
              <p className="text-sm text-muted-foreground">Gerencie seus planos de pagamento</p>
            </div>
          </div>
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
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
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
                {/* Basic info row */}
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

                {/* Options row */}
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
                </div>

                {/* Features */}
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
      </main>
    </div>
  );
}
