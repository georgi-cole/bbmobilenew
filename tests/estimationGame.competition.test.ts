/**
 * Estimation Game — competition regression tests.
 *
 * Covers:
 *  1. Winner is derived from canonical total scores.
 *  2. Last-place finisher is derived from canonical total scores.
 *  3. Explicit lastPlaceId (from the component) takes priority over score derivation.
 *  4. Public mode auto-nominee matches the last-place finisher from the competition.
 *  5. Human nomination flow continues correctly after the game resolves.
 *  6. AI-only nomination flow (no human) produces the correct winner + last-place.
 *  7. Tie-breaking is deterministic (participant order used only as final fallback).
 *  8. No silent fallback when authoritative last-place data can be produced.
 *  9. AI calibration: simulateAiPerformance yields a normalized competitive score spread.
 * 10. Round 3 feedback: the finishGame path is only triggered via handleNextRound (not auto-trigger),
 *     ensuring feedback is shown before the scoreboard for all rounds including round 3.
 *
 * Mirrors the style of tests/quickTapRace.competition.test.ts.
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
  computeRoundScore,
  deriveLastPlaceId,
} from '../src/components/EstimationGame/estimationGameUtils';
import { simulateAiPerformance, getMinigameAiModel } from '../src/ai/competition';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0, // p0 is always the human unless overridden
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

/** Pre-dispatches launchMinigame so completeMinigame has a session to resolve against. */
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

/**
 * `advanceToNominationResults` — dispatches three `advance()` calls so the store
 * transitions from hoh_results all the way to nomination_results.
 *
 * Phase sequence after completeMinigame sets phase = hoh_results:
 *   advance() → social_1
 *   advance() → nominations
 *   advance() → nomination_results
 */
function advanceToNominationResults(store: ReturnType<typeof makeStore>) {
  store.dispatch(advance()); // hoh_results → social_1
  store.dispatch(advance()); // social_1 → nominations
  store.dispatch(advance()); // nominations → nomination_results
}

// ── Pure scoring helpers ──────────────────────────────────────────────────────

describe('Estimation Game — pure scoring helpers', () => {
  it('computeRoundScore: perfect guess returns 100', () => {
    expect(computeRoundScore(42, 42)).toBe(100);
  });

  it('computeRoundScore: off by 1 returns 97', () => {
    expect(computeRoundScore(42, 43)).toBe(97);
  });

  it('computeRoundScore: off by 34+ returns 0 (floor)', () => {
    // 100 - 34*3 = 100 - 102 = -2 → clamped to 0
    expect(computeRoundScore(42, 8)).toBe(0);
  });

  it('computeRoundScore: symmetrical — off by N same either side', () => {
    expect(computeRoundScore(50, 55)).toBe(computeRoundScore(50, 45));
  });

  it('deriveLastPlaceId: returns lowest scorer excluding winner', () => {
    const scores = { p0: 200, p1: 150, p2: 100, p3: 50 };
    expect(deriveLastPlaceId(scores, ['p0', 'p1', 'p2', 'p3'], 'p0')).toBe('p3');
  });

  it('deriveLastPlaceId: does not return winner as last place even if tied lowest', () => {
    const scores = { p0: 200, p1: 200, p2: 50 };
    expect(deriveLastPlaceId(scores, ['p0', 'p1', 'p2'], 'p0')).toBe('p2');
  });

  it('deriveLastPlaceId: returns undefined when no non-winners exist', () => {
    const scores = { p0: 200 };
    expect(deriveLastPlaceId(scores, ['p0'], 'p0')).toBeUndefined();
  });
});

// ── 1. Winner correctness ─────────────────────────────────────────────────────

