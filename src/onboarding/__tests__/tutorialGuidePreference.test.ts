import { beforeEach, describe, expect, it } from 'vitest'
import {
  armRealityUpgradeTutorial,
  getSocialGuideLevel,
  isTutorialGuidePending,
  isTutorialReplayEnabled,
  markSocialTutorialHandled,
  markTutorialGuideHandled,
  resolveSocialTutorialVariant,
  setTutorialReplayEnabled,
  socialGuideLevelStorageKey,
  tutorialReplayStorageKey,
} from '../tutorialGuidePreference'

describe('tutorial guide preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('starts with both guides pending and turns off only after both are handled', () => {
    expect(isTutorialReplayEnabled('profile-a', false)).toBe(true)
    expect(isTutorialGuidePending('profile-a', false, 'game')).toBe(true)
    expect(isTutorialGuidePending('profile-a', false, 'social')).toBe(true)

    markTutorialGuideHandled('profile-a', false, 'game')

    expect(isTutorialReplayEnabled('profile-a', false)).toBe(true)
    expect(isTutorialGuidePending('profile-a', false, 'game')).toBe(false)
    expect(isTutorialGuidePending('profile-a', false, 'social')).toBe(true)

    markSocialTutorialHandled('profile-a', false, 'normal')

    expect(isTutorialReplayEnabled('profile-a', false)).toBe(false)
  })

  it('re-arms both guides together from the centralized toggle', () => {
    markTutorialGuideHandled('profile-a', false, 'game')
    markSocialTutorialHandled('profile-a', false, 'reality')
    expect(isTutorialReplayEnabled('profile-a', false)).toBe(false)

    setTutorialReplayEnabled('profile-a', false, true)

    expect(isTutorialGuidePending('profile-a', false, 'game')).toBe(true)
    expect(isTutorialGuidePending('profile-a', false, 'social')).toBe(true)
  })

  it('branches from Normal Social into the Reality-only upgrade chapter', () => {
    expect(resolveSocialTutorialVariant('profile-a', false, false)).toBe('normal')

    markSocialTutorialHandled('profile-a', false, 'normal')

    expect(getSocialGuideLevel('profile-a', false)).toBe(1)
    expect(resolveSocialTutorialVariant('profile-a', false, false)).toBeNull()

    armRealityUpgradeTutorial('profile-a', false)

    expect(isTutorialGuidePending('profile-a', false, 'social')).toBe(true)
    expect(isTutorialReplayEnabled('profile-a', false)).toBe(true)
    expect(resolveSocialTutorialVariant('profile-a', false, true)).toBe('reality-upgrade')

    markSocialTutorialHandled('profile-a', false, 'reality-upgrade')

    expect(getSocialGuideLevel('profile-a', false)).toBe(2)
    expect(resolveSocialTutorialVariant('profile-a', false, true)).toBeNull()
  })

  it('shows the full Reality guide when Reality is active before Social was learned', () => {
    expect(resolveSocialTutorialVariant('profile-a', false, true)).toBe('reality')

    markSocialTutorialHandled('profile-a', false, 'reality')

    expect(getSocialGuideLevel('profile-a', false)).toBe(2)
  })

  it('keeps guest tutorial state session-scoped', () => {
    markTutorialGuideHandled(null, true, 'game')
    markSocialTutorialHandled(null, true, 'normal')

    expect(window.sessionStorage.getItem(tutorialReplayStorageKey(null))).not.toBeNull()
    expect(window.sessionStorage.getItem(socialGuideLevelStorageKey(null))).toBe('1')
    expect(window.localStorage.getItem(tutorialReplayStorageKey(null))).toBeNull()
    expect(window.localStorage.getItem(socialGuideLevelStorageKey(null))).toBeNull()
  })
})
