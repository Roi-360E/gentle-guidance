import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Rocket, Mail, Lock, User, Shield, CreditCard, Phone } from 'lucide-react';
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

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Login realizado!');
        // Track CompleteRegistration on successful login (email verified)
        trackPixelEvent('CompleteRegistration', {
          content_name: 'Login',
          status: 'completed',
        });
        navigate('/');
      }
    } else {
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
        toast.success('Conta criada! Verifique seu email para confirmar.');
        // Track Lead event on successful signup
        trackPixelEvent('Lead', {
          content_name: 'Signup',
          content_category: 'Registration',
        });
      }
    }
    setLoading(false);
  };

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
            {isLogin ? 'Entre na sua conta' : 'Crie sua conta'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
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
              {loading ? 'Aguarde...' : isLogin ? 'Entrar' : 'Criar Conta'}
            </Button>
          </form>

          {isLogin && (
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

          {!isLogin && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground justify-center">
              <Shield className="h-3 w-3" />
              <span>Apenas emails de provedores confiáveis são aceitos</span>
            </div>
          )}

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline"
            >
              {isLogin ? 'Não tem conta? Crie uma' : 'Já tem conta? Entre'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
