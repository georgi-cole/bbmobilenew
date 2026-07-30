import { describe, expect, it } from 'vitest'
import { evaluateSocialActionEligibility } from '../socialActionEligibility'
import { SOCIAL_ACTIONS, type SocialActionDefinition } from '../socialActions'
import { createInitialDramaSocialNetwork } from '../dramaModeEngine'

function action(id: string): SocialActionDefinition {
  const value = SOCIAL_ACTIONS.find((candidate) => candidate.id === id)
  if (!value) throw new Error(`Missing test action: ${id}`)
  return value
}

const players = [
  { id: 'user', status: 'active' as const },
  { id: 'loh', status: 'loh' as const },
  { id: 'ally', status: 'active' as const },
  { id: 'nominee', status: 'nominated' as const },
  { id: 'pos', status: 'pos' as const },
]

describe('social action catalogue context contract', () => {
  it('declares target shape for every action and subject pools for conversations', () => {
    for (const candidate of SOCIAL_ACTIONS) {
      expect(candidate.targetMode, candidate.id).toBeDefined()
      if (candidate.targetMode === 'primaryPlusSubject') {
        expect(candidate.subjectPool, candidate.id).toBeDefined()
      }
      if (candidate.needsTargets === false) {
        expect(candidate.targetMode, candidate.id).toBe('none')
      }
    }
  })

  it('gives every contextual legacy action a machine-enforced rule', () => {
    expect(action('proposeAlliance')).toMatchObject({
      excludedRelationshipTags: ['alliance'],
    })
    expect(action('favor_request').dramaMinAffinity).toBe(5)
    expect(action('pitch_target')).toMatchObject({
      requiredTargetStatus: ['loh', 'loh+pos'],
      dramaAllowedPhases: ['loh_results', 'social_1', 'nominations'],
    })
    expect(action('ask_use_safety').dramaAllowedPhases).toContain('pos_results')
    expect(action('warn_about_player').dramaRequiredRelationshipTags).toContain('alliance')
    expect(action('rally_votes_against')).toMatchObject({
      dramaRequiredTargetStatus: ['active', 'pos'],
      dramaAllowedPhases: ['pos_ceremony_results', 'social_2'],
    })
  })
})

describe('evaluateSocialActionEligibility', () => {
  it('keeps genuinely general actions available', () => {
    expect(
      evaluateSocialActionEligibility({
        action: action('compliment'),
        actorId: 'user',
        targetIds: ['ally'],
        players,
        relationships: {},
        requireCompleteSelection: true,
      })
    ).toEqual({ eligible: true, reason: '' })
  })

  it('keeps universal relationship prerequisites active in Normal Mode', () => {
    expect(
      evaluateSocialActionEligibility({
        action: action('betray'),
        actorId: 'user',
        targetIds: ['ally'],
        players,
        relationships: { user: { ally: { affinity: 0, tags: [] } } },
        ignoreRealityModeGate: true,
        requireCompleteSelection: true,
      }).eligible
    ).toBe(false)
    expect(
      evaluateSocialActionEligibility({
        action: action('ask_loh_target'),
        actorId: 'user',
        targetIds: ['loh'],
        players,
        ignoreRealityModeGate: true,
      }).eligible
    ).toBe(true)
  })

  it('requires an active alliance before a Drama Mode betrayal', () => {
    const base = {
      action: action('betray'),
      actorId: 'user',
      targetIds: ['ally'],
      players,
      requireCompleteSelection: true,
      dramaMode: true,
    }
    expect(
      evaluateSocialActionEligibility({
        ...base,
        relationships: { user: { ally: { affinity: 30, tags: [] } } },
      }).eligible
    ).toBe(false)
    expect(
      evaluateSocialActionEligibility({
        ...base,
        relationships: {
          user: { ally: { affinity: 30, tags: ['alliance'] } },
          ally: { user: { affinity: 30, tags: ['alliance'] } },
        },
      }).eligible
    ).toBe(true)
  })

  it('enforces role and weekly window for Drama Mode political actions', () => {
    const base = {
      action: action('pitch_target'),
      actorId: 'user',
      subjectId: 'ally',
      players,
      relationships: {},
      requireCompleteSelection: true,
      dramaMode: true,
    }
    expect(
      evaluateSocialActionEligibility({ ...base, targetIds: ['loh'], phase: 'social_1' }).eligible
    ).toBe(true)
    expect(
      evaluateSocialActionEligibility({ ...base, targetIds: ['ally'], phase: 'social_1' }).eligible
    ).toBe(false)
    expect(
      evaluateSocialActionEligibility({ ...base, targetIds: ['loh'], phase: 'live_vote' }).eligible
    ).toBe(false)
  })

  it('validates subject pools instead of trusting a stale picker value', () => {
    const base = {
      action: action('ask_use_safety'),
      actorId: 'user',
      targetIds: ['pos'],
      phase: 'pos_results',
      players,
      relationships: {},
      requireCompleteSelection: true,
      dramaMode: true,
    }
    expect(evaluateSocialActionEligibility({ ...base, subjectId: 'nominee' }).eligible).toBe(true)
    expect(evaluateSocialActionEligibility({ ...base, subjectId: 'ally' }).eligible).toBe(false)
  })

  it('requires a named secret known by the actor before exposure', () => {
    const network = createInitialDramaSocialNetwork()
    const base = {
      action: action('expose_secret'),
      actorId: 'user',
      targetIds: ['ally'],
      phase: 'social_2',
      players,
      relationships: {},
      dramaMode: true,
      requireCompleteSelection: true,
    }
    expect(evaluateSocialActionEligibility({ ...base, dramaNetwork: network }).eligible).toBe(false)
    network.rumours.push({
      id: 'rumour-1',
      kind: 'fake_deal',
      originatorId: 'user',
      subjectId: 'ally',
      truth: 'uncertain',
      createdWeek: 3,
      expiresWeek: 5,
      listeners: [],
      status: 'circulating',
    })
    expect(evaluateSocialActionEligibility({ ...base, dramaNetwork: network }).eligible).toBe(true)
  })

  it('applies actor-role rules to Drama Mode AI catalogue actions too', () => {
    const base = {
      action: action('nominate'),
      actorId: 'loh',
      targetIds: ['ally'],
      phase: 'nominations',
      players,
      relationships: {},
      requireCompleteSelection: true,
      allowAIOnly: true,
      dramaMode: true,
    }
    expect(evaluateSocialActionEligibility(base).eligible).toBe(true)
    expect(evaluateSocialActionEligibility({ ...base, actorId: 'user' }).eligible).toBe(false)
  })
})
