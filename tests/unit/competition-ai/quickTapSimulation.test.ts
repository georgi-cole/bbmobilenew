/**
 * Quick Tap Race — booster prompt system and AI simulation tests.
 *
 * Covers:
 *  1. selectBoosterPrompts — always returns exactly 3 prompts
 *  2. selectBoosterPrompts — deterministic for a given seed
 *  3. selectBoosterPrompts — each prompt type comes from the valid pool
 *  4. selectBoosterPrompts — different seeds produce different sequences
 *  5. selectBoosterPrompts — schedule times match expected slots
 *  6. simulateQuickTapAiScore — output is non-negative integer
 *  7. simulateQuickTapAiScore — deterministic for identical inputs
 *  8. simulateQuickTapAiScore — different players get different scores
 *  9. simulateQuickTapAiScore — scores stay within physically possible range
 * 10. simulateQuickTapAiScore — competitive zone scores dominate (majority 161–265)
 * 11. simulateQuickTapAiScore — stronger physical profile produces higher average scores
 * 12. simulateQuickTapAiScore — can still reach the top competitive band (≥ 240)
 * 13. simulateQuickTapAiScore — can still produce lower-band outcomes (≤ 165)
 */

import { describe, it, expect } from 'vitest';
import {
  selectBoosterPrompts,
  simulateQuickTapAiScore,
  BOOSTER_POOL,
  PROMPT_VISIBLE_FOR,
} from '../../../src/ai/competition/quickTapSimulation';
import type { BoosterType, ScheduledBoosterPrompt } from '../../../src/ai/competition/quickTapSimulation';
import type { CompetitionSkillProfile } from '../../../src/ai/competition';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_BOOSTER_TYPES = new Set<BoosterType>(['2x', '3x', '0.5x', '-1x', '+3s', '-3s']);
const EXPECTED_SCHEDULE_TIMES = [6, 15, 23];

const STRONG_PROFILE: CompetitionSkillProfile = {
  overall: 80, physical: 85, mental: 70, precision: 75, nerve: 80,
  consistency: 75, clutch: 80, chokeRisk: 20, luck: 70,
};

const WEAK_PROFILE: CompetitionSkillProfile = {
  overall: 25, physical: 20, mental: 30, precision: 25, nerve: 25,
  consistency: 25, clutch: 25, chokeRisk: 75, luck: 30,
};

const DEFAULT_PROFILE: CompetitionSkillProfile = {
  overall: 50, physical: 50, mental: 50, precision: 50, nerve: 50,
  consistency: 50, clutch: 50, chokeRisk: 50, luck: 50,
};

// ── 1. Booster prompt selection ───────────────────────────────────────────────

describe('selectBoosterPrompts', () => {
  it('always returns exactly 3 prompts', () => {
    for (const seed of [0, 1, 42, 99, 12345, 999999]) {
      expect(selectBoosterPrompts(seed)).toHaveLength(3);
    }
  });

  it('is deterministic: same seed → same prompts', () => {
    const a = selectBoosterPrompts(42);
    const b = selectBoosterPrompts(42);
    expect(a.map((p) => p.type)).toEqual(b.map((p) => p.type));
    expect(a.map((p) => p.scheduleAt)).toEqual(b.map((p) => p.scheduleAt));
  });

  it('each prompt type is from the valid booster pool', () => {
    const prompts = selectBoosterPrompts(7777);
    for (const p of prompts) {
      expect(VALID_BOOSTER_TYPES.has(p.type)).toBe(true);
    }
  });

  it('different seeds produce different type sequences', () => {
    const sequences = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      sequences.add(selectBoosterPrompts(seed).map((p) => p.type).join(','));
    }
    // With 6 possible types and 3 picks, there should be meaningful variety
    expect(sequences.size).toBeGreaterThan(3);
  });

  it('prompts appear at the expected scheduled times', () => {
    const prompts = selectBoosterPrompts(12345);
    expect(prompts.map((p) => p.scheduleAt)).toEqual(EXPECTED_SCHEDULE_TIMES);
  });

  it('all prompts have the correct visibleFor duration', () => {
    const prompts = selectBoosterPrompts(42);
    for (const p of prompts) {
      expect(p.visibleFor).toBe(PROMPT_VISIBLE_FOR);
    }
  });

  it('all 3 selected prompts have distinct types within a game', () => {
    // With 6 types and 3 picks (seededPickN without replacement), types are unique per game
    for (const seed of [0, 42, 100, 200, 300]) {
      const types = selectBoosterPrompts(seed).map((p) => p.type);
      expect(new Set(types).size).toBe(3);
    }
  });

  it('prompt definitions include required fields', () => {
    const prompts = selectBoosterPrompts(99);
    for (const prompt of prompts) {
      expect(prompt).toMatchObject<Partial<ScheduledBoosterPrompt>>({
        type: expect.any(String),
        label: expect.any(String),
        icon: expect.any(String),
        kind: expect.stringMatching(/^(multiplier|time)$/),
        beneficial: expect.any(Boolean),
        activeDuration: expect.any(Number),
        scheduleAt: expect.any(Number),
        visibleFor: expect.any(Number),
      });
      if (prompt.kind === 'multiplier') {
        expect(typeof prompt.multiplier).toBe('number');
      } else {
        expect(typeof prompt.timeDelta).toBe('number');
      }
    }
  });
});

