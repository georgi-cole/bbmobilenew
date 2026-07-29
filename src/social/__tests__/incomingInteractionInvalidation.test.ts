import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  createInitialGameState,
  finalizePendingEviction,
  hydrateGame,
  submitPovSaveTarget,
} from '../../store/gameSlice'
import socialReducer, {
  hydrateSocial,
  pushIncomingInteraction,
  scheduleIncomingInteraction,
} from '../socialSlice'
import { socialMiddleware } from '../socialMiddleware'
import { respondToIncomingInteraction } from '../incomingInteractions'
import { isIncomingInteractionInvalidated } from '../incomingInteractionValidity'
import type { IncomingInteraction, SocialState } from '../types'

function makeInteraction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'interaction-1',
    fromId: 'p1',
    type: 'check_in',
    text: 'Checking in.',
    payload: { scenarioKey: 'generic_check_in', phase: 'week_start' },
    createdAt: 100,
    createdWeek: 1,
    expiresAtWeek: 2,
    read: false,
    requiresResponse: true,
    resolved: false,
    ...overrides,
  }
}

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  })
}

function buildGameState() {
  const game = createInitialGameState()
  const human = game.players.find((player) => player.isUser)
  const others = game.players.filter((player) => !player.isUser)
  if (!human || others.length < 3) {
    throw new Error('Expected an initial cast with one human and at least three AI players.')
  }
  return {
    game,
    human,
    nominee: others[0],
    otherNominee: others[1],
    loh: others[2],
  }
}

function buildSocialState(interactions: IncomingInteraction[] = []): SocialState {
  return {
    ...(socialReducer(undefined, { type: 'init' }) as SocialState),
    incomingInteractions: interactions,
  }
}

