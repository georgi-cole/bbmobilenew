export type TutorialGuide = 'game' | 'social'
export type SocialTutorialVariant = 'normal' | 'reality' | 'reality-upgrade'
export type SocialGuideLevel = 0 | 1 | 2

type TutorialReplayState = {
  gamePending: boolean
  socialPending: boolean
}

const REPLAY_VERSION = 'v1'
const SOCIAL_LEVEL_VERSION = 'v1'
const CHANGE_EVENT = 'bbmobilenew:tutorial-preference-changed'

const LEGACY_SEASON_TUTORIAL_VERSION = 'v1'
const LEGACY_SEASON_ENABLED_VERSION = 'v2'
const LEGACY_REALITY_SOCIAL_VERSION = 'v1'

function tutorialStorage(isGuest: boolean): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return isGuest ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

export function tutorialReplayStorageKey(profileId: string | null): string {
  return `bbmobilenew_tutorial_replay_${REPLAY_VERSION}:${profileId ?? 'guest'}`
}

export function socialGuideLevelStorageKey(profileId: string | null): string {
  return `bbmobilenew_social_tutorial_level_${SOCIAL_LEVEL_VERSION}:${profileId ?? 'guest'}`
}

function legacySeasonTutorialStorageKey(profileId: string | null): string {
  return `bbmobilenew_season_tutorial_${LEGACY_SEASON_TUTORIAL_VERSION}:${profileId ?? 'profile'}`
}

function legacySeasonTutorialEnabledStorageKey(profileId: string | null): string {
  return `bbmobilenew_season_tutorial_enabled_${LEGACY_SEASON_ENABLED_VERSION}:${profileId ?? 'profile'}`
}

function legacyRealitySocialStorageKey(profileId: string | null): string {
  return `bbmobilenew_reality_social_tutorial_${LEGACY_REALITY_SOCIAL_VERSION}:${profileId ?? 'guest'}`
}

function migratedReplayState(
  storage: Storage | null,
  profileId: string | null,
  isGuest: boolean
): TutorialReplayState {
  if (!storage) return { gamePending: true, socialPending: true }

  const legacySetting = storage.getItem(legacySeasonTutorialEnabledStorageKey(profileId))
  const legacyGameEnabled = isGuest
    ? true
    : legacySetting === 'enabled'
      ? true
      : legacySetting === 'disabled'
        ? false
        : storage.getItem(legacySeasonTutorialStorageKey(profileId)) !== 'done'
  const legacyRealityHandled =
    storage.getItem(legacyRealitySocialStorageKey(profileId)) === 'done'

  return {
    gamePending: legacyGameEnabled,
    socialPending: !legacyRealityHandled,
  }
}

function readReplayState(profileId: string | null, isGuest: boolean): TutorialReplayState {
  const storage = tutorialStorage(isGuest)
  if (!storage) return { gamePending: true, socialPending: true }

  try {
    const raw = storage.getItem(tutorialReplayStorageKey(profileId))
    if (!raw) return migratedReplayState(storage, profileId, isGuest)

    const parsed = JSON.parse(raw) as Partial<TutorialReplayState>
    if (typeof parsed.gamePending !== 'boolean' || typeof parsed.socialPending !== 'boolean') {
      return migratedReplayState(storage, profileId, isGuest)
    }
    return {
      gamePending: parsed.gamePending,
      socialPending: parsed.socialPending,
    }
  } catch {
    return migratedReplayState(storage, profileId, isGuest)
  }
}

function writeReplayState(
  profileId: string | null,
  isGuest: boolean,
  state: TutorialReplayState
): void {
  const storage = tutorialStorage(isGuest)
  if (!storage) return
  try {
    storage.setItem(tutorialReplayStorageKey(profileId), JSON.stringify(state))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // Tutorial preferences are best-effort and must never block gameplay.
  }
}

export function isTutorialGuidePending(
  profileId: string | null,
  isGuest: boolean,
  guide: TutorialGuide
): boolean {
  const state = readReplayState(profileId, isGuest)
  return guide === 'game' ? state.gamePending : state.socialPending
}

export function isTutorialReplayEnabled(profileId: string | null, isGuest: boolean): boolean {
  const state = readReplayState(profileId, isGuest)
  return state.gamePending || state.socialPending
}

/**
 * The single Settings toggle arms or cancels both onboarding guides together.
 * Each guide consumes only its own pending bit when completed or skipped.
 */
export function setTutorialReplayEnabled(
  profileId: string | null,
  isGuest: boolean,
  enabled: boolean
): void {
  writeReplayState(profileId, isGuest, {
    gamePending: enabled,
    socialPending: enabled,
  })
}

export function markTutorialGuideHandled(
  profileId: string | null,
  isGuest: boolean,
  guide: TutorialGuide
): void {
  const state = readReplayState(profileId, isGuest)
  if (guide === 'game') {
    if (!state.gamePending) return
    writeReplayState(profileId, isGuest, { ...state, gamePending: false })
    return
  }
  if (!state.socialPending) return
  writeReplayState(profileId, isGuest, { ...state, socialPending: false })
}

export function getSocialGuideLevel(profileId: string | null, isGuest: boolean): SocialGuideLevel {
  const storage = tutorialStorage(isGuest)
  if (!storage) return 0

  try {
    const raw = storage.getItem(socialGuideLevelStorageKey(profileId))
    if (raw === '1' || raw === '2') return Number(raw) as SocialGuideLevel
    if (raw === '0') return 0

    // Players who already completed the earlier Reality-only guide have
    // already seen both the basic and premium Social concepts.
    if (storage.getItem(legacyRealitySocialStorageKey(profileId)) === 'done') return 2
  } catch {
    return 0
  }

  return 0
}

function markSocialGuideLevel(
  profileId: string | null,
  isGuest: boolean,
  level: SocialGuideLevel
): void {
  const storage = tutorialStorage(isGuest)
  if (!storage) return

  try {
    const current = getSocialGuideLevel(profileId, isGuest)
    const next = Math.max(current, level) as SocialGuideLevel
    storage.setItem(socialGuideLevelStorageKey(profileId), String(next))
  } catch {
    // Best-effort progression marker.
  }
}

/**
 * Normal Social is the first chapter. If Reality Mode is enabled after that
 * chapter has been seen, only the new Reality-specific chapter is offered.
 * A manual replay uses the current mode and never downgrades learned progress.
 */
export function armRealityUpgradeTutorial(
  profileId: string | null,
  isGuest: boolean
): void {
  if (getSocialGuideLevel(profileId, isGuest) !== 1) return
  const state = readReplayState(profileId, isGuest)
  if (state.socialPending) return
  writeReplayState(profileId, isGuest, { ...state, socialPending: true })
}

export function resolveSocialTutorialVariant(
  profileId: string | null,
  isGuest: boolean,
  realityMode: boolean
): SocialTutorialVariant | null {
  const level = getSocialGuideLevel(profileId, isGuest)
  const replayPending = isTutorialGuidePending(profileId, isGuest, 'social')

  if (realityMode && level === 1) return 'reality-upgrade'
  if (!replayPending) return null
  if (!realityMode) return 'normal'
  return 'reality'
}

export function markSocialTutorialHandled(
  profileId: string | null,
  isGuest: boolean,
  variant: SocialTutorialVariant
): void {
  markSocialGuideLevel(profileId, isGuest, variant === 'normal' ? 1 : 2)
  markTutorialGuideHandled(profileId, isGuest, 'social')
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new Event(CHANGE_EVENT))
    } catch {
      // Best-effort UI sync.
    }
  }
}

export function subscribeTutorialPreferenceChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}
