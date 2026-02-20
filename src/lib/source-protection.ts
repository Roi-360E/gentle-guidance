/**
 * Client-side source code protection measures.
 * Uses capture phase + multiple targets for maximum effectiveness.
 */

export function enableSourceProtection() {
  if (import.meta.env.DEV) return;

  // 1. Block right-click on ALL targets with capture phase (highest priority)
  const blockContextMenu = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  };

  // Apply to window, document, and documentElement for maximum coverage
  window.addEventListener('contextmenu', blockContextMenu, true);
  document.addEventListener('contextmenu', blockContextMenu, true);
  document.documentElement.addEventListener('contextmenu', blockContextMenu, true);

  // Also set oncontextmenu directly
  document.oncontextmenu = () => false;
  window.oncontextmenu = () => false;

  // Re-apply after DOM changes (SPA navigation)
  const observer = new MutationObserver(() => {
    document.body.oncontextmenu = () => false;
    document.body.style.userSelect = 'none';
    (document.body.style as any).webkitUserSelect = 'none';
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 2. Block DevTools shortcuts (capture phase)
  const blockKeys = (e: KeyboardEvent) => {
    // F12
    if (e.key === 'F12') {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    // Ctrl+Shift+I/J/C (DevTools)
    if (ctrl && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }
    // Ctrl+U (view source) / Ctrl+S (save) / Ctrl+P (print)
    if (ctrl && ['u', 'U', 's', 'S', 'p', 'P'].includes(e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }
  };

  window.addEventListener('keydown', blockKeys, true);
  document.addEventListener('keydown', blockKeys, true);

  // 3. Disable text selection
  document.body.style.userSelect = 'none';
  (document.body.style as any).webkitUserSelect = 'none';

  // 4. Disable drag
  window.addEventListener('dragstart', (e) => { e.preventDefault(); }, true);

  // 5. Disable copy/cut
  window.addEventListener('copy', (e) => { e.preventDefault(); }, true);
  window.addEventListener('cut', (e) => { e.preventDefault(); }, true);

  // 6. DevTools detection
  let devtoolsOpen = false;
  const threshold = 160;

  const checkDevTools = () => {
    const start = performance.now();
    (function() {}).constructor('debugger')();
    const end = performance.now();

    if (end - start > threshold && !devtoolsOpen) {
      devtoolsOpen = true;
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;text-align:center;padding:2rem"><div><h1 style="font-size:2rem;margin-bottom:1rem">⚠️ Acesso não autorizado</h1><p>Feche as ferramentas de desenvolvedor para continuar usando o aplicativo.</p></div></div>';
    }
  };

  setInterval(checkDevTools, 2000);

  // 7. Console warning
  console.log('%c⛔ ATENÇÃO!', 'color: red; font-size: 40px; font-weight: bold;');
  console.log('%cEste código é protegido por direitos autorais. Copiar, modificar ou redistribuir é proibido.', 'color: red; font-size: 16px;');
}
