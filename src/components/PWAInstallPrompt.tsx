import { useState, useEffect } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isIOS = () => {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isStandalone = () => {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;
};

export const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
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
    setDismissed(true);
    sessionStorage.setItem("pwa_install_dismissed", "true");
  };

  if (dismissed) return null;
  if (!showBanner && !showIOSBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom-4 duration-300 md:hidden">
      <div className="bg-card border border-border rounded-2xl p-4 shadow-2xl flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          {showIOSBanner ? <Share className="w-5 h-5 text-primary" /> : <Download className="w-5 h-5 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Instalar EscalaXPro</p>
          {showIOSBanner ? (
            <p className="text-xs text-muted-foreground">
              Toque em <Share className="w-3 h-3 inline-block mx-0.5 -mt-0.5" /> e depois em <strong>"Adicionar à Tela de Início"</strong>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Acesse mais rápido pela tela inicial</p>
          )}
        </div>
        {!showIOSBanner && (
          <Button size="sm" onClick={handleInstall} className="shrink-0 rounded-xl">
            Instalar
          </Button>
        )}
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
