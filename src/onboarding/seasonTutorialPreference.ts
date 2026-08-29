const TUTORIAL_VERSION = 'v1'

export function seasonTutorialStorageKey(profileId: string | null): string {
  return `bbmobilenew_season_tutorial_${TUTORIAL_VERSION}:${profileId ?? 'profile'}`
}

/**
 * Guest runs deliberately never remember the tutorial choice: every fresh
 * guest season should offer the quick tour again.
 */
export function hasHandledSeasonTutorial(profileId: string | null, isGuest: boolean): boolean {
  if (isGuest || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(seasonTutorialStorageKey(profileId)) === 'done'
  } catch {
    return false
  }
}

/** Persist completion only for named profiles. */
export function markSeasonTutorialHandled(profileId: string | null, isGuest: boolean): void {
  if (isGuest || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(seasonTutorialStorageKey(profileId), 'done')
  } catch {
    // Tutorial persistence is best-effort and must never block gameplay.
  }
}

/**
 * Makes the tutorial eligible again for the profile's next season start.
 * Guests need no reset because they are always eligible.
 */
export function resetSeasonTutorialPreference(profileId: string | null, isGuest: boolean): void {
  if (isGuest || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(seasonTutorialStorageKey(profileId))
  } catch {
    // Best-effort settings action.
  }
}

/**
 * Settings-facing state: ON means the quick tour is eligible to appear at the
 * next season start. Guest is permanently ON by design.
 */
export function isSeasonTutorialEnabled(profileId: string | null, isGuest: boolean): boolean {
  return isGuest || !hasHandledSeasonTutorial(profileId, false)
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
  if (enabled) resetSeasonTutorialPreference(profileId, false)
  else markSeasonTutorialHandled(profileId, false)
}
