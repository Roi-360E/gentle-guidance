import { useState, useEffect } from "react";
import { Download, Share, X, ChevronRight, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isIOS = () => {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isSafari = () => {
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|crios|fxios|edgios|opera/i.test(ua);
};

const isStandalone = () => {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;
};

const IOSInstallGuide = ({ onDismiss }: { onDismiss: () => void }) => {
  const inSafari = isSafari();

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border border-border rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom duration-300 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Instalar EscalaXPro</h3>
          </div>
          <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!inSafari ? (
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
              <p className="text-sm font-semibold text-destructive mb-1">⚠️ Abra no Safari</p>
              <p className="text-xs text-muted-foreground">
                Para instalar o app no iPhone, é necessário usar o <strong>Safari</strong>. Copie o link abaixo e cole no Safari:
              </p>
              <div className="mt-3 flex gap-2">
                <code className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs text-foreground truncate">
                  {window.location.origin}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0 rounded-lg text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin);
                  }}
                >
                  Copiar
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Siga os 3 passos abaixo para instalar o app na tela inicial do seu iPhone:
            </p>

            {/* Step 1 */}
            <div className="flex items-start gap-3 bg-muted/50 rounded-xl p-3">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">1</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Toque no botão <Share className="w-4 h-4 inline-block mx-0.5 -mt-0.5 text-primary" /> Compartilhar
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Fica na barra inferior do Safari (ícone de quadrado com seta para cima)
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3 bg-muted/50 rounded-xl p-3">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">2</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Role para baixo e toque em
                </p>
                <div className="mt-1 inline-flex items-center gap-1.5 bg-background border border-border rounded-lg px-3 py-1.5">
                  <span className="text-sm">➕</span>
                  <span className="text-sm font-medium text-foreground">Adicionar à Tela de Início</span>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3 bg-muted/50 rounded-xl p-3">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">3</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Toque em <strong>"Adicionar"</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O app será instalado na sua tela inicial como um aplicativo nativo
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                ✅ Após instalar, o app funcionará offline e em tela cheia
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const wasDismissed = sessionStorage.getItem("pwa_install_dismissed");
    if (wasDismissed || isStandalone()) {
      setDismissed(true);
      return;
    }

    if (isIOS()) {
      setShowIOSBanner(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIOSBanner(false);
    setShowIOSGuide(false);
    setDismissed(true);
    sessionStorage.setItem("pwa_install_dismissed", "true");
  };

  if (dismissed) return null;
  if (!showBanner && !showIOSBanner) return null;

  return (
    <>
      {showIOSGuide && <IOSInstallGuide onDismiss={handleDismiss} />}

      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom-4 duration-300 md:hidden">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            {showIOSBanner ? <Share className="w-5 h-5 text-primary" /> : <Download className="w-5 h-5 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Instalar EscalaXPro</p>
            {showIOSBanner ? (
              <p className="text-xs text-muted-foreground">Toque para ver como instalar no iPhone</p>
            ) : (
              <p className="text-xs text-muted-foreground">Acesse mais rápido pela tela inicial</p>
            )}
          </div>
          {showIOSBanner ? (
            <Button size="sm" onClick={() => setShowIOSGuide(true)} className="shrink-0 rounded-xl gap-1">
              Ver como <ChevronRight className="w-3 h-3" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleInstall} className="shrink-0 rounded-xl">
              Instalar
            </Button>
          )}
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
};
