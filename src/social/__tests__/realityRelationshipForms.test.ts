import { describe, expect, it } from 'vitest'
import {
  adjustRealityAllianceCommitment,
  applyRealityApology,
  chooseAllianceMemberVote,
  coordinateRealityAllianceTarget,
  createRealityAlliance,
  createRealityGrievance,
  createInitialRealityDomainState,
  findRealityAllianceForConsultation,
  findRealityAllianceForRecruitment,
  formRealityTruce,
  holdRealityAllianceMeeting,
  holdRealityAllianceStrategyMeeting,
  leakRealityAlliance,
  markRealityAllianceInfiltratorIfSecondary,
  recordRealityAllianceBetrayal,
  renameRealityAlliance,
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

  it('keeps a private target agreement inside the strongest overlapping pact', () => {
    const state = createInitialRealityDomainState()
    const core = createRealityAlliance(state, {
      id: 'core-final-two',
      founderIds: ['ava', 'lia'],
      memberIds: [],
      purpose: 'Final two',
      at: { day: 1, phase: 'social_1' },
    })
    core.status = 'ACTIVE'
    core.memberCommitment.ava = 0.82
    core.memberCommitment.lia = 0.8
    refreshRealityAllianceDynamics(core)

    const outer = createRealityAlliance(state, {
      id: 'outer-coalition',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
    })
    outer.status = 'ACTIVE'
    outer.memberCommitment.ava = 0.55
    outer.memberCommitment.lia = 0.54
    outer.memberCommitment.kai = 0.5
    refreshRealityAllianceDynamics(outer)

    const coordinated = coordinateRealityAllianceTarget(state, {
      actorId: 'ava',
      partnerId: 'lia',
      subjectId: 'nova',
      kind: 'CURRENT',
      at: { day: 3, phase: 'social_1' },
      sourceEventId: 'pitch:nova',
    })

    expect(coordinated?.id).toBe(core.id)
    expect(core.currentTargetIds).toEqual(['nova'])
    expect(core.memberPlanBeliefs.ava).toEqual(['target:nova'])
    expect(core.memberPlanBeliefs.lia).toEqual(['target:nova'])
    expect(outer.currentTargetIds).toEqual([])
    expect(
      state.events.some(
        (event) =>
          event.type === 'ALLIANCE_TARGET_COORDINATED' && event.reason.includes('pitch:nova')
      )
    ).toBe(true)
  })
})

