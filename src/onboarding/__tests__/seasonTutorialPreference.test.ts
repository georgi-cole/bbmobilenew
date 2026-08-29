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
})

describe('season tutorial preference', () => {
  it('never considers a guest tutorial permanently handled', () => {
    markSeasonTutorialHandled(null, true)

    expect(hasHandledSeasonTutorial(null, true)).toBe(false)
    expect(isSeasonTutorialEnabled(null, true)).toBe(true)
    expect(window.localStorage.getItem(seasonTutorialStorageKey(null))).toBeNull()
  })

  it('remembers completion for a named profile', () => {
    markSeasonTutorialHandled('profile-1', false)

    expect(hasHandledSeasonTutorial('profile-1', false)).toBe(true)
    expect(isSeasonTutorialEnabled('profile-1', false)).toBe(false)
  })

  it('can reset a named profile so Settings can offer the tutorial again', () => {
    markSeasonTutorialHandled('profile-1', false)
    expect(hasHandledSeasonTutorial('profile-1', false)).toBe(true)

    resetSeasonTutorialPreference('profile-1', false)

    expect(hasHandledSeasonTutorial('profile-1', false)).toBe(false)
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
