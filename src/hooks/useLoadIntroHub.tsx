import { useEffect } from 'react';

interface GameWindow {
  game?: { hubNotifications?: { news?: boolean } };
}

export default function useLoadIntroHub() {
  useEffect(() => {
    // Helper to inject a link tag if not already present
    function ensureCss(href: string) {
      const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      if (!existing.some(el => el.getAttribute('href') === href)) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        document.head.appendChild(l);
      }
    }

    // Helper to inject a script tag (ordered, sync) if missing
    function ensureScript(src: string) {
      const existing = Array.from(document.querySelectorAll('script'));
      if (!existing.some(el => el.getAttribute('src') === src)) {
        const s = document.createElement('script');
        s.src = src;
        s.async = false; // preserve execution order
        document.body.appendChild(s);
      }
    }

    // Determine the correct base path for assets as configured in Vite.
    const basePath = import.meta.env.BASE_URL || '/';

    // Load CSS for the intro hub and houseguests modal
    ensureCss(`${basePath}css/intro-hub.css`);
    ensureCss(`${basePath}css/houseguests-modal.css`);

    // Load data and UI scripts in order
    const scripts = [
      `${basePath}js/data/houseguests.js`,
      `${basePath}js/ui/houseguestsModal.js`,
      `${basePath}js/ui/introHub.js`
    ];

    scripts.forEach(src => ensureScript(src));

    // Optional: set a small flag you can toggle to show badges in the hub for testing
    const w = window as Window & GameWindow;
    w.game = w.game || {};
    w.game.hubNotifications = w.game.hubNotifications || { news: true };

    // No cleanup (we intentionally leave scripts/styles in place for app lifecycle)
  }, []);
}
