import { describe, expect, it } from 'vitest'
import type { CompetitionSkillProfile } from '../../../src/ai/competition/types'
import type { GameHistoryEvent, GameState, Player } from '../../../src/types'
import {
  buildMemoryLaneQuestionBank,
  deriveMemoryLaneAiAbility,
  getSeasonExitReceipts,
  simulateMemoryLaneAiDecision,
  type MemoryLaneQuestion,
} from '../../../src/components/DownMemoryLane/downMemoryLaneLogic'

function player(
  id: string,
  name: string,
  stats: { lohWins: number; posWins: number; timesNominated: number },
  extra: Partial<Player> = {}
): Player {
  return {
    id,
    name,
    avatar: `${id}.webp`,
    status: extra.status ?? 'active',
    stats,
    ...extra,
  }
}

function exitReceipt(
  week: number,
  playerId: string,
  voteCounts: Record<string, number>,
  options: {
    nomineeIds?: string[]
    leaderIds?: string[]
    votesByVoterId?: Record<string, string>
  } = {}
): GameHistoryEvent {
  return {
    type: 'seasonExit',
    week,
    timestamp: week * 1000,
    data: {
      playerId,
      nomineeIds: options.nomineeIds ?? Object.keys(voteCounts),
      leaderIds: options.leaderIds ?? ['maya'],
      votesByVoterId: options.votesByVoterId ?? {},
      voteCounts,
    },
  }
}

function seasonState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    player('user', 'Georgi', { lohWins: 2, posWins: 1, timesNominated: 1 }, { isUser: true }),
    player('maya', 'Maya', { lohWins: 3, posWins: 0, timesNominated: 2 }),
    player(
      'alex',
      'Alex',
      { lohWins: 0, posWins: 3, timesNominated: 4 },
      { status: 'jury', evictedAtWeek: 8 }
    ),
    player(
      'rune',
      'Rune',
      { lohWins: 1, posWins: 1, timesNominated: 0 },
      { status: 'jury', evictedAtWeek: 10 }
    ),
    player(
      'nova',
      'Nova',
      { lohWins: 0, posWins: 0, timesNominated: 3 },
      { status: 'evicted', evictedAtWeek: 2 }
    ),
    player(
      'lia',
      'Lia',
      { lohWins: 0, posWins: 1, timesNominated: 2 },
      { status: 'jury', evictedAtWeek: 6, seasonPlacement: 4 }
    ),
  ]

  return {
    gameId: 'test-season',
    season: 1,
    week: 13,
    phase: 'final3_comp3_minigame',
    players,
    tvFeed: [
      {
        id: 'loh-1',
        text: 'Maya has won Leader of the House! 👑',
        type: 'game',
        timestamp: 1,
        meta: { broadcastTemplateId: 'loh.winner' },
      },
      {
        id: 'pos-1',
        text: 'Lia has won the Power of Safety! 🎭',
        type: 'game',
        timestamp: 2,
      },
    ],
    isLive: true,
    seed: 99,
    lohId: 'user',
    nomineeIds: [],
    posWinnerId: null,
    prevHohId: null,
    mode: 'classic',
    history: [],
    ...overrides,
  } as GameState
}

