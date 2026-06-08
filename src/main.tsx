import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

const APP_VERSION = '2.3.9';

// Cache-busting logic
try {
  const storedVersion = localStorage.getItem('app_version');
  if (storedVersion !== APP_VERSION) {
    localStorage.clear();
    sessionStorage.clear();
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
  const root = createRoot(container);
  root.render(<App />);
}

