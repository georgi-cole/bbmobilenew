export type ContextualGuideId =
  | 'incoming'
  | 'promise'
  | 'alliance'
  | 'alliance-consult'
  | 'public-request'

const CONTEXTUAL_GUIDE_VERSION = 'v1'

function tutorialStorage(isGuest: boolean): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return isGuest ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

export function contextualGuideStorageKey(
  guide: ContextualGuideId,
  profileId: string | null
): string {
  return `bbmobilenew_contextual_guide_${CONTEXTUAL_GUIDE_VERSION}:${guide}:${
    profileId ?? 'guest'
  }`
}

export function hasSeenContextualGuide(
  guide: ContextualGuideId,
  profileId: string | null,
  isGuest: boolean
): boolean {
  try {
    return (
      tutorialStorage(isGuest)?.getItem(contextualGuideStorageKey(guide, profileId)) === 'seen'
    )
  } catch {
    return false
  }
}

export function markContextualGuideSeen(
  guide: ContextualGuideId,
  profileId: string | null,
  isGuest: boolean
): void {
  try {
    tutorialStorage(isGuest)?.setItem(contextualGuideStorageKey(guide, profileId), 'seen')
  } catch {
    // Contextual onboarding is best-effort and must never block gameplay.
  }
}
