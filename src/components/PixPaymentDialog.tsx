import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { generatePixPayload, PIX_KEY, PLAN_CONFIG } from '@/lib/pix-generator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Check, Copy, Loader2, QrCode, ShieldCheck } from 'lucide-react';

interface PixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: 'professional' | 'enterprise';
  onPaymentConfirmed: () => void;
}

export function PixPaymentDialog({ open, onOpenChange, planId, onPaymentConfirmed }: PixPaymentDialogProps) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const planConfig = PLAN_CONFIG[planId];
  const txId = `ESC${Date.now().toString(36).toUpperCase()}`;

  const pixPayload = generatePixPayload({
    pixKey: PIX_KEY,
    merchantName: 'ESCALA CRIATIVO',
    merchantCity: 'SAO PAULO',
    amount: planConfig.price,
    txId,
    description: `Plano ${planConfig.name}`,
  });

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    toast.success('Código Pix copiado!');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleConfirmPayment = useCallback(async () => {
    if (!user) return;
    setConfirming(true);

    try {
      // Create payment record
      const { data, error } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          plan: planId,
          amount: planConfig.price,
          status: 'confirmed',
          pix_tx_id: txId,
          confirmed_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      // Update the user's plan in video_usage
      const monthYear = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

      const { data: existing } = await supabase
        .from('video_usage')
        .select('id')
        .eq('user_id', user.id)
        .eq('month_year', monthYear)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('video_usage')
          .update({ plan: planId })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('video_usage')
          .insert({ user_id: user.id, month_year: monthYear, video_count: 0, plan: planId });
      }

      toast.success(`Plano ${planConfig.name} ativado com sucesso! 🎉`);
      onPaymentConfirmed();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao confirmar pagamento. Tente novamente.');
    } finally {
      setConfirming(false);
    }
  }, [user, planId, planConfig, txId, onPaymentConfirmed, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" />
            Pagamento Pix - {planConfig.name}
          </DialogTitle>
          <DialogDescription>
            Escaneie o QR Code ou copie o código para pagar R$ {planConfig.price.toFixed(2)}/mês
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <QRCodeSVG
                value={pixPayload}
                size={220}
                level="M"
                includeMargin={false}
              />
            </div>
          </div>

          {/* Amount */}
          <div className="text-center">
            <span className="text-3xl font-extrabold text-foreground">R$ {planConfig.price.toFixed(2)}</span>
            <span className="text-muted-foreground text-sm ml-1">/mês</span>
          </div>

          {/* Copy code */}
          <Button
            variant="outline"
            className="w-full gap-2 rounded-full"
            onClick={handleCopyCode}
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar código Pix'}
          </Button>

          {/* Benefits */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Benefícios inclusos</p>
            <ul className="space-y-1.5">
              {planConfig.features.map((feat) => (
                <li key={feat} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  {feat}
                </li>
              ))}
            </ul>
          </div>

          {/* Confirm button */}
          <Button
            className="w-full rounded-full font-semibold bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 gap-2"
            onClick={handleConfirmPayment}
            disabled={confirming}
          >
            {confirming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Confirmando...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Já realizei o pagamento
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Após o pagamento, clique no botão acima para ativar seu plano instantaneamente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
