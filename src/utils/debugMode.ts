const LOCAL_DEBUG_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

type DebugLocationLike = Pick<Location, 'hostname' | 'search' | 'hash'>;

function readQueryParam(fragment: string, key: string): string | null {
  const queryIndex = fragment.indexOf('?');
  if (queryIndex < 0) return null;
  return new URLSearchParams(fragment.slice(queryIndex + 1)).get(key);
}

function isLocalDebugHost(hostname: string): boolean {
  return LOCAL_DEBUG_HOSTS.has(hostname);
}

export function isDebugAccessGranted(
  searchParams: URLSearchParams,
  hostname: string,
): boolean {
  if (searchParams.get('debug') !== '1') return false;
  return isLocalDebugHost(hostname) || searchParams.get('qa') === '1';
}

/**
 * detectDebugMode returns true when the app is running in a debug or e2e
 * context.
 *
 * Checks (in order):
 *   1. window.__E2E__ === true - set by Playwright / test harnesses
 *   2. debug=1 in the URL plus localhost or qa=1
 *
 * Returns false in SSR/non-browser environments and in normal production runs.
 */
export function detectDebugMode(
  locationLike?: DebugLocationLike,
): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as { __E2E__?: boolean }).__E2E__ === true) return true;

  const resolvedLocation = locationLike ?? window.location;

  const debugRequested =
    readQueryParam(resolvedLocation.search, 'debug') === '1' ||
    readQueryParam(resolvedLocation.hash, 'debug') === '1';

  if (!debugRequested) return false;

  return (
    isLocalDebugHost(resolvedLocation.hostname) ||
    readQueryParam(resolvedLocation.search, 'qa') === '1' ||
    readQueryParam(resolvedLocation.hash, 'qa') === '1'
  );
}
