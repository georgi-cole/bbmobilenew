import { describe, expect, it } from 'vitest'
import {
  adjustRealityAllianceCommitment,
  applyRealityApology,
  chooseAllianceMemberVote,
  createRealityAlliance,
  createRealityGrievance,
  createInitialRealityDomainState,
  findRealityAllianceForRecruitment,
  formRealityTruce,
  holdRealityAllianceMeeting,
  recruitRealityAllianceMember,
  refreshRealityAllianceDynamics,
  refreshRealityAllianceOverlaps,
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

describe('Reality alliance commitment and hierarchy', () => {
  it('requires sustained commitment before promotion and sustained erosion before demotion', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'alliance-commitment',
      founderIds: ['ava'],
      memberIds: ['lia'],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia'],
      targetIds: [],
      planIds: ['protect'],
      at: { day: 2, phase: 'social_2' },
    })

    alliance.memberCommitment.lia = 0.73
    alliance.memberPerceivedStatus.lia = 'REGULAR'
    adjustRealityAllianceCommitment(state, alliance.id, 'lia', 0.01)
    expect(alliance.memberPerceivedStatus.lia).toBe('CORE')
    expect(alliance.leaderIds).toContain('lia')

    adjustRealityAllianceCommitment(state, alliance.id, 'lia', -0.2)
    expect(alliance.memberCommitment.lia).toBeCloseTo(0.54)
    expect(alliance.memberPerceivedStatus.lia).toBe('CORE')

    adjustRealityAllianceCommitment(state, alliance.id, 'lia', -0.11)
    expect(alliance.memberPerceivedStatus.lia).toBe('REGULAR')

    adjustRealityAllianceCommitment(state, alliance.id, 'lia', -0.13)
    expect(alliance.memberPerceivedStatus.lia).toBe('PERIPHERAL')
    expect(alliance.leaderIds).not.toContain('lia')
  })

  it('treats a polarized alliance as less cohesive than an equally committed uniform alliance', () => {
    const uniformState = createInitialRealityDomainState()
    const uniform = createRealityAlliance(uniformState, {
      id: 'uniform',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai', 'nova'],
      purpose: 'Control the middle',
      at: { day: 3, phase: 'social_1' },
    })
    uniform.status = 'ACTIVE'
    uniform.memberCommitment = { ava: 0.5, lia: 0.5, kai: 0.5, nova: 0.5 }
    refreshRealityAllianceDynamics(uniform)

    const polarizedState = createInitialRealityDomainState()
    const polarized = createRealityAlliance(polarizedState, {
      id: 'polarized',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai', 'nova'],
      purpose: 'Control the middle',
      at: { day: 3, phase: 'social_1' },
    })
    polarized.status = 'ACTIVE'
    polarized.memberCommitment = { ava: 0.9, lia: 0.9, kai: 0.1, nova: 0.1 }
    refreshRealityAllianceDynamics(polarized)

    expect(polarized.cohesion).toBeLessThan(uniform.cohesion)
    expect(polarized.fractureRisk).toBeGreaterThan(uniform.fractureRisk)
    expect(polarized.status).toBe('FRACTURED')
  })

  it('rewards repeated participation while exclusion and conflicting plans raise fracture pressure', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'alliance-meetings',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai'],
      purpose: 'Coordinate the vote',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia', 'kai'],
      targetIds: ['nova'],
      planIds: ['vote:nova'],
      at: { day: 2, phase: 'social_2' },
    })
    const baselineRisk = alliance.fractureRisk
    const kaiBefore = alliance.memberCommitment.kai

    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia'],
      targetIds: ['mara'],
      planIds: ['vote:mara'],
      at: { day: 3, phase: 'social_1' },
    })

    expect(alliance.memberCommitment.ava).toBeGreaterThan(alliance.memberCommitment.kai)
    expect(alliance.memberCommitment.kai).toBeLessThan(kaiBefore)
    expect(alliance.memberPlanBeliefs.kai).toEqual(['vote:nova'])
    expect(alliance.fractureRisk).toBeGreaterThan(baselineRisk)

    for (let day = 4; day <= 11; day += 1) {
      holdRealityAllianceMeeting(state, {
        allianceId: alliance.id,
        attendeeIds: ['ava', 'lia'],
        targetIds: ['mara'],
        planIds: ['vote:mara'],
        at: { day, phase: 'social_1' },
      })
    }

    expect(alliance.memberPerceivedStatus.lia).toBe('CORE')
    expect(alliance.memberPerceivedStatus.kai).toBe('PERIPHERAL')
  })
})

