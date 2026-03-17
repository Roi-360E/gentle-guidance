import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Rocket, Mail, Lock, User, Shield, CreditCard, Phone, Check, ArrowRight, ArrowLeft, Star, Sparkles, Crown, Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { validateEmailDomain } from '@/lib/email-validator';
import { generateFingerprint } from '@/lib/device-fingerprint';
import { validateCPF, formatCPF, hashCPF } from '@/lib/cpf-validator';
import { supabase } from '@/integrations/supabase/client';
import { trackPixelEvent } from '@/lib/pixel-tracker';

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
  return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
};

interface PlanData {
  id: string;
  plan_key: string;
  name: string;
  price: number;
  tokens: number;
  features: string[];
  icon: string;
  color: string;
  bg_color: string;
  is_popular: boolean;
}

const ICON_MAP: Record<string, any> = { Sparkles, Zap, Crown };

const Auth = () => {
  // 'login' | 'plans' | 'signup'
  const [view, setView] = useState<'login' | 'plans' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  // Plans state
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanData | null>(null);

  // Load plans when switching to plans view
  useEffect(() => {
    if (view === 'plans' && plans.length === 0) {
      setPlansLoading(true);
      supabase
        .from('subscription_plans' as any)
        .select('*')
        .eq('is_active', true)
        .gt('price', 0)
        .order('price', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            setPlans(data.map((p: any) => ({
              ...p,
              features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
            })));
          }
          setPlansLoading(false);
        });
    }
  }, [view, plans.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (view === 'login') {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Login realizado!');
        trackPixelEvent('CompleteRegistration', {
          content_name: 'Login',
          status: 'completed',
        });
        navigate('/');
      }
    } else if (view === 'signup') {
      // --- Client-side email validation ---
      const emailCheck = validateEmailDomain(email);
      if (!emailCheck.valid) {
        toast.error(emailCheck.reason);
        setLoading(false);
        return;
      }

      // --- Phone validation ---
      const phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length < 10 || phoneDigits.length > 11) {
        toast.error('Telefone inválido. Digite DDD + número.');
        setLoading(false);
        return;
      }

      // --- CPF validation ---
      if (!validateCPF(cpf)) {
        toast.error('CPF inválido. Verifique os números digitados.');
        setLoading(false);
        return;
      }

      const cpfHashed = await hashCPF(cpf);

      // --- Server-side validation (fingerprint + IP + domain + CPF) ---
      try {
        const fingerprint = await generateFingerprint();

        const { data, error: fnError } = await supabase.functions.invoke('signup-guard', {
          body: { email, fingerprint, cpfHash: cpfHashed },
        });

        if (fnError) {
          toast.error('Erro ao validar cadastro. Tente novamente.');
          setLoading(false);
          return;
        }

        if (!data?.allowed) {
          toast.error(data?.reason || 'Cadastro bloqueado.');
          setLoading(false);
          return;
        }
      } catch {
        toast.error('Erro ao validar cadastro. Tente novamente.');
        setLoading(false);
        return;
      }

      // --- Proceed with signup ---
      const { error } = await signUp(email, password, name);
      if (error) {
        toast.error(error.message);
      } else {
        // Save CPF hash and phone to profile
        const { data: { user: newUser } } = await supabase.auth.getUser();
        if (newUser) {
          await supabase
            .from('profiles')
            .update({ cpf_hash: cpfHashed, phone: phoneDigits } as any)
            .eq('user_id', newUser.id);
        }
        toast.success('Conta criada! Agora siga para o pagamento para ativar seu plano.');
        trackPixelEvent('Lead', {
          content_name: 'Signup',
          content_category: 'Registration',
        });
        // Redirect to native checkout with selected plan
        if (selectedPlan) {
          navigate(`/checkout?plan=${selectedPlan.plan_key}`, { replace: true });
        }
      }
    }
    setLoading(false);
  };

  // Plan selection view
  if (view === 'plans') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <div className="bg-primary/20 rounded-xl p-3">
                <Rocket className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">Escolha seu plano</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Selecione o plano ideal e comece agora
            </p>
          </div>

          {plansLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const Icon = ICON_MAP[plan.icon] || Sparkles;
                return (
                  <Card
                    key={plan.id}
                    className={`relative cursor-pointer border-2 transition-all hover:scale-[1.02] ${
                      selectedPlan?.id === plan.id ? 'border-primary shadow-lg shadow-primary/20' : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => {
                      setSelectedPlan(plan);
                      setView('signup');
                    }}
                  >
                    {plan.is_popular && (
                      <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] px-2">
                        <Star className="w-3 h-3 mr-1" /> Popular
                      </Badge>
                    )}
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.bg_color}`}>
                          <Icon className={`w-5 h-5 ${plan.color}`} />
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground">{plan.name}</h3>
                          <p className="text-xs text-muted-foreground">{plan.tokens} tokens</p>
                        </div>
                      </div>
                      <div className="text-2xl font-extrabold text-foreground">
                        R$ {plan.price.toFixed(2).replace('.', ',')}
                        <span className="text-xs text-muted-foreground font-normal">/mês</span>
                      </div>
                      <ul className="space-y-1.5">
                        {(plan.features as string[]).slice(0, 4).map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button className="w-full" variant={plan.is_popular ? 'default' : 'outline'}>
                        Selecionar <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setView('login')}
              className="text-sm text-primary hover:underline"
            >
              <ArrowLeft className="w-3 h-3 inline mr-1" />
              Já tem conta? Entre
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Login / Signup form view
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="bg-primary/20 rounded-xl p-3">
              <Rocket className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-extrabold text-primary uppercase tracking-tight">
            EscalaXPro
          </CardTitle>
          <CardDescription>
            {view === 'login' ? 'Entre na sua conta' : `Crie sua conta — Plano ${selectedPlan?.name || ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view === 'signup' && selectedPlan && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 mb-4 text-center">
              <p className="text-sm text-primary font-medium">
                🎁 Plano {selectedPlan.name} — R$ {selectedPlan.price.toFixed(2).replace('.', ',')} /mês
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Pagamento obrigatório no cadastro
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {view === 'signup' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="cpf"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(e) => setCpf(formatCPF(e.target.value))}
                      required
                      maxLength={14}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      placeholder="(00)00000-0000"
                      value={phone}
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                      required
                      maxLength={14}
                      className="pl-10"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pl-10"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-full"
            >
              {loading ? 'Aguarde...' : view === 'login' ? 'Entrar' : 'Criar Conta'}
            </Button>
          </form>

          {view === 'login' && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={async () => {
                  if (!email) {
                    toast.error('Digite seu email primeiro.');
                    return;
                  }
                  const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/reset-password`,
                  });
                  if (error) {
                    toast.error(error.message);
                  } else {
                    toast.success('Email de recuperação enviado! Verifique sua caixa de entrada.');
                  }
                }}
                className="text-sm text-muted-foreground hover:text-primary hover:underline"
              >
                Esqueceu sua senha?
              </button>
            </div>
          )}

          {view === 'signup' && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground justify-center">
              <Shield className="h-3 w-3" />
              <span>Apenas emails de provedores confiáveis são aceitos</span>
            </div>
          )}

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                if (view === 'login') {
                  setView('plans');
                } else {
                  setView('login');
                }
              }}
              className="text-sm text-primary hover:underline"
            >
              {view === 'login' ? 'Não tem conta? Crie uma' : (
                <>
                  <ArrowLeft className="w-3 h-3 inline mr-1" />
                  Voltar aos planos
                </>
              )}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
