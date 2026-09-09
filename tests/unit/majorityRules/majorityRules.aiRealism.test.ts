import { describe, expect, it } from 'vitest'

import {
  buildBaseAiAnswers,
  chooseAiAnswer,
  type MajorityRulesQuestion,
} from '../../../src/features/majorityRules/helpers'

const QUESTION: MajorityRulesQuestion = {
  id: 'q-ai-realism',
  prompt: 'What would most people choose?',
  options: [
    { id: 'a', label: 'A', text: 'Alpha', baseBias: 0.94 },
    { id: 'b', label: 'B', text: 'Beta', baseBias: 0.72 },
    { id: 'c', label: 'C', text: 'Gamma', baseBias: 0.46 },
  ],
}

describe('Majority Rules AI vote realism', () => {
  it('does not let an unrelated previous A/B/C distribution affect the next question', () => {
    const common = {
      seed: 42,
      roundNumber: 3,
      playerId: 'contestant-1',
      question: QUESTION,
    }

    const afterUnanimousA = chooseAiAnswer({
      ...common,
      previousDistribution: { a: 8, b: 0, c: 0 },
    })
    const afterUnanimousC = chooseAiAnswer({
      ...common,
      previousDistribution: { a: 0, b: 0, c: 8 },
    })

    expect(afterUnanimousA).toBe(afterUnanimousC)
  })

  it('keeps all three plausible options alive across repeated populations', () => {
    const counts = { a: 0, b: 0, c: 0 }

    for (let seed = 1; seed <= 600; seed += 1) {
      const answer = chooseAiAnswer({
        seed,
        roundNumber: 1,
        playerId: 'contestant-1',
        question: QUESTION,
      })
      counts[answer as keyof typeof counts] += 1
    }

    const shares = Object.values(counts).map((count) => count / 600)
    expect(Math.max(...shares)).toBeLessThan(0.65)
    expect(Math.min(...shares)).toBeGreaterThan(0.1)
  })

  it('makes full-house unanimity exceptional rather than routine', () => {
    const activeIds = Array.from({ length: 8 }, (_, index) => `ai-${index + 1}`)
    let unanimousRounds = 0
    const sampleSize = 500

    for (let seed = 1; seed <= sampleSize; seed += 1) {
      const answers = buildBaseAiAnswers({
        activeIds,
        humanPlayerId: null,
        seed,
        roundNumber: 1,
        question: QUESTION,
      })
      if (new Set(Object.values(answers)).size === 1) unanimousRounds += 1
    }

    expect(unanimousRounds / sampleSize).toBeLessThan(0.05)
  })
})
