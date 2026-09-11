import { describe, expect, it } from 'vitest'
import {
  getContextualIncomingChoices,
  resolveIncomingResponse,
} from '../incomingInteractionResolution'
import { INCOMING_SCENE_OUTCOME_BANK } from '../incomingSceneOutcomeBank'
import { getIncomingDialogueBeat } from '../incomingDialogueOutcomeBank'
import { SCENARIO_VARIANT_POOLS } from '../interactionVariantBank'
import type { IncomingInteraction } from '../types'

function makeInteraction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'incoming-resolution-1',
    fromId: 'rae',
    type: 'nomination_plea',
    text: 'Can we talk?',
    payload: { scenarioKey: 'nominee_hoh_plea' },
    createdAt: 1,
    createdWeek: 3,
    expiresAtWeek: 3,
    read: false,
    requiresResponse: true,
    resolved: false,
    ...overrides,
  }
}

describe('incoming interaction contextual resolution', () => {
  const supportedSceneKeys = [
    'week_start_ally_check_in',
    'week_start_enemy_gossip',
    'week_start_alliance_lock',
    'hoh_congratulations',
    'safety_win_congratulations',
    'player_nominated_support',
    'player_nominated_tension',
    'competition_low_finish_support',
    'competition_low_finish_taunt',
    'social_momentum_notice',
    'hoh_safety_request',
    'nominee_hoh_plea',
    'nominee_veto_pitch',
    'nominee_campaign',
    'nomination_aftershock',
    'nominee_understands_loh',
    'nominee_confronts_loh',
    'replacement_nominee_reacts_to_loh',
    'post_veto_gratitude',
    'post_veto_campaign',
    'live_vote_pitch',
    'survivor_gratitude',
    'betrayal_warning',
    'ignored_warning',
    'targeted_snark',
    'alliance_reassurance',
    'generic_gossip',
    'generic_check_in',
  ] as const

  it('keeps an authored opening and four outcome branches for every standard scene', () => {
    for (const scenarioKey of supportedSceneKeys) {
      expect(SCENARIO_VARIANT_POOLS[scenarioKey]?.length).toBeGreaterThan(0)
      const outcomeSet = INCOMING_SCENE_OUTCOME_BANK[scenarioKey]
      expect(outcomeSet?.positive.length).toBeGreaterThanOrEqual(2)
      expect(outcomeSet?.neutral.length).toBeGreaterThanOrEqual(2)
      expect(outcomeSet?.negative.length).toBeGreaterThanOrEqual(2)
      expect(outcomeSet?.dismiss.length).toBeGreaterThanOrEqual(2)
      for (const responseType of ['positive', 'neutral', 'negative', 'dismiss'] as const) {
        expect(
          getIncomingDialogueBeat({
            scenarioKey,
            responseType,
            fromName: 'Rae',
            seed: 0,
          })
        ).toBeTruthy()
      }
    }
  })

  it('gives a nomination plea scene-specific player actions', () => {
    const choices = getContextualIncomingChoices(makeInteraction())

    expect(choices).toHaveLength(4)
    expect(choices?.some((choice) => /safety|your word/i.test(choice.label))).toBe(true)
    expect(choices?.some((choice) => /case|without promising/i.test(choice.label))).toBe(true)
    expect(choices?.map((choice) => choice.responseType)).toEqual([
      'positive',
      'neutral',
      'negative',
      'dismiss',
    ])
  })

  it('keeps a scene response short and concrete', () => {
    const resolution = resolveIncomingResponse({
      interaction: makeInteraction(),
      responseType: 'positive',
      fromName: 'Rae',
      phase: 'nominations',
      actorAffinity: 14,
      playerAffinity: 8,
      responseLabel: 'Offer safety',
    })

    expect(resolution.actorDelta).toBeGreaterThan(0)
    expect(resolution.playerDelta).toBeGreaterThan(0)
    expect(resolution.playerDelta).toBeLessThan(resolution.actorDelta)
    expect(resolution.outcomeText).toBe(
      'Rae says putting them up would create a vote you cannot fully control.'
    )
    expect(resolution.outcomeText.length).toBeLessThan(120)
    expect(resolution.memoryDelta.gratitude).toBeGreaterThan(0)
  })

  it('keeps a confrontation distinct from a friendly check-in', () => {
    const resolution = resolveIncomingResponse({
      interaction: makeInteraction({
        id: 'incoming-resolution-2',
        type: 'warning',
        payload: { scenarioKey: 'nominee_confronts_loh' },
      }),
      responseType: 'negative',
      fromName: 'Rae',
      phase: 'nomination_results',
      actorAffinity: -20,
      playerAffinity: -8,
      responseLabel: 'Refuse the accusation',
    })

    expect(resolution.actorDelta).toBeLessThan(0)
    expect(resolution.playerDelta).toBeLessThan(0)
    expect(resolution.outcomeText).toBe('Rae backs off and adjusts their plans without you.')
    expect(resolution.memoryDelta.resentment).toBeGreaterThan(0)
  })

  it('gives a request for an explanation a short, specific reply', () => {
    const resolution = resolveIncomingResponse({
      interaction: makeInteraction({
        id: 'mimi-direct-question',
        fromId: 'mimi',
        type: 'check_in',
        text: 'Something between us is not adding up, and I want a direct answer.',
        payload: { scenarioKey: 'generic_check_in' },
      }),
      responseType: 'neutral',
      responseLabel: 'Make them explain',
      fromName: 'Mimi',
      phase: 'social_1',
      actorAffinity: -2,
      playerAffinity: -2,
    })

    expect(resolution.outcomeText).toBe('Mimi says they felt shut out and wanted a direct answer.')
  })

  it('gives a Safety question a specific concise outcome', () => {
    const interaction = makeInteraction({
      id: 'authored-safety-fallout',
      fromId: 'mimi',
      type: 'nomination_plea',
      text: 'I need to know whether you will use Safety.',
      payload: { scenarioKey: 'nominee_veto_pitch' },
    })
    const resolution = resolveIncomingResponse({
      interaction,
      responseType: 'neutral',
      responseLabel: 'Ask what changes',
      fromName: 'Mimi',
      phase: 'pos_ceremony',
      actorAffinity: 0,
      playerAffinity: 0,
    })
    expect(resolution.outcomeText).toBe('Mimi says they need a clear deal before names are set.')
  })

  it('gives an ask-for-source reply a concrete, qualified exchange', () => {
    const resolution = resolveIncomingResponse({
      interaction: makeInteraction({
        id: 'ask-the-source',
        fromId: 'bea',
        type: 'gossip',
        text: 'I heard something about Dex.',
        payload: { scenarioKey: 'generic_gossip', subjectId: 'dex' },
      }),
      responseType: 'positive',
      responseLabel: 'Ask source',
      fromName: 'Bea',
      subjectName: 'Dex',
      phase: 'social_2',
      actorAffinity: 4,
      playerAffinity: 3,
    })

    expect(resolution.outcomeText).toBe(
      'Bea says the story came up twice, but will not name anyone yet.'
    )
  })

  it('gives a campaign reply an actual case instead of only a relationship summary', () => {
    const resolution = resolveIncomingResponse({
      interaction: makeInteraction({
        id: 'hear-the-case',
        payload: { scenarioKey: 'live_vote_pitch' },
      }),
      responseType: 'neutral',
      responseLabel: 'Ask for their case',
      fromName: 'Rae',
      phase: 'live_vote',
      actorAffinity: 0,
      playerAffinity: 0,
    })

    expect(resolution.outcomeText).toBe(
      'Rae says keeping them gives you a vote that is still open.'
    )
  })

  it('makes check-in answers distinct and phase-aware', () => {
    const interaction = makeInteraction({
      id: 'friendly-check-in',
      type: 'check_in',
      payload: { scenarioKey: 'relationship_friendship_check_in' },
    })
    const askHowTheyAre = resolveIncomingResponse({
      interaction,
      responseType: 'neutral',
      responseLabel: 'Ask how they are',
      fromName: 'Nico',
      phase: 'social_1',
      actorAffinity: 0,
      playerAffinity: 0,
    })
    const askThemBack = resolveIncomingResponse({
      interaction,
      responseType: 'neutral',
      responseLabel: 'Ask them back',
      fromName: 'Rune',
      phase: 'social_1',
      actorAffinity: 0,
      playerAffinity: 0,
    })
    const nomineeCheckIn = resolveIncomingResponse({
      interaction,
      responseType: 'neutral',
      responseLabel: 'Ask how they are',
      fromName: 'Nico',
      phase: 'live_vote',
      senderIsNominated: true,
      actorAffinity: 0,
      playerAffinity: 0,
    })

    expect(askHowTheyAre.outcomeText).toBe(
      'Nico says they are worried about the upcoming nominations.'
    )
    expect(askThemBack.outcomeText).toBe(
      'Rune says they are still trying to read where they stand with you.'
    )
    expect(nomineeCheckIn.outcomeText).toBe('Nico says they feel the house is against them.')
  })
})
