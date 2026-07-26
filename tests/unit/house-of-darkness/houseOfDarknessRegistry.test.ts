import { describe, expect, it } from 'vitest'
import reactComponents from '../../../src/minigames/reactComponents'
import { getAllGames, getGame, getPoolByFilter } from '../../../src/minigames/registry'

describe('House of Darkness registry integration', () => {
  it('registers the game as an active authoritative React minigame', () => {
    const game = getGame('houseOfDarkness')

    expect(game).toMatchObject({
      title: 'House of Darkness',
      resultMode: 'placement',
      authoritative: true,
      scoringAdapter: 'authoritative',
      implementation: 'react',
      reactComponentKey: 'HouseOfDarkness',
      retired: false,
    })
    expect(reactComponents.HouseOfDarkness).toBeTruthy()
  })

  it('includes the game once in the normal active logic pool', () => {
    expect(getAllGames().filter((game) => game.key === 'houseOfDarkness')).toHaveLength(1)
    expect(
      getPoolByFilter({ retired: false, category: 'logic' }).some(
        (game) => game.key === 'houseOfDarkness'
      )
    ).toBe(true)
  })
})
