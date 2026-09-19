import { beforeEach, describe, expect, it } from 'vitest'
import {
  hasHandledRealitySocialTutorial,
  markRealitySocialTutorialHandled,
  realitySocialTutorialStorageKey,
  resetRealitySocialTutorial,
} from '../realitySocialTutorialPreference'

describe('Reality Social tutorial preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('persists completion per named profile', () => {
    expect(hasHandledRealitySocialTutorial('profile-a', false)).toBe(false)

    markRealitySocialTutorialHandled('profile-a', false)

    expect(hasHandledRealitySocialTutorial('profile-a', false)).toBe(true)
    expect(hasHandledRealitySocialTutorial('profile-b', false)).toBe(false)
    expect(
      window.localStorage.getItem(realitySocialTutorialStorageKey('profile-a'))
    ).toBe('done')
  })

  it('keeps guest completion session-scoped', () => {
    markRealitySocialTutorialHandled(null, true)

    expect(hasHandledRealitySocialTutorial(null, true)).toBe(true)
    expect(window.sessionStorage.getItem(realitySocialTutorialStorageKey(null))).toBe('done')
    expect(window.localStorage.getItem(realitySocialTutorialStorageKey(null))).toBeNull()
  })

  it('can be reset so the guide is offered again', () => {
    markRealitySocialTutorialHandled('profile-a', false)
    resetRealitySocialTutorial('profile-a', false)

    expect(hasHandledRealitySocialTutorial('profile-a', false)).toBe(false)
  })
})
