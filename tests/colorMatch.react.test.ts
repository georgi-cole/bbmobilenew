/**
 * Color Match — unit tests for registry wiring and game utilities.
 *
 * Covers:
 *  1. Registry: colorMatch is active, uses React implementation, and has the correct reactComponentKey.
 *  2. React components map: ColorMatch is registered in the reactComponents map.
 *  3. Utility logic: color match accuracy calculation and hint-related helpers.
 *  4. Scoring invariants: average ≤ 100, hint penalty, tie-breaking.
 *  5. AI scoring: colorMatch AI registry caps scores at 0–100.
 */

import { describe, it, expect } from 'vitest';
import { getGame } from '../src/minigames/registry';
import reactComponents from '../src/minigames/reactComponents';
import {
  applyHintPenalty,
  buildHintMessage,
  calculateColorMatchAccuracy,
} from '../src/components/ColorMatchComp/colorMatchUtils';
import { minigameAiRegistry } from '../src/ai/competition/minigameAiRegistry';
import { computeScores } from '../src/minigames/scoring';

// ── 1. Registry checks ────────────────────────────────────────────────────────

describe('colorMatch registry entry', () => {
  it('is active (not retired)', () => {
    const entry = getGame('colorMatch');
    expect(entry).toBeDefined();
    expect(entry?.retired).toBe(false);
  });

  it('uses React implementation', () => {
    const entry = getGame('colorMatch');
    expect(entry?.implementation).toBe('react');
    expect(entry?.legacy).toBe(false);
  });

  it('has reactComponentKey "ColorMatch"', () => {
    const entry = getGame('colorMatch');
    expect(entry?.reactComponentKey).toBe('ColorMatch');
  });

  it('does not have modulePath (not legacy)', () => {
    const entry = getGame('colorMatch');
    expect((entry as Record<string, unknown>)?.modulePath).toBeUndefined();
  });
});

// ── 2. reactComponents map includes ColorMatch ────────────────────────────────

describe('reactComponents map', () => {
  it('contains ColorMatch entry', () => {
    expect(reactComponents['ColorMatch']).toBeDefined();
    expect(typeof reactComponents['ColorMatch']).toBe('function');
  });
});

// ── 3. Accuracy helper logic ──────────────────────────────────────────────────

describe('Color Match accuracy calculation', () => {
  it('returns 100% for an exact match', () => {
    const color = { r: 100, g: 150, b: 200 };
    expect(Math.round(calculateColorMatchAccuracy(color, color))).toBe(100);
  });

  it('returns 0% for maximum possible distance (black vs white)', () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(Math.round(calculateColorMatchAccuracy(black, white))).toBe(0);
  });

  it('returns > 50% for a reasonably close match', () => {
    const target = { r: 100, g: 100, b: 100 };
    const close  = { r: 110, g:  95, b: 105 };
    expect(calculateColorMatchAccuracy(target, close)).toBeGreaterThan(90);
  });

  it('accuracy is symmetric', () => {
    const a = { r: 50,  g: 100, b: 200 };
    const b = { r: 180, g:  30, b:  10 };
    expect(calculateColorMatchAccuracy(a, b)).toBeCloseTo(calculateColorMatchAccuracy(b, a), 5);
  });
});

describe('Color Match hints', () => {
  it('builds directional RGB hint copy', () => {
    const hint = buildHintMessage(
      { r: 200, g: 110, b: 50 },
      { r: 150, g: 112, b: 100 },
    );
    expect(hint).toMatch(/increase red/i);
    expect(hint).toMatch(/green level is accurate/i);
    expect(hint).toMatch(/decrease blue/i);
  });

  it('applies 5 points per hint to final score', () => {
    expect(applyHintPenalty(88, 0)).toBe(88);
    expect(applyHintPenalty(88, 1)).toBe(83);
    expect(applyHintPenalty(88, 2)).toBe(78);
  });

  it('never drops final score below zero', () => {
    expect(applyHintPenalty(4, 2)).toBe(0);
  });
});

// ── 4. Scoring invariants ─────────────────────────────────────────────────────

