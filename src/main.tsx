import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

const APP_VERSION = '2.3.5';

// Cache-busting: limpa caches antigos preservando auth
try {
  const storedVersion = localStorage.getItem('app_version');
  if (storedVersion !== APP_VERSION) {
    console.log(`[App] Updating version ${storedVersion} → ${APP_VERSION}`);
    const keysToKeep = ['app_language', 'user_currency_override', 'app_version'];
    const saved: [string, string][] = [];
    
    // Preserve Supabase and essential app keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase') || keysToKeep.includes(key))) {
        const val = localStorage.getItem(key);
        if (val !== null) saved.push([key, val]);
      }
    }
    
    localStorage.clear();
    saved.forEach(([k, v]) => localStorage.setItem(k, v));
    localStorage.setItem('app_version', APP_VERSION);
    if ('caches' in window) {
      caches.keys().then(names => {
        if (names) {
          names.forEach(n => caches.delete(n));
        }
      });
    }
  }
} catch (e) {
  console.warn('[App] Cache-busting failed:', e);
}

// Source protection removed to fix preview issues
/*
try {
  const isSandbox = window.location.hostname.includes('lovableproject.com') || 
                    window.location.hostname.includes('lovable.app') ||
                    window.location.hostname.includes('localhost');
  const inIframe = window.self !== window.top;
  
  if (!inIframe && !isSandbox && !import.meta.env.DEV) {
    import("./lib/source-protection").then(m => m.enableSourceProtection()).catch(() => {});
  }
} catch {}
*/

try {
  const container = document.getElementById("root");
  if (!container) throw new Error("Root container not found");
  createRoot(container).render(<App />);
} catch (err) {
  console.error('[App] Fatal mount error:', err);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><div style="text-align:center"><h2>Erro ao carregar</h2><p>Recarregue a página (Ctrl+Shift+R)</p></div></div>';
  }
}