describe('BOOSTER_POOL contents', () => {
  it('contains exactly 6 entries', () => {
    expect(BOOSTER_POOL).toHaveLength(6);
  });

  it('contains all 6 required types', () => {
    const types = new Set(BOOSTER_POOL.map((b) => b.type));
    for (const t of VALID_BOOSTER_TYPES) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('has exactly 3 beneficial and 3 harmful boosters', () => {
    const beneficial = BOOSTER_POOL.filter((b) => b.beneficial);
    const harmful = BOOSTER_POOL.filter((b) => !b.beneficial);
    expect(beneficial).toHaveLength(3);
    expect(harmful).toHaveLength(3);
  });
});

// ── 2. AI score simulation ────────────────────────────────────────────────────

describe('simulateQuickTapAiScore — basic correctness', () => {
  it('returns a non-negative integer', () => {
    for (const seed of [0, 42, 999, 12345]) {
      const score = simulateQuickTapAiScore({ seed, playerId: 'p1' });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(score)).toBe(true);
    }
  });

  it('is deterministic for identical inputs', () => {
    const a = simulateQuickTapAiScore({ seed: 42, playerId: 'player-1', participantIndex: 0 });
    const b = simulateQuickTapAiScore({ seed: 42, playerId: 'player-1', participantIndex: 0 });
    expect(a).toBe(b);
  });

  it('different seeds produce different scores', () => {
    const scores = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) =>
        simulateQuickTapAiScore({ seed, playerId: 'p1' }),
      ),
    );
    // With 10 different seeds, we expect meaningful variety (at least 5 distinct values)
    expect(scores.size).toBeGreaterThan(4);
  });

  it('different player IDs produce different scores for the same seed', () => {
    const seed = 42;
    const scores = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) =>
      simulateQuickTapAiScore({ seed, playerId: id }),
    );
    // With 6 players and random archetypes, we expect variety
    const unique = new Set(scores);
    expect(unique.size).toBeGreaterThan(2);
  });
});

