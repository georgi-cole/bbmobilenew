import { describe, expect, it } from 'vitest'
import {
  getProfileRealityAgeEligibility,
  getRealityAgeEligibility,
  normalizeRealityModePreset,
  resolveRealityModePreset,
} from '../realityMode'

describe('Reality Mode presets', () => {
  it('uses the youngest plausible age for a conservative 18+ gate', () => {
    expect(getRealityAgeEligibility('17')).toBe('minor')
    expect(getRealityAgeEligibility('17-19')).toBe('minor')
    expect(getRealityAgeEligibility('mid-20s')).toBe('adult')
    expect(getRealityAgeEligibility('25')).toBe('adult')
    expect(getRealityAgeEligibility('prefer not to say')).toBe('unknown')
  })

  it('does not treat guests or profiles without an age as adult', () => {
    expect(
      getProfileRealityAgeEligibility({
        activeProfileId: 'adult',
        isGuest: true,
        profiles: [
          {
            id: 'adult',
            name: 'Player',
            avatar: '',
            createdAt: '2026-01-01',
            bio: { age: '32' },
          },
        ],
      })
    ).toBe('unknown')
  })

  it('clamps a saved 18+ preset when adult eligibility is absent', () => {
    expect(resolveRealityModePreset('adult', 'minor')).toBe('tv')
    expect(resolveRealityModePreset('adult', 'unknown')).toBe('tv')
    expect(resolveRealityModePreset('adult', 'adult')).toBe('adult')
    expect(normalizeRealityModePreset('legacy-value')).toBe('tv')
  })
})
