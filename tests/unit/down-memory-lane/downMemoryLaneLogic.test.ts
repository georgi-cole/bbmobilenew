import { describe, expect, it } from 'vitest'
import type { GameState, Player } from '../../../src/types'
import {
  buildMemoryLaneQuestionBank,
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

function seasonState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    player('user', 'Georgi', { lohWins: 2, posWins: 1, timesNominated: 1 }, { isUser: true }),
    player('maya', 'Maya', { lohWins: 3, posWins: 0, timesNominated: 2 }),
    player('alex', 'Alex', { lohWins: 0, posWins: 3, timesNominated: 4 }, { status: 'jury', evictedAtWeek: 8 }),
    player('rune', 'Rune', { lohWins: 1, posWins: 1, timesNominated: 0 }, { status: 'jury', evictedAtWeek: 10 }),
    player('nova', 'Nova', { lohWins: 0, posWins: 0, timesNominated: 3 }, { status: 'evicted', evictedAtWeek: 2 }),
    player('lia', 'Lia', { lohWins: 0, posWins: 1, timesNominated: 2 }, { status: 'jury', evictedAtWeek: 6, seasonPlacement: 4 }),
  ]

  return {
    gameId: 'test-season',
    season: 1,
    week: 13,
    phase: 'final3_comp3_minigame',
    players,
    tvFeed: [
      { id: 'loh-1', text: 'Maya has won Leader of the House! 👑', type: 'game', timestamp: 1, meta: { broadcastTemplateId: 'loh.winner' } },
      { id: 'pos-1', text: 'Lia has won the Power of Safety! 🎭', type: 'game', timestamp: 2 },
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
    expect(first.some((question) => question.id === 'first-loh' && question.correctPlayerId === 'maya')).toBe(true)
    expect(first.some((question) => question.id === 'first-pos' && question.correctPlayerId === 'lia')).toBe(true)
    expect(first.every((question) => question.optionPlayerIds.length === 4)).toBe(true)
    expect(first.every((question) => new Set(question.optionPlayerIds).size === 4)).toBe(true)
  })

  it('skips an ambiguous maximum instead of inventing a winner', () => {
    const state = seasonState()
    state.players.find((entry) => entry.id === 'user')!.stats!.timesNominated = 4
    const questions = buildMemoryLaneQuestionBank(state, 5)
    expect(questions.some((question) => question.id === 'most-nominated')).toBe(false)
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
    expect(questions.some((question) => question.id === 'most-public-saves' && question.correctPlayerId === 'alex')).toBe(true)
    expect(questions.some((question) => question.id === 'vox-most-audience-ballots' && question.correctPlayerId === 'alex')).toBe(true)
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

  it('is deterministic but never instant', () => {
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
    expect(first.delayMs).toBeGreaterThanOrEqual(1000)
  })

  it('can decline to buzz and can make mistakes across a representative seed spread', () => {
    const decisions = Array.from({ length: 80 }, (_, seed) =>
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
})
