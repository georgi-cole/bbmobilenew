import { describe, expect, it } from 'vitest'
import {
  buildTetrisOutcomeScores,
  buildTetrisTournamentPlan,
  rankTetrisRound,
  splitTetrisRound,
  type TetrisRoundPerformance,
} from '../../src/components/TetrisComp/tournament'

function performance(
  playerId: string,
  score: number,
  overrides: Partial<TetrisRoundPerformance> = {}
): TetrisRoundPerformance {
  return {
    playerId,
    score,
    lines: 0,
    pieces: 0,
    maxStackHeight: 10,
    previousScore: 0,
    tieBreaker: 0,
    ...overrides,
  }
}

describe('buildTetrisTournamentPlan', () => {
  it('uses two 90-second rounds for three players', () => {
    const plan = buildTetrisTournamentPlan(3)
    expect(plan).toHaveLength(2)
    expect(plan.map((round) => round.durationMs)).toEqual([90_000, 90_000])
    expect(plan.map((round) => round.survivorCount)).toEqual([2, 1])
    expect(plan[1].useHouseguestCells).toBe(true)
  })

  it('uses three rounds for four players', () => {
    const plan = buildTetrisTournamentPlan(4)
    expect(plan).toHaveLength(3)
    expect(plan.map((round) => round.survivorCount)).toEqual([3, 2, 1])
  })

  it('uses four rounds and only removes last place in the first two heats', () => {
    const plan = buildTetrisTournamentPlan(10)
    expect(plan).toHaveLength(4)
    expect(plan.map((round) => round.survivorCount)).toEqual([9, 8, 2, 1])
    expect(plan[2].subtitleKey).toBe('fitMeIn.round.topTwoAdvance')
  })
})

describe('Fit Me In ranking', () => {
  it('uses score, lines, pieces, stack height, previous score, then seeded tie-break', () => {
    const ranked = rankTetrisRound([
      performance('a', 1000, { lines: 3, pieces: 20 }),
      performance('b', 1000, { lines: 4, pieces: 18 }),
      performance('c', 900, { lines: 8, pieces: 40 }),
    ])
    expect(ranked.map((entry) => entry.playerId)).toEqual(['b', 'a', 'c'])
  })

  it('returns eliminated contestants from worst to best for final placement assembly', () => {
    const split = splitTetrisRound(
      [
        performance('first', 400),
        performance('second', 300),
        performance('third', 200),
        performance('fourth', 100),
      ],
      2
    )
    expect(split.survivorIds).toEqual(['first', 'second'])
    expect(split.eliminatedWorstFirst).toEqual(['fourth', 'third'])
  })

  it('encodes placement ahead of visible round score for authoritative results', () => {
    const scores = buildTetrisOutcomeScores(['winner', 'runnerUp', 'last'], {
      winner: 100,
      runnerUp: 5000,
      last: 9000,
    })
    expect(scores.winner).toBeGreaterThan(scores.runnerUp)
    expect(scores.runnerUp).toBeGreaterThan(scores.last)
  })
})
