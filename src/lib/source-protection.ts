/**
 * Client-side source code protection measures.
 * Note: These are deterrents, not absolute protection (client code is always accessible to determined users).
 */

export function enableSourceProtection() {
  if (import.meta.env.DEV) return; // Skip in development

  // 1. Disable right-click context menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });

  // 2. Block common DevTools shortcuts
  document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+I / Cmd+Option+I (Inspect)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+J / Cmd+Option+J (Console)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+C / Cmd+Option+C (Element picker)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      return false;
    }
    // Ctrl+U / Cmd+U (View source)
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      e.preventDefault();
      return false;
    }
    // Ctrl+S / Cmd+S (Save page)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      return false;
    }
  });

  // 3. Disable text selection via CSS
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';

  // 4. Disable drag
  document.addEventListener('dragstart', (e) => {
    e.preventDefault();
    return false;
  });

  // 5. DevTools detection via debugger timing
  let devtoolsOpen = false;
  const threshold = 160;

  const checkDevTools = () => {
    const start = performance.now();
    // debugger statement slows execution when DevTools is open
    // Using Function constructor to avoid bundler stripping it
    (function() {}).constructor('debugger')();
    const end = performance.now();
    
    if (end - start > threshold && !devtoolsOpen) {
      devtoolsOpen = true;
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;text-align:center;padding:2rem"><div><h1 style="font-size:2rem;margin-bottom:1rem">⚠️ Acesso não autorizado</h1><p>Feche as ferramentas de desenvolvedor para continuar usando o aplicativo.</p></div></div>';
    }
  };

  setInterval(checkDevTools, 2000);

  // 6. Console warning
  console.log(
    '%c⛔ ATENÇÃO!',
    'color: red; font-size: 40px; font-weight: bold;'
  );
  console.log(
    '%cEste código é protegido por direitos autorais. Copiar, modificar ou redistribuir é proibido.',
    'color: red; font-size: 16px;'
  );
}
