import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import { SOCIAL_INITIAL_STATE } from '../constants'
import {
  createRealityRng,
  deriveRealitySimulationSeed,
  drawRealityRandom,
  normalizeRealitySimulationState,
  runRealitySimulationHarness,
  type RealityHarnessOpportunity,
} from '../realitySimulation'
import socialReducer, {
  initializeRealitySimulation,
  recordRealitySimulationTrace,
} from '../socialSlice'
import { migrateSocialState } from '../socialStateMigration'
import { SOCIAL_STATE_VERSION } from '../socialHistory'
import type { SocialState } from '../types'
import { socialMiddleware } from '../socialMiddleware'

const opportunities: RealityHarnessOpportunity[] = [
  {
    day: 3,
    phase: 'social_1',
    actorId: 'ai-1',
    targetIds: ['ai-2'],
    candidates: [
      {
        id: 'invalid-role-action',
        weight: 1_000_000,
        score: 999,
        eligible: false,
        blockedReasons: ['actor_role_required'],
      },
      { id: 'repair', weight: 2, score: 4, eligible: true },
      { id: 'defer', weight: 1, score: 1, eligible: true },
    ],
  },
  {
    day: 3,
    phase: 'nominations',
    actorId: 'ai-2',
    candidates: [
      {
        id: 'invalid-phase-action',
        weight: 4,
        eligible: false,
        blockedReasons: ['phase_not_allowed'],
      },
    ],
  },
]

