import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function InstagramCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Conectando sua conta do Instagram...');
  const [username, setUsername] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage('Você cancelou a autorização ou ocorreu um erro.');
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('Código de autorização não encontrado.');
      return;
    }

    const exchangeCode = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('instagram-auth', {
          body: {
            code,
            redirect_uri: `${window.location.origin}/auth/instagram/callback`,
          },
        });

        console.log('Instagram auth response:', { data, fnError });

        if (fnError) {
          setStatus('error');
          setMessage(fnError.message || 'Erro ao chamar função de autenticação.');
          return;
        }

        if (data?.error) {
          setStatus('error');
          setMessage(data.error);
          return;
        }

        setStatus('success');
        setUsername(data.username || '');
        setMessage(`Conta @${data.username} conectada com sucesso!`);
      } catch (err: any) {
        console.error('Instagram callback error:', err);
        setStatus('error');
        setMessage(err?.message || 'Erro inesperado ao processar a conexão.');
      }
    };

    exchangeCode();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Instagram Conectado!</h2>
              <p className="text-muted-foreground">{message}</p>
            </div>
            <Button onClick={() => { window.close(); }} className="gap-2">
              Fechar e Voltar
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-destructive/10 border-2 border-destructive flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Erro na Conexão</h2>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
            {message.includes('Página') && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-left space-y-2">
                <p className="text-xs font-semibold text-amber-400">Como corrigir:</p>
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>Clique em <strong className="text-foreground">"Tentar Novamente"</strong></li>
                  <li>Na tela do Facebook, clique em <strong className="text-foreground">"Editar"</strong> ao lado de "Páginas"</li>
                  <li>Selecione sua Página do Facebook e confirme</li>
                  <li>Clique em <strong className="text-foreground">"Continuar"</strong> para finalizar</li>
                </ol>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => window.close()}>
                Fechar
              </Button>
              <Button onClick={() => window.location.href = window.location.pathname}>
                Tentar Novamente
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
