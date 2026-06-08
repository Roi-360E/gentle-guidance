import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Detecta se estamos rodando dentro do editor/preview do Lovable
const hostname = window.location.hostname;
const isLovablePreview =
  hostname.endsWith(".lovableproject.com") ||
  hostname.endsWith(".lovable.app") ||
  hostname.startsWith("id-preview--") ||
  hostname.startsWith("preview--") ||
  window.self !== window.top;

// Limpa service workers antigos que possam estar bloqueando o preview
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((reg) => {
        // Sempre desregistra SWs antigos no ambiente do editor
        if (isLovablePreview) {
          reg.unregister();
        }
      });
    })
    .catch(() => {
      // Silent fail
    });
}

const rootElement = document.getElementById("root");

if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}

