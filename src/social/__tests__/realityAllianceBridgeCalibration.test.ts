import { describe, expect, it } from 'vitest'
import {
  chooseAiEvictionVote,
  getNominationTargetScore,
  getSafetyRelationshipScore,
  getStrategicAllianceDecisionRead,
} from '../../store/gameSlice'
import type { GameState, Player, StrategicAllianceSnapshot } from '../../types'
import {
  adjustRealityAllianceCommitment,
  coordinateRealityAllianceTarget,
  createInitialRealityDomainState,
  createRealityAlliance,
  ensureRealityActors,
  holdRealityAllianceMeeting,
  leakRealityAlliance,
  markRealityAllianceInfiltratorIfSecondary,
  recruitRealityAllianceMember,
} from '../reality'

function player(id: string): Player {
  return {
    id,
    name: id,
    isUser: false,
    status: 'active',
    stats: { lohWins: 0, posWins: 0, timesNominated: 1 },
  } as Player
}

function allianceSnapshot(
  id: string,
  memberIds: string[],
  overrides: Partial<StrategicAllianceSnapshot> = {}
): StrategicAllianceSnapshot {
  return {
    id,
    memberIds,
    leaderIds: [memberIds[0]],
    status: 'ACTIVE',
    cohesion: 0.8,
    fractureRisk: 0.1,
    currentTargetIds: [],
    fallbackTargetIds: [],
    memberCommitment: Object.fromEntries(memberIds.map((memberId) => [memberId, 0.8])),
    memberPerceivedStatus: Object.fromEntries(
      memberIds.map((memberId) => [memberId, 'CORE' as const])
    ),
    memberPlanBeliefs: Object.fromEntries(memberIds.map((memberId) => [memberId, []])),
    infiltratorIds: [],
    ...overrides,
  }
}

function decisionState(alliances: StrategicAllianceSnapshot[]): GameState {
  return {
    week: 4,
    phase: 'live_vote',
    lohId: 'actor',
    dramaSocialMode: true,
    players: [player('actor'), player('ally'), player('neutral'), player('partner')],
    strategicRelationships: {
      actor: {
        ally: { affinity: 30, tags: ['alliance'] },
        neutral: { affinity: 30, tags: [] },
        partner: { affinity: 30, tags: ['alliance'] },
      },
    },
    strategicAlliances: alliances,
  } as GameState
}

function voteAgainstAllyRate(state: GameState, seeds = 400): number {
  const votesAgainstAlly = Array.from({ length: seeds }, (_, seed) =>
    chooseAiEvictionVote(state, 'actor', ['ally', 'neutral'], seed)
  ).filter((vote) => vote === 'ally').length
  return votesAgainstAlly / seeds
}

function round(value: number, places = 3): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

