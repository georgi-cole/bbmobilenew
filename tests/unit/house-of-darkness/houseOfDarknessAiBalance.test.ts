import { describe, expect, it } from 'vitest'
import { getHouseOfDarknessAiAbility } from '../../../src/components/HouseOfDarknessComp/houseOfDarknessAiBalance'

describe('House of Darkness AI fatigue', () => {
  it('keeps elite profiles inside a strong but human early-round band', () => {
    expect(getHouseOfDarknessAiAbility({ baseAbility: 85, round: 1, health: 100 })).toBe(52)
  })

  it('reduces effective memory ability substantially as fatigue accumulates', () => {
    const early = getHouseOfDarknessAiAbility({ baseAbility: 70, round: 2, health: 100 })
    const late = getHouseOfDarknessAiAbility({ baseAbility: 70, round: 9, health: 100 })

    expect(late).toBeLessThan(early)
    expect(early - late).toBeGreaterThanOrEqual(18)
  })

  it('adds meaningful pressure when lifespan is low', () => {
    const healthy = getHouseOfDarknessAiAbility({ baseAbility: 60, round: 5, health: 80 })
    const wounded = getHouseOfDarknessAiAbility({ baseAbility: 60, round: 5, health: 20 })

    expect(healthy - wounded).toBeGreaterThanOrEqual(7)
  })

  it('caps AI ability inside a human survival range', () => {
    expect(getHouseOfDarknessAiAbility({ baseAbility: 100, round: 1, health: 100 })).toBeLessThanOrEqual(56)
    expect(getHouseOfDarknessAiAbility({ baseAbility: 20, round: 20, health: 1 })).toBe(18)
  })
})
