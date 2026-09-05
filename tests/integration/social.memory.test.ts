import { describe, it, expect } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer from '../../src/store/gameSlice'
import socialReducer, { pushIncomingInteraction } from '../../src/social/socialSlice'
import {
  respondToIncomingInteraction,
  autoResolveExpiredIncomingInteractionsForWeek,
} from '../../src/social/incomingInteractions'
import { socialConfig } from '../../src/social/socialConfig'
import type { IncomingInteraction } from '../../src/social/types'

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, social: socialReducer } })
}

function makeInteraction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'i-1',
    fromId: 'ai1',
    type: 'compliment',
    text: 'Nice move.',
    createdAt: 100,
    createdWeek: 1,
    expiresAtWeek: 2,
    read: false,
    requiresResponse: true,
    resolved: false,
    ...overrides,
  }
}

describe('social memory integration for incoming interactions', () => {
  it('updates memory on manual interaction response', () => {
    const store = makeStore()
    const { players, week } = store.getState().game
    const human = players.find((p) => p.isUser)!
    const ai = players.find((p) => !p.isUser)!

    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({
          id: 'i-1',
          fromId: ai.id,
          createdWeek: week,
          expiresAtWeek: week + 1,
        })
      )
    )
    store.dispatch(
      respondToIncomingInteraction({ interactionId: 'i-1', responseType: 'positive' }) as never
    )

    const entry = store.getState().social.socialMemory[ai.id][human.id]
    const expected = socialConfig.socialMemoryConfig.incomingInteractionDeltas.positive.gratitude
    expect(entry.gratitude).toBe(expected)
    expect(entry.recentEvents[0].type).toBe('appreciated_compliment')
  })

  it('projects a contextual incoming conversation into both sides of the main relationship graph', () => {
    const store = makeStore()
    const { players, week } = store.getState().game
    const human = players.find((p) => p.isUser)!
    const ai = players.find((p) => !p.isUser)!

    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({
          id: 'contextual-relationship-change',
          fromId: ai.id,
          type: 'check_in',
          payload: { scenarioKey: 'week_start_ally_check_in' },
          createdWeek: week,
          expiresAtWeek: week + 1,
        })
      )
    )
    store.dispatch(
      respondToIncomingInteraction({
        interactionId: 'contextual-relationship-change',
        responseType: 'positive',
        responseLabel: 'Share your read',
      }) as never
    )

    const social = store.getState().social
    const interaction = social.incomingInteractions.find(
      (entry) => entry.id === 'contextual-relationship-change'
    )
    expect(social.relationships[ai.id]?.[human.id]?.affinity).toBeGreaterThan(0)
    expect(social.relationships[human.id]?.[ai.id]?.affinity).toBeGreaterThan(0)
    expect(interaction?.outcomeText).toMatch(/where the two of you stand this week/i)
  })

  it('records neglect when interactions expire at week end', () => {
    const store = makeStore()
    const { players, week } = store.getState().game
    const human = players.find((p) => p.isUser)!
    const ai = players.find((p) => !p.isUser)!

    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({ id: 'i-expired', fromId: ai.id, createdWeek: week, expiresAtWeek: week })
      )
    )

    store.dispatch(autoResolveExpiredIncomingInteractionsForWeek(week + 1) as never)

    const entry = store.getState().social.socialMemory[ai.id][human.id]
    const expected = socialConfig.socialMemoryConfig.incomingInteractionDeltas.ignore.neglect
    expect(entry.neglect).toBe(expected)
    expect(entry.recentEvents[0].type).toBe('ignored_compliment')
  })

  it('keeps expired messages in the social inbox history without adding a TV reminder', () => {
    const store = makeStore()
    const { players, week } = store.getState().game
    const aiPlayers = players.filter((p) => !p.isUser)

    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({
          id: 'i-expired-deal',
          fromId: aiPlayers[0].id,
          type: 'deal_offer',
          createdWeek: week,
          expiresAtWeek: week,
        })
      )
    )
    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({
          id: 'i-expired-plea',
          fromId: aiPlayers[1].id,
          type: 'nomination_plea',
          createdWeek: week,
          expiresAtWeek: week,
        })
      )
    )

    store.dispatch(autoResolveExpiredIncomingInteractionsForWeek(week + 1) as never)

    expect(store.getState().game.tvFeed.map((event) => event.text)).not.toContain(
      "Several players' deal offer and nomination plea required answers and passed their deadlines."
    )
    expect(
      store
        .getState()
        .social.incomingInteractions.filter((interaction) => interaction.resolved)
        .map((interaction) => interaction.id)
        .sort()
    ).toEqual(['i-expired-deal', 'i-expired-plea'])
    expect(
      store
        .getState()
        .social.incomingInteractionLogs.filter(
          (entry) => entry.reason === 'auto_resolved_ignored' && entry.stage === 'auto_resolution'
        )
    ).toHaveLength(2)
  })

  it('records every expired required message even when they came from one sender', () => {
    const store = makeStore()
    const { players, week } = store.getState().game
    const ai = players.find((p) => !p.isUser)!

    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({
          id: 'i-expired-deal-same-sender',
          fromId: ai.id,
          type: 'deal_offer',
          createdWeek: week,
          expiresAtWeek: week,
        })
      )
    )
    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({
          id: 'i-expired-plea-same-sender',
          fromId: ai.id,
          type: 'nomination_plea',
          createdWeek: week,
          expiresAtWeek: week,
        })
      )
    )

    store.dispatch(autoResolveExpiredIncomingInteractionsForWeek(week + 1) as never)

    expect(store.getState().game.tvFeed.map((event) => event.text)).not.toContain(
      "One player's deal offer and nomination plea required an answer and passed its deadline."
    )
    expect(
      store
        .getState()
        .social.incomingInteractionLogs.filter(
          (entry) => entry.reason === 'auto_resolved_ignored' && entry.actorId === ai.id
        )
    ).toHaveLength(2)
  })
})
