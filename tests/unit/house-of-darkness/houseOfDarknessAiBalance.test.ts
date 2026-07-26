import { describe, expect, it } from 'vitest'
import { getHouseOfDarknessAiAbility } from '../../../src/components/HouseOfDarknessComp/houseOfDarknessAiBalance'

describe('House of Darkness AI fatigue', () => {
  it('compresses elite profiles so early rounds remain competitive', () => {
    expect(getHouseOfDarknessAiAbility({ baseAbility: 85, round: 1, health: 100 })).toBe(67)
  })

  it('reduces effective memory ability as the survival run continues', () => {
    const early = getHouseOfDarknessAiAbility({ baseAbility: 70, round: 2, health: 100 })
    const late = getHouseOfDarknessAiAbility({ baseAbility: 70, round: 9, health: 100 })

    expect(late).toBeLessThan(early)
    expect(early - late).toBeGreaterThanOrEqual(12)
  })

  it('adds a small pressure penalty when lifespan is low', () => {
    const healthy = getHouseOfDarknessAiAbility({ baseAbility: 60, round: 5, health: 80 })
    const wounded = getHouseOfDarknessAiAbility({ baseAbility: 60, round: 5, health: 20 })

    expect(wounded).toBeLessThan(healthy)
  })
})
