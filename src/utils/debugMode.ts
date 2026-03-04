/**
 * detectDebugMode — returns true when the app is running in a debug or e2e context.
 *
 * Checks (in order):
 *   1. window.__E2E__ === true  — set by Playwright / test harnesses via addInitScript
 *   2. "debug=1" in location.search  — e.g. http://…/game?debug=1
 *   3. "debug=1" in location.hash    — e.g. http://…/#/game?debug=1 (hash-router)
 *
 * Returns false in SSR/non-browser environments and in normal production runs.
 */
export function detectDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as { __E2E__?: boolean }).__E2E__ === true) return true;
  return (
    window.location.search.includes('debug=1') ||
    window.location.hash.includes('debug=1')
  );
}
