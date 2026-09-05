import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import type { Player } from '../../../src/types'
import publicOpinionReducer, {
  initializeProfiles,
  addDirection,
  setProfileApprovals,
} from '../../../src/publicOpinion/publicOpinionSlice'
import { publicOpinionMiddleware } from '../../../src/publicOpinion/publicOpinionMiddleware'
import type { PublicDirection } from '../../../src/publicOpinion/types'

interface TestGameState {
  phase: string
  week: number
  lohId: string | null
  posWinnerId: string | null
  nomineeIds: string[]
  players: Player[]
  seed: number
  publicModeEnabled?: boolean
}

function makePlayer(id: string, name: string, status: Player['status'] = 'active'): Player {
  return {
    id,
    name,
    avatar: '🙂',
    status,
  }
}

function makeGameState(overrides: Partial<TestGameState> = {}): TestGameState {
  return {
    phase: 'eviction_results',
    week: 2,
    lohId: null,
    posWinnerId: null,
    nomineeIds: [],
    players: [makePlayer('p1', 'Aria'), makePlayer('p2', 'Kian')],
    seed: 42,
    publicModeEnabled: true,
    ...overrides,
  }
}

function makeDirection(overrides: Partial<PublicDirection> = {}): PublicDirection {
  return {
    id: 'dir-1',
    type: 'win_competition',
    playerId: 'p1',
    description: 'Aria, win the next competition!',
    status: 'active',
    createdWeek: 1,
    expiresAtWeek: 2,
    approvalDelta: 5,
    ...overrides,
  }
}

function gameReducer(
  state: TestGameState = makeGameState(),
  action: { type: string; payload?: Partial<TestGameState> }
) {
  if (
    action.type === 'game/forcePhase' ||
    action.type === 'game/setPhase' ||
    action.type === 'game/advance'
  ) {
    return {
      ...state,
      ...(action.payload ?? {}),
    }
  }
  return state
}

