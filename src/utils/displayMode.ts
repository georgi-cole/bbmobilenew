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
 *   is-webkit          — running inside a WebKit-based browser (Safari, iOS Chrome,
 *                        iOS WebView); NOT set for desktop Chrome/Edge/Firefox
 *   is-chrome-android  — Chrome on Android (supports backdrop-filter well, but may
 *                        have its own compositing quirks)
 *
 * Import and call applyDisplayModeClasses() once at app entry (main.tsx).
 */

/**
 * Applies display-mode CSS classes to `document.documentElement`.
 * Safe to call before the DOM is fully loaded (only touches <html>).
 */
export function applyDisplayModeClasses(): void {
  const html = document.documentElement;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  // ── Capacitor native WebView ─────────────────────────────────────────────
  // Capacitor injects window.Capacitor when running inside a native shell.
  // Use isNativePlatform() to confirm we are in the actual native context;
  // the global may also exist on web when @capacitor/core is imported there.
  const isCapacitor =
    typeof window !== 'undefined' &&
    (
      window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.() === true;

  if (isCapacitor) {
    html.classList.add('is-capacitor');
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
