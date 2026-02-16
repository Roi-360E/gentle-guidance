# 🚀 Plano Completo de Deploy — VM + Cloudflare Zero Trust + Supabase

> **Objetivo:** Colocar sua aplicação React (Vite) em produção em uma VM própria, protegida pelo Cloudflare Zero Trust, com backend no Supabase.

---

## 📋 Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Etapa 1 — Preparar a VM](#3-etapa-1--preparar-a-vm)
4. [Etapa 2 — Instalar Node.js e Dependências](#4-etapa-2--instalar-nodejs-e-dependências)
5. [Etapa 3 — Configurar o Nginx](#5-etapa-3--configurar-o-nginx)
6. [Etapa 4 — Configurar o Cloudflare (DNS)](#6-etapa-4--configurar-o-cloudflare-dns)
7. [Etapa 5 — Instalar o Cloudflare Tunnel (Zero Trust)](#7-etapa-5--instalar-o-cloudflare-tunnel-zero-trust)
8. [Etapa 6 — Configurar SSL com Zero Trust](#8-etapa-6--configurar-ssl-com-zero-trust)
9. [Etapa 7 — Deploy Automatizado com GitHub Actions](#9-etapa-7--deploy-automatizado-com-github-actions)
10. [Etapa 8 — Variáveis de Ambiente e Supabase](#10-etapa-8--variáveis-de-ambiente-e-supabase)
11. [Etapa 9 — Monitoramento e Manutenção](#11-etapa-9--monitoramento-e-manutenção)
12. [Troubleshooting](#12-troubleshooting)
13. [Checklist Final](#13-checklist-final)

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        ARQUITETURA GERAL                        │
└─────────────────────────────────────────────────────────────────┘

  👤 Usuário
     │
     │  HTTPS (porta 443)
     ▼
┌──────────────────────┐
│   CLOUDFLARE EDGE    │  ← CDN, DDoS Protection, WAF
│   (Zero Trust)       │  ← Regras de acesso, autenticação
└──────────┬───────────┘
           │
           │  Cloudflare Tunnel (conexão segura, sem porta aberta)
           │
           ▼
┌──────────────────────┐
│   SUA VM (VPS)       │
│                      │
│  ┌────────────────┐  │
│  │   cloudflared  │  │  ← Daemon do Tunnel
│  │   (túnel)      │  │
│  └───────┬────────┘  │
│          │           │
│          │ localhost  │
│          ▼           │
│  ┌────────────────┐  │
│  │    NGINX       │  │  ← Servidor web (porta 80)
│  │  (serve SPA)   │  │  ← Gzip, cache, try_files
│  └───────┬────────┘  │
│          │           │
│          ▼           │
│  ┌────────────────┐  │
│  │  /var/www/app  │  │  ← Arquivos estáticos (dist/)
│  │  index.html    │  │
│  │  assets/       │  │
│  └────────────────┘  │
└──────────────────────┘
           │
           │  HTTPS (API calls do frontend)
           ▼
┌──────────────────────┐
│     SUPABASE         │
│  ┌────────────────┐  │
│  │  Auth           │  │  ← Autenticação de usuários
│  │  Database       │  │  ← PostgreSQL (tabelas, RLS)
│  │  Edge Functions │  │  ← Lógica backend (Deno)
│  │  Storage        │  │  ← Armazenamento de arquivos
│  └────────────────┘  │
└──────────────────────┘
```

### 🔑 Por que Cloudflare Tunnel (Zero Trust)?

```
MÉTODO TRADICIONAL (sem Tunnel):          MÉTODO ZERO TRUST (com Tunnel):

  Internet ──► Porta 443 aberta           Internet ──► Cloudflare Edge
                  │                                        │
              Firewall                               Tunnel (outbound)
                  │                                        │
              Servidor                                Servidor

  ⚠️ Portas expostas                      ✅ NENHUMA porta aberta
  ⚠️ IP do servidor visível              ✅ IP oculto
  ⚠️ SSL manual (Let's Encrypt)          ✅ SSL automático
  ⚠️ DDoS direto no servidor             ✅ DDoS absorvido pelo Cloudflare
```

---

## 2. Pré-requisitos

### O que você precisa ter:

| Item | Descrição | Onde obter |
|------|-----------|------------|
| **VM/VPS** | Ubuntu 22.04+ ou AlmaLinux | Integrator, DigitalOcean, Hetzner, etc. |
| **Domínio** | Ex: `seuapp.com.br` | Registro.br, GoDaddy, Namecheap |
| **Conta Cloudflare** | Plano Free é suficiente | [dash.cloudflare.com](https://dash.cloudflare.com) |
| **Conta GitHub** | Repositório do código | [github.com](https://github.com) |
| **Conta Supabase** | Backend já configurado | Já conectado via Lovable Cloud |

### Requisitos mínimos da VM:

```
┌─────────────────────────────┐
│     REQUISITOS DA VM        │
├─────────────────────────────┤
│  CPU:    1 vCPU (mínimo)    │
│  RAM:    1 GB (mínimo)      │
│          2 GB (recomendado) │
│  Disco:  20 GB SSD          │
│  SO:     Ubuntu 22.04 LTS   │
│  Rede:   IPv4 público       │
└─────────────────────────────┘
```

---

## 3. Etapa 1 — Preparar a VM

### 3.1 Acessar a VM via SSH

```bash
# No seu terminal local (Windows: use PowerShell ou WSL)
ssh root@SEU_IP_DA_VM
```

> 💡 **Dica:** Se usar Windows, instale o [Windows Terminal](https://aka.ms/terminal) para uma experiência melhor.

### 3.2 Atualizar o sistema

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# AlmaLinux/CentOS
sudo dnf update -y
```

### 3.3 Criar usuário dedicado (não usar root!)

```bash
# Criar usuário "deploy"
sudo adduser deploy

# Dar permissão sudo
sudo usermod -aG sudo deploy

# Mudar para o novo usuário
su - deploy
```

> ⚠️ **IMPORTANTE:** Nunca rode aplicações como `root` em produção!

### 3.4 Configurar Swap (importante para VMs com pouca RAM)

```bash
# Criar arquivo de swap de 2GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Tornar permanente
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verificar
free -h
```

```
Resultado esperado:
┌────────────────────────────────────────┐
│              total   used   free       │
│ Mem:          1.0G   400M   600M       │
│ Swap:         2.0G     0B   2.0G  ✅  │
└────────────────────────────────────────┘
```

### 3.5 Configurar Firewall

```bash
# Ubuntu (UFW)
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status

# NÃO abra as portas 80/443! O Tunnel cuida disso.
```

```
┌──────────────────────────────────────┐
│        REGRAS DE FIREWALL            │
├──────────────────────────────────────┤
│  22/tcp (SSH)     → ALLOW  ✅       │
│  80/tcp (HTTP)    → DENY   🚫       │
│  443/tcp (HTTPS)  → DENY   🚫       │
│                                      │
│  ⭐ Com Zero Trust, NÃO precisa     │
│     abrir portas 80 e 443!          │
│     O Tunnel faz conexão de saída.  │
└──────────────────────────────────────┘
```

---

## 4. Etapa 2 — Instalar Node.js e Dependências

### 4.1 Instalar NVM (Node Version Manager)

```bash
# Instalar NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# Recarregar o terminal
source ~/.bashrc

# Instalar Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# Verificar
node -v   # Deve mostrar v20.x.x
npm -v    # Deve mostrar 10.x.x
```

### 4.2 Instalar Git

```bash
# Ubuntu
sudo apt install git -y

# Verificar
git --version
```

### 4.3 (Opcional) Instalar FFmpeg — se seu app processa vídeo

```bash
# Ubuntu
sudo apt install ffmpeg -y

# Verificar
ffmpeg -version
```

---

## 5. Etapa 3 — Configurar o Nginx

### 5.1 Instalar Nginx

```bash
# Ubuntu
sudo apt install nginx -y

# Verificar status
sudo systemctl status nginx
```

### 5.2 Criar diretório da aplicação

```bash
sudo mkdir -p /var/www/app
sudo chown -R deploy:deploy /var/www/app
```

### 5.3 Configurar o site no Nginx

```bash
sudo nano /etc/nginx/sites-available/app
```

Cole o seguinte conteúdo:

```nginx
server {
    listen 80;
    server_name localhost;

    root /var/www/app;
    index index.html;

    # ─── Compressão Gzip ───
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml;

    # ─── Cache de assets estáticos ───
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # ─── SPA: redireciona tudo para index.html ───
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ─── Segurança ───
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

```
┌─────────────────────────────────────────────────┐
│           FLUXO DO NGINX (SPA)                  │
├─────────────────────────────────────────────────┤
│                                                  │
│  Request: /dashboard                            │
│     │                                            │
│     ▼                                            │
│  try_files $uri                                  │
│     │  /var/www/app/dashboard → NÃO EXISTE       │
│     ▼                                            │
│  try_files $uri/                                 │
│     │  /var/www/app/dashboard/ → NÃO EXISTE      │
│     ▼                                            │
│  Fallback: /index.html  ✅                       │
│     │                                            │
│     ▼                                            │
│  React Router assume a rota no client-side       │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 5.4 Ativar o site

```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/app /etc/nginx/sites-enabled/

# Remover site padrão
sudo rm /etc/nginx/sites-enabled/default

# Testar configuração
sudo nginx -t

# Se mostrar "syntax is ok", reiniciar
sudo systemctl restart nginx
```

---

## 6. Etapa 4 — Configurar o Cloudflare (DNS)

### 6.1 Adicionar domínio ao Cloudflare

1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com)
2. Clique **"Add a site"**
3. Digite seu domínio (ex: `seuapp.com.br`)
4. Selecione o plano **Free**
5. O Cloudflare vai escanear seus DNS existentes

### 6.2 Alterar os Nameservers

O Cloudflare vai fornecer 2 nameservers. Vá ao seu registrador de domínio e troque:

```
┌─────────────────────────────────────────────────┐
│      TROCAR NAMESERVERS NO REGISTRADOR          │
├─────────────────────────────────────────────────┤
│                                                  │
│  ANTES (exemplo Registro.br):                   │
│    ns1.registrobr.com                            │
│    ns2.registrobr.com                            │
│                                                  │
│  DEPOIS (fornecido pelo Cloudflare):             │
│    aria.ns.cloudflare.com                        │
│    duke.ns.cloudflare.com                        │
│                                                  │
│  ⏱️ Propagação: 1-48 horas                      │
└─────────────────────────────────────────────────┘
```

### 6.3 Configuração SSL no Cloudflare

```
Cloudflare Dashboard → SSL/TLS → Overview

Selecione: ✅ Full (Strict)

┌────────────────────────────────────────────┐
│         MODOS SSL DO CLOUDFLARE            │
├────────────────────────────────────────────┤
│                                            │
│  Off          ──  Sem criptografia    ❌   │
│  Flexible     ──  Só até o Cloudflare ⚠️  │
│  Full         ──  Aceita self-signed  ⚠️  │
│  Full Strict  ──  Certificado válido  ✅   │
│                                            │
│  👉 Use FULL STRICT com o Tunnel!         │
└────────────────────────────────────────────┘
```

> **Com o Tunnel, o SSL é automático!** Não precisa instalar certificado no servidor.

---

## 7. Etapa 5 — Instalar o Cloudflare Tunnel (Zero Trust)

### 7.1 O que é o Cloudflare Tunnel?

```
┌─────────────────────────────────────────────────────────┐
│                COMO O TUNNEL FUNCIONA                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. O daemon "cloudflared" roda na sua VM               │
│  2. Ele INICIA uma conexão de SAÍDA para o Cloudflare   │
│  3. O Cloudflare recebe o tráfego dos usuários          │
│  4. E envia pelo túnel para sua VM                      │
│                                                          │
│  Visitante ──► Cloudflare ◄── Tunnel ── cloudflared     │
│                    ▲                        │            │
│                    │                        ▼            │
│              (entrada)               Nginx (localhost)   │
│                                                          │
│  ✅ Nenhuma porta aberta no firewall!                    │
│  ✅ IP do servidor nunca é exposto!                      │
│  ✅ SSL de ponta a ponta automático!                     │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Instalar o cloudflared na VM

```bash
# Ubuntu/Debian
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Verificar
cloudflared --version
```

### 7.3 Fazer login no Cloudflare

```bash
cloudflared tunnel login
```

> Vai abrir uma URL no terminal. Copie e cole no navegador para autorizar.

### 7.4 Criar o Tunnel

```bash
# Criar tunnel com nome descritivo
cloudflared tunnel create meu-app-producao

# O comando vai gerar um ID, algo como:
# Created tunnel meu-app-producao with id a1b2c3d4-e5f6-...
```

> 📝 **Anote o ID do tunnel!** Você vai precisar dele.

### 7.5 Configurar o Tunnel

```bash
# Criar arquivo de configuração
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Cole este conteúdo (substitua os valores):

```yaml
# ~/.cloudflared/config.yml

tunnel: SEU_TUNNEL_ID_AQUI
credentials-file: /home/deploy/.cloudflared/SEU_TUNNEL_ID_AQUI.json

ingress:
  # Seu domínio principal
  - hostname: seuapp.com.br
    service: http://localhost:80

  # Subdomínio www (opcional)
  - hostname: www.seuapp.com.br
    service: http://localhost:80

  # Regra obrigatória de fallback
  - service: http_status:404
```

```
┌──────────────────────────────────────────────────┐
│          ESTRUTURA DO config.yml                  │
├──────────────────────────────────────────────────┤
│                                                   │
│  tunnel: <id>          ← ID do tunnel criado     │
│  credentials-file: ... ← Chave de autenticação   │
│                                                   │
│  ingress:              ← Regras de roteamento    │
│    ┌─────────────────────────────────────┐       │
│    │ hostname: seuapp.com.br             │       │
│    │ service:  http://localhost:80        │       │
│    │                                     │       │
│    │ "Quando alguém acessar              │       │
│    │  seuapp.com.br, envie para          │       │
│    │  o Nginx na porta 80"               │       │
│    └─────────────────────────────────────┘       │
│                                                   │
│    ┌─────────────────────────────────────┐       │
│    │ service: http_status:404            │       │
│    │                                     │       │
│    │ "Para qualquer outro hostname,      │       │
│    │  retorne 404"                       │       │
│    └─────────────────────────────────────┘       │
└──────────────────────────────────────────────────┘
```

### 7.6 Criar registro DNS do Tunnel

```bash
# Isso cria automaticamente um registro CNAME no Cloudflare
cloudflared tunnel route dns meu-app-producao seuapp.com.br
cloudflared tunnel route dns meu-app-producao www.seuapp.com.br
```

### 7.7 Testar o Tunnel

```bash
# Teste manual (vai mostrar os logs em tempo real)
cloudflared tunnel run meu-app-producao
```

> Se funcionar, acesse `https://seuapp.com.br` no navegador. Deve carregar!

### 7.8 Configurar como serviço (iniciar automaticamente)

```bash
# Instalar como serviço do sistema
sudo cloudflared service install

# Habilitar para iniciar no boot
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Verificar status
sudo systemctl status cloudflared
```

```
┌──────────────────────────────────────────────┐
│     STATUS DO SERVIÇO cloudflared            │
├──────────────────────────────────────────────┤
│                                               │
│  ● cloudflared.service - cloudflared          │
│    Loaded: loaded (/etc/systemd/...)          │
│    Active: active (running) ✅               │
│    Main PID: 1234                             │
│                                               │
│  Se mostrar "active (running)" está OK!      │
└──────────────────────────────────────────────┘
```

---

## 8. Etapa 6 — Configurar SSL com Zero Trust

### Com o Tunnel, o SSL é automático!

```
┌──────────────────────────────────────────────────────┐
│              FLUXO SSL COM TUNNEL                     │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Visitante ──HTTPS──► Cloudflare ──Tunnel──► Nginx   │
│       ↑                    ↑                   ↑     │
│       │                    │                   │     │
│  Certificado          Certificado         HTTP puro  │
│  Cloudflare           automático          (localhost) │
│  (edge)               (tunnel)            Seguro! ✅  │
│                                                       │
│  ✅ Não precisa instalar certificado na VM           │
│  ✅ Não precisa configurar Let's Encrypt             │
│  ✅ Não precisa renovar certificados                  │
│  ✅ Nginx ouve apenas em localhost:80                 │
└──────────────────────────────────────────────────────┘
```

### (Opcional) Políticas de acesso — Zero Trust Access

Se quiser proteger rotas administrativas:

1. Acesse **Cloudflare Dashboard → Zero Trust → Access → Applications**
2. Clique **"Add an application"**
3. Selecione **"Self-hosted"**
4. Configure:

```
┌──────────────────────────────────────────────┐
│      EXEMPLO: PROTEGER /admin                │
├──────────────────────────────────────────────┤
│                                               │
│  Application name: Painel Admin               │
│  Domain: seuapp.com.br                        │
│  Path: /admin                                 │
│                                               │
│  Policy: "Allow"                              │
│  Include:                                     │
│    - Emails ending in: @seudominio.com.br    │
│    - Ou emails específicos                    │
│                                               │
│  Resultado:                                   │
│  Ao acessar /admin, o Cloudflare pede login  │
│  ANTES de chegar ao seu servidor!            │
└──────────────────────────────────────────────┘
```

---

## 9. Etapa 7 — Deploy Automatizado com GitHub Actions

### 9.1 Criar chave SSH para deploy

Na sua VM:

```bash
# Gerar chave SSH
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""

# Adicionar a chave pública ao authorized_keys
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys

# Mostrar a chave PRIVADA (copie para o GitHub Secrets)
cat ~/.ssh/deploy_key
```

### 9.2 Configurar GitHub Secrets

Vá em: **GitHub → Seu Repositório → Settings → Secrets and variables → Actions**

Adicione estes secrets:

```
┌────────────────────────────────────────────────────┐
│           GITHUB SECRETS NECESSÁRIOS               │
├────────────────────────────────────────────────────┤
│                                                     │
│  SSH_HOST          →  IP da sua VM                 │
│  SSH_USERNAME      →  deploy                       │
│  SSH_PRIVATE_KEY   →  Conteúdo da chave privada    │
│  SSH_PORT          →  22                           │
│                                                     │
│  ⚠️ Copie a chave INTEIRA, incluindo:             │
│  -----BEGIN OPENSSH PRIVATE KEY-----               │
│  ... conteúdo ...                                  │
│  -----END OPENSSH PRIVATE KEY-----                 │
└────────────────────────────────────────────────────┘
```

### 9.3 Arquivo do GitHub Actions

Crie/edite `.github/workflows/deploy.yml`:

```yaml
name: 🚀 Deploy para VPS via SSH

on:
  push:
    branches:
      - main

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      # 1. Clonar o repositório
      - name: 📥 Checkout do código
        uses: actions/checkout@v4

      # 2. Configurar Node.js
      - name: 📦 Configurar Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # 3. Instalar dependências
      - name: 📦 Instalar dependências
        run: npm ci

      # 4. Build do projeto
      - name: 🔨 Build do projeto
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}

      # 5. Enviar arquivos para a VM
      - name: 📤 Deploy via SCP
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USERNAME }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          port: ${{ secrets.SSH_PORT }}
          source: "dist/*"
          target: "/var/www/app"
          strip_components: 1
          rm: true

      # 6. Reiniciar Nginx (opcional, para limpar cache)
      - name: 🔄 Reload Nginx
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USERNAME }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          port: ${{ secrets.SSH_PORT }}
          script: sudo systemctl reload nginx
```

```
┌──────────────────────────────────────────────────────┐
│           FLUXO DO GITHUB ACTIONS                     │
├──────────────────────────────────────────────────────┤
│                                                       │
│  git push (main)                                     │
│       │                                               │
│       ▼                                               │
│  ┌─────────────────┐                                 │
│  │  GitHub Actions  │                                │
│  │  Runner (Ubuntu) │                                │
│  └────────┬────────┘                                 │
│           │                                           │
│     ┌─────┼─────┐                                    │
│     ▼     ▼     ▼                                    │
│  checkout  npm   build                               │
│            ci    (dist/)                              │
│                    │                                  │
│                    ▼                                  │
│              SCP (SSH)                                │
│                    │                                  │
│                    ▼                                  │
│            /var/www/app/ ← arquivos atualizados      │
│                    │                                  │
│                    ▼                                  │
│             nginx reload                             │
│                    │                                  │
│                    ▼                                  │
│            ✅ Site atualizado!                        │
└──────────────────────────────────────────────────────┘
```

---

## 10. Etapa 8 — Variáveis de Ambiente e Supabase

### 10.1 Variáveis de Build

Adicione estas variáveis como **GitHub Secrets** para que o build funcione:

```
┌─────────────────────────────────────────────────────┐
│         VARIÁVEIS DO SUPABASE (GitHub Secrets)       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  VITE_SUPABASE_URL                                   │
│  → https://agiazdqztkagivnenomq.supabase.co         │
│                                                      │
│  VITE_SUPABASE_PUBLISHABLE_KEY                       │
│  → eyJhbGciOiJIUzI1Ni... (sua anon key)            │
│                                                      │
│  ⚠️ Essas são chaves PÚBLICAS (anon key),           │
│     seguro colocar no build do frontend.             │
│                                                      │
│  ❌ NUNCA coloque a SERVICE_ROLE_KEY no frontend!    │
└─────────────────────────────────────────────────────┘
```

### 10.2 Como o Supabase se conecta

```
┌──────────────────────────────────────────────────────┐
│          CONEXÃO FRONTEND ↔ SUPABASE                  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Seu App (React)                                     │
│       │                                               │
│       │  import { supabase } from                    │
│       │    "@/integrations/supabase/client"           │
│       │                                               │
│       ▼                                               │
│  supabase.auth.signIn()   ──►  Supabase Auth         │
│  supabase.from('table')  ──►  Supabase DB            │
│  supabase.functions      ──►  Edge Functions         │
│  supabase.storage        ──►  Supabase Storage       │
│                                                       │
│  ✅ Protegido por RLS (Row Level Security)           │
│  ✅ Anon key só permite operações autorizadas        │
│  ✅ Service role key NUNCA sai do backend            │
└──────────────────────────────────────────────────────┘
```

---

## 11. Etapa 9 — Monitoramento e Manutenção

### 11.1 Verificar se tudo está rodando

```bash
# Na VM, verificar serviços
sudo systemctl status nginx        # Servidor web
sudo systemctl status cloudflared  # Tunnel

# Verificar logs
sudo journalctl -u cloudflared -f  # Logs do Tunnel em tempo real
sudo tail -f /var/log/nginx/access.log   # Acessos
sudo tail -f /var/log/nginx/error.log    # Erros
```

### 11.2 Monitoramento externo

```
┌──────────────────────────────────────────────┐
│       FERRAMENTAS DE MONITORAMENTO           │
├──────────────────────────────────────────────┤
│                                               │
│  UptimeRobot (grátis)                        │
│  → Monitora se o site está online            │
│  → Envia alerta por email/Telegram           │
│  → uptimerobot.com                           │
│                                               │
│  Cloudflare Analytics (grátis)               │
│  → Tráfego, ameaças bloqueadas              │
│  → Dashboard → Analytics                     │
│                                               │
│  Sentry (grátis até 5K events/mês)           │
│  → Captura erros do frontend                 │
│  → sentry.io                                 │
└──────────────────────────────────────────────┘
```

### 11.3 Atualizações de segurança

```bash
# Agendar atualizações automáticas (Ubuntu)
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades

# Atualizar cloudflared
sudo cloudflared update
```

---

## 12. Troubleshooting

### Problemas comuns e soluções:

```
┌─────────────────────────────────────────────────────────────┐
│  PROBLEMA                    │  SOLUÇÃO                     │
├─────────────────────────────────────────────────────────────┤
│                              │                              │
│  Site mostra 502 Bad Gateway │  → Verificar se Nginx está   │
│                              │    rodando: systemctl status  │
│                              │    nginx                     │
│                              │                              │
│  Site mostra "Tunnel error"  │  → Verificar cloudflared:    │
│                              │    journalctl -u cloudflared │
│                              │                              │
│  Rotas do React dão 404     │  → Verificar try_files no    │
│                              │    Nginx (seção 5.3)         │
│                              │                              │
│  DNS não resolve             │  → Esperar propagação (48h)  │
│                              │  → Verificar nameservers     │
│                              │                              │
│  GitHub Actions falha no SCP │  → Verificar SSH_PRIVATE_KEY │
│                              │  → Verificar permissões do   │
│                              │    diretório /var/www/app    │
│                              │                              │
│  Build falha no Actions      │  → Verificar se VITE_*       │
│                              │    secrets estão no GitHub   │
│                              │                              │
│  Supabase retorna 401       │  → Verificar ANON_KEY        │
│                              │  → Verificar RLS policies    │
└─────────────────────────────────────────────────────────────┘
```

---

## 13. Checklist Final

```
┌──────────────────────────────────────────────────┐
│            ✅ CHECKLIST DE DEPLOY                 │
├──────────────────────────────────────────────────┤
│                                                   │
│  PREPARAÇÃO DA VM                                │
│  [ ] VM acessível via SSH                        │
│  [ ] Usuário "deploy" criado (não usar root)     │
│  [ ] Swap configurado (2GB)                      │
│  [ ] Firewall ativo (só porta 22 aberta)         │
│  [ ] Node.js 20 instalado via NVM                │
│                                                   │
│  NGINX                                           │
│  [ ] Nginx instalado e rodando                   │
│  [ ] Configuração SPA (try_files)                │
│  [ ] Gzip habilitado                             │
│  [ ] Diretório /var/www/app criado               │
│                                                   │
│  CLOUDFLARE                                      │
│  [ ] Domínio adicionado ao Cloudflare            │
│  [ ] Nameservers atualizados no registrador      │
│  [ ] SSL definido como "Full (Strict)"           │
│                                                   │
│  CLOUDFLARE TUNNEL (ZERO TRUST)                  │
│  [ ] cloudflared instalado na VM                 │
│  [ ] Tunnel criado e configurado                 │
│  [ ] DNS route criado (CNAME automático)         │
│  [ ] Serviço systemd habilitado                  │
│  [ ] Teste: site acessível pelo domínio          │
│                                                   │
│  GITHUB ACTIONS                                  │
│  [ ] Chave SSH de deploy criada                  │
│  [ ] Secrets configurados no GitHub              │
│  [ ] Workflow .yml criado e testado              │
│  [ ] Push no main → deploy automático funciona   │
│                                                   │
│  SUPABASE                                        │
│  [ ] VITE_SUPABASE_URL nos GitHub Secrets        │
│  [ ] VITE_SUPABASE_PUBLISHABLE_KEY nos Secrets   │
│  [ ] Edge Functions acessíveis do domínio        │
│  [ ] RLS policies ativas em todas as tabelas     │
│                                                   │
│  MONITORAMENTO                                   │
│  [ ] UptimeRobot configurado                     │
│  [ ] Logs do Nginx acessíveis                    │
│  [ ] Atualizações automáticas habilitadas        │
│                                                   │
│  🎉 DEPLOY COMPLETO!                             │
└──────────────────────────────────────────────────┘
```

---

## 📎 Referências

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/)
- [GitHub Actions - appleboy/scp-action](https://github.com/appleboy/scp-action)
- [Nginx SPA Configuration](https://nginx.org/en/docs/)
- [NVM - Node Version Manager](https://github.com/nvm-sh/nvm)

---

> 📄 **Como converter este arquivo para PDF:**
> 1. Abra no VS Code → Instale a extensão "Markdown PDF" → Clique direito → "Markdown PDF: Export (pdf)"
> 2. Ou acesse [md2pdf.netlify.app](https://md2pdf.netlify.app) e cole o conteúdo
> 3. Ou use o Pandoc: `pandoc PLANO-DEPLOY-ZEROTRUST.md -o plano-deploy.pdf`
