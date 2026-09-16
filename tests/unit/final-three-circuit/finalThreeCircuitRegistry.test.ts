import { describe, expect, it } from 'vitest'
import {
  getAllGames,
  getGame,
  getPoolByFilter,
  supportsPlayerCount,
} from '../../../src/minigames/registry'

describe('Final Three Circuit registry contract', () => {
  it('is a first-class React game addressable by key and visible to admin/lab surfaces', () => {
    const game = getGame('finalThreeCircuit')
    expect(game).toBeDefined()
    expect(game?.implementation).toBe('react')
    expect(game?.reactComponentKey).toBe('FinalThreeCircuit')
    expect(game?.authoritative).toBe(true)
    expect(game?.instructions.join(' ')).toContain('Warden Escape')
    expect(getAllGames().some((entry) => entry.key === 'finalThreeCircuit')).toBe(true)
  })

  it('requires exactly three competitors', () => {
    const game = getGame('finalThreeCircuit')!
    expect(supportsPlayerCount(game, 2)).toBe(false)
    expect(supportsPlayerCount(game, 3)).toBe(true)
    expect(supportsPlayerCount(game, 4)).toBe(false)
  })

  it('does not leak into ordinary random competition pools', () => {
    expect(getPoolByFilter({ retired: false }).map((game) => game.key)).not.toContain(
      'finalThreeCircuit'
    )
  })
})
