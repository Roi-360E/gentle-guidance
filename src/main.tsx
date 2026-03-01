import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { enableSourceProtection } from "./lib/source-protection";

// Detect Instagram/Facebook in-app browser and redirect to native browser
(function redirectFromInAppBrowser() {
  const ua = navigator.userAgent || '';
  const isInApp = /Instagram|FBAN|FBAV/i.test(ua);
  if (!isInApp) return;

  const currentUrl = window.location.href;

  // Android: use intent to open in Chrome
  const isAndroid = /Android/i.test(ua);
  if (isAndroid) {
    const intentUrl = `intent://${currentUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
    window.location.href = intentUrl;
    return;
  }

  // iOS: use x-safari-https scheme or window.open trick
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS) {
    // Try to open in Safari via a blank page trick
    window.location.href = `x-safari-${currentUrl}`;
    // Fallback: show a banner asking user to open in Safari
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

// Enable source code protection in production
enableSourceProtection();

// Force cache clear on new versions
const APP_VERSION = '2.2.0';
const storedVersion = localStorage.getItem('escalax_version');
if (storedVersion !== APP_VERSION) {
  console.log(`[EscalaX] Atualizando v${storedVersion || '?'} → v${APP_VERSION}`);
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('escalax_version', APP_VERSION);
  // Clear all caches
  if ('caches' in window) {
    caches.keys().then(names => names.forEach(name => caches.delete(name)));
  }
}

createRoot(document.getElementById("root")!).render(<App />);