describe('Down Memory Lane question bank', () => {
  it('builds a substantial deterministic bank from season facts', () => {
    const state = seasonState()
    const first = buildMemoryLaneQuestionBank(state, 4242)
    const second = buildMemoryLaneQuestionBank(state, 4242)
    expect(second).toEqual(first)
    expect(first.length).toBeGreaterThanOrEqual(10)
    expect(
      first.some(
        (question) => question.id === 'first-loh' && question.correctPlayerId === 'maya'
      )
    ).toBe(true)
    expect(
      first.some(
        (question) => question.id === 'first-pos' && question.correctPlayerId === 'lia'
      )
    ).toBe(true)
    expect(first.every((question) => question.optionPlayerIds.length === 4)).toBe(true)
    expect(first.every((question) => new Set(question.optionPlayerIds).size === 4)).toBe(true)
  })

  it('skips an ambiguous maximum instead of inventing a winner', () => {
    const state = seasonState()
    state.players.find((entry) => entry.id === 'user')!.stats!.timesNominated = 4
    const questions = buildMemoryLaneQuestionBank(state, 5)
    expect(questions.some((question) => question.id === 'most-nominated')).toBe(false)
  })

  it('uses durable seasonExit receipts for eviction vote trivia', () => {
    const history = [
      exitReceipt(2, 'nova', { nova: 6, rune: 1 }, {
        nomineeIds: ['nova', 'rune'],
        leaderIds: ['maya'],
        votesByVoterId: {
          user: 'nova',
          maya: 'nova',
          alex: 'nova',
          lia: 'nova',
          rune: 'nova',
          extra: 'nova',
        },
      }),
      exitReceipt(6, 'lia', { lia: 3, alex: 2 }, {
        nomineeIds: ['lia', 'alex'],
        leaderIds: ['user'],
      }),
      exitReceipt(8, 'alex', { alex: 4, maya: 2 }, {
        nomineeIds: ['alex', 'maya'],
        leaderIds: ['rune'],
      }),
    ]
    const state = seasonState({ history })
    const parsed = getSeasonExitReceipts(state)
    const questions = buildMemoryLaneQuestionBank(state, 919)

    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toMatchObject({ playerId: 'nova', week: 2 })
    expect(
      questions.some(
        (question) =>
          question.id === 'highest-eviction-vote-count' && question.correctPlayerId === 'nova'
      )
    ).toBe(true)
    expect(
      questions.some(
        (question) => question.id.startsWith('eviction-companion-')
      )
    ).toBe(true)
    expect(
      questions.some((question) => question.id.startsWith('eviction-leader-'))
    ).toBe(true)
  })

  it('skips highest eviction vote trivia when the season record is tied', () => {
    const state = seasonState({
      history: [
        exitReceipt(2, 'nova', { nova: 6, rune: 1 }),
        exitReceipt(6, 'lia', { lia: 6, alex: 1 }),
      ],
    })
    const questions = buildMemoryLaneQuestionBank(state, 922)
    expect(questions.some((question) => question.id === 'highest-eviction-vote-count')).toBe(
      false
    )
  })

  it('adds Cupid pair memories only when the Cupid season context exists', () => {
    const state = seasonState({
      cupidArrow: {
        scheduledSeason: 1,
        status: 'active',
        activatedSeason: 1,
        activatedWeek: 1,
        pairs: [
          { id: 'pair-1', memberIds: ['maya', 'alex'], color: '#fff' },
          { id: 'pair-2', memberIds: ['rune', 'nova'], color: '#fff' },
        ],
        eliminatedPairCount: 0,
        pendingPartnerEvictionId: null,
        visualsRevealed: true,
      },
    })
    const questions = buildMemoryLaneQuestionBank(state, 8)
    expect(questions.some((question) => question.category === 'cupid')).toBe(true)
  })

  it('uses Vox audience history when that mode is active', () => {
    const state = seasonState({
      voxPopuli: {
        scheduledSeason: 1,
        status: 'active',
        activatedSeason: 1,
        activatedWeek: 1,
        nominationBallots: {},
        nominationVoteCounts: {},
        audienceVoteDaysByPlayerId: { alex: [2, 4, 6], maya: [3], nova: [1, 5] },
        safetySaveCounts: { alex: 2, maya: 1 },
        lastReplacementNomineeIds: [],
        immunityWinnerId: null,
        autoNomineeId: null,
        awaitingPublicVote: false,
        publicVoteContext: null,
        publicVotePercentages: null,
        finaleStage: null,
        finalistIds: [],
        winnerId: null,
      },
    })
    const questions = buildMemoryLaneQuestionBank(state, 9)
    expect(
      questions.some(
        (question) => question.id === 'most-public-saves' && question.correctPlayerId === 'alex'
      )
    ).toBe(true)
    expect(
      questions.some(
        (question) =>
          question.id === 'vox-most-audience-ballots' && question.correctPlayerId === 'alex'
      )
    ).toBe(true)
  })
})

