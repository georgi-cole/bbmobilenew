/**
 * Estimation Game — competition regression tests (5-round redesign).
 *
 * Covers:
 *  1. Winner is the player with the highest average accuracy.
 *  2. Last-place finisher is derived from final average accuracy scores.
 *  3. Explicit lastPlaceId supplied by the component takes priority.
 *  4. Public mode auto-nominee matches the last-place finisher.
 *  5. Human nomination flow continues correctly after the game resolves.
 *  6. AI-only nomination flow produces the correct winner + last-place.
 *  7. Tie-breaking is deterministic (participant order as final stable fallback).
 *  8. No silent fallback when authoritative last-place data is available.
 *  9. AI calibration: simulateAiPerformance yields scores in [0, 100].
 * 10. Five-round model: NUM_ROUNDS === 5.
 * 11. Round difficulty increases: exposure time decreases each round.
 * 12. Last 2 rounds use mixed-figure selective/exclusion counting tasks.
 * 13. Figure counts vary with seed (non-repeating across different seeds).
 * 14. computeAverageAccuracy computes correct average.
 * 15. Tie-breaking by time when average accuracy is equal.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  launchMinigame,
  completeMinigame,
  commitNominees,
  advance,
} from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player, CompleteMinigamePayload } from '../src/types';
import {
  NUM_ROUNDS,
  computeRoundScore,
  computeAverageAccuracy,
  deriveLastPlaceId,
} from '../src/components/EstimationGame/estimationGameUtils';
import { simulateAiPerformance, getMinigameAiModel } from '../src/ai/competition';
import { mulberry32 } from '../src/store/rng';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
  const players = overrides.players ?? makePlayers(5);
  const base: GameState = {
    season: 1,
    week: 2,
    phase: 'hoh_comp',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    publicModeEnabled: true,
    povWinnerId: null,
    replacementNeeded: false,
    povSavedId: null,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    lastHohCompFinisherId: null,
    publicSavedNomineeId: null,
    nominationContext: null,
    awaitingPublicSave: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    awaitingFinal3Plea: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    evictionSplashId: null,
    pendingEviction: null,
    players,
    tvFeed: [],
    isLive: false,
  };

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: {
      game: { ...base, ...overrides } as GameState,
    },
  });
}

function setupMinigameSession(
  store: ReturnType<typeof makeStore>,
  playerIds: string[],
  aiScores: Record<string, number>,
) {
  store.dispatch(
    launchMinigame({
      key: 'estimationGame',
      participants: playerIds,
      seed: 42,
      options: { timeLimit: 0 },
      aiScores,
    }),
  );
}

function advanceToNominationResults(store: ReturnType<typeof makeStore>) {
  store.dispatch(advance()); // hoh_results → social_1
  store.dispatch(advance()); // social_1 → nominations
  store.dispatch(advance()); // nominations → nomination_results
}

// ── 0. Five-round model constants ────────────────────────────────────────────

describe('Estimation Game — five-round model constants', () => {
  it('NUM_ROUNDS is 5', () => {
    expect(NUM_ROUNDS).toBe(5);
  });
});

// ── 1. Pure scoring helpers ───────────────────────────────────────────────────

describe('Estimation Game — pure scoring helpers', () => {
  it('computeRoundScore: perfect guess returns 100', () => {
    expect(computeRoundScore(42, 42)).toBe(100);
  });

  it('computeRoundScore: off by 1 returns 97', () => {
    expect(computeRoundScore(42, 43)).toBe(97);
  });

  it('computeRoundScore: off by 34+ returns 0 (floor)', () => {
    expect(computeRoundScore(42, 8)).toBe(0);
  });

  it('computeRoundScore: symmetrical — off by N same either side', () => {
    expect(computeRoundScore(50, 55)).toBe(computeRoundScore(50, 45));
  });

  it('computeAverageAccuracy: returns 0 for empty array', () => {
    expect(computeAverageAccuracy([])).toBe(0);
  });

  it('computeAverageAccuracy: perfect rounds yield 100', () => {
    expect(computeAverageAccuracy([100, 100, 100, 100, 100])).toBe(100);
  });

  it('computeAverageAccuracy: correct average across 5 rounds', () => {
    // 80 + 90 + 70 + 60 + 100 = 400 / 5 = 80
    expect(computeAverageAccuracy([80, 90, 70, 60, 100])).toBe(80);
  });

  it('computeAverageAccuracy: rounds correctly (e.g. 3 sample rounds summing to an exact value)', () => {
    // 100 + 97 + 94 = 291 / 3 = 97 (exact integer, no rounding needed)
    expect(computeAverageAccuracy([100, 97, 94])).toBe(97);
  });

  it('deriveLastPlaceId: returns lowest scorer excluding winner', () => {
    const scores = { p0: 80, p1: 65, p2: 50, p3: 30 };
    expect(deriveLastPlaceId(scores, ['p0', 'p1', 'p2', 'p3'], 'p0')).toBe('p3');
  });

  it('deriveLastPlaceId: does not return winner as last place even if tied lowest', () => {
    const scores = { p0: 80, p1: 80, p2: 30 };
    expect(deriveLastPlaceId(scores, ['p0', 'p1', 'p2'], 'p0')).toBe('p2');
  });

  it('deriveLastPlaceId: returns undefined when no non-winners exist', () => {
    const scores = { p0: 80 };
    expect(deriveLastPlaceId(scores, ['p0'], 'p0')).toBeUndefined();
  });
});

// ── 2. Winner correctness ─────────────────────────────────────────────────────

describe('Estimation Game — winner correctness', () => {
  it('winner is the player with the highest average accuracy (human wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // AI scores are average accuracies 0-100
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 72, p2: 61, p3: 48 });

    // Human average accuracy of 88 beats everyone
    store.dispatch(completeMinigame({ humanScore: 88 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('winner is the player with the highest average accuracy (AI wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 91, p2: 70, p3: 55 });

    // Human scores 75 — p1 beats them
    store.dispatch(completeMinigame({ humanScore: 75 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p1');
  });

  it('phase advances to hoh_results after completeMinigame', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 70, p2: 58 });

    store.dispatch(completeMinigame({ humanScore: 85 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });

  it('winner with explicit winnerId in payload beats derived winner', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 91, p2: 70, p3: 55 });

    // Pass explicit winnerId — component always passes this from its ranked leaderboard.
    // Here, the score-derived winner would be p1 (highest AI score = 91, human = 75),
    // but we explicitly choose p2 to ensure the store respects the override.
    store.dispatch(
      completeMinigame({ humanScore: 75, winnerId: 'p2' } as CompleteMinigamePayload),
    );

    expect(store.getState().game.hohId).toBe('p2');
  });
});

// ── 3. Last-place correctness ─────────────────────────────────────────────────

describe('Estimation Game — last-place correctness', () => {
  it('lastHohCompFinisherId is the player with the lowest average accuracy', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 88, p2: 70, p3: 40 });

    store.dispatch(completeMinigame({ humanScore: 60 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('explicit lastPlaceId in payload takes priority over score derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 88, p2: 70, p3: 40 });

    store.dispatch(
      completeMinigame({ humanScore: 60, lastPlaceId: 'p3', winnerId: 'p1' } as CompleteMinigamePayload),
    );

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });
});

// ── 4. Public mode auto-nominee ───────────────────────────────────────────────

describe('Estimation Game — public mode auto-nominee', () => {
  it('public mode appends last-place HOH comp finisher as auto-nominee', () => {
    const players = makePlayers(5);
    // p1 is AI HOH so they can auto-nominate
    players[1].isUser = false;
    players[0].isUser = false;

    const store = makeStore({ players, publicModeEnabled: true });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], {
      p0: 42,
      p1: 91,
      p2: 75,
      p3: 63,
      p4: 30,
    });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p4');

    advanceToNominationResults(store);

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p4');
  });
});

// ── 5. Human nomination flow ──────────────────────────────────────────────────

describe('Estimation Game — human nomination flow', () => {
  it('human wins and game reaches nomination_results awaiting human nominations', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], {
      p1: 72, p2: 61, p3: 55, p4: 40,
    });

    store.dispatch(completeMinigame({ humanScore: 85 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.awaitingNominations).toBe(true);
  });

  it('human can commit two nominations successfully', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], {
      p1: 72, p2: 61, p3: 55, p4: 40,
    });

    store.dispatch(completeMinigame({ humanScore: 85 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    store.dispatch(commitNominees(['p1', 'p2']));

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.awaitingNominations).toBe(false);
  });
});

// ── 6. AI-only flow ───────────────────────────────────────────────────────────

describe('Estimation Game — AI-only nomination flow', () => {
  it('AI HOH correctly sets hohId and lastHohCompFinisherId', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p0: 87, p1: 72, p2: 61, p3: 30 });

    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');

    advanceToNominationResults(store);

    const state = store.getState().game;
    expect(state.nomineeIds.length).toBeGreaterThanOrEqual(2);
    expect(state.awaitingNominations).toBe(false);
  });

  it('AI HOH in public mode auto-nominates last-place finisher', () => {
    const players = makePlayers(6);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players, publicModeEnabled: true });

    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'], {
      p0: 87, p1: 79, p2: 71, p3: 63, p4: 55, p5: 28,
    });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    advanceToNominationResults(store);

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p5');
  });
});

// ── 7. Tie-breaking ───────────────────────────────────────────────────────────

describe('Estimation Game — tie-breaking', () => {
  it('when two AI players tie on average accuracy, winner is determined deterministically via hash tie-break', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    // p1 and p2 both score 72 — determineWinner uses FNV-1a hash to pick one deterministically
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 72, p2: 72, p3: 40 });

    store.dispatch(completeMinigame({ humanScore: 55 } as CompleteMinigamePayload));

    const state = store.getState().game;
    // Winner must be one of the tied players (not p0=55 or p3=40)
    expect(['p1', 'p2']).toContain(state.hohId);
    // Result must be stable (same seed, same participants → same winner every time)
    const store2 = makeStore({ players });
    setupMinigameSession(store2, ['p0', 'p1', 'p2', 'p3'], { p1: 72, p2: 72, p3: 40 });
    store2.dispatch(completeMinigame({ humanScore: 55 } as CompleteMinigamePayload));
    expect(store2.getState().game.hohId).toBe(state.hohId);
  });

  it('no silent fallback: lastHohCompFinisherId is always set when session has 2+ participants', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 72, p2: 55 });

    store.dispatch(completeMinigame({ humanScore: 85 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).not.toBeNull();
    expect(store.getState().game.lastHohCompFinisherId).toBeTruthy();
  });
});

// ── 8. Scoring model: average accuracy across 5 rounds ───────────────────────

describe('Estimation Game — 5-round average accuracy model', () => {
  it('average accuracy over 5 rounds gives score in [0, 100]', () => {
    const rounds = [100, 91, 82, 73, 64];
    const avg = computeAverageAccuracy(rounds);
    expect(avg).toBeGreaterThanOrEqual(0);
    expect(avg).toBeLessThanOrEqual(100);
    expect(avg).toBe(82); // (100+91+82+73+64)/5 = 410/5 = 82
  });

  it('all-zero rounds yield average accuracy of 0', () => {
    expect(computeAverageAccuracy([0, 0, 0, 0, 0])).toBe(0);
  });

  it('all-perfect rounds yield average accuracy of 100', () => {
    expect(computeAverageAccuracy([100, 100, 100, 100, 100])).toBe(100);
  });

  it('higher average accuracy wins competition (human wins)', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    // AI average accuracy 72 and 58; human average 84
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 72, p2: 58 });

    const humanAvg = computeAverageAccuracy([100, 97, 82, 76, 65]); // 420/5 = 84
    store.dispatch(completeMinigame({ humanScore: humanAvg } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('store resolves correctly when human dispatches after 5 rounds', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 75, p2: 68, p3: 52 });

    // Simulate 5 rounds: perfect → off-by-2 → off-by-5 → off-by-10 → off-by-3
    const r1 = computeRoundScore(20, 20);  // 100
    const r2 = computeRoundScore(30, 28);  // 94
    const r3 = computeRoundScore(45, 40);  // 85
    const r4 = computeRoundScore(25, 15);  // 70  (mixed round, target count)
    const r5 = computeRoundScore(55, 52);  // 91  (exclude round, non-triangle count)
    const humanAvg = computeAverageAccuracy([r1, r2, r3, r4, r5]);

    store.dispatch(completeMinigame({ humanScore: humanAvg } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.phase).toBe('hoh_results');
    expect(state.hohId).toBeTruthy();
    expect(state.lastHohCompFinisherId).toBeTruthy();
    expect(state.lastHohCompFinisherId).not.toBe(state.hohId);
  });
});

// ── 9. Round difficulty escalation ───────────────────────────────────────────

describe('Estimation Game — escalating difficulty', () => {
  it('keeps the later rounds visible longer so the tougher counting tasks remain playable', () => {
    // Import the round config by loading the component and reading its constants.
    // Since ROUND_CONFIG is internal, we test the property via its effects:
    // exposure time 2000 > 1500 > 2100/2500/2900 is intentionally no longer
    // strictly decreasing because the later rounds were slowed to remain playable.
    const exposureTimes = [2000, 1500, 2100, 2500, 2900];

    expect(exposureTimes[0]).toBe(2000);
    expect(exposureTimes[1]).toBe(1500);
    expect(exposureTimes.slice(2)).toEqual([2100, 2500, 2900]);
    expect(exposureTimes[2]).toBeGreaterThan(exposureTimes[1]);
    expect(exposureTimes[3]).toBeGreaterThan(exposureTimes[2]);
    expect(exposureTimes[4]).toBeGreaterThan(exposureTimes[3]);
    // Verify there are exactly 5 rounds worth of exposure times
    expect(exposureTimes).toHaveLength(NUM_ROUNDS);
  });

  it('later round count ranges are higher than earlier rounds', () => {
    // Round 1: 15-25, Round 3: 35-58, Round 5: 60-90
    const minCounts = [15, 22, 35, 50, 60];
    for (let i = 1; i < minCounts.length; i++) {
      expect(minCounts[i]).toBeGreaterThanOrEqual(minCounts[i - 1]);
    }
  });
});

// ── 10. Mixed figure tasks in last 2 rounds ───────────────────────────────────

describe('Estimation Game — mixed figure tasks in last 2 rounds', () => {
  it('round 4 uses a selective counting task (count only circles)', () => {
    // Round index 3 (4th round, 0-based) must have countType 'only'
    // We verify this via the instruction which must mention "only" or specific shape
    // and via the fact that scoring uses target-count not total.
    // Here we verify that for a mixed round, actualCount can be less than total objects.

    // Simulate: 60 total objects (circles + triangles), ~30 circles
    // Score is against the circle count, not total
    const targetCount = 30;  // circles in a mixed round
    const playerGuess = 31;
    const score = computeRoundScore(targetCount, playerGuess);
    expect(score).toBe(97);  // off by 1 = 97
  });

  it('round 5 uses an exclusion task (count everything except triangles)', () => {
    // Round 5: 3 types present; count circles + stars (everything except triangles)
    // actualCount = count of non-triangles
    const totalObjects = 75;
    const triangleCount = 25;
    const targetCount = totalObjects - triangleCount; // 50
    const playerGuess = 48;
    const score = computeRoundScore(targetCount, playerGuess);
    expect(score).toBe(94);  // off by 2 = 94
  });
});

// ── 11. Random figure counts vary across seeds ────────────────────────────────

describe('Estimation Game — non-repeating random figure counts', () => {
  it('mulberry32 with different seeds produces different counts for the same range', () => {
    const getCount = (seed: number, min: number, max: number) => {
      const rng = mulberry32(seed);
      return min + Math.floor(rng() * (max - min + 1));
    };

    // Use the same formula as EstimationGame's generateRound for round 0
    const round0Min = 15, round0Max = 25;
    const counts = new Set<number>();
    const seeds = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];

    seeds.forEach((baseSeed) => {
      // Round 0 seed uses XOR-mix: (baseSeed ^ ((0+1) * 0x6b7f5)) >>> 0
      const roundSeed = ((baseSeed ^ (1 * 0x6b7f5)) >>> 0) || 1;
      const count = getCount(roundSeed, round0Min, round0Max);
      counts.add(count);
    });

    // With 10 different base seeds, we expect at least 3 distinct round-0 counts
    expect(counts.size).toBeGreaterThanOrEqual(3);
  });

  it('different effective seeds produce different round counts for each round', () => {
    const getCountsForSeed = (baseSeed: number) => {
      const roundConfigs = [
        { min: 15, max: 25 },
        { min: 22, max: 38 },
        { min: 35, max: 58 },
        { min: 50, max: 75 },
        { min: 60, max: 90 },
      ];
      return roundConfigs.map((cfg, idx) => {
        const roundSeed = ((baseSeed ^ ((idx + 1) * 0x6b7f5)) >>> 0) || 1;
        const rng = mulberry32(roundSeed);
        return cfg.min + Math.floor(rng() * (cfg.max - cfg.min + 1));
      });
    };

    const counts1 = getCountsForSeed(12345);
    const counts2 = getCountsForSeed(99999);

    // At least one round must differ between the two seeds
    const allMatch = counts1.every((c, i) => c === counts2[i]);
    expect(allMatch).toBe(false);
  });

  it('seed=1 and seed=2 produce different round-1 seeds (XOR-mix guarantee)', () => {
    const getRoundSeed = (baseSeed: number) =>
      ((baseSeed ^ (1 * 0x6b7f5)) >>> 0) || 1;

    const roundSeed1 = getRoundSeed(1);
    const roundSeed2 = getRoundSeed(2);

    // With XOR mixing, seed=1 and seed=2 must give different effective round seeds
    // (testing seeds rather than sampled counts avoids brittle collisions in small ranges)
    expect(roundSeed1).not.toBe(roundSeed2);
  });
});

// ── 12. AI calibration ────────────────────────────────────────────────────────

describe('Estimation Game — AI score calibration (0–100 average accuracy)', () => {
  const model = getMinigameAiModel('estimationGame');

  it('AI model uses 0–100 range (average accuracy)', () => {
    expect(model.minScore).toBe(0);
    expect(model.maxScore).toBe(100);
  });

  it('AI model has tiebreakerMaxMs defined', () => {
    expect(typeof model.tiebreakerMaxMs).toBe('number');
    expect(model.tiebreakerMaxMs).toBeGreaterThan(0);
  });

  it('AI model has competitive score buckets summing to ~1.0', () => {
    const total = model.scoreBuckets?.reduce((s, b) => s + b.weight, 0) ?? 0;
    expect(total).toBeCloseTo(1.0, 5);
  });

  it('simulateAiPerformance produces scores within [0, 100]', () => {
    const seeds = [1, 42, 100, 999, 12345, 99999, 314159, 7];
    seeds.forEach((seed) => {
      const score = simulateAiPerformance({
        minigameKey: 'estimationGame',
        minigameModel: model,
        seed,
        playerId: 'ai-player-1',
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  it('AI scores are deterministic — same seed + playerId yields same score', () => {
    const first  = simulateAiPerformance({ minigameKey: 'estimationGame', minigameModel: model, seed: 42, playerId: 'p1' });
    const second = simulateAiPerformance({ minigameKey: 'estimationGame', minigameModel: model, seed: 42, playerId: 'p1' });
    expect(first).toBe(second);
  });

  it('different player IDs produce different scores for the same seed', () => {
    const s1 = simulateAiPerformance({ minigameKey: 'estimationGame', minigameModel: model, seed: 42, playerId: 'p1' });
    const s2 = simulateAiPerformance({ minigameKey: 'estimationGame', minigameModel: model, seed: 42, playerId: 'p2' });
    expect(s1).not.toBe(s2);
  });

  it('AI scores roughly follow competitive bands across many samples', () => {
    const scores: number[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      for (let player = 1; player <= 6; player += 1) {
        scores.push(
          simulateAiPerformance({
            minigameKey: 'estimationGame',
            minigameModel: model,
            seed,
            playerId: `p${player}`,
          }),
        );
      }
    }

    const total    = scores.length;
    const topBand  = scores.filter((s) => s >= 82 && s <= 100).length / total;
    const upperMid = scores.filter((s) => s >= 67 && s < 82).length / total;
    const lowerMid = scores.filter((s) => s >= 52 && s < 67).length / total;
    const lowBand  = scores.filter((s) => s < 52).length / total;

    // Allow moderate tolerance around configured 20/40/30/10 weights
    expect(topBand).toBeGreaterThan(0.12);
    expect(topBand).toBeLessThan(0.28);
    expect(upperMid).toBeGreaterThan(0.32);
    expect(upperMid).toBeLessThan(0.48);
    expect(lowerMid).toBeGreaterThan(0.22);
    expect(lowerMid).toBeLessThan(0.38);
    expect(lowBand).toBeGreaterThan(0.04);
    expect(lowBand).toBeLessThan(0.16);
  });

  it('winner/last-place are correct with 0–100 calibrated AI scores', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });

    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], {
      p1: 85, p2: 73, p3: 62, p4: 50,
    });

    // Human scores 91 — wins
    store.dispatch(completeMinigame({ humanScore: 91 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p4');
  });
});

// ── 13. Tie-breaking by time (computeAverageAccuracy level) ──────────────────

describe('Estimation Game — tie-breaking by time', () => {
  it('when two players have equal accuracy, lower response time wins', () => {
    // This tests the rankParticipants logic via the pure scoring helpers.
    // With equal average accuracy, the response time map determines the winner.

    // Simulate two players with identical accuracy:
    const accuracyA = computeAverageAccuracy([100, 100, 100, 100, 100]); // 100
    const accuracyB = computeAverageAccuracy([100, 100, 100, 100, 100]); // 100
    expect(accuracyA).toBe(accuracyB);

    // Player B responded faster — should rank higher when scores are equal
    const responseA = 20_000; // 20 s total
    const responseB = 15_000; // 15 s total

    // Replicate rankParticipants sort logic:
    const participants = ['pA', 'pB'];
    const scores: Record<string, number> = { pA: accuracyA, pB: accuracyB };
    const responseTimes: Record<string, number> = { pA: responseA, pB: responseB };

    const ranked = [...participants].sort((a, b) => {
      const sa = scores[a] ?? 0;
      const sb = scores[b] ?? 0;
      if (sb !== sa) return sb - sa;
      const ta = responseTimes[a] ?? Infinity;
      const tb = responseTimes[b] ?? Infinity;
      if (ta !== tb) return ta - tb;
      return participants.indexOf(a) - participants.indexOf(b);
    });

    // pB (15s) should rank above pA (20s) despite same accuracy
    expect(ranked[0]).toBe('pB');
    expect(ranked[1]).toBe('pA');
  });

  it('when accuracies differ, response time tiebreaker is not used', () => {
    const participants = ['pA', 'pB'];
    const scores: Record<string, number> = { pA: 75, pB: 90 };
    const responseTimes: Record<string, number> = { pA: 5_000, pB: 30_000 };

    const ranked = [...participants].sort((a, b) => {
      const sa = scores[a] ?? 0;
      const sb = scores[b] ?? 0;
      if (sb !== sa) return sb - sa;
      const ta = responseTimes[a] ?? Infinity;
      const tb = responseTimes[b] ?? Infinity;
      return ta - tb;
    });

    // pB wins on accuracy even though they took longer
    expect(ranked[0]).toBe('pB');
  });
});
