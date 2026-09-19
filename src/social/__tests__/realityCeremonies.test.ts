import { describe, expect, it } from 'vitest'
import {
  applyRealityRelationshipChange,
  computeRealityJuryEvaluation,
  createInitialRealityDomainState,
  createRealityAlliance,
  finalizeRealityVote,
  generateRealityJuryQuestion,
  holdRealityAllianceMeeting,
  recordRealityCeremonyOutcome,
  removeRealityAllianceMember,
  scoreRealityNominationCandidate,
  setRealityIntendedVote,
  setRealityStatedVote,
  upsertRealityPromise,
} from '../reality'
import { aiJurorVote, realityJurorScorecard } from '../../utils/juryUtils'
import socialReducer, { recordRealityCeremony, replaceRealityDomain } from '../socialSlice'

describe('Reality ceremony aftermath', () => {
  it('turns official ceremonies into facts, memories, goals, and public perception', () => {
    const state = createInitialRealityDomainState()
    const event = recordRealityCeremonyOutcome(state, {
      kind: 'POWER_WON',
      day: 3,
      phase: 'loh_results',
      actorId: 'ava',
      targetIds: [],
      witnessIds: ['ava', 'lia', 'kai'],
      publicEligible: true,
    })

    expect(event.type).toBe('CEREMONY_POWER_WON')
    expect(Object.values(state.facts)[0].sourceEventId).toBe(event.id)
    expect(state.memoriesByOwner.lia[0].sourceType).toBe('OFFICIAL')
    expect(state.contestants.ava.confidence).toBeGreaterThan(0)
    expect(state.publicPerception.ava.competitionRespect).toBeGreaterThan(0)
  })

  it('creates directed nomination fallout and a mandatory survival replan', () => {
    const state = createInitialRealityDomainState()
    recordRealityCeremonyOutcome(state, {
      kind: 'NOMINATIONS_LOCKED',
      day: 4,
      phase: 'nomination_results',
      actorId: 'ava',
      targetIds: ['lia'],
      witnessIds: ['ava', 'lia', 'kai'],
      publicEligible: false,
      tags: ['betrayal'],
    })

    expect(state.relationships.lia.ava.resentment).toBeGreaterThan(0)
    expect(state.relationships.ava?.lia).toBeUndefined()
    expect(state.contestants.lia.primaryGoalId).toBe('SURVIVE_THE_VOTE')
    expect(state.publicPerception.ava).toBeUndefined()
  })

  it('projects nomination fallout back into the visible roster relationship score', () => {
    const initial = socialReducer(undefined, { type: 'init' })
    const state = socialReducer(
      initial,
      recordRealityCeremony({
        kind: 'NOMINATIONS_LOCKED',
        day: 2,
        phase: 'nomination_results',
        actorId: 'loh',
        targetIds: ['nominee'],
        witnessIds: ['loh', 'nominee'],
        publicEligible: false,
      })
    )

    expect(state.relationships.nominee.loh.affinity).toBeLessThan(0)
    expect(state.relationships.nominee.loh.affinity).toBe(
      Math.round(
        state.reality.relationships.nominee.loh.warmth * 0.38 +
          state.reality.relationships.nominee.loh.trust * 0.24 +
          state.reality.relationships.nominee.loh.loyalty * 0.12 +
          state.reality.relationships.nominee.loh.respect * 0.08 +
          state.reality.relationships.nominee.loh.intimacy * 0.06 +
          state.reality.relationships.nominee.loh.gratitude * 0.05 -
          state.reality.relationships.nominee.loh.resentment * 0.12 -
          state.reality.relationships.nominee.loh.suspicion * 0.08 -
          state.reality.relationships.nominee.loh.fear * 0.03
      )
    )
  })
})

