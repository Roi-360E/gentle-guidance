import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Zap, ArrowRight, Flame } from 'lucide-react';

interface Props {
  open: boolean;
  onDismiss: () => void;
  onGoToPlans: () => void;
  currentPlan: string;
  suggestedPlanName: string;
  suggestedPlanPrice: number;
}

const NewUserWelcomePopupContent = ({ open, onDismiss, onGoToPlans, currentPlan, suggestedPlanName, suggestedPlanPrice }: Props) => (
  <Dialog open={open} onOpenChange={(v) => { if (!v) onDismiss(); }}>
    <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md border-primary/30 shadow-[0_0_40px_rgba(var(--primary),0.15)]">
      <DialogHeader>
        <div className="flex justify-center mb-3">
          <div className="relative">
            <div className="rounded-full bg-gradient-to-br from-primary to-primary/60 p-5 shadow-lg">
              <Flame className="h-10 w-10 text-primary-foreground animate-pulse" />
            </div>
            <div className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-full">
              UPGRADE
            </div>
          </div>
        </div>
        <DialogTitle className="text-center text-2xl font-bold">
          {currentPlan === 'free' ? '🚀 Comece a Criar Agora!' : '⚡ Faça Upgrade!'}
        </DialogTitle>
        <DialogDescription className="text-center text-base mt-3 space-y-2">
          <span className="block">
            {currentPlan === 'free'
              ? 'Recarregue seus tokens e desbloqueie o poder de criar vídeos combinados ilimitados!'
              : 'Desbloqueie ainda mais recursos com um plano superior!'}
          </span>
          <span className="block mt-3 text-lg font-semibold text-foreground">
            {currentPlan === 'free' ? 'A partir de apenas ' : 'Upgrade por '}
            <span className="text-primary text-xl font-bold">
              R$ {suggestedPlanPrice.toFixed(2).replace('.', ',')}
            </span>
          </span>
          <span className="block text-sm text-muted-foreground">
            Plano {suggestedPlanName} • Acesso imediato
          </span>
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3 mt-5">
        <Button onClick={onGoToPlans} size="lg" className="w-full gap-2 text-base font-semibold shadow-md">
          <Zap className="h-5 w-5" />
          {currentPlan === 'free' ? 'Ver Planos e Recarregar' : 'Fazer Upgrade'}
          <ArrowRight className="h-5 w-5" />
        </Button>
        <Button variant="ghost" onClick={onDismiss} className="w-full text-muted-foreground text-sm">
          Agora não
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default NewUserWelcomePopupContent;
