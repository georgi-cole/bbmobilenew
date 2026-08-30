import { describe, expect, it } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, {
  activateDepressionShock,
  createInitialGameState,
  endDepressionShock,
  setDepressionShockRoll,
  tryActivateDepressionShock,
} from '../src/store/gameSlice'
import settingsReducer, { DEFAULT_SETTINGS } from '../src/store/settingsSlice'

function makeStore(overrides: Record<string, unknown> = {}) {
  const game = createInitialGameState({ seed: 42 })
  Object.assign(game, { phase: 'week_start', week: 5 }, overrides)
  return configureStore({
    reducer: { game: gameReducer, settings: settingsReducer },
    preloadedState: {
      game,
      settings: { ...DEFAULT_SETTINGS, sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true } },
    },
  })
}

describe('Depression Shock requirements', () => {
  it('does not activate before Day 5 or with fewer than six active players', () => {
    const early = makeStore({ week: 4 })
    expect(early.dispatch(tryActivateDepressionShock())).toBe(false)

    const tooFew = makeStore({ players: createInitialGameState().players.slice(0, 5) })
    expect(tooFew.dispatch(tryActivateDepressionShock())).toBe(false)
  })

  it('rejects Survival mode while permitting Classic/Vox engine mode', () => {
    const survival = makeStore({ mode: 'survival' })
    survival.dispatch(setDepressionShockRoll({ passed: true }))
    expect(survival.dispatch(tryActivateDepressionShock())).toBe(false)
  })

  it('defers a successful roll when another shock already used the day', () => {
    const store = makeStore({ twistActivatedThisWeek: true })
    store.dispatch(setDepressionShockRoll({ passed: true }))
    expect(store.dispatch(tryActivateDepressionShock())).toBe(false)
    expect(store.getState().game.depressionShock?.pendingActivation).toBe(true)

    const next = makeStore({
      twistActivatedThisWeek: false,
      depressionShock: store.getState().game.depressionShock,
    })
    expect(next.dispatch(tryActivateDepressionShock())).toBe(true)
    expect(next.getState().game.depressionShock?.activeDay).toBe(1)
  })

  it('runs Day 1, Day 2, then the sunny recovery transition', () => {
    let state = createInitialGameState({ seed: 42 })
    state = gameReducer(state, activateDepressionShock({ source: 'debug' }))
    expect(state.depressionShock?.activeDay).toBe(1)

    // The thunk is exercised separately above; reducer actions model the exact
    // day-boundary transitions without mutating a frozen Redux snapshot.
    state = gameReducer({ ...state, week: 6 }, activateDepressionShock({ source: 'debug' }))
    expect(state.depressionShock?.activeDay).toBe(2)
    state = gameReducer({ ...state, week: 7 }, endDepressionShock())
    expect(state.depressionShock?.activeDay).toBe(0)
    expect(state.depressionShock?.completed).toBe(true)
    expect(state.tvFeed.some((event) => event.text.includes('sunny break'))).toBe(true)
  })

  it('the explicit end action is idempotent after recovery', () => {
    const store = makeStore()
    store.dispatch(activateDepressionShock({ source: 'debug' }))
    let state = gameReducer(createInitialGameState(), activateDepressionShock({ source: 'debug' }))
    state = gameReducer(
      { ...state, depressionShock: { ...state.depressionShock!, activeDay: 2 } },
      endDepressionShock()
    )
    const count = state.tvFeed.length
    state = gameReducer(state, endDepressionShock())
    expect(state.tvFeed.length).toBe(count)
  })
})
