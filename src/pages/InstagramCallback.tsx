import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle, Copy, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function InstagramCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'server_down'>('loading');
  const [message, setMessage] = useState('Conectando sua conta do Instagram...');
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [rawDebug, setRawDebug] = useState('');

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
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        console.log('Session found:', !!accessToken);

        const { data, error: fnError } = await supabase.functions.invoke('instagram-auth', {
          body: {
            code,
            redirect_uri: `${window.location.origin}/auth/instagram/callback`,
          },
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
        });

        console.log('Instagram auth response:', { data, fnError });

        if (fnError) {
          setStatus('error');
          setMessage(`Erro na função: ${fnError.message || 'desconhecido'}`);
          return;
        }

        if (data?.error) {
          setStatus('error');
          setMessage(data.error);
          if (data._debug) {
            setDebugInfo(data._debug);
            const debugStr = JSON.stringify(data._debug, null, 2);
            setRawDebug(debugStr);
            console.log('=== INSTAGRAM AUTH DEBUG ===\n', debugStr);
          }
          return;
        }

        setStatus('success');
        setMessage(`Conta @${data.username} conectada com sucesso!`);

        if (window.opener) {
          window.opener.postMessage({ type: 'INSTAGRAM_CONNECTED', username: data.username }, '*');
          setTimeout(() => window.close(), 2000);
        }
      } catch (err: any) {
        console.error('Instagram callback error:', err);
        setStatus('error');
        setMessage(err?.message || 'Erro inesperado ao processar a conexão.');
      }
    };

    exchangeCode();
  }, [searchParams]);

  const copyDebug = () => {
    navigator.clipboard.writeText(rawDebug);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full text-center space-y-6">

        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Instagram Conectado!</h2>
              <p className="text-muted-foreground">{message}</p>
            </div>
            <Button onClick={() => window.close()} className="gap-2">
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

            {/* Diagnostic box */}
            {debugInfo ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-left space-y-2 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Diagnóstico</p>
                  <Button variant="ghost" size="sm" onClick={copyDebug} className="h-6 gap-1 text-xs">
                    <Copy className="w-3 h-3" /> Copiar
                  </Button>
                </div>
                <div className="space-y-1 text-xs font-mono text-muted-foreground">
                  <p>👤 <span className="text-foreground">{debugInfo.fb_user?.name} (id:{debugInfo.fb_user?.id})</span></p>
                  <p>🔑 Token 60d: <span className="text-foreground">{debugInfo.long_token_ok ? '✅' : '❌'}</span></p>
                  <p>✅ Perms: <span className="text-foreground">{debugInfo.granted_permissions?.join(', ') || 'nenhuma'}</span></p>
                  {debugInfo.declined_permissions?.length > 0 && (
                    <p>❌ Recusadas: <span className="text-destructive">{debugInfo.declined_permissions.join(', ')}</span></p>
                  )}
                  <div className="border-t border-border mt-2 pt-2">
                    <p className="font-semibold text-warning">[S1] /me/accounts → {debugInfo.strategy1_pages?.data?.length ?? 0} páginas
                      {debugInfo.strategy1_pages?.error ? ` ❌ ${debugInfo.strategy1_pages.error.message}` : ''}
                    </p>
                    {debugInfo.strategy1_pages?.data?.map((p: any) => (
                      <p key={p.id} className="pl-2 text-foreground">↳ {p.name} | IG: {p.instagram_business_account?.id || 'sem IG vinculado'}</p>
                    ))}
                  </div>
                  <div className="border-t border-border pt-2">
                    <p className="font-semibold text-warning">[S2] /me/businesses → {debugInfo.strategy2_businesses?.data?.length ?? 0} business(es)
                      {debugInfo.strategy2_businesses?.error ? ` ❌ ${debugInfo.strategy2_businesses.error.message}` : ''}
                    </p>
                    {debugInfo.strategy2_businesses?.data?.map((b: any) => (
                      <p key={b.id} className="pl-2 text-foreground">↳ {b.name} | IG: {b.instagram_business_accounts?.data?.length ?? 0} | pages: {b.owned_pages?.data?.length ?? 0}</p>
                    ))}
                  </div>
                  <div className="border-t border-border pt-2">
                    <p className="font-semibold text-warning">[S3] instagram_accounts → {debugInfo.strategy3_creator?.instagram_accounts?.data?.length ?? 0}
                      {debugInfo.strategy3_creator?.error ? ` ❌ ${debugInfo.strategy3_creator.error.message}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground text-left space-y-1">
                <div className="flex items-center gap-2 text-warning font-semibold">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Possíveis causas:</span>
                </div>
                <p>• Sessão expirada — feche e reconecte</p>
                <p>• Servidor temporariamente fora do ar (erro 502) — aguarde e tente novamente</p>
                <p>• O código OAuth expirou — é necessário iniciar o processo novamente</p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => window.close()}>
                Fechar
              </Button>
              <Button onClick={() => { window.location.href = window.location.pathname; }} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Tentar Novamente
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
