import { describe, expect, it } from 'vitest'
import {
  applyRealityApology,
  chooseAllianceMemberVote,
  createRealityAlliance,
  createRealityGrievance,
  createInitialRealityDomainState,
  formRealityTruce,
  holdRealityAllianceMeeting,
  reciprocateRealityRomance,
  signalRealityRomance,
} from '../reality'

describe('operational Reality alliances', () => {
  it('lets members hold different plan beliefs and vote independently', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'alliance-1',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai'],
      purpose: 'Counter the power pair',
      at: { day: 3, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia'],
      targetIds: ['nova'],
      planIds: ['vote-nova'],
      at: { day: 3, phase: 'social_2' },
    })

    expect(alliance.memberPlanBeliefs.ava).toEqual(['vote-nova'])
    expect(alliance.memberPlanBeliefs.lia).toEqual(['vote-nova'])
    expect(alliance.memberPlanBeliefs.kai).toEqual([])

    alliance.memberCommitment.ava = 0.95
    alliance.memberCommitment.kai = 0.1
    const avaVote = chooseAllianceMemberVote(state, alliance.id, 'ava', {
      candidateIds: ['nova', 'mara'],
      day: 3,
      draw: 0.2,
    })
    const kaiVote = chooseAllianceMemberVote(state, alliance.id, 'kai', {
      candidateIds: ['nova', 'mara'],
      day: 3,
      draw: 0.8,
    })

    expect(avaVote.intendedTargetId).toBe('nova')
    expect(kaiVote.confidence).not.toBe(avaVote.confidence)
  })
})

describe('mutual Reality romance', () => {
  it('keeps a one-sided signal from becoming a romance until the other person accepts', () => {
    const state = createInitialRealityDomainState()
    const signal = signalRealityRomance(state, {
      actorId: 'ava',
      targetId: 'lia',
      at: { day: 2, phase: 'night' },
      acceptedByTarget: false,
      settings: { enabled: true },
    })!

    expect(signal.status).toBe('SIGNALLED')
    expect(signal.anchorEventIds).toEqual([])
    expect(state.relationships.ava.lia.perceivedLabel).not.toBe('ROMANCE')
    expect(state.relationships.lia?.ava).toBeUndefined()

    const mutual = reciprocateRealityRomance(state, signal.id, 'lia', { day: 3, phase: 'night' })
    expect(mutual.status).toBe('ACTIVE')
    expect(mutual.anchorEventIds).toHaveLength(1)
    expect(state.relationships.ava.lia.attraction).toBeGreaterThan(0)
    expect(state.relationships.lia.ava.attraction).toBeGreaterThan(0)
  })

  it('honors romance settings before creating any state', () => {
    const state = createInitialRealityDomainState()
    expect(
      signalRealityRomance(state, {
        actorId: 'ava',
        targetId: 'lia',
        at: { day: 1, phase: 'night' },
        acceptedByTarget: true,
        settings: { enabled: false },
      })
    ).toBeNull()
    expect(state.romances).toEqual({})
  })
})

describe('conflict, repair, and truce', () => {
  it('makes severe repair take repeated accountable actions', () => {
    const state = createInitialRealityDomainState()
    const grievance = createRealityGrievance(state, {
      id: 'grievance-1',
      holderId: 'lia',
      againstId: 'ava',
      causeEventId: 'blindside',
      severity: 90,
      at: { day: 5, phase: 'eviction_results' },
    })
    applyRealityApology(state, {
      grievanceId: grievance.id,
      apologyEventId: 'apology-1',
      sincerity: 1,
      accountability: 1,
      at: { day: 5, phase: 'night' },
    })

    expect(grievance.status).toBe('REPAIRING')
    expect(grievance.repairDebt).toBeGreaterThan(70)
    expect(state.relationships.lia.ava.unresolvedGrievanceIds).toContain(grievance.id)
  })

  it('forms an uneasy truce without deleting prior resentment', () => {
    const state = createInitialRealityDomainState()
    state.relationships.lia = {
      ava: {
        ...state.relationships.lia?.ava,
        ...({
          fromId: 'lia',
          toId: 'ava',
          warmth: -60,
          trust: -55,
          loyalty: -30,
          respect: 0,
          attraction: 0,
          intimacy: 0,
          gratitude: 0,
          resentment: 80,
          fear: 0,
          envy: 0,
          suspicion: 70,
          strategicValue: 0,
          perceivedThreat: 55,
          reliability: -50,
          familiarity: 70,
          publicCloseness: 0,
          secretCloseness: 0,
          trend: 0,
          positiveAnchorEventIds: [],
          negativeAnchorEventIds: ['fight'],
          unresolvedGrievanceIds: [],
          activePromiseIds: [],
          activeDebtIds: [],
          perceivedLabel: 'ENEMY',
          publicLabel: 'RIVAL',
          labelConfidence: 0.9,
        } as const),
      },
    }
    formRealityTruce(state, 'lia', 'ava', 'nova', { day: 6, phase: 'social_1' })

    expect(state.relationships.lia.ava.perceivedLabel).toBe('UNEASY_TRUCE')
    expect(state.relationships.lia.ava.resentment).toBeGreaterThan(60)
  })
})
