import { describe, it, expect, vi } from 'vitest';
import {
  getDefaultCompetitionProfile,
  getFallbackMinigameAiModel,
  getMinigameAiModel,
  registerMinigameAiModel,
  simulateAiPerformance,
} from '../../../src/ai/competition';
import type { GameRegistryEntry } from '../../../src/minigames/registry';
import { mulberry32 } from '../../../src/store/rng';

describe('competition AI foundation', () => {
  it('returns a default competition profile with baseline values', () => {
    const profile = getDefaultCompetitionProfile();

    expect(profile).toMatchObject({
      overall: 50,
      physical: 50,
      mental: 50,
      precision: 50,
      nerve: 50,
      consistency: 50,
      clutch: 50,
      chokeRisk: 50,
      luck: 50,
    });
  });

  it('returns fallback minigame metadata when no registry entry exists', () => {
    const model = getMinigameAiModel('unknown-minigame');

    expect(model.key).toBe('unknown-minigame');
    expect(model.scoreDirection).toBe('higher-is-better');
    expect(model.weights).toMatchObject({
      physical: 1,
      mental: 1,
      precision: 1,
      nerve: 1,
      luck: 1,
    });
  });

  it('returns a fallback model directly for explicit usage', () => {
    const fallback = getFallbackMinigameAiModel('fallback-minigame');

    expect(fallback.key).toBe('fallback-minigame');
    expect(fallback.notes).toContain('Fallback');
  });

  it('warns when lower-is-better metadata is used with legacy tap scores', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registerMinigameAiModel({
      key: 'lower-better',
      category: 'physical',
      scoreDirection: 'lower-is-better',
      volatility: 0.4,
      weights: { physical: 1, mental: 1, precision: 1, nerve: 1, luck: 0.5 },
    });

    simulateAiPerformance({ minigameKey: 'lower-better', seed: 1, timeLimitSeconds: 10 });

    expect(warnSpy).toHaveBeenCalledWith(
      '[competition-ai] lower-better uses lower-is-better but still returns legacy tap scores.',
    );
    warnSpy.mockRestore();
  });
});

describe('simulateAiPerformance legacy challenge scoring', () => {
  const seed = 12345;

  function makeTestGame(
    metricKind: GameRegistryEntry['metricKind'],
    overrides: Partial<GameRegistryEntry> = {},
  ): GameRegistryEntry {
    return {
      key: `${metricKind}-test`,
      title: 'Test Game',
      description: 'Test game description',
      instructions: [],
      metricKind,
      metricLabel: 'Score',
      timeLimitMs: 10_000,
      authoritative: false,
      scoringAdapter: 'raw',
      legacy: true,
      weight: 1,
      category: 'arcade',
      retired: false,
      ...overrides,
    };
  }

  it('computes count metric scores deterministically', () => {
    const game = makeTestGame('count', { timeLimitMs: 10_000 });
    const rng = mulberry32(seed >>> 0);
    const expected = Math.round(75 + Math.floor(rng() * 16));

    expect(simulateAiPerformance({ minigameKey: game.key, seed, game })).toBe(expected);
  });

  it('computes time metric scores deterministically', () => {
    const game = makeTestGame('time', {
      timeLimitMs: 30_000,
      scoringParams: { targetMs: 1500, maxMs: 30_000 },
    });
    const rng = mulberry32(seed >>> 0);
    const expected = Math.round(1500 + rng() * (30_000 - 1500) * 0.5);

    expect(simulateAiPerformance({ minigameKey: game.key, seed, game })).toBe(expected);
  });

  it('computes accuracy metric scores deterministically', () => {
    const game = makeTestGame('accuracy');
    const rng = mulberry32(seed >>> 0);
    const expected = Math.round(60 + rng() * 40);

    expect(simulateAiPerformance({ minigameKey: game.key, seed, game })).toBe(expected);
  });

  it('computes endurance metric scores deterministically', () => {
    const game = makeTestGame('endurance');
    const rng = mulberry32(seed >>> 0);
    const expected = Math.round(10 + rng() * 50);

    expect(simulateAiPerformance({ minigameKey: game.key, seed, game })).toBe(expected);
  });

  it('computes hybrid metric scores deterministically', () => {
    const game = makeTestGame('hybrid');
    const rng = mulberry32(seed >>> 0);
    const expected = Math.round(rng() * 100);

    expect(simulateAiPerformance({ minigameKey: game.key, seed, game })).toBe(expected);
  });

  it('computes points metric scores deterministically', () => {
    const game = makeTestGame('points');
    const rng = mulberry32(seed >>> 0);
    const expected = Math.round(rng() * 100);

    expect(simulateAiPerformance({ minigameKey: game.key, seed, game })).toBe(expected);
  });
});
