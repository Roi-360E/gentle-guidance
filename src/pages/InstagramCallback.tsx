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
  const [debugInfo, setDebugInfo] = useState<any>(null);

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
          if (data._debug) {
            setDebugInfo(data._debug);
            console.log('=== INSTAGRAM AUTH DEBUG ===', JSON.stringify(data._debug, null, 2));
          }
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

            {/* Debug info */}
            {debugInfo && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3 text-left space-y-2 max-h-64 overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Diagnóstico Detalhado</p>
                <div className="space-y-1 text-xs font-mono text-muted-foreground">
                  <p>👤 FB: <span className="text-foreground">{debugInfo.fb_user?.name} (id:{debugInfo.fb_user?.id})</span></p>
                  <p>🔑 Token longo: <span className="text-foreground">{debugInfo.long_token_ok ? '✅' : '❌'}</span></p>
                  <p>✅ Permissões: <span className="text-foreground">{debugInfo.granted_permissions?.join(', ')}</span></p>
                  
                  <p className="mt-2 font-bold text-yellow-400">Estratégia 1 (/me/accounts):</p>
                  <p>Páginas: <span className="text-foreground">{debugInfo.strategy1_pages?.data?.length ?? 0}
                    {debugInfo.strategy1_pages?.error ? ` ❌ ${debugInfo.strategy1_pages.error.message}` : ''}</span></p>
                  {debugInfo.strategy1_pages?.data?.map((p: any) => (
                    <p key={p.id} className="pl-2 text-foreground">↳ {p.name} | IG: {p.instagram_business_account?.id || 'sem IG'}</p>
                  ))}

                  <p className="mt-2 font-bold text-yellow-400">Estratégia 2 (/me/businesses):</p>
                  <p>Businesses: <span className="text-foreground">{debugInfo.strategy2_businesses?.data?.length ?? 0}
                    {debugInfo.strategy2_businesses?.error ? ` ❌ ${debugInfo.strategy2_businesses.error.message}` : ''}</span></p>
                  {debugInfo.strategy2_businesses?.data?.map((b: any) => (
                    <p key={b.id} className="pl-2 text-foreground">↳ {b.name} | IG accounts: {b.instagram_business_accounts?.data?.length ?? 0} | pages: {b.owned_pages?.data?.length ?? 0}</p>
                  ))}

                  <p className="mt-2 font-bold text-yellow-400">Estratégia 3 (/me?instagram_accounts):</p>
                  <p>IG accounts: <span className="text-foreground">{debugInfo.strategy3_creator?.instagram_accounts?.data?.length ?? 0}
                    {debugInfo.strategy3_creator?.error ? ` ❌ ${debugInfo.strategy3_creator.error.message}` : ''}</span></p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Copie estas informações e envie para o suporte.</p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => window.close()}>
                Fechar
              </Button>
              <Button onClick={() => { window.location.href = window.location.pathname; }}>
                Tentar Novamente
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
