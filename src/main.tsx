import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

const APP_VERSION = '2.3.7';

// Cache-busting logic
try {
  const storedVersion = localStorage.getItem('app_version');
  if (storedVersion !== APP_VERSION) {
    console.log(`[App] Updating version ${storedVersion} → ${APP_VERSION}`);
    const keysToKeep = ['app_language', 'user_currency_override', 'app_version'];
    const saved: [string, string][] = [];
    
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

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
}
