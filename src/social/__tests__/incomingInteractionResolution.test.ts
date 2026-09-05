import { describe, expect, it } from 'vitest'
import {
  getContextualIncomingChoices,
  resolveIncomingResponse,
} from '../incomingInteractionResolution'
import {
  getAuthoredIncomingSceneOutcome,
  INCOMING_SCENE_OUTCOME_BANK,
} from '../incomingSceneOutcomeBank'
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

  it('resolves the same answer through scene, relationship, phase, and personality context', () => {
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
    expect(resolution.outcomeText).toMatch(/candid answer.*keeping them off the block/i)
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
    expect(resolution.outcomeText).toMatch(/drew a line/i)
    expect(resolution.memoryDelta.resentment).toBeGreaterThan(0)
  })

  it('turns a direct question and a request to explain into a concrete aftermath', () => {
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

    expect(resolution.outcomeText).toMatch(/asked Mimi to spell out exactly what was not adding up/i)
    expect(resolution.outcomeText).toMatch(/real answer.*not enough certainty|immediate issue better/i)
    expect(resolution.outcomeText).not.toMatch(/measured answer|reading between the lines|conversation about/i)
  })

  it('uses the authored fallout branch rather than a generic relationship sentence', () => {
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
    const authored = getAuthoredIncomingSceneOutcome('nominee_veto_pitch', 'neutral', 0)

    expect(authored).not.toBeNull()
    expect(resolution.outcomeText).toMatch(/Safety ceremony shaping the block/i)
    expect(resolution.outcomeText).toMatch(/Mimi knows Safety is still possible|Mimi leaves with a conditional opening/i)
  })
})
