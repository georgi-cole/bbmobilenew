/**
 * displayMode.ts
 *
 * Detects the current display environment and adds CSS classes to <html> so
 * stylesheets can target platform-specific quirks with plain class selectors.
 *
 * Classes applied:
 *   is-standalone      — launched from iOS/Android home-screen (A2HS / PWA)
 *                        OR running inside a Capacitor native WebView
 *   is-capacitor       — running inside a Capacitor native WebView
 *   is-capacitor-ios   — running inside the native iOS WebView
 *   is-capacitor-android — running inside the native Android WebView
 *   is-webkit          — running inside a WebKit-based browser (Safari, iOS Chrome,
 *                        iOS WebView); NOT set for desktop Chrome/Edge/Firefox
 *   is-chrome-android  — Chrome on Android (supports backdrop-filter well, but may
 *                        have its own compositing quirks)
 *
 * Import and call applyDisplayModeClasses() once at app entry (main.tsx).
 */

interface CapacitorRuntimeLike {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

/** Used only when a native WebView reports zero for env(safe-area-inset-top). */
export function getNativeTopInsetFallbackPx(
  platform: string,
  screenWidth: number,
  screenHeight: number,
): number {
  if (platform === 'android') return 24;
  if (platform !== 'ios') return 0;

  const shortSide = Math.min(screenWidth, screenHeight);
  const longSide = Math.max(screenWidth, screenHeight);
  if (shortSide >= 390 && longSide >= 844) return 59;
  if (longSide >= 812) return 44;
  return 20;
}

function readCssSafeAreaTopPx(): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px)';
  document.documentElement.appendChild(probe);
  const measured = Number.parseFloat(getComputedStyle(probe).paddingTop);
  probe.remove();
  return Number.isFinite(measured) ? measured : 0;
}

/**
 * Applies display-mode CSS classes to `document.documentElement`.
 * Safe to call before the DOM is fully loaded (only touches <html>).
 */
export function applyDisplayModeClasses(): void {
  const html = document.documentElement;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const capacitor = (window as Window & { Capacitor?: CapacitorRuntimeLike }).Capacitor;

  // ── Capacitor native WebView ─────────────────────────────────────────────
  // Capacitor injects window.Capacitor when running inside a native shell.
  // Use isNativePlatform() to confirm we are in the actual native context;
  // the global may also exist on web when @capacitor/core is imported there.
  const isCapacitor =
    typeof window !== 'undefined' &&
    (
      window as Window & { Capacitor?: CapacitorRuntimeLike }
    ).Capacitor?.isNativePlatform?.() === true;

  if (isCapacitor) {
    html.classList.add('is-capacitor');
    const platform = capacitor?.getPlatform?.() ?? '';
    if (platform === 'ios' || platform === 'android') {
      html.classList.add(`is-capacitor-${platform}`);
    }

    if (readCssSafeAreaTopPx() < 1) {
      const fallbackPx = getNativeTopInsetFallbackPx(platform, screen.width, screen.height);
      if (fallbackPx > 0) {
        html.style.setProperty('--app-safe-area-top-fallback', `${fallbackPx}px`);
      }
    }
  }

  // ── Standalone (A2HS / PWA / Capacitor native) ───────────────────────────
  const isStandalone =
    isCapacitor ||
    (typeof window.navigator !== 'undefined' &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches;

  if (isStandalone) {
    html.classList.add('is-standalone');
  }

  // ── WebKit ───────────────────────────────────────────────────────────────
  // Matches Safari (macOS + iOS) and every iOS browser (all use WebKit on iOS).
  // Excludes desktop Chrome/Firefox/Edge which include "Chrome/" or "Firefox/" tokens.
  const isWebKit =
    /WebKit/i.test(ua) && !/Chrome\/|Chromium\/|EdgA?\/|Firefox\//i.test(ua);

  if (isWebKit) {
    html.classList.add('is-webkit');
  }

  // ── Chrome on Android ────────────────────────────────────────────────────
  const isChromeAndroid = /Chrome\//.test(ua) && /Android/.test(ua);

  if (isChromeAndroid) {
    html.classList.add('is-chrome-android');
  }
}
