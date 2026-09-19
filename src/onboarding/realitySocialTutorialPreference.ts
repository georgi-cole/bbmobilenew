const TUTORIAL_VERSION = 'v1'

export function realitySocialTutorialStorageKey(profileId: string | null): string {
  return `bbmobilenew_reality_social_tutorial_${TUTORIAL_VERSION}:${profileId ?? 'guest'}`
}

function tutorialStorage(isGuest: boolean): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return isGuest ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

/**
 * The Reality Social guide is tied to actually seeing the premium social
 * experience, not to generic Social usage. A player may therefore use the
 * normal Social panel for many seasons, upgrade later, and still receive the
 * guide the first time they open Social with Reality Mode active.
 */
export function hasHandledRealitySocialTutorial(
  profileId: string | null,
  isGuest: boolean
): boolean {
  try {
    return tutorialStorage(isGuest)?.getItem(realitySocialTutorialStorageKey(profileId)) === 'done'
  } catch {
    return false
  }
}

export function markRealitySocialTutorialHandled(profileId: string | null, isGuest: boolean): void {
  try {
    tutorialStorage(isGuest)?.setItem(realitySocialTutorialStorageKey(profileId), 'done')
  } catch {
    // Tutorial persistence is best-effort and must never block Social.
  }
}

export function resetRealitySocialTutorial(profileId: string | null, isGuest: boolean): void {
  try {
    tutorialStorage(isGuest)?.removeItem(realitySocialTutorialStorageKey(profileId))
  } catch {
    // Best-effort replay preference.
  }
}
