import { describe, expect, it } from 'vitest'
import {
  hasEffectiveStoreEntitlement,
  isEffectiveVipActive,
  type VipEntitlementStateLike,
} from './effectiveEntitlements'

const EMPTY_VIP: VipEntitlementStateLike = {
  isActive: false,
  entitlements: {
    survivalMode: false,
    publicMode: false,
    tribunalHouse: false,
    dramaMode: false,
    cupidArrow: false,
    voxPopuli: false,
    premiumChallenges: false,
    noAds: false,
  },
}

describe('effective entitlements', () => {
  it('preserves real VIP ownership when developer unlocks are off', () => {
    expect(isEffectiveVipActive({ ...EMPTY_VIP, isActive: true }, false)).toBe(true)
    expect(isEffectiveVipActive(EMPTY_VIP, false)).toBe(false)
  })

  it('preserves standalone ownership when developer unlocks are off', () => {
    expect(
      hasEffectiveStoreEntitlement(
        {
          ...EMPTY_VIP,
          entitlements: { ...EMPTY_VIP.entitlements, dramaMode: true },
        },
        'dramaMode',
        false
      )
    ).toBe(true)
    expect(hasEffectiveStoreEntitlement(EMPTY_VIP, 'dramaMode', false)).toBe(false)
  })

  it('grants VIP and every standalone entitlement through the developer override', () => {
    expect(isEffectiveVipActive(EMPTY_VIP, true)).toBe(true)
    expect(hasEffectiveStoreEntitlement(EMPTY_VIP, 'dramaMode', true)).toBe(true)
    expect(hasEffectiveStoreEntitlement(EMPTY_VIP, 'premiumChallenges', true)).toBe(true)
    expect(hasEffectiveStoreEntitlement(EMPTY_VIP, 'noAds', true)).toBe(true)
  })
})
