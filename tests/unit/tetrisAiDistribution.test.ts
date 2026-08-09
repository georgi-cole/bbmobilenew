import { describe, expect, it } from 'vitest'
import { simulateTetrisAiScores } from '../../src/ai/competition/tetrisSimulation'
import { rankTetrisRound, type TetrisRoundPerformance } from '../../src/components/TetrisComp/tournament'

const field = Array.from({ length: 6 }, (_, index) => ({
  id: `ai-${index + 1}`,
  baselineScore: 1_275 + index,
}))

function performance(playerId: string, score: number, tieBreaker: number): TetrisRoundPerformance {
  return { playerId, score, lines: 0, pieces: 0, maxStackHeight: 10, previousScore: 0, tieBreaker }
}

describe('Fit Me In AI distribution', () => {
  it('is deterministic and makes a full field meaningfully spread out', () => {
    const first = simulateTetrisAiScores({ seed: 42, participants: field, minScore: 320, maxScore: 2_700 })
    const second = simulateTetrisAiScores({ seed: 42, participants: field, minScore: 320, maxScore: 2_700 })
    const ordered = Object.values(first).sort((a, b) => b - a)

    expect(second).toEqual(first)
    expect(new Set(ordered).size).toBe(field.length)
    expect(ordered[0] - ordered[ordered.length - 1]).toBeGreaterThanOrEqual(1_000)
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index - 1] - ordered[index]).toBeGreaterThanOrEqual(175)
    }
  })

  it('uses a stable, non-random tie resolution after all visible metrics tie', () => {
    const ranked = rankTetrisRound([performance('zeta', 1000, 0.99), performance('alpha', 1000, 0.01)])
    expect(ranked.map((entry) => entry.playerId)).toEqual(['alpha', 'zeta'])
  })
})
