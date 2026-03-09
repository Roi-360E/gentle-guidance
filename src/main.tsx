import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { enableSourceProtection } from "./lib/source-protection";

// Skip redirects and heavy logic inside iframes (Lovable preview)
const isIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

// Detect Instagram/Facebook in-app browser and redirect to native browser
if (!isIframe) {
  (function redirectFromInAppBrowser() {
    const ua = navigator.userAgent || '';
    const isInApp = /Instagram|FBAN|FBAV/i.test(ua);
    if (!isInApp) return;

    const currentUrl = window.location.href;

    const isAndroid = /Android/i.test(ua);
    if (isAndroid) {
      const intentUrl = `intent://${currentUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
      window.location.href = intentUrl;
      return;
    }

    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    if (isIOS) {
      window.location.href = `x-safari-${currentUrl}`;
      setTimeout(() => {
        const banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#0f0a1a;color:#fff;padding:16px;text-align:center;font-family:system-ui;font-size:14px;';
        banner.innerHTML = `
          <p style="margin:0 0 8px">Para melhor experiência, abra no Safari</p>
          <p style="margin:0;font-size:12px;opacity:0.7">Toque nos 3 pontos (⋯) no canto superior e selecione "Abrir no navegador"</p>
        `;
        document.body.prepend(banner);
      }, 500);
    }
  })();
}

// Enable source code protection in production
enableSourceProtection();

// Force cache clear on new versions — skip in iframe to preserve auth session
if (!isIframe) {
  const APP_VERSION = '2.2.1';
  const storedVersion = localStorage.getItem('escalax_version');
  if (storedVersion !== APP_VERSION) {
    console.log(`[EscalaX] Atualizando v${storedVersion || '?'} → v${APP_VERSION}`);
    // Preserve Supabase auth keys during cache clear
    const authKeys: [string, string | null][] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
        authKeys.push([key, localStorage.getItem(key)]);
      }
    }
    localStorage.clear();
    sessionStorage.clear();
    // Restore auth keys
    authKeys.forEach(([key, val]) => { if (val) localStorage.setItem(key, val); });
    localStorage.setItem('escalax_version', APP_VERSION);
    if ('caches' in window) {
      caches.keys().then(names => names.forEach(name => caches.delete(name)));
    }
  }
}

console.log('[EscalaX] App mounting...');
createRoot(document.getElementById("root")!).render(<App />);
console.log('[EscalaX] App mounted');
