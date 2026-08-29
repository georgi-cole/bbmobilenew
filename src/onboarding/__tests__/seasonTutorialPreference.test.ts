import { beforeEach, describe, expect, it } from 'vitest'
import {
  hasHandledSeasonTutorial,
  markSeasonTutorialHandled,
  resetSeasonTutorialPreference,
  seasonTutorialStorageKey,
} from '../seasonTutorialPreference'

beforeEach(() => {
  window.localStorage.clear()
})

describe('season tutorial preference', () => {
  it('never considers a guest tutorial permanently handled', () => {
    markSeasonTutorialHandled(null, true)

    expect(hasHandledSeasonTutorial(null, true)).toBe(false)
    expect(window.localStorage.getItem(seasonTutorialStorageKey(null))).toBeNull()
  })

  it('remembers completion for a named profile', () => {
    markSeasonTutorialHandled('profile-1', false)

    expect(hasHandledSeasonTutorial('profile-1', false)).toBe(true)
  })

  it('can reset a named profile so Settings can offer the tutorial again', () => {
    markSeasonTutorialHandled('profile-1', false)
    expect(hasHandledSeasonTutorial('profile-1', false)).toBe(true)

    resetSeasonTutorialPreference('profile-1', false)

    expect(hasHandledSeasonTutorial('profile-1', false)).toBe(false)
  })
})
