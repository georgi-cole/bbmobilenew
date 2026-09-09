import { describe, expect, it } from 'vitest'

import {
  buildBaseAiAnswers,
  type MajorityRulesQuestion,
} from '../../../src/features/majorityRules/helpers'

const QUESTION: MajorityRulesQuestion = {
  id: 'q-consensus-balance',
  prompt: 'What would most people choose?',
  options: [
    { id: 'a', label: 'A', text: 'Alpha', baseBias: 0.94 },
    { id: 'b', label: 'B', text: 'Beta', baseBias: 0.72 },
    { id: 'c', label: 'C', text: 'Gamma', baseBias: 0.46 },
  ],
}

describe('Majority Rules consensus balance', () => {
  it('usually creates a clear favorite and a small minority in a 14-player field', () => {
    const activeIds = Array.from({ length: 14 }, (_, index) => `ai-${index + 1}`)
    const sampleSize = 500
    let nearEvenRounds = 0
    let smallMinorityRounds = 0

    for (let seed = 1; seed <= sampleSize; seed += 1) {
      const answers = buildBaseAiAnswers({
        activeIds,
        humanPlayerId: null,
        seed,
        roundNumber: 1,
        question: QUESTION,
      })
      const counts = { a: 0, b: 0, c: 0 }
      for (const answer of Object.values(answers)) {
        counts[answer as keyof typeof counts] += 1
      }
      const sortedCounts = Object.values(counts).sort((left, right) => right - left)

      if ((sortedCounts[0] ?? 0) <= 6) nearEvenRounds += 1
      if ((sortedCounts[2] ?? 0) <= 2) smallMinorityRounds += 1
    }

    expect(nearEvenRounds / sampleSize).toBeLessThan(0.2)
    expect(smallMinorityRounds / sampleSize).toBeGreaterThan(0.7)
  })
})
