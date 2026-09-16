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
  isWardenBoardStateSolvable,
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
    'offers multiple seeded, solver-checked %s Warden layouts',
    (tier) => {
      const variations = getSolvableWardenVariations(tier)
      expect(variations.length).toBeGreaterThanOrEqual(4)
      expect(variations.every(isWardenBoardStateSolvable)).toBe(true)

      const signatures = new Set(
        Array.from({ length: 24 }, (_unused, seed) => {
          const board = buildVariedWardenBoard(tier, seed + 1)
          return `${board.start}|${board.exit}|${board.wardenStart}|${[...board.walls]
            .sort((a, b) => a - b)
            .join(',')}`
        })
      )
      expect(signatures.size).toBeGreaterThanOrEqual(4)
    }
  )

  it('reseeds Signal Hunt and Sequence Builder content', () => {
    expect(buildSignalRounds(11).map((round) => round.targetOrder)).not.toEqual(
      buildSignalRounds(12).map((round) => round.targetOrder)
    )
    expect(buildSequenceBoards(11).map((board) => board.initial)).not.toEqual(
      buildSequenceBoards(12).map((board) => board.initial)
    )
  })
})
