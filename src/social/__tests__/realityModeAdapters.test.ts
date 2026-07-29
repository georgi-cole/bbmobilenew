import { describe, expect, it } from 'vitest'
import { getRealityModeAdapter } from '../reality'

describe('Reality mode adapters', () => {
  it('keeps one social engine active across Classic and Survival', () => {
    const classic = getRealityModeAdapter('classic', true)
    const survival = getRealityModeAdapter('survival', true)

    expect(classic.gameMode).toBe('CLASSIC')
    expect(classic.publicConsequencesEnabled).toBe(true)
    expect(survival.gameMode).toBe('SURVIVAL')
    expect(survival.socialDensityMultiplier).toBeGreaterThan(1)
    expect(survival.publicConsequencesEnabled).toBe(false)
    expect(survival.replacementEntrantsEnabled).toBe(true)
  })
})