describe('Color Match scoring invariants', () => {
  it('average of 5 perfect rounds via the real accuracy helper never exceeds 100', () => {
    // Each round uses calculateColorMatchAccuracy, which returns 0–100.
    // Even when every round is a perfect match the average must stay ≤ 100.
    const target = { r: 128, g: 128, b: 128 };
    const guess  = { r: 128, g: 128, b: 128 };
    const rounds = Array.from({ length: 5 }, () =>
      Math.round(calculateColorMatchAccuracy(target, guess)),
    );
    const avg = Math.round(rounds.reduce((s, v) => s + v, 0) / rounds.length);
    expect(avg).toBeLessThanOrEqual(100);
  });

  it('average is capped to 100 when individual rounds score at most 100', () => {
    // Individual round accuracy is computed as [0, 100] via calculateColorMatchAccuracy.
    // Even with a mix of perfect and worst-case guesses, the averaged score must stay ≤ 100.
    const target = { r: 128, g: 128, b: 128 };
    const guesses = [
      { r: 128, g: 128, b: 128 }, // perfect match
      { r: 0,   g: 0,   b: 0   }, // extreme miss
      { r: 255, g: 255, b: 255 }, // opposite extreme
      { r: 128, g: 0,   b: 255 }, // mixed error
      { r: 100, g: 150, b: 200 }, // partial match
    ];
    const roundScores = guesses.map((guess) =>
      Math.round(calculateColorMatchAccuracy(target, guess)),
    );
    const avg = Math.round(
      roundScores.reduce((sum, value) => sum + value, 0) / roundScores.length,
    );
    expect(avg).toBeLessThanOrEqual(100);
  });

  it('hint penalty applied after average still stays ≤ 100', () => {
    const rawAvg = 100;
    expect(applyHintPenalty(rawAvg, 0)).toBeLessThanOrEqual(100);
    expect(applyHintPenalty(rawAvg, 1)).toBeLessThanOrEqual(100);
    expect(applyHintPenalty(rawAvg, 2)).toBeLessThanOrEqual(100);
  });
});

// ── 5. AI scoring range ───────────────────────────────────────────────────────

describe('colorMatch AI registry', () => {
  it('has explicit minScore = 0 and maxScore = 100', () => {
    const model = minigameAiRegistry['colorMatch'];
    expect(model).toBeDefined();
    expect(model.minScore).toBe(0);
    expect(model.maxScore).toBe(100);
  });

  it('AI scores stay in [0, 100] regardless of timeLimitMs', () => {
    // Regression guard: previously the generic time-scaled fallback produced
    // maxScore = round(100 * (25/10)) = 250 for a 25-second game.
    const model = minigameAiRegistry['colorMatch'];
    expect(model.maxScore).not.toBeGreaterThan(100);
  });
});

// ── 6. Time-based tie-breaking ────────────────────────────────────────────────

describe('computeScores time-based tie-breaking', () => {
  it('player with lower tiebreaker value ranks higher on equal score', () => {
    const results = [
      { playerId: 'slow', rawValue: 85, tiebreaker: 120_000 },
      { playerId: 'fast', rawValue: 85, tiebreaker:  80_000 },
    ];
    const ranked = computeScores('raw', results);
    expect(ranked[0].playerId).toBe('fast');
    expect(ranked[1].playerId).toBe('slow');
  });

  it('score difference still takes priority over tiebreaker', () => {
    const results = [
      { playerId: 'lower-score-fast', rawValue: 80, tiebreaker: 1_000 },
      { playerId: 'higher-score-slow', rawValue: 90, tiebreaker: 200_000 },
    ];
    const ranked = computeScores('raw', results);
    expect(ranked[0].playerId).toBe('higher-score-slow');
  });

  it('absent tiebreaker defaults to Infinity — cannot beat a real time', () => {
    const results = [
      { playerId: 'no-tie', rawValue: 75 },
      { playerId: 'with-tie', rawValue: 75, tiebreaker: 50_000 },
    ];
    const ranked = computeScores('raw', results);
    // 'with-tie' has an explicit tiebreaker of 50 000 ms < Infinity → ranks first
    expect(ranked[0].playerId).toBe('with-tie');
  });
});
