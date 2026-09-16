import { describe, expect, it } from 'vitest'
import {
  EMPTY_SEQUENCE_TILE,
  FINAL_PUSH_STAKES,
  SEQUENCE_STAGE_TIME_MS,
  applyFinalPush,
  buildPowerPuzzle,
  buildSequenceBoards,
  buildSignalBoard,
  buildSignalRounds,
  buildWardenBoard,
  isPowerPuzzleSolved,
  isSequenceSolved,
  isWardenBoardSolvable,
  moveWardenOneStep,
  moveWardenTowardPlayer,
  rankCircuitResults,
  scoreRiskAttempt,
  scoreSequenceBoard,
  scoreSignalRound,
  slideSequenceTile,
  splitAiCircuitScore,
  type CircuitStageScores,
  type WardenBoard,
} from '../../../src/components/FinalThreeCircuit/finalThreeCircuitLogic'

describe('Final Three Circuit scoring', () => {
  it('scores risk tiers against their configured ceilings', () => {
    expect(scoreRiskAttempt('safe', 1)).toBe(32)
    expect(scoreRiskAttempt('standard', 1)).toBe(40)
    expect(scoreRiskAttempt('risky', 1)).toBe(48)
    expect(scoreRiskAttempt('risky', 0)).toBe(0)
  })

  it('applies the final push as a real gain or loss without exceeding the stage cap', () => {
    expect(applyFinalPush(60, FINAL_PUSH_STAKES[1], true)).toBe(75)
    expect(applyFinalPush(60, FINAL_PUSH_STAKES[1], false)).toBe(45)
    expect(applyFinalPush(90, FINAL_PUSH_STAKES[2], true)).toBe(100)
  })
})

describe('Signal Hunt', () => {
  it('builds deterministic rounds worth exactly 100 points', () => {
    const first = buildSignalRounds(4242)
    expect(buildSignalRounds(4242)).toEqual(first)
    expect(first.map((round) => round.maxPoints)).toEqual([30, 33, 37])
    expect(first.reduce((sum, round) => sum + round.maxPoints, 0)).toBe(100)
  })

  it('reshuffles the board between successful targets', () => {
    const round = buildSignalRounds(99)[2]
    const first = buildSignalBoard(99, 2, 0, round.cellCount)
    const second = buildSignalBoard(99, 2, 1, round.cellCount)
    expect(first).not.toEqual(second)
    expect(new Set(first).size).toBe(round.cellCount)
  })

  it('rewards completion and penalizes wrong taps', () => {
    const clean = scoreSignalRound(8, 8, 5000, 12000, 33, 0)
    const messy = scoreSignalRound(8, 8, 5000, 12000, 33, 3)
    const partial = scoreSignalRound(4, 8, 0, 12000, 33, 0)
    expect(clean).toBeGreaterThan(messy)
    expect(clean).toBeGreaterThan(partial)
  })
})

describe('Sequence Builder sliding puzzles', () => {
  it('uses only the easiest and hardest boards on one five-minute clock', () => {
    const first = buildSequenceBoards(4242)
    expect(buildSequenceBoards(4242)).toEqual(first)
    expect(first).toHaveLength(2)
    expect(first.map((board) => [board.rows, board.columns])).toEqual([
      [2, 3],
      [3, 3],
    ])
    expect(first.map((board) => board.maxPoints)).toEqual([40, 60])
    expect(first.every((board) => board.timeLimitMs === SEQUENCE_STAGE_TIME_MS)).toBe(true)
    expect(SEQUENCE_STAGE_TIME_MS).toBe(300_000)
    expect(first.reduce((sum, board) => sum + board.maxPoints, 0)).toBe(100)
    expect(first.every((board) => board.initial.includes(EMPTY_SEQUENCE_TILE))).toBe(true)
    expect(first.every((board) => !isSequenceSolved(board.initial, board.target))).toBe(true)
  })

  it('only allows a tile touching the empty slot to move', () => {
    const board = buildSequenceBoards(7)[0]
    const blank = board.initial.indexOf(EMPTY_SEQUENCE_TILE)
    const illegal = board.initial.findIndex((_, index) => {
      if (index === blank) return false
      const rowDelta = Math.abs(Math.floor(index / board.columns) - Math.floor(blank / board.columns))
      const colDelta = Math.abs((index % board.columns) - (blank % board.columns))
      return rowDelta + colDelta > 1
    })
    expect(slideSequenceTile(board.initial, illegal, board.rows, board.columns)).toBeNull()
  })

  it('rewards a solved board more than an expired partial board', () => {
    const board = buildSequenceBoards(13)[0]
    const solved = scoreSequenceBoard(board, board.target, board.scrambleMoves, 250_000, true)
    const partial = scoreSequenceBoard(board, board.initial, board.scrambleMoves, 0, false)
    expect(solved).toBeGreaterThan(partial)
  })
})

describe('Warden Escape rules', () => {
  it.each(['safe', 'standard', 'risky'] as const)('keeps the %s prison board solvable', (tier) => {
    const board = buildWardenBoard(tier)
    expect(board.guardSteps).toBe(2)
    expect(isWardenBoardSolvable(tier)).toBe(true)
  })

  it('moves horizontally toward the player before considering vertical movement', () => {
    const board: WardenBoard = {
      size: 5,
      start: 24,
      exit: 0,
      wardenStart: 12,
      walls: new Set(),
      guardSteps: 2,
      moveBudget: 20,
    }
    expect(moveWardenOneStep(board, 12, 24)).toBe(13)
    expect(moveWardenTowardPlayer(board, 12, 24)).toBe(14)
  })

  it('falls back to vertical pursuit when a wall blocks the preferred horizontal step', () => {
    const board: WardenBoard = {
      size: 5,
      start: 24,
      exit: 0,
      wardenStart: 12,
      walls: new Set([13]),
      guardSteps: 2,
      moveBudget: 20,
    }
    expect(moveWardenOneStep(board, 12, 24)).toBe(17)
  })
})

describe('Risk Run challenge safety', () => {
  it.each(['safe', 'standard', 'risky'] as const)('builds a valid %s Power Balance puzzle', (tier) => {
    const puzzle = buildPowerPuzzle(101, tier)
    expect(puzzle.values.length).toBeGreaterThanOrEqual(5)
    expect(puzzle.maxToggles).toBe(3)
    expect(isPowerPuzzleSolved(puzzle.target, puzzle)).toBe(true)
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
