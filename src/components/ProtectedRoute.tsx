import { useAuth } from '@/hooks/useAuth';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (!user) {
      setCheckingSubscription(false);
      return;
    }

    const checkSub = async () => {
      try {
        // Admins skip subscription check
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (roleData) {
          setHasSubscription(true);
          setCheckingSubscription(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_subscriptions')
          .select('status')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error checking subscription:', error);
          setHasSubscription(true);
          setCheckingSubscription(false);
          return;
        }

        if (!data) {
          setHasSubscription(false);
        } else if (data.status === 'blocked') {
          setIsBlocked(true);
          setHasSubscription(true);
        } else {
          setHasSubscription(true);
        }
      } catch {
        setHasSubscription(true);
      }
      setCheckingSubscription(false);
    };

    checkSub();
  }, [user]);

  if (loading || checkingSubscription) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // If user has no subscription, redirect to plans to pick a plan and pay
  if (hasSubscription === false && location.pathname !== '/onboarding') {
    return <Navigate to="/plans" replace />;
  }

  // If user is blocked, show blocked message
  if (isBlocked && location.pathname !== '/plans' && location.pathname !== '/checkout') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
            <Loader2 className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Assinatura Bloqueada</h2>
          <p className="text-muted-foreground text-sm">
            Sua cobrança não foi aprovada. Atualize seus dados de pagamento para continuar usando o plano.
          </p>
          <a
            href="/plans"
            className="inline-block px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition"
          >
            Regularizar Plano
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
