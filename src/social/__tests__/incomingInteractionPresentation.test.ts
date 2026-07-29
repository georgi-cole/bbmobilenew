import { describe, it, expect } from 'vitest'
import {
  getIncomingInteractionResponseLabel,
  getIncomingInteractionResponseOptions,
  getIncomingInteractionTone,
} from '../incomingInteractionPresentation'
import type { IncomingInteraction, RelationshipsMap, SocialMemoryMap } from '../types'

function makeInteraction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'interaction-1',
    fromId: 'p2',
    type: 'warning',
    text: 'Heads up.',
    createdAt: 100,
    createdWeek: 1,
    expiresAtWeek: 2,
    read: false,
    requiresResponse: true,
    resolved: false,
    ...overrides,
  }
}

describe('incomingInteractionPresentation', () => {
  it('maps contextual response labels for warnings', () => {
    const options = getIncomingInteractionResponseOptions('warning')
    expect(options.map((option) => option.label)).toEqual(['Thank', 'Note it', 'Reject', 'Dismiss'])
    expect(options.map((option) => option.responseType)).toEqual([
      'positive',
      'neutral',
      'negative',
      'dismiss',
    ])
    expect(getIncomingInteractionResponseLabel('warning', 'positive')).toBe('Thank')
  })

  it('varies player-facing choices while preserving the same response intents', () => {
    const labelSets = Array.from({ length: 8 }, (_, index) =>
      getIncomingInteractionResponseOptions(
        'check_in',
        makeInteraction({ id: `check-in-${index}`, fromId: `p${index}`, type: 'check_in' }),
        'Curious',
        true
      )
        .map((option) => option.label)
        .join('|')
    )

    expect(new Set(labelSets).size).toBeGreaterThan(1)
    expect(
      getIncomingInteractionResponseOptions(
        'check_in',
        makeInteraction({ type: 'check_in' }),
        'Guarded',
        true
      ).map((option) => option.responseType)
    ).toEqual(['positive', 'neutral', 'negative', 'dismiss'])
  })

  it('uses threat-specific replies for an LOH nomination warning', () => {
    const options = getIncomingInteractionResponseOptions(
      'warning',
      makeInteraction({ payload: { scenarioKey: 'background_nominate' } }),
      'Guarded'
    )
    expect(options.map((option) => option.label)).toEqual([
      'Ask why',
      'Offer a deal',
      'Stand your ground',
      'Keep it private',
    ])
  })

  it('lets the human join, observe, intervene, or lay low in an AI group scene', () => {
    const options = getIncomingInteractionResponseOptions(
      'other',
      makeInteraction({
        type: 'other',
        payload: { scenarioKey: 'background_group_chat', groupScene: true },
      }),
      'Curious',
      true
    )
    expect(options.map((option) => option.label)).toEqual([
      'Join the talk',
      'Observe quietly',
      'Intervene',
      'Lay low',
    ])
    expect(options.map((option) => option.responseType)).toEqual([
      'accept',
      'neutral',
      'negative',
      'dismiss',
    ])
  })

  it('offers all four Safety plans when the LOH consults the human holder', () => {
    const options = getIncomingInteractionResponseOptions(
      'deal_offer',
      makeInteraction({
        type: 'deal_offer',
        payload: {
          scenarioKey: 'loh_consults_safety_holder',
          nomineeNames: ['Nova', 'Lia'],
        },
      })
    )

    expect(options.map((option) => option.label)).toEqual([
      'Save Nova',
      'Save Lia',
      'Save nobody',
      'Your advice?',
    ])
  })

  it('derives a warm tone from strong gratitude and trust', () => {
    const interaction = makeInteraction({ type: 'compliment' })
    const relationships: RelationshipsMap = {
      [interaction.fromId]: { user: { affinity: 70, tags: [] } },
    }
    const socialMemory: SocialMemoryMap = {
      [interaction.fromId]: {
        user: {
          gratitude: 8,
          resentment: 0,
          neglect: 0,
          trustMomentum: 4,
          recentEvents: [],
        },
      },
    }

    expect(
      getIncomingInteractionTone({
        interaction,
        relationships,
        socialMemory,
        humanId: 'user',
      })
    ).toBe('Warm')
  })

  it('flags neglected relationships as feeling ignored', () => {
    const interaction = makeInteraction({ type: 'gossip' })
    const relationships: RelationshipsMap = {
      [interaction.fromId]: { user: { affinity: -15, tags: [] } },
    }
    const socialMemory: SocialMemoryMap = {
      [interaction.fromId]: {
        user: {
          gratitude: 0,
          resentment: 0,
          neglect: 7,
          trustMomentum: -1,
          recentEvents: [],
        },
      },
    }

    expect(
      getIncomingInteractionTone({
        interaction,
        relationships,
        socialMemory,
        humanId: 'user',
      })
    ).toBe('Feels ignored')
  })

  it('provides a default tone for check-ins without strong signals', () => {
    const interaction = makeInteraction({ type: 'check_in' })
    const relationships: RelationshipsMap = {}
    const socialMemory: SocialMemoryMap = {}

    expect(
      getIncomingInteractionTone({
        interaction,
        relationships,
        socialMemory,
        humanId: 'user',
      })
    ).toBe('Curious')
  })
})