describe('Reality alliance ceremony consequences', () => {
  it('fractures a core pact when the LOH formally nominates their ally', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'core-pact',
      founderIds: ['loh', 'ally'],
      memberIds: [],
      purpose: 'Final two',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['loh', 'ally'],
      targetIds: ['outsider'],
      planIds: ['vote:outsider'],
      at: { day: 2, phase: 'social_2' },
    })

    recordRealityCeremonyOutcome(state, {
      kind: 'NOMINATIONS_LOCKED',
      day: 5,
      phase: 'nomination_results',
      actorId: 'loh',
      targetIds: ['ally'],
      witnessIds: ['loh', 'ally', 'outsider'],
      publicEligible: false,
    })

    expect(alliance.status).toBe('FRACTURED')
    expect(
      state.events.some(
        (event) =>
          event.type === 'ALLIANCE_BETRAYAL' &&
          event.actorId === 'loh' &&
          event.targetIds.includes('ally')
      )
    ).toBe(true)
    expect(state.relationships.ally.loh.resentment).toBeGreaterThan(0)
  })

  it('rewards following a known alliance vote plan only once across vote projections', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'plan-pact',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai'],
      purpose: 'Vote together',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia', 'kai'],
      targetIds: ['outsider'],
      planIds: ['vote:outsider'],
      at: { day: 2, phase: 'social_2' },
    })

    const before = alliance.memberCommitment.ava
    finalizeRealityVote(state, 'ava', 'outsider', { day: 5, phase: 'live_vote' }, 'vote-cast')
    expect(alliance.memberCommitment.ava).toBeCloseTo(before + 0.04)

    const afterCast = alliance.memberCommitment.ava
    finalizeRealityVote(
      state,
      'ava',
      'outsider',
      { day: 5, phase: 'eviction_results' },
      'vote-revealed'
    )
    expect(alliance.memberCommitment.ava).toBe(afterCast)
  })

  it('records a known vote-plan defection without treating it like voting against an ally', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'plan-defiance-pact',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai'],
      purpose: 'Vote together',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia', 'kai'],
      targetIds: ['outsider'],
      fallbackTargetIds: ['backup'],
      planIds: ['target:outsider', 'fallback:backup'],
      at: { day: 2, phase: 'social_2' },
    })

    const commitmentBefore = alliance.memberCommitment.ava
    finalizeRealityVote(state, 'ava', 'mara', { day: 5, phase: 'live_vote' }, 'vote-defiance')

    expect(alliance.memberCommitment.ava).toBeLessThan(commitmentBefore)
    expect(
      state.events.some(
        (event) =>
          event.type === 'ALLIANCE_PLAN_DEFIED' &&
          event.actorId === 'ava' &&
          event.targetIds.includes('mara')
      )
    ).toBe(true)
    expect(
      state.events.some(
        (event) =>
          event.type === 'ALLIANCE_BETRAYAL' &&
          event.actorId === 'ava' &&
          event.targetIds.includes('mara')
      )
    ).toBe(false)
    expect(state.relationships.lia.ava.suspicion).toBeGreaterThan(0)

    const afterFirstProjection = alliance.memberCommitment.ava
    finalizeRealityVote(
      state,
      'ava',
      'mara',
      { day: 5, phase: 'eviction_results' },
      'vote-defiance-reveal'
    )
    expect(alliance.memberCommitment.ava).toBe(afterFirstProjection)
  })

  it('does not punish a member when the alliance target is not available on the live block', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'stale-plan-pact',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai'],
      purpose: 'Vote together',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia', 'kai'],
      targetIds: ['outsider'],
      planIds: ['target:outsider'],
      at: { day: 2, phase: 'social_2' },
    })

    const commitmentBefore = alliance.memberCommitment.ava
    finalizeRealityVote(state, 'ava', 'mara', { day: 5, phase: 'live_vote' }, 'forced-choice', [
      'mara',
      'zoe',
    ])

    expect(alliance.memberCommitment.ava).toBe(commitmentBefore)
    expect(state.events.some((event) => event.type === 'ALLIANCE_PLAN_DEFIED')).toBe(false)
  })

  it('records an actual vote against an ally as a distinct alliance betrayal', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'voting-pact',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai'],
      purpose: 'Vote together',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia', 'kai'],
      targetIds: ['outsider'],
      planIds: ['vote:outsider'],
      at: { day: 2, phase: 'social_2' },
    })

    const before = alliance.memberCommitment.ava
    finalizeRealityVote(state, 'ava', 'lia', { day: 5, phase: 'live_vote' }, 'vote-against-lia')

    expect(alliance.memberCommitment.ava).toBeLessThan(before)
    const afterFirstProjection = alliance.memberCommitment.ava
    expect(
      state.events.some(
        (event) =>
          event.type === 'ALLIANCE_BETRAYAL' &&
          event.reason.includes('vote:voting-pact:vote-against-lia')
      )
    ).toBe(true)

    finalizeRealityVote(
      state,
      'ava',
      'lia',
      { day: 5, phase: 'eviction_results' },
      'vote-reveal-against-lia'
    )
    expect(alliance.memberCommitment.ava).toBe(afterFirstProjection)
  })
})

