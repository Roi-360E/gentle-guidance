import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const APP_VERSION = '2.2.2';

// Cache-busting: limpa caches antigos preservando auth
try {
  const storedVersion = localStorage.getItem('app_version');
  if (storedVersion !== APP_VERSION) {
    console.log(`[App] Atualizando versão ${storedVersion} → ${APP_VERSION}`);
    const keysToKeep: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
        keysToKeep.push(key);
      }
    }
    const saved = keysToKeep.map(k => [k, localStorage.getItem(k)!]);
    localStorage.clear();
    saved.forEach(([k, v]) => localStorage.setItem(k, v));
    localStorage.setItem('app_version', APP_VERSION);
    if ('caches' in window) {
      caches.keys().then(names => names.forEach(n => caches.delete(n)));
    }
  }
} catch {}

// Source protection — only in production, outside iframes
try {
  const inIframe = window.self !== window.top;
  if (!inIframe && !import.meta.env.DEV) {
    import("./lib/source-protection").then(m => m.enableSourceProtection()).catch(() => {});
  }
} catch {}

try {
  createRoot(document.getElementById("root")!).render(<App />);
} catch (err) {
  console.error('[App] Fatal mount error:', err);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><div style="text-align:center"><h2>Erro ao carregar</h2><p>Recarregue a página (Ctrl+Shift+R)</p></div></div>';
  }
}