describe('Reality alliance strategic bridge calibration', () => {
  it('scales nomination, safety, and eviction protection with pact strength without making votes absolute', () => {
    const cases = {
      strong: allianceSnapshot('strong', ['actor', 'ally'], {
        cohesion: 0.9,
        fractureRisk: 0.06,
        memberCommitment: { actor: 0.9, ally: 0.88 },
      }),
      medium: allianceSnapshot('medium', ['actor', 'ally'], {
        cohesion: 0.6,
        fractureRisk: 0.34,
        memberCommitment: { actor: 0.58, ally: 0.6 },
        memberPerceivedStatus: { actor: 'REGULAR', ally: 'REGULAR' },
      }),
      weak: allianceSnapshot('weak', ['actor', 'ally'], {
        cohesion: 0.36,
        fractureRisk: 0.62,
        memberCommitment: { actor: 0.36, ally: 0.34 },
        memberPerceivedStatus: { actor: 'PERIPHERAL', ally: 'PERIPHERAL' },
      }),
      infiltrator: allianceSnapshot('infiltrator', ['actor', 'ally'], {
        cohesion: 0.4,
        fractureRisk: 0.56,
        memberCommitment: { actor: 0.3, ally: 0.72 },
        memberPerceivedStatus: { actor: 'PERIPHERAL', ally: 'CORE' },
        infiltratorIds: ['actor'],
      }),
    } satisfies Record<string, StrategicAllianceSnapshot>

    const metrics = Object.fromEntries(
      Object.entries(cases).map(([label, alliance]) => {
        const state = decisionState([alliance])
        const ally = state.players.find((entry) => entry.id === 'ally')!
        const neutral = state.players.find((entry) => entry.id === 'neutral')!
        const read = getStrategicAllianceDecisionRead(state, 'actor', 'ally')
        return [
          label,
          {
            sharedProtection: round(read.sharedProtection),
            betrayalPressure: round(read.betrayalPressure),
            nominationProtectionMargin: round(
              getNominationTargetScore(state, 'actor', neutral) -
                getNominationTargetScore(state, 'actor', ally)
            ),
            safetyProtectionMargin: round(
              getSafetyRelationshipScore(state, 'actor', ally) -
                getSafetyRelationshipScore(state, 'actor', neutral)
            ),
            voteAgainstAllyRate: round(voteAgainstAllyRate(state)),
          },
        ]
      })
    ) as Record<
      keyof typeof cases,
      {
        sharedProtection: number
        betrayalPressure: number
        nominationProtectionMargin: number
        safetyProtectionMargin: number
        voteAgainstAllyRate: number
      }
    >

    console.log('REALITY_ALLIANCE_DECISION_CALIBRATION')
    console.log(JSON.stringify(metrics, null, 2))

    expect(metrics.strong.sharedProtection).toBeGreaterThan(metrics.weak.sharedProtection)
    expect(metrics.strong.nominationProtectionMargin).toBeGreaterThan(
      metrics.weak.nominationProtectionMargin
    )
    expect(metrics.strong.safetyProtectionMargin).toBeGreaterThan(
      metrics.weak.safetyProtectionMargin
    )
    expect(metrics.strong.voteAgainstAllyRate).toBeGreaterThan(0)
    expect(metrics.strong.voteAgainstAllyRate).toBeLessThan(metrics.weak.voteAgainstAllyRate)
    expect(metrics.weak.voteAgainstAllyRate).toBeLessThan(metrics.infiltrator.voteAgainstAllyRate)
    expect(metrics.infiltrator.voteAgainstAllyRate).toBeLessThan(1)
  })

  it('lets a coordinated target plan pressure compete with a separate protective pact', () => {
    const protective = allianceSnapshot('protective', ['actor', 'ally'], {
      cohesion: 0.88,
      fractureRisk: 0.08,
      memberCommitment: { actor: 0.88, ally: 0.86 },
    })
    const targeting = allianceSnapshot('targeting', ['actor', 'partner'], {
      cohesion: 0.72,
      fractureRisk: 0.2,
      currentTargetIds: ['ally'],
      memberCommitment: { actor: 0.74, partner: 0.7 },
      memberPerceivedStatus: { actor: 'CORE', partner: 'REGULAR' },
      memberPlanBeliefs: { actor: ['target:ally'], partner: ['target:ally'] },
    })

    const protectedOnly = decisionState([protective])
    const conflicted = decisionState([protective, targeting])
    const ally = conflicted.players.find((entry) => entry.id === 'ally')!

    const beforeRead = getStrategicAllianceDecisionRead(protectedOnly, 'actor', 'ally')
    const afterRead = getStrategicAllianceDecisionRead(conflicted, 'actor', 'ally')
    const beforeNomination = getNominationTargetScore(protectedOnly, 'actor', ally)
    const afterNomination = getNominationTargetScore(conflicted, 'actor', ally)
    const beforeSafety = getSafetyRelationshipScore(protectedOnly, 'actor', ally)
    const afterSafety = getSafetyRelationshipScore(conflicted, 'actor', ally)
    const beforeVoteRate = voteAgainstAllyRate(protectedOnly)
    const afterVoteRate = voteAgainstAllyRate(conflicted)

    const strainedProtective = allianceSnapshot('strained-protective', ['actor', 'ally'], {
      cohesion: 0.4,
      fractureRisk: 0.55,
      memberCommitment: { actor: 0.38, ally: 0.4 },
      memberPerceivedStatus: { actor: 'PERIPHERAL', ally: 'PERIPHERAL' },
    })
    const strainedOnly = decisionState([strainedProtective])
    const strainedConflicted = decisionState([strainedProtective, targeting])
    const strainedVoteRateBefore = voteAgainstAllyRate(strainedOnly)
    const strainedVoteRateAfter = voteAgainstAllyRate(strainedConflicted)

    console.log(
      'REALITY_ALLIANCE_CONFLICT_CALIBRATION',
      JSON.stringify(
        {
          strongProtectiveRead: {
            sharedProtection: round(beforeRead.sharedProtection),
            currentTargetPressure: round(beforeRead.currentTargetPressure),
          },
          strongConflictedRead: {
            sharedProtection: round(afterRead.sharedProtection),
            currentTargetPressure: round(afterRead.currentTargetPressure),
          },
          nominationScoreDelta: round(afterNomination - beforeNomination),
          safetyScoreDelta: round(afterSafety - beforeSafety),
          strongVoteAgainstAllyRateBefore: round(beforeVoteRate),
          strongVoteAgainstAllyRateAfter: round(afterVoteRate),
          strainedVoteAgainstAllyRateBefore: round(strainedVoteRateBefore),
          strainedVoteAgainstAllyRateAfter: round(strainedVoteRateAfter),
        },
        null,
        2
      )
    )

    expect(afterRead.sharedProtection).toBeGreaterThan(0)
    expect(afterRead.currentTargetPressure).toBeGreaterThan(0)
    expect(afterNomination).toBeGreaterThan(beforeNomination)
    expect(afterSafety).toBeLessThan(beforeSafety)
    // One coordinated plan should not automatically override a strong core pact.
    expect(afterVoteRate).toBeGreaterThanOrEqual(beforeVoteRate)
    expect(afterVoteRate).toBeLessThan(1)
    // The same plan should become behaviorally meaningful once the protective pact is strained.
    expect(strainedVoteRateAfter).toBeGreaterThan(strainedVoteRateBefore)
    expect(strainedVoteRateAfter).toBeLessThan(1)
  })

  it('exercises coalition growth, false-pretense infiltration, target coordination, leak discovery, and public exposure together', () => {
    const domain = createInitialRealityDomainState()
    const actorIds = [
      'broker',
      'double-agent',
      'loyal',
      'leader',
      'wing',
      'recruit',
      'rival',
      'outsider-1',
      'outsider-2',
      'outsider-3',
      'outsider-4',
    ]
    ensureRealityActors(domain, actorIds)

    createRealityAlliance(domain, {
      id: 'primary-pact',
      founderIds: ['double-agent'],
      memberIds: ['loyal'],
      purpose: 'Final 2',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(domain, {
      allianceId: 'primary-pact',
      attendeeIds: ['double-agent', 'loyal'],
      targetIds: [],
      planIds: ['endgame'],
      at: { day: 2, phase: 'social_2' },
    })
    adjustRealityAllianceCommitment(domain, 'primary-pact', 'double-agent', 0.35)
    adjustRealityAllianceCommitment(domain, 'primary-pact', 'loyal', 0.35)

    createRealityAlliance(domain, {
      id: 'secondary-pact',
      founderIds: ['broker'],
      memberIds: ['double-agent'],
      purpose: 'Mutual protection',
      at: { day: 3, phase: 'social_1' },
    })
    expect(
      markRealityAllianceInfiltratorIfSecondary(domain, 'secondary-pact', 'double-agent', {
        day: 3,
        phase: 'social_2',
      })
    ).toBe(true)

    leakRealityAlliance(
      domain,
      'secondary-pact',
      'double-agent',
      ['outsider-1', 'outsider-2', 'outsider-3', 'outsider-4'],
      { day: 4, phase: 'social_1' }
    )

    createRealityAlliance(domain, {
      id: 'coalition-base',
      founderIds: ['leader'],
      memberIds: ['wing'],
      purpose: 'Control the vote',
      at: { day: 4, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(domain, {
      allianceId: 'coalition-base',
      attendeeIds: ['leader', 'wing'],
      targetIds: [],
      planIds: ['build:numbers'],
      at: { day: 4, phase: 'social_2' },
    })
    const expanded = recruitRealityAllianceMember(domain, {
      allianceId: 'coalition-base',
      recruiterId: 'leader',
      targetId: 'recruit',
      expandedAllianceId: 'coalition-expanded',
      at: { day: 5, phase: 'social_1' },
    })
    const coordinated = coordinateRealityAllianceTarget(domain, {
      actorId: 'leader',
      partnerId: 'recruit',
      subjectId: 'rival',
      kind: 'CURRENT',
      at: { day: 5, phase: 'social_2' },
      sourceEventId: 'calibration:target-plan',
    })

    const eventTypes = domain.events.map((event) => event.type)
    const secondary = domain.alliances['secondary-pact']

    console.log(
      'REALITY_ALLIANCE_LIFECYCLE_CALIBRATION',
      JSON.stringify(
        {
          expandedCoalitionSize: expanded.memberIds.length,
          preservedInnerPact: Boolean(domain.alliances['coalition-base']),
          overlapLinked:
            expanded.overlapAllianceIds.includes('coalition-base') &&
            domain.alliances['coalition-base'].overlapAllianceIds.includes(expanded.id),
          targetCoordinated: coordinated?.currentTargetIds.includes('rival') ?? false,
          infiltratorIds: secondary.infiltratorIds,
          secrecyAfterLeak: round(secondary.secrecy),
          leakEvents: eventTypes.filter((type) => type === 'ALLIANCE_LEAKED').length,
          publicExposureEvents: eventTypes.filter(
            (type) => type === 'ALLIANCE_PUBLICLY_EXPOSED'
          ).length,
        },
        null,
        2
      )
    )

    expect(expanded.memberIds).toHaveLength(3)
    expect(domain.alliances['coalition-base']).toBeDefined()
    expect(expanded.overlapAllianceIds).toContain('coalition-base')
    expect(domain.alliances['coalition-base'].overlapAllianceIds).toContain(expanded.id)
    expect(coordinated?.currentTargetIds).toContain('rival')
    expect(secondary.infiltratorIds).toContain('double-agent')
    expect(eventTypes).toContain('ALLIANCE_FALSE_PRETENSE_ESTABLISHED')
    expect(eventTypes).toContain('ALLIANCE_LEAKED')
    expect(eventTypes).toContain('ALLIANCE_PUBLICLY_EXPOSED')
  })
})
