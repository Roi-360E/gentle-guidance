import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Versão simplificada sem lógicas de cache-busting que possam travar o preview
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

