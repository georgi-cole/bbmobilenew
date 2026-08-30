import { describe, expect, it } from 'vitest'
import reducer, {
  confirmDuelElimination,
  revealDuelResults,
  setGuesses,
  setResponseTimes,
  startCwgoCompetition,
} from '../src/features/cwgo/cwgoCompetitionSlice'
import { computeMassElimination, generateAIResponseTimeMs } from '../src/features/cwgo/cwgoHelpers'
import { cwgoInputUnit, formatCwgoValue, parseCwgoGuess } from '../src/features/cwgo/cwgoDisplay'
import { CWGO_QUESTIONS } from '../src/features/cwgo/cwgoQuestions'

describe("Don't Go Over improvements", () => {
  it('keeps three starting contestants in qualifiers instead of starting a 3-player final', () => {
    const state = reducer(
      undefined,
      startCwgoCompetition({
        participantIds: ['player-a', 'player-b', 'player-c'],
        prizeType: 'POS',
        seed: 12345,
      })
    )

    expect(state.stage).toBe('qualifier')
    expect(state.status).toBe('mass_input')
    expect(state.playerScores).toEqual({})
  })

  it('never collapses a 3+ player qualifier directly to one survivor', () => {
    const result = computeMassElimination(
      [
        { playerId: 'safe', guess: 100 },
        { playerId: 'slightly-over', guess: 110 },
        { playerId: 'far-over', guess: 140 },
      ],
      100,
      ['safe', 'slightly-over', 'far-over'],
      {
        safe: 7_000,
        'slightly-over': 8_000,
        'far-over': 5_000,
      },
      99
    )

    expect(result.redraw).toBe(false)
    expect(result.eliminated).toEqual(['far-over'])
    expect(result.surviving).toEqual(['safe', 'slightly-over'])
  })

  it('keeps the same two finalists in a direct duel after a life is lost', () => {
    let state = reducer(
      undefined,
      startCwgoCompetition({
        participantIds: ['finalist-a', 'finalist-b'],
        prizeType: 'LOH',
        seed: 54321,
      })
    )

    expect(state.status).toBe('duel_input')
    expect(state.duelPair).toEqual(['finalist-a', 'finalist-b'])

    const answer = CWGO_QUESTIONS[state.questionIdx].answer
    state = reducer(
      state,
      setGuesses({
        'finalist-a': answer,
        'finalist-b': Math.max(0, answer - 1),
      })
    )
    state = reducer(
      state,
      setResponseTimes({
        'finalist-a': 6_000,
        'finalist-b': 7_000,
      })
    )
    state = reducer(state, revealDuelResults())
    expect(state.duelWinnerId).toBe('finalist-a')

    state = reducer(state, confirmDuelElimination())
    expect(state.status).toBe('duel_input')
    expect(state.aliveIds).toEqual(['finalist-a', 'finalist-b'])
    expect(state.playerScores['finalist-b']).toBe(2)
    expect(state.duelPair).toEqual(['finalist-a', 'finalist-b'])
  })

  it('gives AI contestants human-like minimum thinking time in the opening three rounds', () => {
    for (let round = 0; round < 3; round += 1) {
      const responseTime = generateAIResponseTimeMs(1, 24680, 'opening-ai', round, {
        answerMode: 'common_knowledge',
        knewAnswer: true,
        aiSkill: 0.8,
      })
      expect(responseTime).toBeGreaterThanOrEqual(3_200)
    }
  })

  it('treats scaled answers as the unit stated to the player', () => {
    const cellsQuestion = CWGO_QUESTIONS.find((question) => question.id === 'q53')
    expect(cellsQuestion).toBeDefined()
    if (!cellsQuestion) return

    expect(cwgoInputUnit(cellsQuestion)).toBe('trillions of cells')
    expect(parseCwgoGuess('12', cellsQuestion)).toBe(12_000_000_000_000)
    expect(formatCwgoValue(cellsQuestion.answer, cellsQuestion, { includeUnit: true })).toBe(
      '37 trillion cells'
    )
    expect(formatCwgoValue(31_080_414_892_881, cellsQuestion)).toBe('31.08 trillion')
  })
})
