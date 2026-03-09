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
  try {
    const ua = navigator.userAgent || '';
    const isInApp = /Instagram|FBAN|FBAV/i.test(ua);
    if (isInApp) {
      const currentUrl = window.location.href;
      const isAndroid = /Android/i.test(ua);
      if (isAndroid) {
        window.location.href = `intent://${currentUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
      } else if (/iPhone|iPad|iPod/i.test(ua)) {
        window.location.href = `x-safari-${currentUrl}`;
      }
    }
  } catch (e) {
    console.warn('[EscalaX] In-app redirect skipped:', e);
  }
}

// Enable source code protection in production (safe — returns early in iframe/dev)
try {
  enableSourceProtection();
} catch (e) {
  console.warn('[EscalaX] Source protection skipped:', e);
}

// Force cache clear on new versions — skip in iframe to preserve auth session
if (!isIframe) {
  try {
    const APP_VERSION = '2.2.1';
    const storedVersion = localStorage.getItem('escalax_version');
    if (storedVersion !== APP_VERSION) {
      const authKeys: [string, string | null][] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          authKeys.push([key, localStorage.getItem(key)]);
        }
      }
      localStorage.clear();
      sessionStorage.clear();
      authKeys.forEach(([key, val]) => { if (val) localStorage.setItem(key, val); });
      localStorage.setItem('escalax_version', APP_VERSION);
      if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
      }
    }
  } catch (e) {
    console.warn('[EscalaX] Cache clear skipped:', e);
  }
}

// Mount app with error handling
try {
  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(<App />);
  } else {
    console.error('[EscalaX] #root element not found');
  }
} catch (e) {
  console.error('[EscalaX] Fatal mount error:', e);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `<div style="padding:2rem;color:white;background:#0f0a1a;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui"><div style="text-align:center"><h1>Erro ao carregar</h1><p>${e instanceof Error ? e.message : 'Erro desconhecido'}</p><button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1rem;background:#7c3aed;color:white;border:none;border-radius:8px;cursor:pointer">Recarregar</button></div></div>`;
  }
}