describe('Reality Mode deterministic simulation foundation', () => {
  it('derives a stable, game-specific social seed', () => {
    expect(deriveRealitySimulationSeed(42, 'game-a')).toBe(
      deriveRealitySimulationSeed(42, 'game-a')
    )
    expect(deriveRealitySimulationSeed(42, 'game-a')).not.toBe(
      deriveRealitySimulationSeed(42, 'game-b')
    )
  })

  it('replays the same opportunities and never lets randomness rescue a hard-blocked action', () => {
    const first = runRealitySimulationHarness({ seed: 91, opportunities })
    const replay = runRealitySimulationHarness({ seed: 91, opportunities })

    expect(replay).toEqual(first)
    expect(first.selections[0].selectedActionId).not.toBe('invalid-role-action')
    expect(first.selections[1]).toMatchObject({
      selectedActionId: null,
      randomDraw: null,
      rngCursor: 1,
    })
    expect(first.simulation.trace[1]).toMatchObject({
      stage: 'blocked',
      reason: 'no_eligible_candidate',
    })
  })

  it('continues at the identical random value after serialise and hydrate', () => {
    const first = drawRealityRandom(createRealityRng(12345))
    const second = drawRealityRandom(first.next)
    const hydrated = normalizeRealitySimulationState(
      JSON.parse(
        JSON.stringify({
          version: 1,
          rng: second.next,
          trace: [],
          nextTraceSequence: 0,
        })
      )
    )
    const resumedThird = drawRealityRandom(hydrated.rng!)
    const uninterruptedThird = drawRealityRandom(second.next)

    expect(resumedThird.value).toBe(uninterruptedThird.value)
    expect(resumedThird.next).toEqual(uninterruptedThird.next)
  })

  it('repairs malformed trace entries and drops unknown trace stages', () => {
    const normalized = normalizeRealitySimulationState({
      version: -3,
      rng: { seed: 9, state: 10, cursor: -2 },
      trace: [
        { phase: 'social', stage: 'invented', sequence: 0, day: 2 },
        { phase: 'social', stage: 'selected', sequence: 'bad', day: -4 },
      ],
      nextTraceSequence: -8,
    })

    expect(normalized).toMatchObject({
      version: 1,
      rng: { seed: 9, state: 10, cursor: 0 },
      nextTraceSequence: 2,
      trace: [
        {
          id: 'reality-trace-1',
          sequence: 1,
          day: 0,
          phase: 'social',
          stage: 'selected',
        },
      ],
    })
  })

  it('migrates v2 saves without resetting resources, relationships, or pending interactions', () => {
    const legacy = {
      ...SOCIAL_INITIAL_STATE,
      socialStateVersion: 2,
      realitySimulation: undefined,
      energyBank: { human: 7 },
      influenceBank: { human: 30 },
      infoBank: { human: 40 },
      relationships: {
        human: { ally: { affinity: 25, tags: ['alliance'] } },
      },
      incomingInteractions: [
        {
          id: 'incoming-1',
          fromId: 'ally',
          type: 'warning',
          text: 'Careful.',
          createdAt: 10,
          createdWeek: 2,
          expiresAtWeek: 3,
          read: false,
          requiresResponse: true,
          resolved: false,
        },
      ],
    } as unknown as SocialState

    const migrated = migrateSocialState(legacy)

    expect(migrated.socialStateVersion).toBe(SOCIAL_STATE_VERSION)
    expect(migrated.energyBank.human).toBe(7)
    expect(migrated.influenceBank.human).toBe(30)
    expect(migrated.infoBank.human).toBe(40)
    expect(migrated.relationships.human.ally).toMatchObject({
      // Existing v2 migration enforces the minimum affinity for alliance tags.
      affinity: 50,
      tags: ['alliance'],
    })
    expect(migrated.incomingInteractions).toHaveLength(1)
    expect(migrated.realitySimulation).toMatchObject({
      version: 1,
      rng: null,
      trace: [],
      nextTraceSequence: 0,
    })
  })

  it('stores a bounded serialisable runtime trace in Redux state', () => {
    const store = configureStore({ reducer: { social: socialReducer } })
    store.dispatch(initializeRealitySimulation({ seed: 8 }))
    store.dispatch(
      recordRealitySimulationTrace({
        day: 1,
        phase: 'day_start',
        stage: 'context',
        actorId: 'ai-1',
        reason: 'characterization',
      })
    )

    expect(store.getState().social.realitySimulation).toMatchObject({
      rng: { seed: 8, state: 8, cursor: 0 },
      nextTraceSequence: 1,
      trace: [
        {
          id: 'reality-trace-0',
          sequence: 0,
          day: 1,
          phase: 'day_start',
          stage: 'context',
        },
      ],
    })
  })

  it('binds a fresh persisted stream to each new game without changing legacy keys', () => {
    type TestGameState = {
      gameId: string
      seed: number
      phase: string
      week: number
      lohId: null
      prevHohId: null
      posWinnerId: null
      nomineeIds: string[]
      players: Array<{ id: string; status: string }>
    }
    const initialGame: TestGameState = {
      gameId: 'before-reset',
      seed: 1,
      phase: 'day_start',
      week: 1,
      lohId: null,
      prevHohId: null,
      posWinnerId: null,
      nomineeIds: [],
      players: [],
    }
    const gameReducer = (
      state = initialGame,
      action: { type: string; payload?: { gameId: string; seed: number } }
    ): TestGameState =>
      action.type === 'game/resetGame' && action.payload ? { ...state, ...action.payload } : state
    const store = configureStore({
      reducer: {
        game: gameReducer,
        social: socialReducer,
        settings: (
          state = {
            gameUX: {
              dramaMode: true,
              dramaModeAdminOverride: true,
              realityModePreset: 'tv',
            },
          }
        ) => state,
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
    })

    store.dispatch({
      type: 'game/resetGame',
      payload: { gameId: 'new-season', seed: 456 },
    })

    expect(store.getState().social.realitySimulation.rng).toEqual(
      createRealityRng(deriveRealitySimulationSeed(456, 'new-season'))
    )
    expect(store.getState().social.energyBank).toEqual({})
    expect(store.getState().social.influenceBank).toEqual({})
    expect(store.getState().social.infoBank).toEqual({})
  })
})
