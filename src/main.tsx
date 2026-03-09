import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Source protection — only in production, outside iframes
try {
  const inIframe = window.self !== window.top;
  if (!inIframe && !import.meta.env.DEV) {
    import("./lib/source-protection").then(m => m.enableSourceProtection()).catch(() => {});
  }
} catch {}

createRoot(document.getElementById("root")!).render(<App />);
