import { describe, expect, it } from 'vitest'
import { getClassicCampaignPoolForContext } from '../../../src/ai/competition/bracketTemplate'
import { getAllGames, getGame, getPoolByFilter } from '../../../src/minigames/registry'

describe('Down Memory Lane finale registration', () => {
  it('is a two-player authoritative React duel that remains Lab-visible', () => {
    const game = getGame('downMemoryLane')
    expect(game).toBeDefined()
    expect(game?.title).toBe('Down Memory Lane')
    expect(game?.implementation).toBe('react')
    expect(game?.reactComponentKey).toBe('DownMemoryLane')
    expect(game?.authoritative).toBe(true)
    expect(game?.minPlayers).toBe(2)
    expect(game?.maxPlayers).toBe(3)
    expect(getAllGames().some((entry) => entry.key === 'downMemoryLane')).toBe(true)
  })

  it('is excluded from ordinary random pools', () => {
    expect(
      getPoolByFilter({ retired: false }).some((entry) => entry.key === 'downMemoryLane')
    ).toBe(false)
  })

  it('owns Final 3 Part 3 and does not appear in Parts 1 or 2', () => {
    const resolve = (
      phase: 'final3_comp1_minigame' | 'final3_comp2_minigame' | 'final3_comp3_minigame'
    ) =>
      getClassicCampaignPoolForContext({
        day: 14,
        playerCount: 3,
        compType: 'LOH',
        phase,
      })

    expect(resolve('final3_comp1_minigame')).toEqual(['finalThreeCircuit'])
    expect(resolve('final3_comp2_minigame')).toEqual(['finalThreeCircuit'])
    expect(resolve('final3_comp3_minigame')).toEqual(['downMemoryLane'])
  })
})