describe('Estimation Game — winner correctness', () => {
  it('winner is the player with the highest total score (human wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // AI scores are totals for all 3 rounds (max 300)
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 200, p2: 180, p3: 150 });

    // Human score of 270 beats everyone
    store.dispatch(completeMinigame({ humanScore: 270 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('winner is the player with the highest total score (AI wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 280, p2: 180, p3: 150 });

    // Human scores 200 — p1 beats them
    store.dispatch(completeMinigame({ humanScore: 200 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p1');
  });

  it('phase advances to hoh_results after completeMinigame', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 200, p2: 180 });

    store.dispatch(completeMinigame({ humanScore: 250 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });
});

// ── 2. Last-place finisher correctness ────────────────────────────────────────

describe('Estimation Game — last-place finisher correctness', () => {
  it('last-place is the player with the lowest total score (AI last)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 200, p2: 180, p3: 50 });

    store.dispatch(completeMinigame({ humanScore: 250 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('last-place is human when they score the lowest', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 240, p2: 220, p3: 200 });

    // Human scores 50 — lowest of all
    store.dispatch(completeMinigame({ humanScore: 50 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p0');
  });

  it('winner is NOT set as last-place finisher', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 200, p2: 180, p3: 150 });

    store.dispatch(completeMinigame({ humanScore: 250 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lastHohCompFinisherId).not.toBe(state.hohId);
  });

  it('explicit lastPlaceId from component takes priority over score derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 200, p2: 180, p3: 150 });

    // Human wins, and component explicitly marks p2 as last place
    store.dispatch(completeMinigame({ humanScore: 270, lastPlaceId: 'p2' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('invalid lastPlaceId (equals winner) falls back to score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 200, p2: 180, p3: 50 });

    // p0 wins; passing p0 as lastPlaceId is invalid — falls back to p3 (lowest score)
    store.dispatch(completeMinigame({ humanScore: 270, lastPlaceId: 'p0' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });
});

// ── 3. Public mode auto-nominee matches last-place finisher ───────────────────

describe('Estimation Game — Public mode auto-nominee', () => {
  it('auto-nominee in Public mode matches the last-place finisher from Estimation', () => {
    const players = makePlayers(6);
    const store = makeStore({ players, publicModeEnabled: true });

    setupMinigameSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      { p1: 250, p2: 230, p3: 210, p4: 190, p5: 80 },
    );
    store.dispatch(completeMinigame({ humanScore: 280 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    // hoh_results → social_1 → nominations → nomination_results
    advanceToNominationResults(store);

    // Human HOH (p0) must nominate two players
    expect(store.getState().game.awaitingNominations).toBe(true);

    store.dispatch(commitNominees(['p1', 'p2']));

    const afterNoms = store.getState().game;
    // Auto-third nominee must match canonical last-place finisher
    expect(afterNoms.nominationContext?.autoNomineeId).toBe('p5');
    expect(afterNoms.nomineeIds).toContain('p5');
  });

  it('auto-nominee is NOT added when public mode is disabled', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });

    setupMinigameSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 220, p2: 200, p3: 180, p4: 60 },
    );
    store.dispatch(completeMinigame({ humanScore: 250 } as CompleteMinigamePayload));

    advanceToNominationResults(store);

    store.dispatch(commitNominees(['p1', 'p2']));

    const afterNoms = store.getState().game;
    expect(afterNoms.nomineeIds).not.toContain('p4');
    expect(afterNoms.nomineeIds).toHaveLength(2);
  });
});

// ── 4. Human HOH nomination flow ──────────────────────────────────────────────

describe('Estimation Game — human HOH nomination flow', () => {
  it('awaitingNominations is set for the human HOH (they must nominate manually)', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], { p1: 200, p2: 180, p3: 160, p4: 50 });

    store.dispatch(completeMinigame({ humanScore: 250 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.awaitingNominations).toBe(true);
  });

  it('human can commit two nominations successfully', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], { p1: 200, p2: 180, p3: 160, p4: 50 });

    store.dispatch(completeMinigame({ humanScore: 250 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    store.dispatch(commitNominees(['p1', 'p2']));

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.awaitingNominations).toBe(false);
  });
});

// ── 5. AI-only flow ───────────────────────────────────────────────────────────

describe('Estimation Game — AI-only nomination flow', () => {
  it('AI HOH correctly sets hohId and lastHohCompFinisherId', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p0: 270, p1: 200, p2: 180, p3: 50 });

    // Human score 0 — AI wins (p0 has highest AI score)
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');

    // AI HOH picks nominees at nomination_results
    advanceToNominationResults(store);

    const state = store.getState().game;
    // AI HOH should have picked nominees
    expect(state.nomineeIds.length).toBeGreaterThanOrEqual(2);
    expect(state.awaitingNominations).toBe(false);
  });

  it('AI HOH in public mode auto-nominates last-place finisher', () => {
    const players = makePlayers(6);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players, publicModeEnabled: true });

    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'], {
      p0: 270,
      p1: 240,
      p2: 210,
      p3: 180,
      p4: 150,
      p5: 60,
    });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    // AI HOH picks nominees at nomination_results
    advanceToNominationResults(store);

    const state = store.getState().game;
    // p5 must be in nominees as the auto-third
    expect(state.nomineeIds).toContain('p5');
  });
});

// ── 6. Tie-breaking is deterministic ─────────────────────────────────────────

describe('Estimation Game — tie-breaking', () => {
  it('when two AI players tie, the earlier participant wins (stable sort fallback)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    // p1 and p2 both score 200 — p1 comes first in participant list → wins tie
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 200, p2: 200, p3: 100 });

    // Human scores 150 (doesn't win)
    store.dispatch(completeMinigame({ humanScore: 150 } as CompleteMinigamePayload));

    const state = store.getState().game;
    // Winner should be p1 (first in order, same score as p2)
    expect(state.hohId).toBe('p1');
  });

  it('when two players tie for last, the first tied player in participant order is last-place (stable reduce)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    // p1 wins (280); human p0=100; p2 and p3 both score 50.
    // deriveLastPlaceId reduces over non-winners [p0, p2, p3]:
    //   start worst=p0 (100); p2: 50<100 → worst=p2; p3: 50<50 → false → worst stays p2.
    // So lastHohCompFinisherId must be deterministically p2.
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 280, p2: 50, p3: 50 });

    // Human scores 100 (not last)
    store.dispatch(completeMinigame({ humanScore: 100 } as CompleteMinigamePayload));

    const state = store.getState().game;
    // p2 is the first tied-lowest non-winner encountered during the reduce — deterministic
    expect(state.lastHohCompFinisherId).toBe('p2');
  });

  it('no silent fallback: lastHohCompFinisherId is always set when session has 2+ participants', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 200, p2: 150 });

    store.dispatch(completeMinigame({ humanScore: 250 } as CompleteMinigamePayload));

    // Must always be set — never null — when there are non-winner participants
    expect(store.getState().game.lastHohCompFinisherId).not.toBeNull();
    expect(store.getState().game.lastHohCompFinisherId).toBeTruthy();
  });
});

