import { describe, expect, it } from 'vitest'
import { canUseSurpriseMe, getEligibleSeasonRulesets, pickSurpriseRuleset } from './seasonRulesets'

describe('season ruleset entitlements', () => {
  it('keeps a free player on Classic and hides Surprise Me', () => {
    const access = { cupidArrow: false, voxPopuli: false }
    expect(getEligibleSeasonRulesets(access)).toEqual(['classic'])
    expect(canUseSurpriseMe(access)).toBe(false)
    expect(pickSurpriseRuleset(access, () => 0.99)).toBe('classic')
  })

  it('adds only paid rulesets the player owns', () => {
    expect(getEligibleSeasonRulesets({ cupidArrow: true, voxPopuli: false })).toEqual([
      'classic',
      'cupidArrow',
    ])
    expect(getEligibleSeasonRulesets({ cupidArrow: false, voxPopuli: true })).toEqual([
      'classic',
      'voxPopuli',
    ])
  })

  it('enables Surprise Me only with two or more eligible finite rulesets', () => {
    expect(canUseSurpriseMe({ cupidArrow: true, voxPopuli: false })).toBe(true)
    expect(canUseSurpriseMe({ cupidArrow: false, voxPopuli: true })).toBe(true)
    expect(canUseSurpriseMe({ cupidArrow: true, voxPopuli: true })).toBe(true)
  })

  it('never rolls an unowned expansion', () => {
    expect(pickSurpriseRuleset({ cupidArrow: true, voxPopuli: false }, () => 0.999)).toBe(
      'cupidArrow'
    )
    expect(pickSurpriseRuleset({ cupidArrow: false, voxPopuli: true }, () => 0.999)).toBe(
      'voxPopuli'
    )
  })

  it('uses Classic and both owned expansions when all are eligible', () => {
    const access = { cupidArrow: true, voxPopuli: true }
    expect(pickSurpriseRuleset(access, () => 0)).toBe('classic')
    expect(pickSurpriseRuleset(access, () => 0.4)).toBe('cupidArrow')
    expect(pickSurpriseRuleset(access, () => 0.9)).toBe('voxPopuli')
  })
})