describe('incoming interaction invalidation', () => {
  it('blocks a nominee from asking a competing nominee for a saving vote', () => {
    const { game, human, nominee } = buildGameState()
    game.phase = 'live_vote'
    human.status = 'nominated'
    nominee.status = 'nominated'
    game.nomineeIds = [human.id, nominee.id]

    expect(
      isIncomingInteractionInvalidated(
        makeInteraction({
          fromId: nominee.id,
          type: 'deal_offer',
          payload: { scenarioKey: 'live_vote_pitch', phase: 'live_vote' },
        }),
        game
      )
    ).toBe(true)
  })

  it('blocks a nominee from asking the current LOH for a vote they cannot cast', () => {
    const { game, human, nominee, otherNominee } = buildGameState()
    game.phase = 'live_vote'
    game.lohId = human.id
    human.status = 'loh'
    nominee.status = 'nominated'
    otherNominee.status = 'nominated'
    game.nomineeIds = [nominee.id, otherNominee.id]

    expect(
      isIncomingInteractionInvalidated(
        makeInteraction({
          fromId: nominee.id,
          type: 'deal_offer',
          payload: { scenarioKey: 'live_vote_pitch', phase: 'live_vote' },
        }),
        game
      )
    ).toBe(true)
  })

  it('dismisses veto pitches from a nominee once that nominee is saved', () => {
    const store = makeStore()
    const { game, human, nominee, otherNominee, loh } = buildGameState()

    human.status = 'pos'
    nominee.status = 'nominated'
    otherNominee.status = 'nominated'
    loh.status = 'loh'
    game.week = 3
    game.phase = 'pos_ceremony_results'
    game.posWinnerId = human.id
    game.lohId = loh.id
    game.awaitingPovSaveTarget = true
    game.nomineeIds = [nominee.id, otherNominee.id]

    store.dispatch(hydrateGame(game))
    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({
          id: 'veto-live',
          fromId: nominee.id,
          type: 'deal_offer',
          payload: { scenarioKey: 'nominee_veto_pitch', phase: 'pos_results' },
        })
      )
    )
    store.dispatch(
      scheduleIncomingInteraction({
        interaction: makeInteraction({
          id: 'veto-scheduled',
          fromId: nominee.id,
          type: 'deal_offer',
          payload: { scenarioKey: 'nominee_veto_pitch', phase: 'pos_results' },
        }),
        priority: 'high',
        scheduledAt: 100,
        scheduledForWeek: 3,
        scheduledForPhase: 'social_2',
      })
    )

    store.dispatch(submitPovSaveTarget(nominee.id))

    const state = store.getState()
    const live = state.social.incomingInteractions.find((entry) => entry.id === 'veto-live')
    const scheduled = state.social.scheduledIncomingInteractions.find(
      (entry) => entry.interaction.id === 'veto-scheduled'
    )
    expect(live?.resolved).toBe(true)
    expect(live?.resolvedWith).toBe('dismiss')
    expect(scheduled).toBeUndefined()
  })

  it('dismisses pending and scheduled interactions from an evicted sender', () => {
    const store = makeStore()
    const { game, nominee, otherNominee } = buildGameState()

    nominee.status = 'nominated'
    otherNominee.status = 'nominated'
    game.week = 4
    game.phase = 'week_end'
    game.nomineeIds = [nominee.id, otherNominee.id]
    game.pendingEviction = {
      evicteeId: nominee.id,
      evictionMessage: `${nominee.name} was evicted.`,
    }

    store.dispatch(hydrateGame(game))
    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({
          id: 'eviction-live',
          fromId: nominee.id,
          type: 'check_in',
          payload: { scenarioKey: 'nominee_campaign', phase: 'social_2' },
        })
      )
    )
    store.dispatch(
      scheduleIncomingInteraction({
        interaction: makeInteraction({
          id: 'eviction-scheduled',
          fromId: nominee.id,
          type: 'check_in',
          payload: { scenarioKey: 'nominee_campaign', phase: 'social_2' },
        }),
        priority: 'medium',
        scheduledAt: 100,
        scheduledForWeek: 4,
        scheduledForPhase: 'week_start',
      })
    )

    store.dispatch(finalizePendingEviction(nominee.id))

    const state = store.getState()
    const live = state.social.incomingInteractions.find((entry) => entry.id === 'eviction-live')
    const scheduled = state.social.scheduledIncomingInteractions.find(
      (entry) => entry.interaction.id === 'eviction-scheduled'
    )
    expect(live?.resolved).toBe(true)
    expect(live?.resolvedWith).toBe('dismiss')
    expect(scheduled).toBeUndefined()
  })

  it('dismisses a stale interaction instead of applying a manual response', () => {
    const store = makeStore()
    const { game, human, nominee } = buildGameState()

    nominee.status = 'evicted'
    game.week = 5
    store.dispatch(hydrateGame(game))
    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({
          id: 'stale-response',
          fromId: nominee.id,
          type: 'check_in',
        })
      )
    )

    const tvCountBefore = store.getState().game.tvFeed.length
    store.dispatch(
      respondToIncomingInteraction({
        interactionId: 'stale-response',
        responseType: 'positive',
      }) as never
    )

    const state = store.getState()
    const entry = state.social.incomingInteractions.find(
      (interaction) => interaction.id === 'stale-response'
    )
    const relationshipToHuman = state.social.relationships[nominee.id]?.[human.id]
    expect(entry?.resolved).toBe(true)
    expect(entry?.resolvedWith).toBe('dismiss')
    expect(state.game.tvFeed).toHaveLength(tvCountBefore)
    expect(relationshipToHuman).toBeUndefined()
  })

  it('cleans stale incoming interactions when hydrating social state', () => {
    const store = makeStore()
    const { game, nominee } = buildGameState()

    nominee.status = 'evicted'
    store.dispatch(hydrateGame(game))
    store.dispatch(
      hydrateSocial(
        buildSocialState([
          makeInteraction({
            id: 'hydrated-stale',
            fromId: nominee.id,
            type: 'check_in',
          }),
        ])
      )
    )

    const entry = store
      .getState()
      .social.incomingInteractions.find((interaction) => interaction.id === 'hydrated-stale')
    expect(entry?.resolved).toBe(true)
    expect(entry?.resolvedWith).toBe('dismiss')
  })
})
