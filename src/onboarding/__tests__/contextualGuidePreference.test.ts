import { beforeEach, describe, expect, it } from 'vitest'
import {
  contextualGuideStorageKey,
  hasSeenContextualGuide,
  markContextualGuideSeen,
} from '../contextualGuidePreference'

describe('contextual guide preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('persists named-profile hints independently', () => {
    expect(hasSeenContextualGuide('incoming', 'profile-a', false)).toBe(false)
    expect(hasSeenContextualGuide('promise', 'profile-a', false)).toBe(false)

    markContextualGuideSeen('incoming', 'profile-a', false)

    expect(hasSeenContextualGuide('incoming', 'profile-a', false)).toBe(true)
    expect(hasSeenContextualGuide('promise', 'profile-a', false)).toBe(false)
    expect(window.localStorage.getItem(contextualGuideStorageKey('incoming', 'profile-a'))).toBe(
      'seen'
    )
  })

  it('keeps guest contextual hints session-scoped', () => {
    markContextualGuideSeen('alliance', null, true)

    expect(hasSeenContextualGuide('alliance', null, true)).toBe(true)
    expect(window.sessionStorage.getItem(contextualGuideStorageKey('alliance', null))).toBe('seen')
    expect(window.localStorage.getItem(contextualGuideStorageKey('alliance', null))).toBeNull()
  })
})
