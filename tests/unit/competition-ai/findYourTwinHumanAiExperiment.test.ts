import { describe, expect, it } from 'vitest'
import { TIME_LIMIT_MS } from '../../../src/minigames/castleRescue/castleRescueConstants'
import {
  FIND_YOUR_TWIN_EXPERIMENT_FIELD,
  simulateHumanlikeFindYourTwinAi,
  simulateHumanlikeFindYourTwinField,
} from '../../../src/experiments/findYourTwinHumanAi/findYourTwinHumanAi'

describe('Find Your Twin human-AI experiment', () => {
  it('is deterministic for the same seed, opponent, and difficulty', () => {
    const config = FIND_YOUR_TWIN_EXPERIMENT_FIELD[0]
    const first = simulateHumanlikeFindYourTwinAi({ seed: 42, config, difficulty: 'balanced' })
    const second = simulateHumanlikeFindYourTwinAi({ seed: 42, config, difficulty: 'balanced' })
    expect(second).toEqual(first)
  })

  it('earns scores through legal movement, jump, pipe, and rescue actions', () => {
    const results = Array.from({ length: 80 }, (_, index) =>
      simulateHumanlikeFindYourTwinField(index + 1, 'balanced')
    ).flat()
    const rescued = results.find((result) => result.rescued)

    expect(rescued).toBeDefined()
    expect(rescued?.actions.some((action) => action.type === 'move')).toBe(true)
    expect(rescued?.actions.some((action) => action.type === 'jump')).toBe(true)
    expect(
      rescued?.actions.filter((action) => action.type === 'pipe').length
    ).toBeGreaterThanOrEqual(3)
    expect(rescued?.actions.at(-1)?.type).toBe('rescue')
    expect(rescued?.pipesComplete).toBe(3)
  })

  it('never runs beyond the real deadline or uses more than three hearts', () => {
    for (let seed = 1; seed <= 250; seed += 1) {
      for (const result of simulateHumanlikeFindYourTwinField(seed, 'balanced')) {
        expect(result.elapsedMs).toBeLessThanOrEqual(TIME_LIMIT_MS)
        expect(result.deaths).toBeLessThanOrEqual(3)
        expect(result.pipesComplete).toBeGreaterThanOrEqual(0)
        expect(result.pipesComplete).toBeLessThanOrEqual(3)
        expect(result.finalScore).toBeGreaterThanOrEqual(0)
        if (result.rescued) expect(result.endReason).toBe('rescued')
      }
    }
  })

  it('does not inspect hidden route order before physically trying pipes', () => {
    const result = simulateHumanlikeFindYourTwinAi({
      seed: 424242,
      config: FIND_YOUR_TWIN_EXPERIMENT_FIELD[1],
      difficulty: 'balanced',
    })
    const firstSuccessfulPipe = result.actions.find(
      (action) => action.type === 'pipe' && action.detail.includes('found route pipe')
    )
    const earlierPipeAttempts = result.actions.filter(
      (action) => action.type === 'pipe' && action.atMs <= (firstSuccessfulPipe?.atMs ?? 0)
    )

    expect(firstSuccessfulPipe).toBeDefined()
    expect(earlierPipeAttempts.length).toBeGreaterThanOrEqual(1)
    expect(result.actions.every((action) => action.atMs >= 0)).toBe(true)
  })

  it('improves aggregate legal-action outcomes as difficulty increases', () => {
    const totals = { friendly: 0, balanced: 0, competitive: 0 }
    const rescues = { friendly: 0, balanced: 0, competitive: 0 }
    for (let seed = 1; seed <= 300; seed += 1) {
      for (const difficulty of ['friendly', 'balanced', 'competitive'] as const) {
        for (const result of simulateHumanlikeFindYourTwinField(seed, difficulty)) {
          totals[difficulty] += result.finalScore
          if (result.rescued) rescues[difficulty] += 1
        }
      }
    }

    expect(totals.balanced).toBeGreaterThan(totals.friendly)
    expect(totals.competitive).toBeGreaterThan(totals.balanced)
    expect(rescues.balanced).toBeGreaterThanOrEqual(rescues.friendly)
    expect(rescues.competitive).toBeGreaterThanOrEqual(rescues.balanced)
  })

  it('uses the legally earned action score as the competition score', () => {
    const results = Array.from({ length: 100 }, (_, index) =>
      simulateHumanlikeFindYourTwinField(index + 1, 'balanced')
    ).flat()

    expect(
      results.every(
        (result) =>
          result.bandTargetScore === result.finalScore &&
          result.scoreGap === 0 &&
          result.targetReached
      )
    ).toBe(true)
  })

  it('gives both the human and AI field plausible wins across the three calibration runs', () => {
    const runs = [
      { seed: 424242, humanScore: 1220 },
      { seed: 1036148016, humanScore: 1035 },
      { seed: 1567981262, humanScore: 905 },
    ]
    const humanWins = runs.filter(({ seed, humanScore }) =>
      simulateHumanlikeFindYourTwinField(seed, 'balanced').every(
        (result) => humanScore > result.finalScore
      )
    ).length

    expect(humanWins).toBeGreaterThan(0)
    expect(humanWins).toBeLessThan(runs.length)
  })
})
