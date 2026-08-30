import { describe, expect, it } from 'vitest'
import type { RootState } from '../store'
import { selectHasPremiumChallengesAccess } from '../vipSlice'
import { createEmptyStoreEntitlements } from '../../vip/vipStorage'

function stateWithAccess(isActive: boolean, premiumChallenges: boolean): RootState {
  return {
    vip: { isActive, entitlements: { ...createEmptyStoreEntitlements(), premiumChallenges } },
  } as RootState
}

describe('Premium Challenges access', () => {
  it('is included with VIP', () =>
    expect(selectHasPremiumChallengesAccess(stateWithAccess(true, false))).toBe(true))
  it('is included with the standalone pack', () =>
    expect(selectHasPremiumChallengesAccess(stateWithAccess(false, true))).toBe(true))
  it('stays locked without either purchase', () =>
    expect(selectHasPremiumChallengesAccess(stateWithAccess(false, false))).toBe(false))
})
