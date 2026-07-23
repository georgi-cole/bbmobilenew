import { describe, expect, it } from 'vitest'
import { getDramaResponseBlueprint } from '../incomingResponseBank'
import {
  getIncomingResponseLogCopy,
  getIncomingResponseRelationshipDelta,
} from '../incomingResponseEffects'
import { getNamedInteractionText } from '../namedInteractionBank'
import { getInteractionDedupeReason } from '../incomingInteractionScheduler'
import { pickVariantText, SCENARIO_VARIANT_POOLS } from '../interactionVariantBank'
import socialReducer, { updateRelationship } from '../socialSlice'
import { getSocialOutcomeCopy } from '../socialOutcomeCopy'
import { hydrateSocial } from '../socialSlice'
import type { IncomingInteraction } from '../types'

function interaction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'incoming-1',
    fromId: 'ai-1',
    type: 'check_in',
    text: 'Checking in.',
    payload: { scenarioKey: 'generic_check_in', phase: 'social_1', dramaMode: true },
    createdAt: 10,
    createdWeek: 2,
    expiresAtWeek: 3,
    read: false,
    requiresResponse: true,
    resolved: false,
    ...overrides,
  }
}

describe('Drama social content system', () => {
  it('avoids an exact incoming line that was recently shown', () => {
    const families = SCENARIO_VARIANT_POOLS.generic_check_in
    const profile = { primary: ['composed' as const], secondary: ['sincere' as const] }
    const first = pickVariantText(families, profile, new Set(), 0, () => 0)
    const second = pickVariantText(
      families,
      profile,
      new Set(),
      0,
      () => 0,
      new Set([first.variantId])
    )
    expect(second.variantId).not.toBe(first.variantId)
    expect(second.text).not.toBe(first.text)
  })

  it('keeps every incoming scenario stocked with meaningful variety', () => {
    for (const families of Object.values(SCENARIO_VARIANT_POOLS)) {
      expect(families.flatMap((family) => family.variants).length).toBeGreaterThanOrEqual(6)
    }
  })

  it('varies compact response choices across different conversations', () => {
    const variants = Array.from({ length: 12 }, (_, index) =>
      getDramaResponseBlueprint(
        'compliment',
        interaction({ id: `compliment-${index}`, fromId: `ai-${index}`, type: 'compliment' }),
        'Warm'
      )
        ?.map((choice) => choice.label)
        .join('|')
    )
    expect(new Set(variants).size).toBeGreaterThan(1)
  })

  it('makes high-stakes replies matter more than casual replies', () => {
    expect(getIncomingResponseRelationshipDelta('alliance_proposal', 'accept', 'Trusting')).toBe(14)
    expect(getIncomingResponseRelationshipDelta('compliment', 'neutral', 'Curious')).toBe(1)
    expect(getIncomingResponseRelationshipDelta('nomination_plea', 'negative', 'Bitter')).toBe(-11)
  })

  it('renders concrete named intel and every response outcome as player-facing copy', () => {
    expect(getNamedInteractionText('betrayal_warning', 'warning', 'Quinn', 'seed-a')).toContain(
      'Quinn'
    )
    expect(getNamedInteractionText('unknown', 'gossip', 'Kai', 'seed-b')).toContain('Kai')
    expect(getNamedInteractionText('unknown', 'warning', 'Lia', 'seed-c')).toContain('Lia')

    const responseTypes = [
      'positive',
      'neutral',
      'negative',
      'accept',
      'decline',
      'dismiss',
      'ignore',
    ] as const
    for (const responseType of responseTypes) {
      expect(
        getIncomingResponseLogCopy(`interaction-${responseType}`, responseType, 'Nova')
      ).toContain('Nova')
    }
  })

  it('prevents the whole house from queueing the same routine scenario in one week', () => {
    const reason = getInteractionDedupeReason({
      interaction: interaction({ id: 'incoming-2', fromId: 'ai-2' }),
      priority: 'medium',
      pendingInteractions: [interaction()],
      week: 2,
    })
    expect(reason).toBe('deduped_scenario_weekly_cap')
  })

  it('enforces credible affinity floors and ceilings for named relationships', () => {
    let state = socialReducer(
      undefined,
      updateRelationship({ source: 'user', target: 'ally', delta: 0, tags: ['alliance'] })
    )
    expect(state.relationships.user.ally.affinity).toBe(50)

    state = socialReducer(
      state,
      updateRelationship({ source: 'user', target: 'rival', delta: 0, tags: ['rivalry'] })
    )
    expect(state.relationships.user.rival.affinity).toBe(-30)
  })

  it('repairs contradictory relationship tags when an older save is loaded', () => {
    const baseline = socialReducer(undefined, { type: 'test/init' })
    const saved = {
      ...baseline,
      relationships: { user: { ally: { affinity: 0, tags: ['alliance'] } } },
    }
    const hydrated = socialReducer(saved, hydrateSocial(saved))
    expect(hydrated.relationships.user.ally.affinity).toBe(50)
  })
  it('rotates immediate outcome copy instead of parroting one summary', () => {
    const summaries = Array.from({ length: 4 }, () =>
      getSocialOutcomeCopy({
        actionId: 'test-compliment',
        actionTitle: 'Compliment',
        kind: 'success',
        delta: 3,
      })
    )
    expect(new Set(summaries).size).toBe(4)
    expect(summaries.every((summary) => summary.includes('Relationship +3'))).toBe(true)
  })
})