describe('Down Memory Lane AI', () => {
  const question: MemoryLaneQuestion = {
    id: 'q',
    prompt: 'Who did it?',
    correctPlayerId: 'maya',
    optionPlayerIds: ['maya', 'alex', 'rune', 'nova'],
    category: 'milestone',
    difficulty: 0.6,
  }

  it('derives recall ability primarily from mental skill while respecting pressure traits', () => {
    const strong: CompetitionSkillProfile = {
      overall: 80,
      physical: 40,
      mental: 90,
      precision: 60,
      nerve: 80,
      consistency: 80,
      clutch: 85,
      chokeRisk: 15,
      luck: 50,
    }
    const weak: CompetitionSkillProfile = {
      overall: 45,
      physical: 80,
      mental: 38,
      precision: 50,
      nerve: 42,
      consistency: 40,
      clutch: 35,
      chokeRisk: 75,
      luck: 50,
    }
    expect(deriveMemoryLaneAiAbility(strong)).toBeGreaterThan(deriveMemoryLaneAiAbility(weak))
    expect(deriveMemoryLaneAiAbility(strong)).toBeLessThanOrEqual(88)
    expect(deriveMemoryLaneAiAbility(weak)).toBeGreaterThanOrEqual(42)
  })

  it('is deterministic but never machine-fast', () => {
    const first = simulateMemoryLaneAiDecision({
      seed: 55,
      question,
      aiPlayerId: 'alex',
      aiAbility: 75,
      aiLives: 5,
      humanLives: 5,
    })
    const second = simulateMemoryLaneAiDecision({
      seed: 55,
      question,
      aiPlayerId: 'alex',
      aiAbility: 75,
      aiLives: 5,
      humanLives: 5,
    })
    expect(second).toEqual(first)
    expect(first.delayMs).toBeGreaterThanOrEqual(1200)
  })

  it('can decline to buzz and can make mistakes across a representative seed spread', () => {
    const decisions = Array.from({ length: 100 }, (_, seed) =>
      simulateMemoryLaneAiDecision({
        seed,
        question: { ...question, difficulty: 0.82 },
        aiPlayerId: 'alex',
        aiAbility: 62,
        aiLives: 5,
        humanLives: 5,
      })
    )
    expect(decisions.some((decision) => !decision.willBuzz)).toBe(true)
    expect(decisions.some((decision) => decision.willBuzz && !decision.correct)).toBe(true)
    expect(decisions.some((decision) => decision.willBuzz && decision.correct)).toBe(true)
  })

  it('becomes more cautious on its final life without becoming deterministic', () => {
    const healthy = Array.from({ length: 120 }, (_, seed) =>
      simulateMemoryLaneAiDecision({
        seed,
        question: { ...question, difficulty: 0.7 },
        aiPlayerId: 'alex',
        aiAbility: 66,
        aiLives: 5,
        humanLives: 3,
      })
    )
    const endangered = Array.from({ length: 120 }, (_, seed) =>
      simulateMemoryLaneAiDecision({
        seed,
        question: { ...question, difficulty: 0.7 },
        aiPlayerId: 'alex',
        aiAbility: 66,
        aiLives: 1,
        humanLives: 3,
      })
    )
    const healthyBuzzes = healthy.filter((decision) => decision.willBuzz).length
    const endangeredBuzzes = endangered.filter((decision) => decision.willBuzz).length
    expect(endangeredBuzzes).toBeLessThanOrEqual(healthyBuzzes)
    expect(endangeredBuzzes).toBeGreaterThan(0)
  })
})
