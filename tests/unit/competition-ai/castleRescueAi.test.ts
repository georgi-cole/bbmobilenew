import { describe, expect, it } from 'vitest';
import { getMinigameAiModel, simulateAiPerformance } from '../../../src/ai/competition';

describe('castleRescue AI calibration', () => {
  const model = getMinigameAiModel('castleRescue');

  it('uses the calibrated 0–2000 score range and normalized score buckets', () => {
    expect(model.minScore).toBe(0);
    expect(model.maxScore).toBe(2000);
    expect(model.scoreBuckets).toEqual([
      { minScore: 0, maxScore: 500, weight: 25 / 150 },
      { minScore: 501, maxScore: 600, weight: 25 / 150 },
      { minScore: 601, maxScore: 800, weight: 40 / 150 },
      { minScore: 801, maxScore: 1000, weight: 25 / 150 },
      { minScore: 1001, maxScore: 1200, weight: 20 / 150 },
      { minScore: 1201, maxScore: 1500, weight: 10 / 150 },
      { minScore: 1501, maxScore: 2000, weight: 5 / 150 },
    ]);
  });

  it('produces deterministic AI scores inside the calibrated range', () => {
    const first = simulateAiPerformance({
      minigameKey: 'castleRescue',
      minigameModel: model,
      seed: 42,
      playerId: 'castle-ai',
    });
    const second = simulateAiPerformance({
      minigameKey: 'castleRescue',
      minigameModel: model,
      seed: 42,
      playerId: 'castle-ai',
    });

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(2000);
  });

  it('roughly follows the configured Castle Rescue score bands over many samples', () => {
    const scores: number[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      for (let player = 1; player <= 6; player += 1) {
        scores.push(
          simulateAiPerformance({
            minigameKey: 'castleRescue',
            minigameModel: model,
            seed,
            playerId: `castle-ai-${player}`,
          }),
        );
      }
    }

    const total = scores.length;
    const ratios = {
      low: scores.filter((score) => score >= 0 && score <= 500).length / total,
      lowMid: scores.filter((score) => score >= 501 && score <= 600).length / total,
      mid: scores.filter((score) => score >= 601 && score <= 800).length / total,
      highMid: scores.filter((score) => score >= 801 && score <= 1000).length / total,
      high: scores.filter((score) => score >= 1001 && score <= 1200).length / total,
      veryHigh: scores.filter((score) => score >= 1201 && score <= 1500).length / total,
      elite: scores.filter((score) => score >= 1501 && score <= 2000).length / total,
    };

    expect(ratios.low).toBeGreaterThan(0.11);
    expect(ratios.low).toBeLessThan(0.23);
    expect(ratios.lowMid).toBeGreaterThan(0.11);
    expect(ratios.lowMid).toBeLessThan(0.23);
    expect(ratios.mid).toBeGreaterThan(0.20);
    expect(ratios.mid).toBeLessThan(0.33);
    expect(ratios.highMid).toBeGreaterThan(0.11);
    expect(ratios.highMid).toBeLessThan(0.23);
    expect(ratios.high).toBeGreaterThan(0.08);
    expect(ratios.high).toBeLessThan(0.19);
    expect(ratios.veryHigh).toBeGreaterThan(0.02);
    expect(ratios.veryHigh).toBeLessThan(0.11);
    expect(ratios.elite).toBeGreaterThan(0.005);
    expect(ratios.elite).toBeLessThan(0.07);
  });
});
