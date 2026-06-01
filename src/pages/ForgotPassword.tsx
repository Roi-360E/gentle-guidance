import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Rocket, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const ForgotPassword = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error(t('forgotPassword.missingEmail'));
      return;
    }
    setLoading(true);
    const siteUrl = import.meta.env.PROD ? 'https://escalaxpro.com' : window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
      toast.success(t('forgotPassword.successToast'));
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
              {t('forgotPassword.title')}
            </CardTitle>
            <CardDescription>
              {sent ? t('forgotPassword.descSent') : t('forgotPassword.descIdle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-center">
                <p className="text-muted-foreground text-sm">
                  {t('forgotPassword.checkInbox')}
                </p>
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  onClick={() => navigate('/auth')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('forgotPassword.back')}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('common.email')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('auth.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-full"
                >
                  {loading ? t('forgotPassword.sending') : t('forgotPassword.submit')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => navigate('/auth')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('forgotPassword.back')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
