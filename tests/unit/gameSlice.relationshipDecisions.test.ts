import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  chooseAiEvictionVote,
  getNominationTargetScore,
  getSafetyRelationshipScore,
  getStrategicAllianceDecisionRead,
  setDramaSocialMode,
} from '../../src/store/gameSlice'
import type { GameState, Player, StrategicAllianceSnapshot } from '../../src/types'

function player(id: string): Player {
  return {
    id,
    name: id,
    isUser: false,
    status: 'active',
    stats: { lohWins: 0, posWins: 0, timesNominated: 1 },
  } as Player
}

function userPlayer(id: string): Player {
  return { ...player(id), isUser: true }
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

describe('Reality alliance strategic influence', () => {
  it('makes a strong core pact more protective than a weak peripheral deal', () => {
    const holder = player('holder')
    const core = player('core')
    const peripheral = player('peripheral')
    const state = {
      week: 4,
      dramaSocialMode: true,
      players: [holder, core, peripheral],
      strategicRelationships: {
        holder: {
          core: { affinity: 30, tags: ['alliance'] },
          peripheral: { affinity: 30, tags: ['alliance'] },
        },
      },
      strategicAlliances: [
        allianceSnapshot('core-pact', ['holder', 'core'], {
          cohesion: 0.92,
          fractureRisk: 0.04,
          memberCommitment: { holder: 0.9, core: 0.9 },
        }),
        allianceSnapshot('loose-deal', ['holder', 'peripheral'], {
          cohesion: 0.34,
          fractureRisk: 0.58,
          memberCommitment: { holder: 0.46, peripheral: 0.29 },
          memberPerceivedStatus: { holder: 'REGULAR', peripheral: 'PERIPHERAL' },
        }),
      ],
    } as GameState

    expect(getSafetyRelationshipScore(state, 'holder', core)).toBeGreaterThan(
      getSafetyRelationshipScore(state, 'holder', peripheral)
    )
    expect(getNominationTargetScore(state, 'holder', core)).toBeLessThan(
      getNominationTargetScore(state, 'holder', peripheral)
    )
  })

  it('lets an overlapping alliance plan pressure compete with a separate protective pact', () => {
    const target = player('target')
    const base = {
      week: 4,
      dramaSocialMode: true,
      players: [player('actor'), target, player('third')],
      strategicRelationships: {
        actor: {
          target: { affinity: 45, tags: ['alliance'] },
        },
      },
      strategicAlliances: [
        allianceSnapshot('protective-pact', ['actor', 'target'], {
          cohesion: 0.86,
          memberCommitment: { actor: 0.86, target: 0.82 },
        }),
      ],
    } as GameState
    const conflicted = {
      ...base,
      strategicAlliances: [
        ...(base.strategicAlliances ?? []),
        allianceSnapshot('targeting-coalition', ['actor', 'third'], {
          leaderIds: ['actor'],
          cohesion: 0.74,
          currentTargetIds: ['target'],
          memberCommitment: { actor: 0.72, third: 0.7 },
          memberPerceivedStatus: { actor: 'CORE', third: 'REGULAR' },
          memberPlanBeliefs: { actor: ['vote:target'], third: ['vote:target'] },
        }),
      ],
    } as GameState

    const cleanRead = getStrategicAllianceDecisionRead(base, 'actor', 'target')
    const conflictRead = getStrategicAllianceDecisionRead(conflicted, 'actor', 'target')

    expect(cleanRead.sharedProtection).toBeGreaterThan(0)
    expect(cleanRead.currentTargetPressure).toBe(0)
    expect(conflictRead.sharedProtection).toBeGreaterThan(0)
    expect(conflictRead.currentTargetPressure).toBeGreaterThan(0)
    expect(getNominationTargetScore(conflicted, 'actor', target)).toBeGreaterThan(
      getNominationTargetScore(base, 'actor', target)
    )
  })

  it('treats a false-pretense member as far less protected by that alliance', () => {
    const genuine = {
      week: 4,
      dramaSocialMode: true,
      players: [player('voter'), player('ally'), player('other')],
      strategicRelationships: {
        voter: {
          ally: { affinity: 35, tags: ['alliance'] },
          other: { affinity: 0, tags: [] },
        },
      },
      strategicAlliances: [
        allianceSnapshot('deal', ['voter', 'ally'], {
          memberCommitment: { voter: 0.8, ally: 0.75 },
        }),
      ],
    } as GameState
    const falseDeal = {
      ...genuine,
      strategicAlliances: [
        allianceSnapshot('deal', ['voter', 'ally'], {
          cohesion: 0.42,
          fractureRisk: 0.5,
          memberCommitment: { voter: 0.3, ally: 0.75 },
          memberPerceivedStatus: { voter: 'PERIPHERAL', ally: 'CORE' },
          infiltratorIds: ['voter'],
        }),
      ],
    } as GameState

    const genuineRead = getStrategicAllianceDecisionRead(genuine, 'voter', 'ally')
    const falseRead = getStrategicAllianceDecisionRead(falseDeal, 'voter', 'ally')
    expect(falseRead.sharedProtection).toBeLessThan(genuineRead.sharedProtection * 0.25)
    expect(falseRead.betrayalPressure).toBeGreaterThan(genuineRead.betrayalPressure)

    const genuineBackstabs = Array.from({ length: 120 }, (_, seed) =>
      chooseAiEvictionVote(genuine, 'voter', ['ally', 'other'], seed)
    ).filter((vote) => vote === 'ally').length
    const falseDealBackstabs = Array.from({ length: 120 }, (_, seed) =>
      chooseAiEvictionVote(falseDeal, 'voter', ['ally', 'other'], seed)
    ).filter((vote) => vote === 'ally').length

    expect(falseDealBackstabs).toBeGreaterThan(genuineBackstabs)
  })
})

describe('relationship-aware AI eviction decisions', () => {
  it('persists the Drama Mode gameplay switch', () => {
    const initial = gameReducer(undefined, { type: 'test/init' })
    expect(gameReducer(initial, setDramaSocialMode(true)).dramaSocialMode).toBe(true)
  })

  it('uses bonds, betrayals, rivalries, and suspicion for Drama Mode nominations', () => {
    const initial = gameReducer(undefined, { type: 'test/init' })
    const loh = { ...player('loh'), status: 'loh' as const }
    const candidates = [
      player('betrayer'),
      player('ally'),
      player('romance'),
      player('protected'),
      player('target'),
      player('suspicious'),
    ]
    const state = {
      ...initial,
      phase: 'nominations' as const,
      lohId: loh.id,
      players: [loh, ...candidates],
      nomineeIds: [],
      dramaSocialMode: true,
      strategicRelationships: {
        [loh.id]: {
          betrayer: { affinity: 10, tags: ['betrayal'] },
          ally: { affinity: 70, tags: ['alliance'] },
          romance: { affinity: 60, tags: ['romance'] },
          protected: { affinity: 40, tags: ['protection'] },
          target: { affinity: 0, tags: ['target', 'rivalry'] },
          suspicious: { affinity: 0, tags: ['suspicious', 'unreliable'] },
        },
      },
    }

    const result = gameReducer(state, advance())
    expect(result.nomineeIds).toContain('betrayer')
    expect(result.nomineeIds).toContain('target')
    expect(result.nomineeIds).not.toContain('ally')
  })

  it('does not treat the human as an automatic eviction threat', () => {
    const voters = Array.from({ length: 12 }, (_, index) => player(`voter-${index}`))
    const state = {
      week: 4,
      lohId: 'loh',
      players: [...voters, userPlayer('user'), player('ai')],
      strategicRelationships: {},
    } as GameState

    const votes = voters.map((voter) => chooseAiEvictionVote(state, voter.id, ['user', 'ai'], 42))

    expect(new Set(votes)).toEqual(new Set(['user', 'ai']))
  })

  it('uses accomplishments rather than player type to identify a threat', () => {
    const provenThreat = player('proven-threat')
    provenThreat.stats = { lohWins: 2, posWins: 1, timesNominated: 1 }
    const state = {
      week: 4,
      lohId: 'loh',
      players: [player('voter'), userPlayer('user'), provenThreat],
      strategicRelationships: {},
    } as GameState

    expect(chooseAiEvictionVote(state, 'voter', ['user', 'proven-threat'], 42)).toBe(
      'proven-threat'
    )
  })

  it('carries an executed backdoor target into eviction voting', () => {
    const state = {
      week: 4,
      lohId: 'loh',
      players: [player('voter'), player('hidden-target'), player('pawn')],
      nomineeIds: ['hidden-target', 'pawn'],
      lohNominationPlan: {
        week: 4,
        lohId: 'loh',
        targetId: 'hidden-target',
        backupTargetId: null,
        pawnIds: ['pawn'],
        initialNomineeIds: ['pawn'],
        strategy: 'backdoor' as const,
        status: 'executed' as const,
        selectionBasis: 'strategy' as const,
        targetScore: 80,
        backdoorChance: 0.5,
      },
      strategicRelationships: {},
    } as GameState

    expect(chooseAiEvictionVote(state, 'voter', ['hidden-target', 'pawn'], 42)).toBe(
      'hidden-target'
    )
  })

  it('still lets a strong alliance protect the backdoor target', () => {
    const state = {
      week: 4,
      lohId: 'loh',
      players: [player('voter'), player('hidden-target'), player('pawn')],
      nomineeIds: ['hidden-target', 'pawn'],
      lohNominationPlan: {
        week: 4,
        lohId: 'loh',
        targetId: 'hidden-target',
        backupTargetId: null,
        pawnIds: ['pawn'],
        initialNomineeIds: ['pawn'],
        strategy: 'backdoor' as const,
        status: 'executed' as const,
        selectionBasis: 'strategy' as const,
        targetScore: 80,
        backdoorChance: 0.5,
      },
      strategicRelationships: {
        voter: {
          'hidden-target': { affinity: 75, tags: ['alliance'] },
          pawn: { affinity: 0, tags: [] },
        },
      },
    } as GameState

    expect(chooseAiEvictionVote(state, 'voter', ['hidden-target', 'pawn'], 42)).toBe('pawn')
  })

  it('normally protects an ally instead of voting randomly', () => {
    const state = {
      week: 4,
      lohId: 'loh',
      players: [player('voter'), player('ally'), player('other')],
      strategicRelationships: {
        voter: {
          ally: { affinity: 75, tags: ['alliance'] },
          other: { affinity: 0, tags: [] },
        },
      },
    } as GameState

    const votesAgainstAlly = Array.from({ length: 100 }, (_, seed) =>
      chooseAiEvictionVote(state, 'voter', ['ally', 'other'], seed)
    ).filter((vote) => vote === 'ally').length

    expect(votesAgainstAlly).toBeGreaterThan(0)
    expect(votesAgainstAlly).toBeLessThanOrEqual(22)
  })

  it('makes romance and bromance substantially more protective at eviction', () => {
    const state = {
      week: 4,
      lohId: 'loh',
      players: [player('voter'), player('romance'), player('other')],
      strategicRelationships: {
        voter: {
          romance: { affinity: 75, tags: ['alliance', 'romance'] },
          other: { affinity: 0, tags: [] },
        },
      },
    } as GameState

    const votesAgainstRomance = Array.from({ length: 100 }, (_, seed) =>
      chooseAiEvictionVote(state, 'voter', ['romance', 'other'], seed)
    ).filter((vote) => vote === 'romance').length

    expect(votesAgainstRomance).toBeLessThanOrEqual(10)
  })

  it('protects the stronger relationship when neither nominee is tagged as an ally', () => {
    const state = {
      week: 4,
      lohId: 'loh',
      players: [player('voter'), player('close'), player('distant')],
      strategicRelationships: {
        voter: {
          close: { affinity: 80, tags: [] },
          distant: { affinity: 5, tags: [] },
        },
      },
    } as GameState

    expect(chooseAiEvictionVote(state, 'voter', ['close', 'distant'], 42)).toBe('distant')
  })
})
