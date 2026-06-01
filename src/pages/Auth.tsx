import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Rocket, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { trackPixelEvent } from '@/lib/pixel-tracker';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const Auth = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('auth.loginSuccess'));
      trackPixelEvent('CompleteRegistration', {
        content_name: 'Login',
        status: 'completed',
      });
      navigate(searchParams.get('redirect') || '/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher />
        </div>
        <Card className="w-full border-border bg-card">
          <CardHeader className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="bg-primary/20 rounded-xl p-3">
                <Rocket className="w-8 h-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-extrabold text-primary uppercase tracking-tight">
              {t('auth.brand')}
            </CardTitle>
            <CardDescription>{t('auth.loginTitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('common.email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('common.password')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type="password" placeholder={t('auth.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="pl-10" />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-full">
                {loading ? t('auth.loggingIn') : t('auth.loginButton')}
              </Button>
            </form>

            <div className="mt-3 text-center">
              <button type="button" onClick={() => navigate('/forgot-password')} className="text-sm text-muted-foreground hover:text-primary hover:underline">
                {t('auth.forgotPassword')}
              </button>
            </div>

            <div className="mt-4 text-center">
              <button type="button" onClick={() => navigate('/planos')} className="text-sm text-primary hover:underline">
                {t('common.noAccount')}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
