import { useState } from "react";
import { ArrowLeft, Server, Shield, Globe, Terminal, Monitor, Film, ChevronDown, ChevronRight, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const CodeBlock = ({ code, language = "bash" }: { code: string; language?: string }) => {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  return (
    <div className="relative group my-3">
      <pre className="bg-zinc-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        onClick={copyToClipboard}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-700 hover:bg-zinc-600 text-white p-1.5 rounded"
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>
  );
};

const StepSection = ({
  step,
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  step: number;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="border-zinc-800 bg-zinc-950/50">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="flex items-center gap-3 text-lg">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary text-sm font-bold">
            {step}
          </div>
          <Icon className="w-5 h-5 text-primary" />
          <span className="flex-1">{title}</span>
          {open ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      {open && <CardContent className="pt-0 space-y-4">{children}</CardContent>}
    </Card>
  );
};

const DiagramBox = ({ title, items, color = "primary" }: { title: string; items: string[]; color?: string }) => (
  <div className={`border border-${color}/30 bg-${color}/5 rounded-lg p-4`}>
    <h4 className="font-semibold text-sm mb-2 text-primary">{title}</h4>
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  </div>
);

const GuiaDeploy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Guia de Deploy — VPS Integrator + Cloudflare</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Tutorial completo para colocar seu app em produção
            </p>
          </div>
        </div>

        {/* Architecture Diagram */}
        <Card className="border-zinc-800 bg-zinc-950/50 mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Arquitetura do Deploy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-stretch gap-4">
              <DiagramBox
                title="👤 Usuário"
                items={["Acessa seudominio.com.br", "Tráfego via HTTPS"]}
              />
              <div className="flex items-center justify-center text-muted-foreground font-mono text-xs">
                →→→
              </div>
              <DiagramBox
                title="☁️ Cloudflare (Proxy)"
                items={["DNS gerenciado", "CDN + Cache", "SSL Full (Strict)", "Firewall / WAF"]}
              />
              <div className="flex items-center justify-center text-muted-foreground font-mono text-xs">
                →→→
              </div>
              <DiagramBox
                title="🖥️ VPS Integrator"
                items={["Nginx (porta 443)", "Certificado de Origem", "Arquivos estáticos /var/www/app", "FFmpeg instalado"]}
              />
            </div>
            <div className="mt-4 flex flex-col md:flex-row items-stretch gap-4">
              <DiagramBox
                title="⚙️ GitHub Actions"
                items={["Build automático (npm run build)", "Deploy via SSH/SCP", "Triggered on push to main"]}
              />
              <div className="flex items-center justify-center text-muted-foreground font-mono text-xs">
                →→→
              </div>
              <DiagramBox
                title="☁️ Lovable Cloud"
                items={["Banco de dados", "Autenticação", "Edge Functions", "Storage"]}
              />
            </div>
          </CardContent>
        </Card>

        {/* Steps */}
        <div className="space-y-4">
          {/* STEP 1 */}
          <StepSection step={1} title="Acessar a VPS via SSH" icon={Terminal} defaultOpen>
            <p className="text-sm text-muted-foreground">
              Primeiro, acesse sua VPS via terminal. Use as credenciais fornecidas pela Integrator.
            </p>
            <CodeBlock code={`ssh root@SEU_IP_DA_VPS`} />
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-sm text-amber-400">
                💡 <strong>Dica:</strong> Substitua <code>SEU_IP_DA_VPS</code> pelo IP real da sua VPS (encontrado no painel da Integrator).
              </p>
            </div>

            <h4 className="font-semibold mt-4">Configurar Swap (recomendado para VPS com pouca RAM)</h4>
            <CodeBlock code={`fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab`} />
          </StepSection>

          {/* STEP 2 */}
          <StepSection step={2} title="Instalar Node.js 20 via NVM" icon={Server}>
            <p className="text-sm text-muted-foreground">
              O script padrão do NodeSource pode não funcionar na Integrator. Use NVM:
            </p>
            <CodeBlock code={`# Instalar NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Recarregar o terminal
source ~/.bashrc

# Instalar Node.js 20
nvm install 20

# Verificar instalação
node -v   # Deve mostrar v20.x.x
npm -v    # Deve mostrar 10.x.x`} />

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <p className="text-sm text-blue-400">
                ✅ <strong>Validação:</strong> Se <code>node -v</code> retornar <code>v20.x.x</code>, está tudo certo!
              </p>
            </div>
          </StepSection>

          {/* STEP 3 */}
          <StepSection step={3} title="Instalar FFmpeg" icon={Film}>
            <p className="text-sm text-muted-foreground">
              FFmpeg é necessário para processamento de vídeo nativo (muito mais rápido que WASM).
            </p>

            <h4 className="font-semibold">Ubuntu/Debian:</h4>
            <CodeBlock code={`apt update && apt install -y ffmpeg
ffmpeg -version`} />

            <h4 className="font-semibold">AlmaLinux/CentOS:</h4>
            <CodeBlock code={`dnf install -y epel-release
dnf install -y ffmpeg ffmpeg-devel
ffmpeg -version`} />

            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <p className="text-sm text-green-400">
                🎬 <strong>Por quê?</strong> O FFmpeg nativo é ~10x mais rápido que a versão WASM usada no navegador para concatenar vídeos.
              </p>
            </div>
          </StepSection>

          {/* STEP 4 */}
          <StepSection step={4} title="Configurar Nginx para SPA" icon={Server}>
            <p className="text-sm text-muted-foreground">
              Crie o diretório e configure o Nginx para servir sua aplicação React.
            </p>

            <h4 className="font-semibold">Criar diretório:</h4>
            <CodeBlock code={`mkdir -p /var/www/app`} />

            <h4 className="font-semibold">Instalar Nginx:</h4>
            <CodeBlock code={`# Ubuntu/Debian
apt install -y nginx

# AlmaLinux/CentOS
dnf install -y nginx`} />

            <h4 className="font-semibold">Criar arquivo de configuração:</h4>
            <CodeBlock code={`nano /etc/nginx/sites-available/app`} />

            <h4 className="font-semibold">Conteúdo do arquivo (sem SSL — Cloudflare cuida):</h4>
            <CodeBlock language="nginx" code={`server {
    listen 80;
    server_name seudominio.com.br www.seudominio.com.br;
    root /var/www/app;
    index index.html;

    # SPA - redireciona todas as rotas para index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache de assets estáticos
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Compressão Gzip
    gzip on;
    gzip_types text/plain text/css application/json 
               application/javascript text/xml application/xml 
               image/svg+xml;
    gzip_min_length 1000;
}`} />

            <h4 className="font-semibold">Ativar o site:</h4>
            <CodeBlock code={`# Ubuntu/Debian
ln -s /etc/nginx/sites-available/app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Testar configuração
nginx -t

# Reiniciar
systemctl restart nginx
systemctl enable nginx`} />

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-sm text-amber-400">
                ⚠️ <strong>Nota:</strong> Se a VPS usa AlmaLinux, o caminho pode ser <code>/etc/nginx/conf.d/app.conf</code> em vez de <code>sites-available</code>.
              </p>
            </div>
          </StepSection>

          {/* STEP 5 */}
          <StepSection step={5} title="Configurar SSL com Cloudflare" icon={Shield}>
            <p className="text-sm text-muted-foreground">
              Para SSL Full (Strict), instale um Certificado de Origem do Cloudflare.
            </p>

            <h4 className="font-semibold">No Cloudflare:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-2">
              <li>Acesse <strong>SSL/TLS → Origin Server</strong></li>
              <li>Clique em <strong>"Create Certificate"</strong></li>
              <li>Escolha <strong>RSA (2048)</strong></li>
              <li>Adicione seus domínios: <code>seudominio.com.br</code> e <code>*.seudominio.com.br</code></li>
              <li>Validade: <strong>15 anos</strong></li>
              <li>Copie o <strong>Certificate</strong> e a <strong>Private Key</strong></li>
            </ol>

            <h4 className="font-semibold mt-4">Na VPS — salvar os certificados:</h4>
            <CodeBlock code={`# Criar diretório para certificados
mkdir -p /etc/ssl/cloudflare

# Colar o certificado
nano /etc/ssl/cloudflare/cert.pem
# (Cole o conteúdo do Certificate)

# Colar a chave privada
nano /etc/ssl/cloudflare/key.pem
# (Cole o conteúdo da Private Key)`} />

            <h4 className="font-semibold mt-4">Atualizar Nginx para HTTPS:</h4>
            <CodeBlock language="nginx" code={`server {
    listen 443 ssl;
    server_name seudominio.com.br www.seudominio.com.br;

    ssl_certificate     /etc/ssl/cloudflare/cert.pem;
    ssl_certificate_key /etc/ssl/cloudflare/key.pem;

    root /var/www/app;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json
               application/javascript text/xml application/xml
               image/svg+xml;
    gzip_min_length 1000;
}

server {
    listen 80;
    server_name seudominio.com.br www.seudominio.com.br;
    return 301 https://$host$request_uri;
}`} />

            <CodeBlock code={`nginx -t && systemctl restart nginx`} />
          </StepSection>

          {/* STEP 6 */}
          <StepSection step={6} title="Configurar DNS no Cloudflare" icon={Globe}>
            <p className="text-sm text-muted-foreground">
              Configure os registros DNS apontando para sua VPS.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-zinc-800 rounded-lg overflow-hidden">
                <thead className="bg-zinc-900">
                  <tr>
                    <th className="p-3 text-left">Tipo</th>
                    <th className="p-3 text-left">Nome</th>
                    <th className="p-3 text-left">Valor</th>
                    <th className="p-3 text-left">Proxy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  <tr>
                    <td className="p-3"><Badge variant="outline">A</Badge></td>
                    <td className="p-3">@</td>
                    <td className="p-3 font-mono text-xs">SEU_IP_DA_VPS</td>
                    <td className="p-3"><Badge className="bg-orange-500/20 text-orange-400">Proxied ☁️</Badge></td>
                  </tr>
                  <tr>
                    <td className="p-3"><Badge variant="outline">A</Badge></td>
                    <td className="p-3">www</td>
                    <td className="p-3 font-mono text-xs">SEU_IP_DA_VPS</td>
                    <td className="p-3"><Badge className="bg-orange-500/20 text-orange-400">Proxied ☁️</Badge></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 className="font-semibold mt-4">Configurações do SSL no Cloudflare:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-2">
              <li>Acesse <strong>SSL/TLS → Overview</strong></li>
              <li>Defina o modo como <strong>Full (Strict)</strong></li>
              <li>Ative <strong>"Always Use HTTPS"</strong> em Edge Certificates</li>
              <li>Ative <strong>"Automatic HTTPS Rewrites"</strong></li>
            </ol>
          </StepSection>

          {/* STEP 7 */}
          <StepSection step={7} title="Configurar GitHub Actions (Deploy Automático)" icon={Server}>
            <p className="text-sm text-muted-foreground">
              Configure o deploy automático via SSH. Cada push na branch <code>main</code> fará deploy automaticamente.
            </p>

            <h4 className="font-semibold">Passo 1 — Gerar chave SSH na VPS:</h4>
            <CodeBlock code={`ssh-keygen -t ed25519 -C "deploy-key" -f ~/.ssh/deploy_key -N ""

# Adicionar ao authorized_keys
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys

# Copiar a chave privada (você vai precisar dela)
cat ~/.ssh/deploy_key`} />

            <h4 className="font-semibold">Passo 2 — Adicionar Secrets no GitHub:</h4>
            <p className="text-sm text-muted-foreground">
              Vá em <strong>Settings → Secrets and variables → Actions</strong> no seu repositório:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-zinc-800 rounded-lg overflow-hidden">
                <thead className="bg-zinc-900">
                  <tr>
                    <th className="p-3 text-left">Secret</th>
                    <th className="p-3 text-left">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  <tr>
                    <td className="p-3 font-mono text-xs">VPS_HOST</td>
                    <td className="p-3 text-muted-foreground">IP da sua VPS</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-xs">VPS_USER</td>
                    <td className="p-3 text-muted-foreground">root (ou seu usuário)</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-xs">VPS_SSH_KEY</td>
                    <td className="p-3 text-muted-foreground">Conteúdo de <code>~/.ssh/deploy_key</code></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 className="font-semibold mt-4">Passo 3 — O arquivo deploy.yml será atualizado para:</h4>
            <CodeBlock language="yaml" code={`name: Deploy to VPS via SSH

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run build

      - name: Deploy via SCP
        uses: appleboy/scp-action@v0.1.7
        with:
          host: \${{ secrets.VPS_HOST }}
          username: \${{ secrets.VPS_USER }}
          key: \${{ secrets.VPS_SSH_KEY }}
          source: "dist/*"
          target: "/var/www/app"
          strip_components: 1

      - name: Restart Nginx
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: \${{ secrets.VPS_HOST }}
          username: \${{ secrets.VPS_USER }}
          key: \${{ secrets.VPS_SSH_KEY }}
          script: systemctl restart nginx`} />
          </StepSection>

          {/* STEP 8 */}
          <StepSection step={8} title="Testes e Validação" icon={Monitor}>
            <p className="text-sm text-muted-foreground">
              Após completar todos os passos, valide sua configuração:
            </p>

            <h4 className="font-semibold">Checklist de Validação:</h4>
            <div className="space-y-2">
              {[
                "Acessar https://seudominio.com.br — deve carregar o app",
                "Verificar cadeado SSL verde no navegador",
                "Testar navegação (ex: /auth, /plans) — não deve dar 404",
                "Abrir DevTools → Network → verificar Gzip ativo",
                "Fazer um push no GitHub → verificar se deploy automático funciona",
                "Testar login/cadastro — backend Lovable Cloud deve responder",
                "Testar upload de vídeo — funcionalidade principal",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
                  {item}
                </div>
              ))}
            </div>

            <h4 className="font-semibold mt-4">Testar via terminal:</h4>
            <CodeBlock code={`# Verificar se o site responde
curl -I https://seudominio.com.br

# Verificar certificado SSL
openssl s_client -connect seudominio.com.br:443 -servername seudominio.com.br

# Verificar headers de cache
curl -I https://seudominio.com.br/assets/index.js`} />
          </StepSection>

          {/* STEP 9 */}
          <StepSection step={9} title="Monitoramento" icon={Monitor}>
            <p className="text-sm text-muted-foreground">
              Configure monitoramento para ficar de olho no seu app em produção.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DiagramBox
                title="🔔 UptimeRobot (Grátis)"
                items={[
                  "Monitora se o site está online",
                  "Alerta por email/Telegram/Slack",
                  "Verificação a cada 5 minutos",
                  "uptimerobot.com",
                ]}
              />
              <DiagramBox
                title="📊 Cloudflare Analytics"
                items={[
                  "Já incluso no plano gratuito",
                  "Tráfego, cache hits, ameaças",
                  "Métricas de performance",
                  "Web Analytics (opcional)",
                ]}
              />
              <DiagramBox
                title="🐛 Sentry (Grátis até 5K erros)"
                items={[
                  "Captura erros do frontend",
                  "Stack traces detalhados",
                  "Alertas por email",
                  "sentry.io",
                ]}
              />
              <DiagramBox
                title="📈 Google Analytics"
                items={[
                  "Comportamento dos usuários",
                  "Páginas mais visitadas",
                  "Conversões",
                  "analytics.google.com",
                ]}
              />
            </div>
          </StepSection>
        </div>

        {/* Footer CTA */}
        <Card className="border-primary/30 bg-primary/5 mt-8">
          <CardContent className="p-6 text-center space-y-3">
            <h3 className="font-semibold text-lg">Precisa de ajuda com algum passo?</h3>
            <p className="text-sm text-muted-foreground">
              Me diga qual etapa você está e eu executo junto com você em tempo real!
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GuiaDeploy;
