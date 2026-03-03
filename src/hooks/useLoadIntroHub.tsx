import { useEffect } from 'react';

interface GameWindow {
  game?: {
    hubNotifications?: Record<string, boolean>;
    hub?: { init?: (container: HTMLElement) => void };
  };
}

export default function useLoadIntroHub() {
  useEffect(() => {
    // Determine the correct base path for assets as configured in Vite.
    const basePath = import.meta.env.BASE_URL || '/';
    // If the app is served from /bbmobilenew/ (the configured Vite base), fall back to the root
    // path /. If it is somehow served from /, fall back to /bbmobilenew/.
    // This covers deployments where request paths in logs differ from the Vite base setting.
    const altBasePath = basePath === '/bbmobilenew/' ? '/' : '/bbmobilenew/';

    // Helper to inject a link tag if not already present, with onerror fallback
    function ensureCss(href: string) {
      const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      if (!existing.some(el => el.getAttribute('href') === href)) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        l.onload = () => console.debug('[IntroHub] CSS loaded:', href);
        l.onerror = () => {
          console.warn('[IntroHub] CSS failed to load:', href);
          // Attempt fallback path
          const altHref = href.replace(basePath, altBasePath);
          if (altHref !== href) {
            const alreadyLoaded = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
            if (!alreadyLoaded.some(el => el.getAttribute('href') === altHref)) {
              console.debug('[IntroHub] Retrying CSS from alt path:', altHref);
              const lAlt = document.createElement('link');
              lAlt.rel = 'stylesheet';
              lAlt.href = altHref;
              lAlt.onload = () => console.debug('[IntroHub] CSS loaded (alt):', altHref);
              lAlt.onerror = () => console.error('[IntroHub] CSS failed to load (alt):', altHref);
              document.head.appendChild(lAlt);
            }
          }
        };
        document.head.appendChild(l);
      }
    }

    // Helper to inject a script tag (ordered, sync) if missing, with onerror fallback.
    // An optional onLoaded callback fires once the script executes successfully.
    function ensureScript(src: string, onLoaded?: () => void) {
      const existing = Array.from(document.querySelectorAll('script'));
      if (!existing.some(el => el.getAttribute('src') === src)) {
        const s = document.createElement('script');
        s.src = src;
        s.async = false; // preserve execution order
        s.onload = () => {
          console.debug('[IntroHub] Script loaded:', src);
          if (onLoaded) onLoaded();
        };
        s.onerror = () => {
          console.warn('[IntroHub] Script failed to load:', src);
          // Attempt fallback path
          const altSrc = src.replace(basePath, altBasePath);
          if (altSrc !== src) {
            const alreadyLoaded = Array.from(document.querySelectorAll('script'));
            if (!alreadyLoaded.some(el => el.getAttribute('src') === altSrc)) {
              console.debug('[IntroHub] Retrying script from alt path:', altSrc);
              const sAlt = document.createElement('script');
              sAlt.src = altSrc;
              sAlt.async = false;
              sAlt.onload = () => {
                console.debug('[IntroHub] Script loaded (alt):', altSrc);
                if (onLoaded) onLoaded();
              };
              sAlt.onerror = () => console.error('[IntroHub] Script failed to load (alt):', altSrc);
              document.body.appendChild(sAlt);
            }
          }
        };
        document.body.appendChild(s);
      }
    }

    // Load CSS for the intro hub and houseguests modal
    ensureCss(`${basePath}css/intro-hub.css`);
    ensureCss(`${basePath}css/houseguests-modal.css`);

    // Helper to (re-)initialize hub chips into the #intro-hub container.
    function initHubNow() {
      const container = document.getElementById('intro-hub');
      const gw = window as Window & GameWindow;
      if (container && gw.game?.hub?.init) {
        gw.game.hub.init(container);
      }
    }

    // Load data and UI scripts in order.
    // For introHub.js, pass initHubNow so chips are rendered as soon as it loads.
    ensureScript(`${basePath}js/data/houseguests.js`);
    ensureScript(`${basePath}js/ui/houseguestsModal.js`);
    ensureScript(`${basePath}js/ui/introHub.js`, initHubNow);

    // If introHub.js was already loaded from a previous mount, g.hub.init exists —
    // call it directly so chips are re-rendered into the freshly mounted #intro-hub.
    const gw = window as Window & GameWindow;
    gw.game = gw.game || {};
    gw.game.hubNotifications = gw.game.hubNotifications || { news: true };
    initHubNow();

    // No cleanup (we intentionally leave scripts/styles in place for app lifecycle)
  }, []);
}
