import { describe, expect, it } from 'vitest'
import { chooseUtilityDramaAIMove } from '../dramaAIPolicy'
import {
  applyDramaActionEffect,
  createInitialDramaSocialNetwork,
  type DramaAIMoveInput,
} from '../dramaModeEngine'
import { DRAMA_MODE_CONFIG } from '../dramaModeConfig'
import { isIncomingInteractionInvalidated } from '../incomingInteractionValidity'
import { evaluateSocialActionEligibility } from '../socialActionEligibility'
import { SOCIAL_ACTIONS } from '../socialActions'
import type { IncomingInteraction } from '../types'

function action(id: string) {
  const result = SOCIAL_ACTIONS.find((candidate) => candidate.id === id)
  if (!result) throw new Error(`Missing action ${id}`)
  return result
}

function dramaInput(overrides: Partial<DramaAIMoveInput> = {}): DramaAIMoveInput {
  return {
    actorId: 'finn',
    players: [
      { id: 'finn', name: 'Finn', status: 'active' },
      { id: 'user', name: 'User', status: 'active', isUser: true },
      { id: 'rae', name: 'Rae', status: 'active' },
    ],
    relationships: {},
    memory: {},
    network: createInitialDramaSocialNetwork(),
    recentActions: [],
    week: 3,
    phase: 'social_2',
    seed: 12345,
    tick: 2,
    nomineeIds: [],
    ...overrides,
  }
}

describe('utility-scored Drama AI', () => {
  it('prioritises the only immediate survival motive for a nominee', () => {
    const input = dramaInput({
      players: [
        { id: 'finn', name: 'Finn', status: 'nominated' },
        { id: 'user', name: 'User', status: 'pos', isUser: true },
        { id: 'rae', name: 'Rae', status: 'active' },
      ],
      nomineeIds: ['finn'],
      posWinnerId: 'user',
    })

    expect(chooseUtilityDramaAIMove(input)).toMatchObject({
      actionId: 'ask_use_safety',
      targetId: 'user',
      subjectId: 'finn',
    })
  })

  it('selects deterministically from competing story motives', () => {
    const network = createInitialDramaSocialNetwork()
    network.arcs.push({
      id: 'rivalry:finn~rae:2',
      type: 'rivalry',
      participantIds: ['finn', 'rae'],
      stage: 'established',
      intensity: 72,
      startedWeek: 2,
      lastAdvancedWeek: 2,
      public: false,
      status: 'active',
    })
    const input = dramaInput({
      network,
      relationships: {
        finn: {
          rae: { affinity: -60, tags: ['rivalry'] },
          user: { affinity: 20, tags: [] },
        },
      },
    })

    const first = chooseUtilityDramaAIMove(input)
    const second = chooseUtilityDramaAIMove(input)
    expect(second).toEqual(first)
    expect(['confront', 'public_callout']).toContain(first?.actionId)
    expect(first?.targetId).toBe('rae')
    expect(first?.reason).toMatch(/conflict:/)
  })
})

describe('shared public Drama pacing', () => {
  it('blocks a manual public action after the weekly cap is reached', () => {
    const network = createInitialDramaSocialNetwork()
    network.pacing.week = 4
    network.pacing.publicEventsThisWeek = DRAMA_MODE_CONFIG.pacing.maxPublicEventsPerWeek

    const result = evaluateSocialActionEligibility({
      action: action('public_callout'),
      actorId: 'finn',
      targetIds: ['rae'],
      phase: 'social_2',
      week: 4,
      players: [
        { id: 'finn', status: 'active' },
        { id: 'rae', status: 'active' },
      ],
      dramaNetwork: network,
      dramaMode: true,
      requireCompleteSelection: true,
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toMatch(/public drama limit/i)
  })

  it('defensively refuses to mutate the Drama network when a public action bypasses UI', () => {
    const network = createInitialDramaSocialNetwork()
    network.pacing.week = 4
    network.pacing.publicEventsThisWeek = DRAMA_MODE_CONFIG.pacing.maxPublicEventsPerWeek

    const next = applyDramaActionEffect(network, {
      actionId: 'public_callout',
      actorId: 'finn',
      targetId: 'rae',
      actorName: 'Finn',
      targetName: 'Rae',
      week: 4,
      phase: 'social_2',
      success: true,
    })

    expect(next.events).toHaveLength(0)
    expect(next.arcs).toHaveLength(0)
    expect(next.pacing.publicEventsThisWeek).toBe(
      DRAMA_MODE_CONFIG.pacing.maxPublicEventsPerWeek
    )
  })
})

describe('declarative incoming-interaction validity', () => {
  function interaction(
    scenarioKey: string,
    payload: Record<string, unknown> = {}
  ): IncomingInteraction {
    return {
      id: `interaction-${scenarioKey}`,
      fromId: 'finn',
      type: 'warning',
      text: 'We need to talk.',
      payload: { scenarioKey, ...payload },
      createdAt: 1,
      createdWeek: 2,
      expiresAtWeek: 3,
      read: false,
      requiresResponse: true,
      resolved: false,
    }
  }

  it('invalidates subject-dependent gossip when its subject leaves the house', () => {
    expect(
      isIncomingInteractionInvalidated(
        interaction('generic_gossip', { subjectId: 'rae' }),
        {
          phase: 'social_2',
          players: [
            { id: 'user', status: 'active', isUser: true },
            { id: 'finn', status: 'active' },
            { id: 'rae', status: 'jury' },
          ],
        }
      )
    ).toBe(true)
  })

  it('invalidates a Safety consultation when the sender no longer holds Safety', () => {
    expect(
      isIncomingInteractionInvalidated(interaction('safety_holder_consults_loh'), {
        phase: 'pos_ceremony',
        lohId: 'user',
        posWinnerId: 'rae',
        players: [
          { id: 'user', status: 'loh', isUser: true },
          { id: 'finn', status: 'active' },
          { id: 'rae', status: 'pos' },
        ],
      })
    ).toBe(true)
  })
})