describe('simulateQuickTapAiScore — realism and competitiveness', () => {
  it('30-second scores stay inside the physically possible range', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const scores = seeds.map((seed) =>
      simulateQuickTapAiScore({ seed, playerId: `p${seed}`, profile: DEFAULT_PROFILE }),
    );
    // Bands reduced 15% (issue #951). Absolute minimum is the lowest band (89)
    // minus max jitter (4) minus max slump (14) = 71. Absolute maximum is the
    // rare perfect-run band (328) plus max jitter (4) plus max hot-streak bonus (18) = 350.
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...scores)).toBeLessThanOrEqual(350);
  });

  it('competitive zone scores dominate — majority fall in the competitive range', () => {
    const seeds = Array.from({ length: 1000 }, (_, i) => i + 1);
    const scores = seeds.map((seed) =>
      simulateQuickTapAiScore({ seed, playerId: 'distribution-check', profile: DEFAULT_PROFILE }),
    );

    // Bands from minigameAiBalance.ts, reduced 15% (issue #951). Grouped to the
    // configured (scaled) band edges so each range maps to its nominal chance:
    //   band1: ≤118        →  3% nominal
    //   band2: 119–157     → 17% nominal
    //   band3: 158–187     → 20% nominal
    //   band4: 188–225     → 30% nominal
    //   band5: ≥226        → 30% nominal (including the 5% perfect-run tier)
    //
    // Jitter (±4) and hot-streak/slump (±6–18) can shift individual scores across
    // band edges, so tolerances are intentionally wider than the nominal percentage.
    // Counts sum to exactly 1000 because the ranges are mutually exclusive and exhaustive.
    const counts = {
      band1: scores.filter((s) => s <= 118).length,
      band2: scores.filter((s) => s >= 119 && s <= 157).length,
      band3: scores.filter((s) => s >= 158 && s <= 187).length,
      band4: scores.filter((s) => s >= 188 && s <= 225).length,
      band5: scores.filter((s) => s >= 226).length,
    };

    // Sanity: all 1000 scores are captured (exhaustive + non-overlapping).
    expect(counts.band1 + counts.band2 + counts.band3 + counts.band4 + counts.band5).toBe(1000);

    // band1 (~3% nominal): allow generous tolerance for jitter + slump spillover
    expect(counts.band1).toBeGreaterThanOrEqual(5);
    expect(counts.band1).toBeLessThanOrEqual(100);

    // band2 (~17% nominal)
    expect(counts.band2).toBeGreaterThanOrEqual(100);
    expect(counts.band2).toBeLessThanOrEqual(270);

    // band3 (~20% nominal)
    expect(counts.band3).toBeGreaterThanOrEqual(130);
    expect(counts.band3).toBeLessThanOrEqual(300);

    // band4 (~30% nominal — core competitive zone)
    expect(counts.band4).toBeGreaterThanOrEqual(230);
    expect(counts.band4).toBeLessThanOrEqual(400);

    // band5 (~30% nominal): includes standout and perfect-run outcomes
    expect(counts.band5).toBeGreaterThanOrEqual(180);
    expect(counts.band5).toBeLessThanOrEqual(400);

    // Summary check: competitive zone (bands 2–5) should dominate
    const competitive = counts.band2 + counts.band3 + counts.band4 + counts.band5;
    expect(competitive).toBeGreaterThanOrEqual(820); // ≥ 82% of 1000
  });

  it('strong AI can still reach the top competitive band (≥ 240)', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i * 7 + 3);
    const scores = seeds.map((seed) =>
      simulateQuickTapAiScore({ seed, playerId: 'strong-ai', profile: STRONG_PROFILE }),
    );
    const topBand = scores.filter((s) => s >= 240);
    expect(topBand.length).toBeGreaterThan(0);
  });

  it('weak AI can still produce lower-band results (≤ 165)', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i * 13 + 5);
    const scores = seeds.map((seed) =>
      simulateQuickTapAiScore({ seed, playerId: 'weak-ai', profile: WEAK_PROFILE }),
    );
    const lowBand = scores.filter((s) => s <= 165);
    expect(lowBand.length).toBeGreaterThan(0);
  });

  it('distribution shows meaningful variance (max − min > 80 across 20 runs)', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i + 100);
    const scores = seeds.map((seed) =>
      simulateQuickTapAiScore({ seed, playerId: 'p0', profile: DEFAULT_PROFILE }),
    );
    const range = Math.max(...scores) - Math.min(...scores);
    expect(range).toBeGreaterThan(80);
  });

  it('stronger physical profile produces higher average scores', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i + 200);

    const strongAvg =
      seeds.reduce(
        (sum, seed) =>
          sum + simulateQuickTapAiScore({ seed, playerId: 'strong', profile: STRONG_PROFILE }),
        0,
      ) / seeds.length;

    const weakAvg =
      seeds.reduce(
        (sum, seed) =>
          sum + simulateQuickTapAiScore({ seed, playerId: 'weak', profile: WEAK_PROFILE }),
        0,
      ) / seeds.length;

    expect(strongAvg).toBeGreaterThan(weakAvg);
  });

  it('scores can exceed 200 for favorable seed + profile combinations', () => {
    const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const over200 = seeds.flatMap((seed) =>
      players.map((id) =>
        simulateQuickTapAiScore({ seed, playerId: id, profile: STRONG_PROFILE }),
      ),
    ).filter((s) => s > 200);
    expect(over200.length).toBeGreaterThan(0);
  });

  it('no outlier scores exceed physically impossible values (< 500)', () => {
    // At 10 taps/sec for 33 seconds (30 + max time bonus) with 3× turbo for entire game,
    // the theoretical max would be ~990. Real players can't sustain that.
    // Ensure simulation doesn't produce bizarre outliers.
    const seeds = Array.from({ length: 100 }, (_, i) => i);
    const max = Math.max(
      ...seeds.map((seed) =>
        simulateQuickTapAiScore({ seed, playerId: 'max-ai', profile: STRONG_PROFILE }),
      ),
    );
    expect(max).toBeLessThan(500);
  });
});

describe('simulateQuickTapAiScore — time limit sensitivity', () => {
  it('longer time limit produces higher scores', () => {
    const seed = 42;
    const score30 = simulateQuickTapAiScore({ seed, playerId: 'p1', timeLimitSeconds: 30 });
    const score60 = simulateQuickTapAiScore({ seed, playerId: 'p1', timeLimitSeconds: 60 });
    expect(score60).toBeGreaterThan(score30);
  });

  it('shorter time limit produces lower scores', () => {
    const seed = 42;
    const score30 = simulateQuickTapAiScore({ seed, playerId: 'p1', timeLimitSeconds: 30 });
    const score15 = simulateQuickTapAiScore({ seed, playerId: 'p1', timeLimitSeconds: 15 });
    expect(score15).toBeLessThan(score30);
  });
});
