import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  activateCupidArrowNow,
  breakCupidArrowNow,
  resetGame,
} from '../../store/gameSlice'
import socialReducer from '../socialSlice'
import { socialMiddleware } from '../socialMiddleware'

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  })
}

function expectCupidPairsInSocialGraph(store: ReturnType<typeof makeStore>) {
  const { game, social } = store.getState()
  expect(game.cupidArrow?.status).toBe('active')
  for (const pair of game.cupidArrow?.pairs ?? []) {
    const [firstId, secondId] = pair.memberIds
    for (const [source, target] of [
      [firstId, secondId],
      [secondId, firstId],
    ]) {
      const relationship = social.relationships[source]?.[target]
      expect(relationship?.tags).toEqual(
        expect.arrayContaining(['cupid_partner', 'cupid_forced_bond', 'protection'])
      )
      expect(relationship?.affinity).toBeGreaterThanOrEqual(55)
    }
  }
}

describe("Cupid's Arrow social integration", () => {
  it('seeds every pair into the social graph when activated directly', () => {
    const store = makeStore()
    store.dispatch(activateCupidArrowNow())

    expectCupidPairsInSocialGraph(store)
  })

  it('seeds every pair after reset clears the previous social graph', () => {
    const store = makeStore()
    store.dispatch(activateCupidArrowNow())
    store.dispatch(resetGame())

    // The reset may launch a normal season; direct activation proves the
    // reset-cleared social slice can still receive the Cupid projection.
    store.dispatch(activateCupidArrowNow())
    expectCupidPairsInSocialGraph(store)
  })

  it('removes only Cupid-specific labels after the spell breaks', () => {
    const store = makeStore()
    store.dispatch(activateCupidArrowNow())
    const [firstId, secondId] = store.getState().game.cupidArrow!.pairs[0].memberIds

    store.dispatch(breakCupidArrowNow())

    expect(store.getState().social.relationships[firstId][secondId].tags).not.toContain(
      'cupid_partner'
    )
    expect(store.getState().social.relationships[firstId][secondId].tags).not.toContain(
      'protection'
    )
    expect(
      store.getState().social.relationships[firstId][secondId].affinity
    ).toBeGreaterThanOrEqual(55)
  })
})
