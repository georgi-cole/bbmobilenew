import { beforeEach, describe, expect, it } from 'vitest'
import {
  hasHandledSeasonTutorial,
  isSeasonTutorialEnabled,
  markSeasonTutorialHandled,
  resetSeasonTutorialPreference,
  seasonTutorialStorageKey,
  setSeasonTutorialEnabled,
} from '../seasonTutorialPreference'

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('season tutorial preference', () => {
  it('never considers a guest tutorial permanently handled', () => {
    markSeasonTutorialHandled(null, true, 'game-1')

    expect(hasHandledSeasonTutorial(null, true, 'game-1')).toBe(true)
    expect(isSeasonTutorialEnabled(null, true)).toBe(true)
    expect(window.localStorage.getItem(seasonTutorialStorageKey(null))).toBeNull()
  })

  it('remembers completion only for the current season', () => {
    markSeasonTutorialHandled('profile-1', false, 'game-1')

    expect(hasHandledSeasonTutorial('profile-1', false, 'game-1')).toBe(true)
    expect(hasHandledSeasonTutorial('profile-1', false, 'game-2')).toBe(false)
    expect(isSeasonTutorialEnabled('profile-1', false)).toBe(true)
  })

  it('enables the tutorial for future seasons without changing this season completion', () => {
    markSeasonTutorialHandled('profile-1', false, 'game-1')
    setSeasonTutorialEnabled('profile-1', false, false)
    expect(isSeasonTutorialEnabled('profile-1', false)).toBe(false)

    resetSeasonTutorialPreference('profile-1', false)

    expect(hasHandledSeasonTutorial('profile-1', false, 'game-1')).toBe(true)
    expect(isSeasonTutorialEnabled('profile-1', false)).toBe(true)
  })

  it('maps the Settings switch directly to next-season tutorial eligibility', () => {
    setSeasonTutorialEnabled('profile-1', false, false)
    expect(isSeasonTutorialEnabled('profile-1', false)).toBe(false)

    setSeasonTutorialEnabled('profile-1', false, true)
    expect(isSeasonTutorialEnabled('profile-1', false)).toBe(true)
  })

  it('cannot disable the tutorial for Guest', () => {
    setSeasonTutorialEnabled(null, true, false)

    expect(isSeasonTutorialEnabled(null, true)).toBe(true)
    expect(window.localStorage.getItem(seasonTutorialStorageKey(null))).toBeNull()
  })
})
