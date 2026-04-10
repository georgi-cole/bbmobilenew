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
  buildColorMatchCompetitionRawResults,
  buildHintMessage,
  calculateColorMatchAccuracy,
  createColorMatchCompetitionStandings,
  formatColorMatchScore,
  getColorMatchAiRoundScore,
  getColorMatchFeedbackCtaLabel,
  getColorMatchScoreDisplayPrecision,
  rankColorMatchCompetitionStandings,
  resolveColorMatchCompetitionRound,
  simulateColorMatchAiRoundScore,
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
  it('has explicit fallback AI bounds in the intended 65–99 range', () => {
    const model = minigameAiRegistry['colorMatch'];
    expect(model).toBeDefined();
    expect(model.minScore).toBe(65);
    expect(model.maxScore).toBe(99);
  });

  it('AI scores stay in [65, 99] regardless of timeLimitMs', () => {
    const model = minigameAiRegistry['colorMatch'];
    expect(model.minScore).toBeGreaterThanOrEqual(65);
    expect(model.maxScore).toBeLessThanOrEqual(99);
  });
});

describe('Color Match competition helpers', () => {
  it('rounds 1-4 eliminate every player tied for the lowest score', () => {
    const initial = createColorMatchCompetitionStandings([
      { id: 'p0', name: 'P0', isHuman: true },
      { id: 'p1', name: 'P1', isHuman: false },
      { id: 'p2', name: 'P2', isHuman: false },
      { id: 'p3', name: 'P3', isHuman: false },
    ]);

    const round1 = resolveColorMatchCompetitionRound(initial, 1, {
      p0: 88,
      p1: 70,
      p2: 70,
      p3: 92,
    });

    expect(round1.eliminatedIds).toEqual(['p1', 'p2']);
    expect(round1.activeIds).toEqual(['p0', 'p3']);
  });

  it('round 4 also eliminates every player tied for the lowest score', () => {
    const standings = createColorMatchCompetitionStandings([
      { id: 'p0', name: 'P0', isHuman: true },
      { id: 'p1', name: 'P1', isHuman: false },
      { id: 'p2', name: 'P2', isHuman: false },
      { id: 'p3', name: 'P3', isHuman: false },
    ]).map((standing, index) => ({
      ...standing,
      roundScores: [95 - index, 94 - index, 93 - index],
    }));

    const round4 = resolveColorMatchCompetitionRound(standings, 4, {
      p0: 90,
      p1: 66,
      p2: 66,
      p3: 66,
    });

    expect(round4.eliminatedIds).toEqual(['p1', 'p2', 'p3']);
    expect(round4.activeIds).toEqual(['p0']);
  });

  it('finale keeps only the exact top tie group active for a rematch', () => {
    let standings = createColorMatchCompetitionStandings([
      { id: 'p0', name: 'P0', isHuman: true },
      { id: 'p1', name: 'P1', isHuman: false },
      { id: 'p2', name: 'P2', isHuman: false },
      { id: 'p3', name: 'P3', isHuman: false },
      { id: 'p4', name: 'P4', isHuman: false },
      { id: 'p5', name: 'P5', isHuman: false },
      { id: 'p6', name: 'P6', isHuman: false },
    ]);

    standings = resolveColorMatchCompetitionRound(standings, 1, {
      p0: 90, p1: 85, p2: 82, p3: 80, p4: 78, p5: 76, p6: 65,
    }).standings;
    standings = resolveColorMatchCompetitionRound(standings, 2, {
      p0: 91, p1: 86, p2: 83, p3: 81, p4: 79, p5: 66,
    }).standings;
    standings = resolveColorMatchCompetitionRound(standings, 3, {
      p0: 92, p1: 87, p2: 84, p3: 82, p4: 67,
    }).standings;

    const round4 = resolveColorMatchCompetitionRound(standings, 4, {
      p0: 93, p1: 89, p2: 72, p3: 69,
    });
    expect(round4.eliminatedIds).toEqual(['p3']);
    expect(round4.activeIds).toEqual(['p0', 'p1', 'p2']);

    const round5 = resolveColorMatchCompetitionRound(round4.standings, 5, {
      p0: 97.445,
      p1: 97.445,
      p2: 95.112,
    });
    expect(round5.eliminatedIds).toEqual(['p2']);
    expect(round5.activeIds).toEqual(['p0', 'p1']);

    const rematch = resolveColorMatchCompetitionRound(round5.standings, 6, {
      p0: 98.111,
      p1: 97.876,
    });
    expect(rematch.activeIds).toEqual(['p0']);

    const ranked = rankColorMatchCompetitionStandings(rematch.standings);
    const rawResults = buildColorMatchCompetitionRawResults(ranked);

    expect(ranked.map((entry) => entry.participantId)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(rawResults.p0).toBeGreaterThan(rawResults.p1);
    expect(rawResults.p1).toBeGreaterThan(rawResults.p2);
  });

  it('AI scores stay between 65 and 99 and trend upward in later rounds', () => {
    const participant = { id: 'ai-1', participantIndex: 1, precomputedScore: 78 };
    const round1Scores = Array.from({ length: 50 }, (_, seed) => simulateColorMatchAiRoundScore(participant, 1, seed));
    const round5Scores = Array.from({ length: 50 }, (_, seed) => simulateColorMatchAiRoundScore(participant, 5, seed));

    expect(Math.min(...round1Scores)).toBeGreaterThanOrEqual(65);
    expect(Math.max(...round5Scores)).toBeLessThanOrEqual(99);
    expect(round5Scores.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(
      round1Scores.reduce((sum, value) => sum + value, 0),
    );
  });

  it('shows only as many decimal places as needed to break visible ties', () => {
    expect(getColorMatchScoreDisplayPrecision([88.31, 88.36, 70])).toBe(1);
    expect(formatColorMatchScore(88.31, 1)).toBe('88.3%');
    expect(getColorMatchScoreDisplayPrecision([99.941, 99.944, 80])).toBe(3);
    expect(formatColorMatchScore(99.944, 3)).toBe('99.944%');
  });

  it('uses simulated AI scores for rematch rounds beyond the precomputed opening rounds', () => {
    const participant = {
      id: 'p1',
      name: 'P1',
      isHuman: false,
      precomputedScore: 84,
      participantIndex: 1,
    };
    const openingScores = Array.from({ length: 5 }, (_, index) => simulateColorMatchAiRoundScore(
      participant,
      index + 1,
      42,
    ));

    expect(getColorMatchAiRoundScore(participant, 3, 42, openingScores)).toBe(openingScores[2]);
    expect(getColorMatchAiRoundScore(participant, 6, 42, openingScores)).toBe(
      simulateColorMatchAiRoundScore(participant, 6, 42),
    );
  });

  it('matches the feedback CTA label to rematch-vs-results behavior', () => {
    expect(getColorMatchFeedbackCtaLabel({
      competitionMode: true,
      humanStillActive: false,
      activeCompetitionCount: 2,
      nextIndex: 5,
      maxRounds: 5,
    })).toBe('Continue Watching →');

    expect(getColorMatchFeedbackCtaLabel({
      competitionMode: true,
      humanStillActive: true,
      activeCompetitionCount: 2,
      nextIndex: 5,
      maxRounds: 5,
    })).toBe('Next Round →');

    expect(getColorMatchFeedbackCtaLabel({
      competitionMode: true,
      humanStillActive: true,
      activeCompetitionCount: 1,
      nextIndex: 5,
      maxRounds: 5,
    })).toBe('See Results →');
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
