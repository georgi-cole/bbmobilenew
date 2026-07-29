import { describe, expect, it } from 'vitest'
import {
  applyRealityRelationshipChange,
  computeRealityJuryEvaluation,
  createInitialRealityDomainState,
  finalizeRealityVote,
  generateRealityJuryQuestion,
  recordRealityCeremonyOutcome,
  scoreRealityNominationCandidate,
  setRealityIntendedVote,
  setRealityStatedVote,
  upsertRealityPromise,
} from '../reality'
import { aiJurorVote, realityJurorScorecard } from '../../utils/juryUtils'
import socialReducer, { recordRealityCeremony } from '../socialSlice'

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

describe('stated, intended, and actual votes', () => {
  it('keeps the three vote layers separate and resolves vote promises from reality', () => {
    const state = createInitialRealityDomainState()
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