describe('Reality alliance exit projection', () => {
  it('removes the live alliance tag and projects a broken membership after expulsion', () => {
    const initial = socialReducer(undefined, { type: 'init' })
    const reality = createInitialRealityDomainState(initial.relationships)
    const alliance = createRealityAlliance(reality, {
      id: 'exit-pact',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai'],
      purpose: 'Control the vote',
      at: { day: 2, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'
    alliance.memberCommitment.ava = 0.9
    alliance.memberCommitment.lia = 0.85
    alliance.memberCommitment.kai = 0.05
    alliance.memberPerceivedStatus.ava = 'CORE'
    alliance.memberPerceivedStatus.lia = 'CORE'
    alliance.memberPerceivedStatus.kai = 'PERIPHERAL'
    alliance.leaderIds = ['ava', 'lia']

    let state = socialReducer(initial, replaceRealityDomain(reality))
    expect(state.relationships.ava.kai.tags).toContain('alliance')

    const nextReality = structuredClone(state.reality)
    removeRealityAllianceMember(nextReality, {
      allianceId: alliance.id,
      memberId: 'kai',
      actorId: 'ava',
      kind: 'EXPELLED',
      at: { day: 4, phase: 'social_2' },
      sourceEventId: 'expel-kai',
    })
    state = socialReducer(state, replaceRealityDomain(nextReality))

    expect(state.relationships.ava.kai.tags).not.toContain('alliance')
    expect(state.relationships.ava.kai.tags).toContain('broken_alliance')
  })
})

describe('stated, intended, and actual votes', () => {
  it('keeps the three vote layers separate and resolves vote promises from reality', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'promise-pact',
      founderIds: ['ava'],
      memberIds: ['lia'],
      purpose: 'Vote together',
      at: { day: 3, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia'],
      targetIds: [],
      planIds: ['keep-options-open'],
      at: { day: 3, phase: 'social_2' },
    })
    const commitmentBeforeBrokenPromise = alliance.memberCommitment.ava
    setRealityStatedVote(state, 'ava', 'lia', 5)
    setRealityIntendedVote(state, 'ava', 'kai', 5, 0.8)
    upsertRealityPromise(state, {
      id: 'vote-promise',
      kind: 'vote_commitment',
      promisorId: 'ava',
      beneficiaryIds: ['lia'],
      witnessIds: [],
      createdAt: { day: 5, phase: 'social_2' },
      deadline: { day: 5, phase: 'live_vote' },
      stakes: 0.9,
      scope: { targetId: 'lia' },
      status: 'ACTIVE',
    })

    finalizeRealityVote(state, 'ava', 'kai', { day: 5, phase: 'live_vote' }, 'vote-event')

    expect(state.voteIntents.ava).toMatchObject({
      statedTargetId: 'lia',
      intendedTargetId: 'kai',
      actualTargetId: 'kai',
    })
    expect(state.promises['vote-promise'].status).toBe('BROKEN')
    expect(alliance.memberCommitment.ava).toBeLessThan(commitmentBeforeBrokenPromise)
  })
})

describe('history-grounded strategic and jury decisions', () => {
  it('scores protected allies below threatening outsiders for nominations', () => {
    const state = createInitialRealityDomainState()
    applyRealityRelationshipChange(state, {
      sourceId: 'ava',
      targetId: 'lia',
      day: 2,
      phase: 'social_1',
      eventId: 'ally-anchor',
      anchor: 'positive',
      deltas: { trust: 55, loyalty: 60, warmth: 45 },
    })
    applyRealityRelationshipChange(state, {
      sourceId: 'ava',
      targetId: 'kai',
      day: 2,
      phase: 'social_1',
      eventId: 'threat-anchor',
      anchor: 'negative',
      deltas: { perceivedThreat: 80, suspicion: 50, resentment: 30 },
    })

    expect(scoreRealityNominationCandidate(state, 'ava', 'kai')).toBeGreaterThan(
      scoreRealityNominationCandidate(state, 'ava', 'lia')
    )
  })

  it('grounds a juror vote and question in remembered season history', () => {
    const state = createInitialRealityDomainState()
    applyRealityRelationshipChange(state, {
      sourceId: 'juror',
      targetId: 'ava',
      day: 8,
      phase: 'night',
      eventId: 'trusted-me',
      anchor: 'positive',
      deltas: { warmth: 70, trust: 65, respect: 60, reliability: 55 },
    })
    applyRealityRelationshipChange(state, {
      sourceId: 'juror',
      targetId: 'kai',
      day: 8,
      phase: 'night',
      eventId: 'betrayed-me',
      anchor: 'negative',
      deltas: { warmth: -55, trust: -70, resentment: 85, suspicion: 60 },
    })

    const scorecard = realityJurorScorecard('juror', ['ava', 'kai'], state)!
    expect(scorecard.ava).toBeGreaterThan(scorecard.kai)
    expect(aiJurorVote('juror', ['ava', 'kai'], 41, state)).toBe('ava')

    const evaluation = computeRealityJuryEvaluation(state, 'juror', 'kai')
    expect(generateRealityJuryQuestion(evaluation)).toMatch(/\?$/)
  })
})