describe('Reality coalition recruitment', () => {
  it('preserves a two-person core while creating a wider overlapping coalition', () => {
    const state = createInitialRealityDomainState()
    const core = createRealityAlliance(state, {
      id: 'alliance-core',
      founderIds: ['ava'],
      memberIds: ['lia'],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: core.id,
      attendeeIds: ['ava', 'lia'],
      targetIds: [],
      planIds: ['protect:core'],
      at: { day: 2, phase: 'social_2' },
    })

    expect(findRealityAllianceForRecruitment(state, 'ava', 'kai')?.id).toBe(core.id)

    const coalition = recruitRealityAllianceMember(state, {
      allianceId: core.id,
      recruiterId: 'ava',
      targetId: 'kai',
      expandedAllianceId: 'alliance-coalition',
      at: { day: 3, phase: 'social_1' },
    })

    expect(core.memberIds).toEqual(['ava', 'lia'])
    expect(coalition.memberIds).toEqual(['ava', 'lia', 'kai'])
    expect(coalition.memberPerceivedStatus).toMatchObject({
      ava: 'CORE',
      lia: 'CORE',
      kai: 'REGULAR',
    })
    expect(core.overlapAllianceIds).toEqual(['alliance-coalition'])
    expect(coalition.overlapAllianceIds).toEqual(['alliance-core'])
    expect(Object.values(state.alliances)).toHaveLength(2)
  })

  it('extends the wider coalition in place and keeps duplicate recruitment idempotent', () => {
    const state = createInitialRealityDomainState()
    const core = createRealityAlliance(state, {
      id: 'alliance-core',
      founderIds: ['ava'],
      memberIds: ['lia'],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: core.id,
      attendeeIds: ['ava', 'lia'],
      targetIds: [],
      planIds: ['protect:core'],
      at: { day: 2, phase: 'social_2' },
    })
    const coalition = recruitRealityAllianceMember(state, {
      allianceId: core.id,
      recruiterId: 'ava',
      targetId: 'kai',
      expandedAllianceId: 'alliance-coalition',
      at: { day: 3, phase: 'social_1' },
    })

    expect(findRealityAllianceForRecruitment(state, 'ava', 'nova')?.id).toBe(coalition.id)

    const expanded = recruitRealityAllianceMember(state, {
      allianceId: coalition.id,
      recruiterId: 'ava',
      targetId: 'nova',
      expandedAllianceId: 'unused-id',
      at: { day: 4, phase: 'social_1' },
    })
    expect(expanded.id).toBe(coalition.id)
    expect(expanded.memberIds).toEqual(['ava', 'lia', 'kai', 'nova'])
    expect(expanded.memberPerceivedStatus.nova).toBe('PERIPHERAL')
    expect(Object.values(state.alliances)).toHaveLength(2)

    const eventCount = state.events.length
    const duplicate = recruitRealityAllianceMember(state, {
      allianceId: coalition.id,
      recruiterId: 'ava',
      targetId: 'nova',
      expandedAllianceId: 'still-unused',
      at: { day: 4, phase: 'social_2' },
    })
    expect(duplicate.id).toBe(coalition.id)
    expect(duplicate.memberIds.filter((id) => id === 'nova')).toHaveLength(1)
    expect(state.events).toHaveLength(eventCount)
  })

  it('clears stale overlaps and refuses recruitment from a dissolved coalition', () => {
    const state = createInitialRealityDomainState()
    const core = createRealityAlliance(state, {
      id: 'alliance-core',
      founderIds: ['ava'],
      memberIds: ['lia'],
      purpose: 'Inner pact',
      at: { day: 2, phase: 'social_1' },
    })
    const outer = createRealityAlliance(state, {
      id: 'alliance-outer',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai'],
      purpose: 'Wider coalition',
      at: { day: 3, phase: 'social_1' },
    })

    expect(core.overlapAllianceIds).toEqual(['alliance-outer'])
    outer.status = 'DISSOLVED'
    refreshRealityAllianceOverlaps(state)

    expect(core.overlapAllianceIds).toEqual([])
    expect(outer.overlapAllianceIds).toEqual([])
    expect(() =>
      recruitRealityAllianceMember(state, {
        allianceId: outer.id,
        recruiterId: 'ava',
        targetId: 'nova',
        expandedAllianceId: 'unused',
        at: { day: 4, phase: 'social_1' },
      })
    ).toThrow('Alliance is not recruitable')
  })

  it('does not let a peripheral member silently expand the coalition', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'alliance-1',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
    })
    alliance.memberPerceivedStatus.kai = 'PERIPHERAL'

    expect(findRealityAllianceForRecruitment(state, 'kai', 'nova')).toBeNull()
    expect(() =>
      recruitRealityAllianceMember(state, {
        allianceId: alliance.id,
        recruiterId: 'kai',
        targetId: 'nova',
        expandedAllianceId: 'alliance-2',
        at: { day: 3, phase: 'social_1' },
      })
    ).toThrow('Peripheral members cannot recruit')
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
