/**
 * Hybrid Score Resolver — unit tests.
 *
 * Validates the central post-human-score AI score resolution system:
 *
 *  1. Scores are non-negative integers within the game's score envelope.
 *  2. Deterministic: same inputs → same outputs.
 *  3. Different seeds / players produce different results.
 *  4. Human score of 0 does NOT collapse all AI scores near 0.
 *  5. A typical (non-zero) human score produces a competitive spread.
 *  6. isHybridScoredGame correctly identifies scored vs. endurance games.
 *  7. Profile nudge only has a small effect (not deterministic winner/loser).
 *  8. Higher-is-better vs. lower-is-better games both work correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveHybridAiScores,
  isHybridScoredGame,
  type HybridAiParticipant,
} from '../../../src/ai/competition/hybridScoreResolver';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AI_PLAYERS: HybridAiParticipant[] = [
  { id: 'p1' },
  { id: 'p2' },
  { id: 'p3' },
  { id: 'p4' },
];

// ── 1. isHybridScoredGame ─────────────────────────────────────────────────────

describe('isHybridScoredGame', () => {
  it('returns true for scored physical games (quickTap)', () => {
    expect(isHybridScoredGame('quickTap')).toBe(true);
  });

  it('returns true for scored precision games (targetPractice / Bullseye)', () => {
    expect(isHybridScoredGame('targetPractice')).toBe(true);
  });

  it('returns true for snake', () => {
    expect(isHybridScoredGame('snake')).toBe(true);
  });

  it('returns true for estimationGame', () => {
    expect(isHybridScoredGame('estimationGame')).toBe(true);
  });

  it('returns true for travelingDots', () => {
    expect(isHybridScoredGame('travelingDots')).toBe(true);
  });

  it('returns false for endurance game holdWall', () => {
    expect(isHybridScoredGame('holdWall')).toBe(false);
  });

  it('returns false for endurance game tiltedLedge', () => {
    expect(isHybridScoredGame('tiltedLedge')).toBe(false);
  });

  it('returns false for endurance game pressurePlank', () => {
    expect(isHybridScoredGame('pressurePlank')).toBe(false);
  });

  it('returns false for endurance game rainBarrelBalance', () => {
    expect(isHybridScoredGame('rainBarrelBalance')).toBe(false);
  });

  it('returns false for glass_bridge_brutal (endurance)', () => {
    expect(isHybridScoredGame('glass_bridge_brutal')).toBe(false);
  });
});

// ── 2. Basic correctness ──────────────────────────────────────────────────────

describe('resolveHybridAiScores — basic correctness', () => {
  it('returns a score for each AI participant', () => {
    const result = resolveHybridAiScores({
      gameKey: 'quickTap',
      humanScore: 150,
      aiParticipants: AI_PLAYERS,
      seed: 42,
    });
    expect(Object.keys(result)).toHaveLength(4);
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      expect(typeof result[id]).toBe('number');
    }
  });

  it('all scores are non-negative integers within the quickTap envelope [80, 280]', () => {
    const result = resolveHybridAiScores({
      gameKey: 'quickTap',
      humanScore: 150,
      aiParticipants: AI_PLAYERS,
      seed: 99,
    });
    for (const score of Object.values(result)) {
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(80);
      expect(score).toBeLessThanOrEqual(280);
    }
  });

  it('is deterministic for identical inputs', () => {
    const args = {
      gameKey: 'quickTap',
      humanScore: 160,
      aiParticipants: AI_PLAYERS,
      seed: 7,
    };
    const a = resolveHybridAiScores(args);
    const b = resolveHybridAiScores(args);
    expect(a).toEqual(b);
  });

  it('different seeds produce different results', () => {
    const base = { gameKey: 'quickTap', humanScore: 160, aiParticipants: AI_PLAYERS };
    const r1 = resolveHybridAiScores({ ...base, seed: 1 });
    const r2 = resolveHybridAiScores({ ...base, seed: 2 });
    // At least one player should differ
    const p1Differs = r1['p1'] !== r2['p1'];
    const p2Differs = r1['p2'] !== r2['p2'];
    expect(p1Differs || p2Differs).toBe(true);
  });

  it('different player IDs produce different scores for the same seed', () => {
    const result = resolveHybridAiScores({
      gameKey: 'quickTap',
      humanScore: 150,
      aiParticipants: AI_PLAYERS,
      seed: 42,
    });
    const scores = Object.values(result);
    const uniqueScores = new Set(scores);
    // With 4 players, expect at least some diversity
    expect(uniqueScores.size).toBeGreaterThan(1);
  });
});

// ── 3. Human-score floor protection ──────────────────────────────────────────

describe('resolveHybridAiScores — floor protection', () => {
  it('when human scores 0, AI quickTap scores stay in a believable range (≥80)', () => {
    const participants: HybridAiParticipant[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
    }));
    const result = resolveHybridAiScores({
      gameKey: 'quickTap',
      humanScore: 0,
      aiParticipants: participants,
      seed: 42,
    });
    for (const score of Object.values(result)) {
      // Must stay at or above the game floor — human's 0 must not collapse AI scores
      expect(score).toBeGreaterThanOrEqual(80);
    }
  });

  it('AI average is significantly above 0 when human scores 0', () => {
    const participants: HybridAiParticipant[] = Array.from({ length: 20 }, (_, i) => ({
      id: `player-${i}`,
    }));
    const scores = Object.values(
      resolveHybridAiScores({
        gameKey: 'quickTap',
        humanScore: 0,
        aiParticipants: participants,
        seed: 100,
      }),
    );
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    // Average should be well above 0 — expect at least 100 for quickTap
    expect(avg).toBeGreaterThan(100);
  });

  it('AI estimationGame scores stay in [0, 300] even when human scores 0', () => {
    const participants: HybridAiParticipant[] = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
    }));
    const result = resolveHybridAiScores({
      gameKey: 'estimationGame',
      humanScore: 0,
      aiParticipants: participants,
      seed: 77,
    });
    for (const score of Object.values(result)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(300);
    }
  });
});

// ── 4. Competitive spread ─────────────────────────────────────────────────────

describe('resolveHybridAiScores — competitive spread', () => {
  it('produces a varied distribution when human scores a typical quickTap value', () => {
    // Run 100 different seeds with a typical human score; verify some AIs score
    // higher and some lower than the human to confirm competitive spread.
    const humanScore = 160;
    let countHigher = 0;
    let countLower = 0;

    for (let seed = 0; seed < 100; seed++) {
      const result = resolveHybridAiScores({
        gameKey: 'quickTap',
        humanScore,
        aiParticipants: [{ id: 'ai' }],
        seed,
      });
      const aiScore = result['ai']!;
      if (aiScore > humanScore) countHigher++;
      if (aiScore < humanScore) countLower++;
    }

    // Roughly 20% of AIs should outscore the human (15% better + 5% much-better)
    // and ~40% should score lower. Allow ±15% margin for seeded randomness.
    expect(countHigher).toBeGreaterThan(5);   // at least 5% chance to beat human
    expect(countLower).toBeGreaterThan(20);    // majority should lose or tie
  });

  it('spread is wide enough that not all AIs score within ±5 of human', () => {
    const humanScore = 150;
    const participants = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}` }));
    const scores = Object.values(
      resolveHybridAiScores({
        gameKey: 'quickTap',
        humanScore,
        aiParticipants: participants,
        seed: 42,
      }),
    );
    const allVeryClose = scores.every(
      (s) => Math.abs(s - humanScore) <= 5,
    );
    expect(allVeryClose).toBe(false);
  });
});

// ── 5. Profile soft-nudge ─────────────────────────────────────────────────────

describe('resolveHybridAiScores — profile soft-nudge', () => {
  it('strong profile produces slightly higher average than weak profile (over many seeds)', () => {
    const strongProfile = {
      overall: 90, physical: 90, mental: 90, precision: 90,
      nerve: 90, consistency: 90, clutch: 90, chokeRisk: 10, luck: 80,
    };
    const weakProfile = {
      overall: 20, physical: 20, mental: 20, precision: 20,
      nerve: 20, consistency: 20, clutch: 20, chokeRisk: 80, luck: 20,
    };

    const NUM_SEEDS = 200;
    let strongTotal = 0;
    let weakTotal = 0;

    for (let seed = 0; seed < NUM_SEEDS; seed++) {
      strongTotal += resolveHybridAiScores({
        gameKey: 'quickTap',
        humanScore: 150,
        aiParticipants: [{ id: 'strong', profile: strongProfile }],
        seed,
      })['strong']!;

      weakTotal += resolveHybridAiScores({
        gameKey: 'quickTap',
        humanScore: 150,
        aiParticipants: [{ id: 'weak', profile: weakProfile }],
        seed,
      })['weak']!;
    }

    // Strong profile should average higher, but the difference is small
    expect(strongTotal / NUM_SEEDS).toBeGreaterThan(weakTotal / NUM_SEEDS);
    // Profile nudge is intentionally kept very small (±10% of bucket span)
    // so the same AI player never deterministically always wins or loses.
    // 40 pts = ~17% of the 230-pt quickTap range — well within expected one-sigma
    // variation, meaning profile should not create a dominant skill gap.
    const diff = (strongTotal - weakTotal) / NUM_SEEDS;
    const MAX_PROFILE_ADVANTAGE_PTS = 40;
    expect(diff).toBeLessThan(MAX_PROFILE_ADVANTAGE_PTS);
  });
});

// ── 6. Lower-is-better games ──────────────────────────────────────────────────

describe('resolveHybridAiScores — lower-is-better games', () => {
  it('swipeMaze scores stay within the model score range', () => {
    const participants = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}` }));
    const result = resolveHybridAiScores({
      gameKey: 'swipeMaze',
      humanScore: 40,
      aiParticipants: participants,
      seed: 55,
    });
    for (const score of Object.values(result)) {
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── 7. Multiple games — envelope coverage ────────────────────────────────────

describe('resolveHybridAiScores — score envelopes across games', () => {
  const GAME_CASES: Array<{ key: string; human: number; min: number; max: number }> = [
    { key: 'quickTap',       human: 150, min: 80,  max: 280 },
    { key: 'targetPractice', human: 100, min: 30,  max: 220 },
    { key: 'snake',          human: 200, min: 0,   max: 500 },
    { key: 'estimationGame', human: 200, min: 0,   max: 300 },
    { key: 'travelingDots',  human: 500, min: 150, max: 880 },
  ];

  for (const { key, human, min, max } of GAME_CASES) {
    it(`${key}: all AI scores clamped to [${min}, ${max}]`, () => {
      const participants = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}` }));
      const result = resolveHybridAiScores({
        gameKey: key,
        humanScore: human,
        aiParticipants: participants,
        seed: 42,
      });
      for (const score of Object.values(result)) {
        expect(score).toBeGreaterThanOrEqual(min);
        expect(score).toBeLessThanOrEqual(max);
      }
    });
  }
});
