import { IS_ADMIN_BUILD, IS_RELEASE_BUILD } from '../config/buildTarget'
const LOCAL_DEBUG_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
export const DEBUG_ACCESS_STORAGE_KEY = 'bbmobilenew:qa-debug-access'

type DebugLocationLike = Pick<Location, 'hostname' | 'search' | 'hash'>

function readQueryParam(fragment: string, key: string): string | null {
  const queryIndex = fragment.indexOf('?')
  if (queryIndex < 0) return null
  return new URLSearchParams(fragment.slice(queryIndex + 1)).get(key)
}

function isLocalDebugHost(hostname: string): boolean {
  return LOCAL_DEBUG_HOSTS.has(hostname)
}

function readPersistedDebugAccess(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DEBUG_ACCESS_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function persistDebugAccess(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEBUG_ACCESS_STORAGE_KEY, '1')
  } catch {
    // Debug access still works for the current URL when storage is unavailable.
  }
}

export function revokeDebugAccess(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DEBUG_ACCESS_STORAGE_KEY)
  } catch {
    // Best effort. Callers reload after revoking so URL gating is re-evaluated.
  }
}

function hasDebugQaAccess(locationLike: DebugLocationLike): boolean {
  const debugRequested =
    readQueryParam(locationLike.search, 'debug') === '1' ||
    readQueryParam(locationLike.hash, 'debug') === '1'

  if (!debugRequested) return false

  return (
    isLocalDebugHost(locationLike.hostname) ||
    readQueryParam(locationLike.search, 'qa') === '1' ||
    readQueryParam(locationLike.hash, 'qa') === '1'
  )
}

function isRemoteQaSession(locationLike: DebugLocationLike): boolean {
  if (isLocalDebugHost(locationLike.hostname)) return false

  return (
    readQueryParam(locationLike.search, 'qa') === '1' ||
    readQueryParam(locationLike.hash, 'qa') === '1'
  )
}

export function isDebugAccessGranted(searchParams: URLSearchParams, hostname: string): boolean {
  if (IS_ADMIN_BUILD) return true
  if (IS_RELEASE_BUILD) return false
  const requested =
    searchParams.get('debug') === '1' &&
    (isLocalDebugHost(hostname) || searchParams.get('qa') === '1')
  return requested || readPersistedDebugAccess()
}

export function canAccessSpecialSettings(locationLike?: DebugLocationLike): boolean {
  if (typeof window === 'undefined') return false
  if (IS_RELEASE_BUILD) return false
  if (IS_ADMIN_BUILD) return true
  if ((window as { __E2E__?: boolean }).__E2E__ === true) return true

  const resolvedLocation = locationLike ?? window.location
  return hasDebugQaAccess(resolvedLocation) || readPersistedDebugAccess()
}

/**
 * detectDebugMode returns true only for execution contexts that should use
 * debug gameplay shortcuts.
 *
 * Remote QA sessions retain access to the DebugPanel and special settings,
 * but deliberately use the normal gameplay choreography. Treating a remote
 * QA session as a gameplay-debug context skipped the Final 4 plea initializer
 * and could leave the game stuck in final4_eviction with no pending action.
 *
 * Checks (in order):
 *   1. window.__E2E__ === true - set by Playwright / test harnesses
 *   2. local debug=1 sessions
 *
 * Returns false in SSR/non-browser environments, normal production runs,
 * and remote qa=1 sessions.
 */
export function detectDebugMode(locationLike?: DebugLocationLike): boolean {
  if (typeof window === 'undefined') return false
  if (IS_RELEASE_BUILD) return false
  if (IS_ADMIN_BUILD) return true
  if ((window as { __E2E__?: boolean }).__E2E__ === true) return true

  const resolvedLocation = locationLike ?? window.location
  if (isRemoteQaSession(resolvedLocation)) return false
  return hasDebugQaAccess(resolvedLocation)
}
