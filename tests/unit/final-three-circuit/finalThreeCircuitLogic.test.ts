import { describe, expect, it } from 'vitest'
import {
  FINAL_PUSH_STAKES,
  applyFinalPush,
  buildSequenceBoards,
  minimumSwapCount,
  rankCircuitResults,
  scorePrecisionAttempt,
  scoreRiskAttempt,
  scoreSequenceBoard,
  splitAiCircuitScore,
  type CircuitStageScores,
} from '../../../src/components/FinalThreeCircuit/finalThreeCircuitLogic'

describe('Final Three Circuit scoring', () => {
  it('rewards a centred precision lock and penalizes a clear miss', () => {
    expect(scorePrecisionAttempt(0.5, 0.5, 0.08)).toBe(20)
    expect(scorePrecisionAttempt(0.95, 0.5, 0.08)).toBe(0)
  })

  it('scores risk tiers against their configured ceilings', () => {
    expect(scoreRiskAttempt('safe', 1)).toBe(16)
    expect(scoreRiskAttempt('standard', 1)).toBe(22)
    expect(scoreRiskAttempt('risky', 1)).toBe(28)
    expect(scoreRiskAttempt('risky', 0)).toBe(0)
  })

  it('applies the final push as a real gain or loss without exceeding the stage cap', () => {
    expect(applyFinalPush(60, FINAL_PUSH_STAKES[1], true)).toBe(75)
    expect(applyFinalPush(60, FINAL_PUSH_STAKES[1], false)).toBe(45)
    expect(applyFinalPush(90, FINAL_PUSH_STAKES[2], true)).toBe(100)
  })
})

describe('Sequence Builder', () => {
  it('finds the minimum number of arbitrary swaps', () => {
    expect(minimumSwapCount(['B', 'A', 'C'], ['A', 'B', 'C'])).toBe(1)
    expect(minimumSwapCount(['C', 'A', 'B'], ['A', 'B', 'C'])).toBe(2)
  })

  it('builds deterministic progressively harder boards worth exactly 100 points', () => {
    const first = buildSequenceBoards(4242)
    const second = buildSequenceBoards(4242)

    expect(second).toEqual(first)
    expect(first.map((board) => board.maxPoints)).toEqual([30, 33, 37])
    expect(first.reduce((sum, board) => sum + board.maxPoints, 0)).toBe(100)
    expect(first[0].optimalSwaps).toBeGreaterThanOrEqual(2)
    expect(first[1].optimalSwaps).toBeGreaterThanOrEqual(3)
    expect(first[2].optimalSwaps).toBeGreaterThanOrEqual(4)
  })

  it('gives the full board score for an optimal solve and less for wasted moves', () => {
    expect(scoreSequenceBoard(3, 3, 33)).toBe(33)
    expect(scoreSequenceBoard(5, 3, 33)).toBeLessThan(33)
    expect(scoreSequenceBoard(20, 3, 33)).toBeGreaterThan(0)
  })
})

describe('three-player result contract', () => {
  it('splits an AI total deterministically across three stages while preserving the total', () => {
    const stages = splitAiCircuitScore(241, 99, 'maya')
    expect(splitAiCircuitScore(241, 99, 'maya')).toEqual(stages)
    expect(stages).toHaveLength(3)
    expect(stages.every((score) => score >= 0 && score <= 100)).toBe(true)
    expect(stages.reduce((sum, score) => sum + score, 0)).toBe(241)
  })

  it('ranks by total, then Risk Run, then Sequence Builder', () => {
    const stages: Record<string, CircuitStageScores> = {
      a: [80, 70, 80],
      b: [75, 70, 85],
      c: [82, 73, 75],
    }
    const totals = { a: 230, b: 230, c: 230 }
    expect(rankCircuitResults(['a', 'b', 'c'], totals, stages, 12)).toEqual(['b', 'a', 'c'])
  })
})