describe('Reality alliance player-facing coordination', () => {
  it('uses the wider coalition for a group consultation when an inner pact overlaps it', () => {
    const state = createInitialRealityDomainState()
    const core = createRealityAlliance(state, {
      id: 'inner-final-two',
      founderIds: ['ava', 'lia'],
      memberIds: [],
      purpose: 'Final two',
      at: { day: 1, phase: 'social_1' },
    })
    core.status = 'ACTIVE'
    core.memberCommitment.ava = 0.9
    core.memberCommitment.lia = 0.9
    refreshRealityAllianceDynamics(core)

    const coalition = createRealityAlliance(state, {
      id: 'wider-coalition',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai', 'nova'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
    })
    coalition.status = 'ACTIVE'
    refreshRealityAllianceDynamics(coalition)

    expect(findRealityAllianceForConsultation(state, 'ava', 'lia')?.id).toBe(coalition.id)
  })

  it('persists a strategy huddle as the shared alliance plan without penalizing excused absences', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'strategy-pact',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai', 'nova'],
      purpose: 'Control the vote',
      at: { day: 2, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'
    const novaBefore = alliance.memberCommitment.nova

    holdRealityAllianceStrategyMeeting(state, {
      allianceId: alliance.id,
      callerId: 'ava',
      attendeeIds: ['ava', 'lia', 'kai'],
      targetIds: ['mara'],
      fallbackTargetIds: ['zoe'],
      planIds: ['target:mara', 'fallback:zoe'],
      agenda: 'nominations',
      at: { day: 4, phase: 'social_1' },
      sourceEventId: 'consult-1',
      excusedAbsentIds: ['nova'],
    })

    expect(alliance.currentTargetIds).toEqual(['mara'])
    expect(alliance.fallbackTargetIds).toEqual(['zoe'])
    expect(alliance.memberPlanBeliefs.lia).toEqual(['target:mara', 'fallback:zoe'])
    expect(alliance.memberCommitment.nova).toBe(novaBefore)
    expect(
      state.events.some(
        (event) =>
          event.type === 'ALLIANCE_STRATEGY_MEETING' &&
          event.reason.includes('nominations:consult-1')
      )
    ).toBe(true)
  })

  it('lets a member give the alliance a private custom name', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'named-pact',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai'],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })

    renameRealityAlliance(state, {
      allianceId: alliance.id,
      actorId: 'ava',
      name: '  The Night Shift  ',
      at: { day: 3, phase: 'social_2' },
    })

    expect(alliance.name).toBe('The Night Shift')
    expect(
      state.events.some(
        (event) => event.type === 'ALLIANCE_RENAMED' && event.actorId === 'ava'
      )
    ).toBe(true)
    expect(() =>
      renameRealityAlliance(state, {
        allianceId: alliance.id,
        actorId: 'outsider',
        name: 'Stolen Name',
        at: { day: 3, phase: 'social_2' },
      })
    ).toThrow('Only a member')
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

    adjustRealityAllianceCommitment(state, alliance.id, 'lia', -0.14)
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
    expect(polarized.fractureRisk).toBeGreaterThanOrEqual(0.72)
    expect(polarized.status).toBe('ACTIVE')

    polarized.memberCommitment = { ava: 0.8, lia: 0.8, kai: 0.8, nova: 0.8 }
    polarized.memberPlanBeliefs = {
      ava: ['vote:mara'],
      lia: ['vote:mara'],
      kai: ['vote:mara'],
      nova: ['vote:mara'],
    }
    refreshRealityAllianceDynamics(polarized)

    expect(polarized.status).toBe('ACTIVE')
    expect(polarized.cohesion).toBeGreaterThan(0.7)
    expect(polarized.fractureRisk).toBeLessThan(0.42)
  })

  it('lets a neglected alliance go dormant and later revive through renewed participation', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'dormant-pact',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia', 'kai'],
      targetIds: ['nova'],
      planIds: ['vote:nova'],
      at: { day: 2, phase: 'social_2' },
    })

    adjustRealityAllianceCommitment(state, alliance.id, 'ava', -0.4)
    adjustRealityAllianceCommitment(state, alliance.id, 'lia', -0.4)

    expect(alliance.status).toBe('DORMANT')

    for (let day = 3; day <= 9; day += 1) {
      holdRealityAllianceMeeting(state, {
        allianceId: alliance.id,
        attendeeIds: ['ava', 'lia', 'kai'],
        targetIds: ['nova'],
        planIds: ['vote:nova'],
        at: { day, phase: 'social_1' },
      })
    }

    expect(alliance.status).toBe('ACTIVE')
    expect(alliance.cohesion).toBeGreaterThanOrEqual(0.5)
  })

  it('keeps explicit leak-driven fracture behavior separate from passive fracture pressure', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'alliance-leaks',
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

    leakRealityAlliance(state, alliance.id, 'ava', ['kai'], {
      day: 3,
      phase: 'social_1',
    })
    leakRealityAlliance(state, alliance.id, 'ava', ['nova'], {
      day: 4,
      phase: 'social_1',
    })
    expect(alliance.status).toBe('ACTIVE')

    leakRealityAlliance(state, alliance.id, 'ava', ['mara'], {
      day: 5,
      phase: 'social_1',
    })

    expect(alliance.fractureRisk).toBeGreaterThanOrEqual(0.72)
    expect(alliance.status).toBe('FRACTURED')
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

    for (let day = 4; day <= 13; day += 1) {
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

describe('Reality overlapping deals and betrayal lifecycle', () => {
  it('marks a secondary deal as false pretence when the recruit already has a much stronger pact', () => {
    const state = createInitialRealityDomainState()
    const primary = createRealityAlliance(state, {
      id: 'primary',
      founderIds: ['kai'],
      memberIds: ['nova'],
      purpose: 'Final two',
      at: { day: 1, phase: 'social_1' },
    })
    for (let day = 1; day <= 4; day += 1) {
      holdRealityAllianceMeeting(state, {
        allianceId: primary.id,
        attendeeIds: ['kai', 'nova'],
        targetIds: [],
        planIds: ['final-two'],
        at: { day, phase: 'social_2' },
      })
    }

    const core = createRealityAlliance(state, {
      id: 'recruiting-core',
      founderIds: ['ava'],
      memberIds: ['lia'],
      purpose: 'Control the middle',
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
      expandedAllianceId: 'secondary-coalition',
      at: { day: 5, phase: 'social_1' },
    })

    expect(primary.memberCommitment.kai).toBeGreaterThanOrEqual(0.68)
    expect(coalition.infiltratorIds).toContain('kai')
    expect(coalition.genuine).toBe(false)
    expect(coalition.memberPerceivedStatus.kai).toBe('PERIPHERAL')
    expect(coalition.memberCommitment.kai).toBeLessThanOrEqual(0.3)
    expect(
      state.events.some(
        (event) => event.type === 'ALLIANCE_FALSE_PRETENSE_ESTABLISHED' && event.actorId === 'kai'
      )
    ).toBe(true)
  })

  it('lets a secondary false deal become genuine after the primary pact ends and loyalty rebuilds', () => {
    const state = createInitialRealityDomainState()
    const primary = createRealityAlliance(state, {
      id: 'primary',
      founderIds: ['kai'],
      memberIds: ['nova'],
      purpose: 'Final two',
      at: { day: 1, phase: 'social_1' },
    })
    primary.status = 'ACTIVE'
    primary.memberCommitment.kai = 0.82
    primary.memberCommitment.nova = 0.8

    const secondary = createRealityAlliance(state, {
      id: 'secondary',
      founderIds: ['ava'],
      memberIds: ['kai'],
      purpose: 'Backup deal',
      at: { day: 2, phase: 'social_1' },
    })
    expect(
      markRealityAllianceInfiltratorIfSecondary(state, secondary.id, 'kai', {
        day: 2,
        phase: 'social_2',
      })
    ).toBe(true)
    expect(secondary.infiltratorIds).toContain('kai')

    primary.status = 'DISSOLVED'
    for (let day = 3; day <= 9; day += 1) {
      holdRealityAllianceMeeting(state, {
        allianceId: secondary.id,
        attendeeIds: ['ava', 'kai'],
        targetIds: [],
        planIds: ['rebuild'],
        at: { day, phase: 'social_1' },
      })
    }

    expect(secondary.memberCommitment.kai).toBeGreaterThanOrEqual(0.58)
    expect(secondary.infiltratorIds).not.toContain('kai')
    expect(secondary.genuine).toBe(true)
  })

  it('lets a recruit organically defect from a weak unrelated pact after loyalty shifts', () => {
    const state = createInitialRealityDomainState()
    const oldPact = createRealityAlliance(state, {
      id: 'old-pact',
      founderIds: ['kai'],
      memberIds: ['nova'],
      purpose: 'Old protection deal',
      at: { day: 1, phase: 'social_1' },
    })
    oldPact.status = 'ACTIVE'
    oldPact.memberCommitment.kai = 0.18
    oldPact.memberCommitment.nova = 0.55
    refreshRealityAllianceDynamics(oldPact)

    const newCoalition = createRealityAlliance(state, {
      id: 'new-coalition',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
    })
    newCoalition.status = 'ACTIVE'
    newCoalition.memberCommitment.ava = 0.78
    newCoalition.memberCommitment.lia = 0.76
    newCoalition.memberCommitment.kai = 0.71
    refreshRealityAllianceDynamics(newCoalition)

    holdRealityAllianceMeeting(state, {
      allianceId: newCoalition.id,
      attendeeIds: ['ava', 'lia', 'kai'],
      targetIds: ['mara'],
      planIds: ['target:mara'],
      at: { day: 4, phase: 'social_2' },
    })

    expect(newCoalition.memberIds).toContain('kai')
    expect(oldPact.memberIds).not.toContain('kai')
    expect(oldPact.status).toBe('DISSOLVED')
    expect(
      state.events.some(
        (event) =>
          event.type === 'ALLIANCE_MEMBER_DEFECTED' &&
          event.targetIds.includes('kai') &&
          event.reason.includes('old-pact')
      )
    ).toBe(true)
  })

  it('does not break a nested inner pact when loyalty rises in its overlapping coalition', () => {
    const state = createInitialRealityDomainState()
    const inner = createRealityAlliance(state, {
      id: 'inner-pact',
      founderIds: ['ava', 'lia'],
      memberIds: [],
      purpose: 'Final two',
      at: { day: 1, phase: 'social_1' },
    })
    inner.status = 'ACTIVE'
    inner.memberCommitment.ava = 0.18
    inner.memberCommitment.lia = 0.82
    refreshRealityAllianceDynamics(inner)

    const coalition = createRealityAlliance(state, {
      id: 'outer-coalition',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai'],
      purpose: 'Wider coalition',
      at: { day: 2, phase: 'social_1' },
    })
    coalition.status = 'ACTIVE'
    coalition.memberCommitment.ava = 0.71
    coalition.memberCommitment.lia = 0.74
    coalition.memberCommitment.kai = 0.7
    refreshRealityAllianceDynamics(coalition)

    holdRealityAllianceMeeting(state, {
      allianceId: coalition.id,
      attendeeIds: ['ava', 'lia', 'kai'],
      targetIds: ['mara'],
      planIds: ['target:mara'],
      at: { day: 4, phase: 'social_2' },
    })

    expect(inner.memberIds).toContain('ava')
    expect(inner.status).not.toBe('DISSOLVED')
    expect(
      state.events.some(
        (event) =>
          event.type === 'ALLIANCE_MEMBER_DEFECTED' &&
          event.targetIds.includes('ava') &&
          event.reason.includes('inner-pact')
      )
    ).toBe(false)
  })

  it('expels a collapsed member from a fractured coalition instead of destroying the whole group', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'fractured-coalition',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai'],
      purpose: 'Control the vote',
      at: { day: 2, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'
    alliance.memberCommitment.ava = 0.9
    alliance.memberCommitment.lia = 0.85
    alliance.memberCommitment.kai = 0.12
    refreshRealityAllianceDynamics(alliance)
    alliance.status = 'FRACTURED'

    recordRealityAllianceBetrayal(state, {
      actorId: 'kai',
      targetId: 'lia',
      kind: 'SOCIAL_BETRAYAL',
      at: { day: 5, phase: 'social_2' },
      sourceEventId: 'kai-crossed-line',
    })

    expect(alliance.memberIds).toEqual(expect.arrayContaining(['ava', 'lia']))
    expect(alliance.memberIds).not.toContain('kai')
    expect(alliance.status).not.toBe('DISSOLVED')
    expect(
      state.events.some(
        (event) =>
          event.type === 'ALLIANCE_MEMBER_EXPELLED' &&
          event.targetIds.includes('kai') &&
          event.reason.includes('fractured-coalition')
      )
    ).toBe(true)
  })

  it('fractures a core pact after a serious betrayal and dissolves it after another severe breach', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'ride-or-die',
      founderIds: ['ava', 'lia'],
      memberIds: [],
      purpose: 'Final two',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(state, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia'],
      targetIds: ['nova'],
      planIds: ['vote:nova'],
      at: { day: 2, phase: 'social_2' },
    })

    recordRealityAllianceBetrayal(state, {
      actorId: 'ava',
      targetId: 'lia',
      kind: 'NOMINATION',
      at: { day: 5, phase: 'nomination_results' },
      sourceEventId: 'nomination-1',
    })

    expect(alliance.status).toBe('FRACTURED')
    expect(state.relationships.lia.ava.resentment).toBeGreaterThan(0)
    expect(state.memoriesByOwner.lia.some((memory) => memory.tags.includes('BETRAYAL'))).toBe(true)
    expect(
      Object.values(state.grievances).some(
        (grievance) => grievance.holderId === 'lia' && grievance.againstId === 'ava'
      )
    ).toBe(true)

    const commitmentAfterFirstBetrayal = alliance.memberCommitment.ava
    recordRealityAllianceBetrayal(state, {
      actorId: 'ava',
      targetId: 'lia',
      kind: 'NOMINATION',
      at: { day: 5, phase: 'nomination_results' },
      sourceEventId: 'nomination-1',
    })
    expect(alliance.memberCommitment.ava).toBe(commitmentAfterFirstBetrayal)

    recordRealityAllianceBetrayal(state, {
      actorId: 'ava',
      targetId: 'lia',
      kind: 'SOCIAL_BETRAYAL',
      at: { day: 6, phase: 'social_1' },
      sourceEventId: 'betrayal-2',
    })

    expect(alliance.status).toBe('DISSOLVED')
    expect(alliance.currentTargetIds).toEqual([])
    expect(alliance.fallbackTargetIds).toEqual([])
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
