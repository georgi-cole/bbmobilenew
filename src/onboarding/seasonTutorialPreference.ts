const LEGACY_TUTORIAL_VERSION = 'v1'
const TUTORIAL_VERSION = 'v2'

/** Legacy key used before enabled preference and per-season completion diverged. */
export function seasonTutorialStorageKey(profileId: string | null): string {
  return `bbmobilenew_season_tutorial_${LEGACY_TUTORIAL_VERSION}:${profileId ?? 'profile'}`
}

export function seasonTutorialEnabledStorageKey(profileId: string | null): string {
  return `bbmobilenew_season_tutorial_enabled_${TUTORIAL_VERSION}:${profileId ?? 'profile'}`
}

export function seasonTutorialCompletionStorageKey(
  profileId: string | null,
  gameId: string
): string {
  return `bbmobilenew_season_tutorial_completion_${TUTORIAL_VERSION}:${profileId ?? 'guest'}:${gameId}`
}

/**
 * Completion is scoped to one season. The separate enabled preference decides
 * whether a future season should offer the tour.
 */
export function hasHandledSeasonTutorial(
  profileId: string | null,
  isGuest: boolean,
  gameId: string
): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(seasonTutorialCompletionStorageKey(profileId, gameId)) === 'done'
  } catch {
    return false
  }
}

/** Remember completion only for this open season, never as a settings change. */
export function markSeasonTutorialHandled(
  profileId: string | null,
  isGuest: boolean,
  gameId: string
): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(seasonTutorialCompletionStorageKey(profileId, gameId), 'done')
  } catch {
    // Tutorial state is best-effort and must never block gameplay.
  }
}

/** Enable the tutorial for every future season. */
export function resetSeasonTutorialPreference(profileId: string | null, isGuest: boolean): void {
  if (isGuest || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(seasonTutorialEnabledStorageKey(profileId), 'enabled')
    // Preserve a user's intentional re-enable action when upgrading from v1.
    window.localStorage.removeItem(seasonTutorialStorageKey(profileId))
  } catch {
    // Best-effort settings action.
  }
}

/**
 * Settings-facing state: ON means the quick tour appears at every new season
 * start. The v1 completion value is used only as a one-time migration default.
 */
export function isSeasonTutorialEnabled(profileId: string | null, isGuest: boolean): boolean {
  if (isGuest || typeof window === 'undefined') return true
  try {
    const stored = window.localStorage.getItem(seasonTutorialEnabledStorageKey(profileId))
    if (stored === 'enabled') return true
    if (stored === 'disabled') return false
    return window.localStorage.getItem(seasonTutorialStorageKey(profileId)) !== 'done'
  } catch {
    return true
  }
}

/**
 * Toggle the next-season tutorial prompt for a named profile. Guest ignores
 * writes because its tutorial prompt is intentionally always enabled.
 */
export function setSeasonTutorialEnabled(
  profileId: string | null,
  isGuest: boolean,
  enabled: boolean
): void {
  if (isGuest) return
  if (enabled) {
    resetSeasonTutorialPreference(profileId, false)
    return
  }
  try {
    window.localStorage.setItem(seasonTutorialEnabledStorageKey(profileId), 'disabled')
  } catch {
    // Best-effort settings action.
  }
}
