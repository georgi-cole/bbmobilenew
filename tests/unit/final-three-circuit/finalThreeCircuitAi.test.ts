import { describe, expect, it } from 'vitest'
import {
  normalizeCircuitAiAbility,
  simulateAiCircuitScores,
} from '../../../src/components/FinalThreeCircuit/finalThreeCircuitAi'

describe('Final Three Circuit AI calibration', () => {
  it('interprets both lab 0-100 input and native circuit-range input as ability signals', () => {
    expect(normalizeCircuitAiAbility(0)).toBe(0)
    expect(normalizeCircuitAiAbility(100)).toBe(1)
    expect(normalizeCircuitAiAbility(150)).toBe(0)
    expect(normalizeCircuitAiAbility(285)).toBe(1)
  })

  it('is deterministic for the same seed and player', () => {
    const first = simulateAiCircuitScores(78, 424242, 'ai-1')
    expect(simulateAiCircuitScores(78, 424242, 'ai-1')).toEqual(first)
  })

  it('keeps each discipline inside a realistic human range rather than producing automatic near-perfect scores', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const [signal, sequence, risk] = simulateAiCircuitScores(100, seed, 'elite')
      expect(signal).toBeGreaterThanOrEqual(28)
      expect(signal).toBeLessThanOrEqual(95)
      expect(sequence).toBeGreaterThanOrEqual(20)
      expect(sequence).toBeLessThanOrEqual(96)
      expect(risk).toBeGreaterThanOrEqual(18)
      expect(risk).toBeLessThanOrEqual(94)
    }
  })

  it('makes stronger AI better on average without forcing every individual stage to be perfect', () => {
    const averageTotal = (ability: number) => {
      let total = 0
      for (let seed = 1; seed <= 40; seed += 1) {
        total += simulateAiCircuitScores(ability, seed, `player-${seed}`).reduce(
          (sum, score) => sum + score,
          0
        )
      }
      return total / 40
    }

    const average = averageTotal(72)
    const elite = averageTotal(95)
    expect(elite).toBeGreaterThan(average + 15)
    expect(elite).toBeLessThan(270)
  })
})