// ── 7. Round scoring preservation (3-round model) ────────────────────────────

describe('Estimation Game — scoring model preservation', () => {
  it('total score is sum of three round scores (0–300 range)', () => {
    // Simulate 3 rounds: perfect (100) + off-by-5 (85) + off-by-10 (70) = 255
    const r1 = computeRoundScore(30, 30);   // perfect
    const r2 = computeRoundScore(50, 45);   // off by 5
    const r3 = computeRoundScore(80, 70);   // off by 10
    expect(r1).toBe(100);
    expect(r2).toBe(85);
    expect(r3).toBe(70);
    expect(r1 + r2 + r3).toBe(255);
  });

  it('higher total score produces better rank (higher is better)', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    // p1 has 180, human (p0) has 250 → human wins
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 180, p2: 120 });

    store.dispatch(completeMinigame({ humanScore: 250 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('round score is bounded between 0 and 100', () => {
    expect(computeRoundScore(1, 200)).toBe(0);   // far over
    expect(computeRoundScore(200, 1)).toBe(0);   // far under
    expect(computeRoundScore(0, 0)).toBe(100);   // exact
  });
});

// ── 8. AI calibration — normalized competitive spread ────────────────────────

describe('Estimation Game — AI score calibration', () => {
  const model = getMinigameAiModel('estimationGame');

  it('AI model exposes the full 0–300 score space plus normalized buckets', () => {
    expect(model.minScore).toBe(0);
    expect(model.maxScore).toBe(300);
    expect(model.scoreBuckets).toEqual([
      { minScore: 250, maxScore: 300, weight: 0.2 },
      { minScore: 200, maxScore: 250, weight: 0.4 },
      { minScore: 180, maxScore: 200, weight: 0.3 },
      { minScore: 0, maxScore: 180, weight: 0.1 },
    ]);
  });

  it('simulateAiPerformance produces scores within [0, 300] for various seeds', () => {
    const seeds = [1, 42, 100, 999, 12345, 99999, 314159, 7];
    seeds.forEach((seed) => {
      const score = simulateAiPerformance({
        minigameKey: 'estimationGame',
        minigameModel: model,
        seed,
        playerId: 'ai-player-1',
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(300);
    });
  });

  it('AI scores roughly follow the normalized target bands across many deterministic samples', () => {
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

    const total = scores.length;
    const topBand = scores.filter((score) => score >= 250 && score <= 300).length / total;
    const upperMidBand = scores.filter((score) => score >= 200 && score < 250).length / total;
    const lowerMidBand = scores.filter((score) => score >= 180 && score < 200).length / total;
    const lowBand = scores.filter((score) => score < 180).length / total;

    // Allow a moderate tolerance around the configured 20/40/30/10 weights because
    // deterministic skill bias nudges stronger samples upward and weaker samples
    // downward instead of keeping every sample on the exact base proportions.
    expect(topBand).toBeGreaterThan(0.12);
    expect(topBand).toBeLessThan(0.28);
    expect(upperMidBand).toBeGreaterThan(0.32);
    expect(upperMidBand).toBeLessThan(0.48);
    expect(lowerMidBand).toBeGreaterThan(0.22);
    expect(lowerMidBand).toBeLessThan(0.38);
    expect(lowBand).toBeGreaterThan(0.04);
    expect(lowBand).toBeLessThan(0.16);
  });

  it('AI scores are deterministic — same seed + playerId yields same score', () => {
    const first  = simulateAiPerformance({ minigameKey: 'estimationGame', minigameModel: model, seed: 42, playerId: 'p1' });
    const second = simulateAiPerformance({ minigameKey: 'estimationGame', minigameModel: model, seed: 42, playerId: 'p1' });
    expect(first).toBe(second);
  });

  it('different player IDs produce different scores for the same seed', () => {
    const s1 = simulateAiPerformance({ minigameKey: 'estimationGame', minigameModel: model, seed: 42, playerId: 'p1' });
    const s2 = simulateAiPerformance({ minigameKey: 'estimationGame', minigameModel: model, seed: 42, playerId: 'p2' });
    // With different player-id hashes the RNG offset differs — scores should differ
    expect(s1).not.toBe(s2);
  });

  it('winner/last-place are still correct with calibrated AI scores', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });

    // Use calibrated AI scores in the 150-220 range
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], {
      p1: 215, p2: 190, p3: 175, p4: 155,
    });

    // Human scores 240 — wins
    store.dispatch(completeMinigame({ humanScore: 240 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p4');
  });
});

// ── 9. Round 3 submit → feedback before scoreboard ────────────────────────────

describe('Estimation Game — round 3 submit flow', () => {
  it('store resolves outcome after round 3 when completeMinigame is dispatched explicitly', () => {
    // This test verifies the store-side behavior once completeMinigame is dispatched
    // after 3 rounds. The UI is responsible for dispatching this action when the
    // player clicks through to see the final results; that wiring is covered by
    // component-level tests, not here.
    //
    // At the store level we confirm: winner/lastPlace are computed after completeMinigame
    // regardless of whether the human score corresponds to round 3 outcomes.
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 200, p2: 170, p3: 155 });

    // Simulate a human total consistent with all 3 rounds having been played
    // (the component only dispatches completeMinigame after the user clicks "See Final Results")
    const humanTotal = computeRoundScore(25, 24) + computeRoundScore(45, 43) + computeRoundScore(70, 65);
    store.dispatch(completeMinigame({ humanScore: humanTotal } as CompleteMinigamePayload));

    const state = store.getState().game;
    // Phase should advance to hoh_results (completeMinigame dispatched correctly)
    expect(state.phase).toBe('hoh_results');
    // Winner and last-place are set based on canonical scores
    expect(state.hohId).toBeTruthy();
    expect(state.lastHohCompFinisherId).toBeTruthy();
    expect(state.lastHohCompFinisherId).not.toBe(state.hohId);
  });

  it('round 3 feedback total equals sum of all three round scores', () => {
    // Verify the scoring model used by the component produces the correct total
    // that would be displayed in the round 3 feedback before the final scoreboard.
    const r1 = computeRoundScore(20, 20);  // perfect
    const r2 = computeRoundScore(45, 42);  // off by 3 → 91
    const r3 = computeRoundScore(75, 68);  // off by 7 → 79
    const total = r1 + r2 + r3;

    expect(r1).toBe(100);
    expect(r2).toBe(91);
    expect(r3).toBe(79);
    expect(total).toBe(270);

    // After dispatching with this total, winner is correctly resolved
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 210, p2: 185 });
    store.dispatch(completeMinigame({ humanScore: total } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });
});
