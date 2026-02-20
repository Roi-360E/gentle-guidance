import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Instagram, Link2, Unlink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const REDIRECT_URI = `${window.location.origin}/auth/instagram/callback`;

const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
].join(',');

export function InstagramConnect() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [metaAppId, setMetaAppId] = useState('');
  const [connection, setConnection] = useState<{
    instagram_username: string;
    instagram_user_id: string;
  } | null>(null);

  const fetchStatus = async () => {
    if (!session) return;
    try {
      const [statusRes, appIdRes] = await Promise.all([
        supabase.functions.invoke('instagram-auth', {
          body: { action: 'status' },
        }),
        supabase.functions.invoke('instagram-auth', {
          body: { action: 'get_app_id' },
        }),
      ]);
      setConnection(statusRes.data?.connection || null);
      setMetaAppId(appIdRes.data?.app_id || '');
    } catch (err) {
      console.error('Failed to fetch IG status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [session]);

  const handleConnect = () => {
    if (!metaAppId) {
      toast.error('App ID não configurado. Contate o suporte.');
      return;
    }
    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPES}&response_type=code&state=${crypto.randomUUID()}`;
    window.location.href = authUrl;
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    try {
      await supabase.functions.invoke('instagram-auth', {
        body: { action: 'disconnect' },
      });
      setConnection(null);
      toast.success('Conta do Instagram desconectada');
    } catch (err) {
      toast.error('Erro ao desconectar');
    } finally {
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-2.5">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">Instagram</CardTitle>
              <CardDescription className="text-sm">
                Publique anúncios diretamente no seu perfil
              </CardDescription>
            </div>
          </div>
          {connection ? (
            <Badge variant="outline" className="gap-1.5 text-green-500 border-green-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5" /> Desconectado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {connection ? (
          <>
            <div className="rounded-lg bg-secondary/50 border border-border p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Instagram className="w-4 h-4 text-pink-500" />
                <span className="font-medium text-sm">@{connection.instagram_username}</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={connecting}
              className="gap-2 text-destructive hover:text-destructive"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Unlink className="w-4 h-4" />
              )}
              Desconectar
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Conecte sua conta Business/Creator do Instagram para publicar
              anúncios automaticamente com gancho, corpo e CTA gerados.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>Conta Instagram Business ou Creator obrigatória</li>
              <li>Vinculada a uma Página do Facebook</li>
              <li>Permissões de publicação necessárias</li>
            </ul>
            <Button onClick={handleConnect} className="gap-2">
              <Link2 className="w-4 h-4" /> Conectar Instagram
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
