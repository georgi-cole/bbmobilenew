import { describe, expect, it } from 'vitest'
import {
  QUICK_TAP_EXPERIMENT_FIELD,
  simulateHumanlikeQuickTapAi,
  simulateHumanlikeQuickTapField,
} from '../../../src/experiments/quickTapHumanAi/quickTapHumanAi'

describe('Quick Tap human-AI experiment', () => {
  it('is deterministic for the same seed, opponent, and difficulty', () => {
    const config = QUICK_TAP_EXPERIMENT_FIELD[0]
    const first = simulateHumanlikeQuickTapAi({ seed: 42, config, difficulty: 'balanced' })
    const second = simulateHumanlikeQuickTapAi({ seed: 42, config, difficulty: 'balanced' })
    expect(second).toEqual(first)
  })

  it('produces actual tap and booster action traces', () => {
    const result = simulateHumanlikeQuickTapAi({
      seed: 424242,
      config: QUICK_TAP_EXPERIMENT_FIELD[2],
      difficulty: 'balanced',
    })
    expect(result.actions.filter((action) => action.type === 'tap').length).toBe(result.rawTaps)
    expect(result.actions.some((action) => action.type === 'booster')).toBe(true)
    expect(result.openingReactionMs).toBeGreaterThanOrEqual(200)
    expect(result.averageTapsPerSecond).toBeGreaterThan(2)
    expect(result.averageTapsPerSecond).toBeLessThan(9)
    expect(result.bandTargetScore).toBeGreaterThan(0)
    expect(result.scoreGap).toBe(result.effectiveScore - result.bandTargetScore)
  })

  it('keeps every booster decision inside the human-visible response window', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      for (const result of simulateHumanlikeQuickTapField(seed, 'balanced')) {
        for (const booster of result.boosters) {
          if (!booster.taken) continue
          expect(booster.reactionMs).not.toBeNull()
          expect(booster.reactionMs ?? 0).toBeGreaterThanOrEqual(260)
          expect(booster.reactionMs ?? 0).toBeLessThan(4_000)
        }
      }
    }
  })

  it('raises average field scores as difficulty increases', () => {
    const totals = { friendly: 0, balanced: 0, competitive: 0 }
    for (let seed = 1; seed <= 500; seed += 1) {
      for (const difficulty of ['friendly', 'balanced', 'competitive'] as const) {
        totals[difficulty] += simulateHumanlikeQuickTapField(seed, difficulty).reduce(
          (sum, result) => sum + result.effectiveScore,
          0
        )
      }
    }
    expect(totals.balanced).toBeGreaterThan(totals.friendly)
    expect(totals.competitive).toBeGreaterThan(totals.balanced)
  })

  it('anchors sustained balanced rhythm inside the 7.1-8.7 taps-per-second band', () => {
    const results = Array.from({ length: 300 }, (_, index) =>
      simulateHumanlikeQuickTapField(index + 1, 'balanced')
    ).flat()
    const mean =
      results.reduce((sum, result) => sum + result.averageTapsPerSecond, 0) / results.length
    const inBandRatio =
      results.filter(
        (result) => result.averageTapsPerSecond >= 7.1 && result.averageTapsPerSecond <= 8.7
      ).length / results.length

    expect(mean).toBeGreaterThanOrEqual(7.1)
    expect(mean).toBeLessThanOrEqual(8.7)
    expect(inBandRatio).toBeGreaterThanOrEqual(0.97)
  })

  it('audits fixed-band targets instead of fabricating unreachable action scores', () => {
    const results = Array.from({ length: 100 }, (_, index) =>
      simulateHumanlikeQuickTapField(index + 1, 'balanced')
    ).flat()

    expect(results.some((result) => result.targetReached)).toBe(true)
    expect(results.every((result) => result.actions.length >= result.rawTaps)).toBe(true)
  })

  it('can force every AI to accept all three boxes for a controlled comparison', () => {
    const results = simulateHumanlikeQuickTapField(424242, 'balanced', {
      forceAllBoosters: true,
    })

    expect(results.every((result) => result.boosters.every((booster) => booster.taken))).toBe(true)
  })

  it('allows 1-3 inertia taps, then stops during a revealed -1x drain', () => {
    let drainSeed = 1
    while (
      !simulateHumanlikeQuickTapAi({
        seed: drainSeed,
        config: QUICK_TAP_EXPERIMENT_FIELD[0],
        forceAllBoosters: true,
      }).boosters.some((booster) => booster.type === '-1x')
    ) {
      drainSeed += 1
    }

    const result = simulateHumanlikeQuickTapAi({
      seed: drainSeed,
      config: QUICK_TAP_EXPERIMENT_FIELD[0],
      forceAllBoosters: true,
    })
    const drainActivation = result.actions.find(
      (action) => action.type === 'booster' && action.boosterType === '-1x'
    )
    expect(drainActivation).toBeDefined()
    const drainWindowTaps = result.actions.filter(
      (action) =>
        action.type === 'tap' &&
        action.atMs > (drainActivation?.atMs ?? 0) &&
        action.atMs < (drainActivation?.atMs ?? 0) + 4_000
    )
    expect(drainWindowTaps.length).toBeGreaterThanOrEqual(1)
    expect(drainWindowTaps.length).toBeLessThanOrEqual(3)
    expect(
      result.actions.some(
        (action) => action.type === 'tap' && action.atMs >= (drainActivation?.atMs ?? 0) + 4_000
      )
    ).toBe(true)
  })
})
