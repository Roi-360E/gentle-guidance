import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force cache clear on new versions
const APP_VERSION = '2.1.0';
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
