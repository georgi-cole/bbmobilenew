import { describe, expect, it } from 'vitest'
import {
  FINAL_OVERRIDE_QUESTION_BANK,
  buildFinalOverrideRounds,
} from '../../../src/components/FinalThreeCircuit/finalOverrideQuestionBank'
import {
  buildSequenceBoards,
  buildSignalRounds,
} from '../../../src/components/FinalThreeCircuit/finalThreeCircuitLogic'
import {
  buildVariedWardenBoard,
  getSolvableWardenVariations,
  getWardenDifficultyProfile,
  isWardenBoardStateSolvable,
  meetsWardenTierDifficulty,
} from '../../../src/components/FinalThreeCircuit/wardenBoardVariations'

describe('Final Three Circuit content variety', () => {
  it('has a broad Final Override bank and samples without replacement', () => {
    expect(FINAL_OVERRIDE_QUESTION_BANK.length).toBeGreaterThanOrEqual(40)

    const first = buildFinalOverrideRounds(101)
    const second = buildFinalOverrideRounds(202)
    expect(first).toHaveLength(5)
    expect(new Set(first.map((question) => question.id)).size).toBe(5)
    expect(second.map((question) => question.id)).not.toEqual(first.map((question) => question.id))
  })

  it.each(['safe', 'standard', 'risky'] as const)(
    'offers a rich set of solver- and difficulty-certified %s Warden layouts',
    (tier) => {
      const variations = getSolvableWardenVariations(tier)
      expect(variations.length).toBeGreaterThanOrEqual(8)
      expect(variations.every(isWardenBoardStateSolvable)).toBe(true)
      expect(variations.every((board) => meetsWardenTierDifficulty(board, tier))).toBe(true)

      const signatures = new Set(
        Array.from({ length: 48 }, (_unused, seed) => {
          const board = buildVariedWardenBoard(tier, seed + 1)
          return `${board.start}|${board.exit}|${board.wardenStart}|${[...board.walls]
            .sort((a, b) => a - b)
            .join(',')}`
        })
      )
      expect(signatures.size).toBeGreaterThanOrEqual(8)
    }
  )

  it('forces real detours and guard trapping instead of allowing straight-line escapes', () => {
    const minimums = {
      safe: { moves: 10, detour: 5, retreats: 3, stalls: 5 },
      standard: { moves: 16, detour: 8, retreats: 5, stalls: 9 },
      risky: { moves: 28, detour: 14, retreats: 9, stalls: 16 },
    } as const

    for (const tier of ['safe', 'standard', 'risky'] as const) {
      for (const board of getSolvableWardenVariations(tier)) {
        const profile = getWardenDifficultyProfile(board)
        expect(profile).not.toBeNull()
        expect(profile!.solutionMoves).toBeGreaterThanOrEqual(minimums[tier].moves)
        expect(profile!.forcedDetourMoves).toBeGreaterThanOrEqual(minimums[tier].detour)
        expect(profile!.retreatMoves).toBeGreaterThanOrEqual(minimums[tier].retreats)
        expect(profile!.guardStallTurns).toBeGreaterThanOrEqual(minimums[tier].stalls)
      }
    }
  })

  it('reseeds Signal Hunt and Sequence Builder content', () => {
    expect(buildSignalRounds(11).map((round) => round.targetOrder)).not.toEqual(
      buildSignalRounds(12).map((round) => round.targetOrder)
    )
    expect(buildSequenceBoards(11).map((board) => board.initial)).not.toEqual(
      buildSequenceBoards(12).map((board) => board.initial)
    )
  })
})