describe('publicOpinionMiddleware', () => {
  it('keeps an evicted houseguest approval frozen at the last in-game value', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState(),
      },
    })

    store.dispatch(initializeProfiles(['p1', 'p2']))

    store.dispatch({
      type: 'game/forcePhase',
      payload: {
        phase: 'week_end',
        players: [makePlayer('p1', 'Aria', 'jury'), makePlayer('p2', 'Kian', 'active')],
      },
    })

    const state = store.getState()
    expect(state.publicOpinion.profiles.p1.approval).toBe(50)
  })

  it('generates public requests only for active houseguests', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({
          players: [makePlayer('p1', 'Aria', 'active'), makePlayer('p2', 'Kian', 'jury')],
        }),
      },
    })

    store.dispatch(initializeProfiles(['p1', 'p2']))

    store.dispatch({
      type: 'game/forcePhase',
      payload: {
        phase: 'week_end',
        players: [makePlayer('p1', 'Aria', 'active'), makePlayer('p2', 'Kian', 'jury')],
      },
    })

    const state = store.getState()
    expect(state.publicOpinion.directions.every((direction) => direction.playerId === 'p1')).toBe(
      true
    )
  })

  it('does not generate or progress public requests when Public Mode is off', () => {
    const store = configureStore({
      reducer: { game: gameReducer, publicOpinion: publicOpinionReducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: { game: makeGameState({ publicModeEnabled: false }) },
    })

    store.dispatch(initializeProfiles(['p1', 'p2']))
    store.dispatch(addDirection(makeDirection({ id: 'off-dir', progressPercent: 0 })))
    store.dispatch({ type: 'game/applyMinigameWinner', payload: { winnerId: 'p1' } })
    store.dispatch({ type: 'game/forcePhase', payload: { phase: 'week_end' } })

    const state = store.getState().publicOpinion
    expect(state.directions).toHaveLength(1)
    expect(state.directions[0]?.progressPercent ?? 0).toBe(0)
  })

  it('dispatches mission progress for AI nominations on nomination_results', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({ phase: 'nomination_ceremony', week: 1, lohId: 'p1' }),
      },
    })

    store.dispatch(initializeProfiles(['p1', 'p2', 'p3']))
    store.dispatch(
      addDirection(
        makeDirection({
          id: 'target-dir',
          type: 'target_player',
          playerId: 'p1',
          relatedPlayerId: 'p2',
          status: 'active',
          progressPercent: 0,
        })
      )
    )

    // Simulate advance() result: nomination_results phase, AI LOH (awaitingNominations=false),
    // nomineeIds already populated.
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'nomination_results',
        lohId: 'p1',
        nomineeIds: ['p2'],
        awaitingNominations: false,
        week: 1,
      },
    })

    const dir = store.getState().publicOpinion.directions.find((d) => d.id === 'target-dir')
    // Progress should have advanced
    expect(dir?.progressPercent ?? 0).toBeGreaterThan(0)
  })

  it('dispatches mission progress for AI votes at eviction_results', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({ phase: 'live_vote', week: 1 }),
      },
    })

    store.dispatch(initializeProfiles(['p1', 'p2', 'p3']))
    store.dispatch(
      addDirection(
        makeDirection({
          id: 'vote-dir',
          type: 'target_player',
          playerId: 'p1',
          relatedPlayerId: 'p2',
          status: 'active',
          progressPercent: 0,
        })
      )
    )

    // Simulate advance() to eviction_results with AI votes recorded
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'eviction_results',
        nomineeIds: ['p2', 'p3'],
        votes: { p1: 'p2' }, // p1 voted to evict p2 (the mission target)
        week: 1,
      },
    })

    const dir = store.getState().publicOpinion.directions.find((d) => d.id === 'vote-dir')
    expect(dir?.progressPercent ?? 0).toBeGreaterThan(0)
  })

  it('does not move approval merely because a new week started', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({ phase: 'week_end', week: 1 }),
      },
    })

    store.dispatch(initializeProfiles(['p1', 'p2', 'p3']))
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'week_start',
        week: 2,
        players: [makePlayer('p1', 'Aria'), makePlayer('p2', 'Kian'), makePlayer('p3', 'Rae')],
        seed: 42,
      },
    })

    const state = store.getState().publicOpinion
    expect(state.profiles.p1.approval).toBe(50)
    expect(state.profiles.p2.approval).toBe(50)
    expect(state.profiles.p3.approval).toBe(50)
    expect(state.feed).toHaveLength(0)
  })

  it('provides a small visible recovery path when approval is critically low', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({ phase: 'week_end', week: 1 }),
      },
    })

    store.dispatch(initializeProfiles(['p1', 'p2']))
    store.dispatch(setProfileApprovals({ p1: 5, p2: 50 }))
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'week_start',
        week: 2,
      },
    })

    const state = store.getState().publicOpinion
    expect(state.profiles.p1.approval).toBe(8)
    expect(state.profiles.p2.approval).toBe(50)
    expect(state.feed.some((entry) => entry.playerId === 'p1' && entry.delta === 3)).toBe(true)
  })

  it('prunes directions using the upcoming cycle week at week_end', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({ week: 1 }),
      },
    })

    store.dispatch(initializeProfiles(['p1', 'p2']))
    store.dispatch(addDirection(makeDirection({ expiresAtWeek: 2 })))

    store.dispatch({
      type: 'game/forcePhase',
      payload: {
        phase: 'week_end',
      },
    })

    const expiredDirection = store
      .getState()
      .publicOpinion.directions.find((direction) => direction.id === 'dir-1')
    expect(expiredDirection?.status).toBe('expired')
  })

  it('initializes a public profile for a newly added late entrant without resetting existing approvals', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState(),
      },
    })

    store.dispatch(initializeProfiles(['p1', 'p2']))

    store.dispatch({
      type: 'game/forcePhase',
      payload: {
        players: [makePlayer('p1', 'Aria'), makePlayer('p2', 'Kian'), makePlayer('ali', 'Ali')],
      },
    })

    const { profiles } = store.getState().publicOpinion
    expect(profiles.p1.approval).toBe(50)
    expect(profiles.p2.approval).toBe(50)
    expect(profiles.ali.approval).toBe(50)
  })
})
