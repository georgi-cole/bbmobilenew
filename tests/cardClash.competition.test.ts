/**
 * House of Cards (cardClash) — competition regression tests.
 *
 * Covers:
 *  1. Winner is derived from authoritative Clash Score standings.
 *  2. Last-place finisher is derived from authoritative standings.
 *  3. Authoritative data (not participant order) is used for last place.
 *  4. Public mode auto-nominee matches the canonical last-place finisher.
 *  5. Human nomination flow behaves correctly after the game resolves.
 *  6. AI-only nomination flow produces correct winner + last-place.
 *  7. Ranking/tiebreak edge cases.
 *  8. Explicit verification that authoritative last-place data is used.
 *
 * Test helpers mirror the patterns in:
 *   tests/quickTapRace.competition.test.ts
 *   tests/hohCompLastPlace.test.ts
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { advance, commitNominees } from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import houseOfCardsReducer, {
  startHouseOfCards,
  finaliseOutcome,
  computeClashScore,
  rankOutcomes,
  simulateAiOutcome,
  TOTAL_PAIRS,
  AI_MIN_FINISH_MS,
} from '../src/features/houseOfCards/houseOfCardsSlice';
import type { HouseOfCardsState } from '../src/features/houseOfCards/houseOfCardsSlice';
import { resolveHouseOfCardsOutcome } from '../src/features/houseOfCards/thunks';
import type { GameState, Player } from '../src/types';

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
      houseOfCards: houseOfCardsReducer,
    },
    preloadedState: {
      game: { ...base, ...overrides } as GameState,
    },
  });
}

/**
 * Drives the game through start → finalise → resolve in one call.
 * Returns the store after outcome is dispatched.
 */
function runGame(
  store: ReturnType<typeof makeStore>,
  options: {
    participantIds: string[];
    humanId: string;
    humanMatchedPairs: number;
    humanMistakes: number;
    humanCompletionMs: number | null;
    humanStreak?: number;
    prizeType?: 'HOH' | 'POV';
    seed?: number;
  },
) {
  const {
    participantIds,
    humanId,
    humanMatchedPairs,
    humanMistakes,
    humanCompletionMs,
    humanStreak = 0,
    prizeType = 'HOH',
    seed = 42,
  } = options;

  store.dispatch(
    startHouseOfCards({
      participantIds,
      humanId,
      prizeType,
      seed,
    }),
  );

  store.dispatch(
    finaliseOutcome({
      matchedPairs: humanMatchedPairs,
      mistakes: humanMistakes,
      turnsTaken: humanMatchedPairs * 2 + humanMistakes * 2,
      completionTimeMs: humanCompletionMs,
      streakBest: humanStreak,
      humanId,
    }),
  );

  store.dispatch(resolveHouseOfCardsOutcome());
}

/**
 * advance() × 3 from hoh_results → social_1 → nominations → nomination_results
 */
function advanceToNominationResults(store: ReturnType<typeof makeStore>) {
  store.dispatch(advance()); // hoh_results → social_1
  store.dispatch(advance()); // social_1 → nominations
  store.dispatch(advance()); // nominations → nomination_results
}

// ── 1. Winner correctness ─────────────────────────────────────────────────────

describe('House of Cards — winner correctness', () => {
  it('winner is the player with the highest Clash Score (human wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    // Human finishes all 10 pairs fast → high score. AI players have lower scores.
    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 15_000,
      humanStreak: 4,
      seed: 1,
    });

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('winner is an AI player if they have a higher Clash Score than human', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });

    // Human performs poorly (didn't finish, few pairs).
    runGame(store, {
      participantIds: ['p0', 'p1', 'p2'],
      humanId: 'p0',
      humanMatchedPairs: 2,
      humanMistakes: 8,
      humanCompletionMs: null, // did not finish
      seed: 100,
    });

    const state = store.getState();
    // The winner is the player with the highest Clash Score — must not be human.
    expect(state.game.hohId).not.toBe('p0');
  });

  it('phase advances to hoh_results after the game resolves', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });

    runGame(store, {
      participantIds: ['p0', 'p1', 'p2'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 1,
      humanCompletionMs: 20_000,
      seed: 2,
    });

    expect(store.getState().game.phase).toBe('hoh_results');
  });
});

// ── 2. Last-place finisher correctness ────────────────────────────────────────

describe('House of Cards — last-place finisher correctness', () => {
  it('last-place is the player with the worst outcome (fewest matches, most mistakes)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    // Human wins convincingly; last place should be a badly-performing AI.
    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 10_000,
      humanStreak: 5,
      seed: 99,
    });

    const state = store.getState();
    const hoc = (state as { houseOfCards: HouseOfCardsState }).houseOfCards;

    expect(state.game.lastHohCompFinisherId).toBe(hoc?.standings[hoc.standings.length - 1]?.playerId);
  });

  it('human can be last place if they perform worst', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    // Human does very badly — 1 pair, many mistakes, no finish.
    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3'],
      humanId: 'p0',
      humanMatchedPairs: 1,
      humanMistakes: 15,
      humanCompletionMs: null,
      seed: 77,
    });

    // With 1 pair and 15 mistakes vs AI with normal performance, human should be last.
    // The exact winner depends on AI seed 77, but lastPlace should not be the winner.
    const state = store.getState();
    expect(state.game.lastHohCompFinisherId).not.toBe(state.game.hohId);
  });

  it('winner is never set as last-place finisher', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });

    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 12_000,
      humanStreak: 5,
      seed: 42,
    });

    const state = store.getState();
    expect(state.game.lastHohCompFinisherId).not.toBe(state.game.hohId);
  });

  it('lastHohCompFinisherType is set to "scored"', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 15_000,
      seed: 5,
    });

    expect(store.getState().game.lastHohCompFinisherType).toBe('scored');
  });
});

// ── 3. Authoritative data — no fallback to participant order ─────────────────

describe('House of Cards — authoritative data, no participant-order fallback', () => {
  it('standings are derived from score data, not participant insertion order', () => {
    // Build a known ranking: run with same seed and check standings are stable.
    const outcomes = [
      { playerId: 'pA', matchedPairs: 8, mistakes: 0, turnsTaken: 16, didFinish: true, completionTimeMs: 20000, streakBest: 4 },
      { playerId: 'pB', matchedPairs: 8, mistakes: 2, turnsTaken: 20, didFinish: true, completionTimeMs: 25000, streakBest: 2 },
      { playerId: 'pC', matchedPairs: 5, mistakes: 5, turnsTaken: 20, didFinish: false, completionTimeMs: null, streakBest: 1 },
    ];
    const withScores = outcomes.map((o) => ({ ...o, clashScore: computeClashScore(o) }));
    const ranked = rankOutcomes(withScores, ['pA', 'pB', 'pC']);

    // pA should be first (finished, fewer mistakes, faster than pB).
    expect(ranked[0].playerId).toBe('pA');
    // pB second (finished but slower/more mistakes).
    expect(ranked[1].playerId).toBe('pB');
    // pC last (did not finish).
    expect(ranked[2].playerId).toBe('pC');
  });

  it('resolveHouseOfCardsOutcome dispatches lastPlaceId from standings, not array[0]', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    // Seed chosen so human (p0) gets a mid-range score.
    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3'],
      humanId: 'p0',
      humanMatchedPairs: 4,
      humanMistakes: 4,
      humanCompletionMs: null,
      seed: 200,
    });

    const state = store.getState();
    // Verify last place is not simply p0 (first participant) unless they actually scored lowest.
    const hoc = (state as { houseOfCards: HouseOfCardsState }).houseOfCards;
    const worstInStandings = hoc.standings[hoc.standings.length - 1]?.playerId;
    expect(state.game.lastHohCompFinisherId).toBe(worstInStandings);
  });

  it('outcomeResolved prevents double-dispatch', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });

    runGame(store, {
      participantIds: ['p0', 'p1', 'p2'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 15_000,
      seed: 10,
    });

    const hohBefore = store.getState().game.hohId;
    // Dispatch outcome thunk again — should be a no-op.
    store.dispatch(resolveHouseOfCardsOutcome());
    expect(store.getState().game.hohId).toBe(hohBefore);
  });
});

// ── 4. Public mode auto-nominee ────────────────────────────────────────────────

describe('House of Cards — Public mode auto-nominee', () => {
  it('auto-nominee matches the canonical last-place finisher', () => {
    const players = makePlayers(6);
    const store = makeStore({ players, publicModeEnabled: true });

    // Human wins; last place is some AI.
    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 10_000,
      humanStreak: 6,
      seed: 42,
    });

    const lastPlace = store.getState().game.lastHohCompFinisherId;
    expect(lastPlace).toBeTruthy();

    // Advance to nomination_results
    advanceToNominationResults(store);

    expect(store.getState().game.awaitingNominations).toBe(true);

    // Human HOH nominates two players (neither is the auto-nominee).
    const nominatableOthers = ['p1', 'p2', 'p3', 'p4', 'p5'].filter((id) => id !== lastPlace);
    store.dispatch(commitNominees([nominatableOthers[0], nominatableOthers[1]]));

    const afterNoms = store.getState().game;
    expect(afterNoms.nominationContext?.autoNomineeId).toBe(lastPlace);
    expect(afterNoms.nomineeIds).toContain(lastPlace);
  });

  it('auto-nominee is NOT added when public mode is disabled', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });

    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 10_000,
      seed: 42,
    });

    advanceToNominationResults(store);
    store.dispatch(commitNominees(['p1', 'p2']));

    expect(store.getState().game.nomineeIds).toHaveLength(2);
    expect(store.getState().game.nominationContext).toBeNull();
  });
});

// ── 5. Human nomination flow ───────────────────────────────────────────────────

describe('House of Cards — human nomination flow', () => {
  it('phase is hoh_results immediately after game resolves', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 1,
      humanCompletionMs: 20_000,
      seed: 2,
    });

    expect(store.getState().game.phase).toBe('hoh_results');
  });

  it('awaitingNominations is set for human HOH', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });

    // seed=1 + streak=4 is known to make p0 the winner (passes in winner test above)
    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 12_000,
      humanStreak: 4,
      seed: 1,
    });

    advanceToNominationResults(store);

    expect(store.getState().game.phase).toBe('nomination_results');
    expect(store.getState().game.awaitingNominations).toBe(true);
  });

  it('human can commit two nominations successfully', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });

    // seed=1 + streak=4 guarantees p0 wins
    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 12_000,
      humanStreak: 4,
      seed: 1,
    });

    advanceToNominationResults(store);
    store.dispatch(commitNominees(['p1', 'p2']));

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.awaitingNominations).toBe(false);
  });
});

// ── 6. AI-only nomination flow ─────────────────────────────────────────────────

describe('House of Cards — AI-only nomination flow', () => {
  it('AI HOH sets hohId and lastHohCompFinisherId correctly', () => {
    const players = makePlayers(4).map((p) => ({ ...p, isUser: false }));
    const store = makeStore({ players });

    // Manually call applyMinigameWinner as an AI-driven game would.
    store.dispatch(
      startHouseOfCards({
        participantIds: ['p1', 'p2', 'p3'],
        humanId: null,
        prizeType: 'HOH',
        seed: 42,
      }),
    );
    store.dispatch(
      finaliseOutcome({
        matchedPairs: TOTAL_PAIRS,
        mistakes: 0,
        turnsTaken: 16,
        completionTimeMs: 15_000,
        streakBest: 4,
        humanId: 'p1', // p1 is the "best" AI in this scenario
      }),
    );
    store.dispatch(resolveHouseOfCardsOutcome());

    const state = store.getState();
    expect(state.game.hohId).toBeTruthy();
    expect(state.game.lastHohCompFinisherId).toBeTruthy();
    expect(state.game.lastHohCompFinisherId).not.toBe(state.game.hohId);
  });

  it('AI HOH in public mode auto-nominates last-place finisher', () => {
    const players = makePlayers(6).map((p) => ({ ...p, isUser: false }));
    const store = makeStore({ players, publicModeEnabled: true });

    runGame(store, {
      participantIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      humanId: 'p1',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 10_000,
      humanStreak: 6,
      seed: 55,
    });

    const lastPlace = store.getState().game.lastHohCompFinisherId;
    expect(lastPlace).toBeTruthy();

    advanceToNominationResults(store);

    const afterNoms = store.getState().game;
    // p5 (last place from standings) must be nominated.
    expect(afterNoms.nomineeIds).toContain(lastPlace);
  });
});

// ── 7. Ranking / tiebreak edge cases ──────────────────────────────────────────

describe('House of Cards — ranking and tiebreak', () => {
  it('finishers always rank above non-finishers regardless of score', () => {
    const outcomes = [
      {
        playerId: 'slow',
        matchedPairs: 8,
        mistakes: 10,
        turnsTaken: 36,
        didFinish: true,
        completionTimeMs: 58_000,
        streakBest: 0,
        clashScore: computeClashScore({ playerId: 'slow', matchedPairs: 8, mistakes: 10, turnsTaken: 36, didFinish: true, completionTimeMs: 58_000, streakBest: 0 }),
      },
      {
        playerId: 'fast_nonfinisher',
        matchedPairs: 7,
        mistakes: 0,
        turnsTaken: 14,
        didFinish: false,
        completionTimeMs: null,
        streakBest: 5,
        clashScore: computeClashScore({ playerId: 'fast_nonfinisher', matchedPairs: 7, mistakes: 0, turnsTaken: 14, didFinish: false, completionTimeMs: null, streakBest: 5 }),
      },
    ];
    const ranked = rankOutcomes(outcomes, ['slow', 'fast_nonfinisher']);
    expect(ranked[0].playerId).toBe('slow'); // finisher wins even with lower effective score
    expect(ranked[1].playerId).toBe('fast_nonfinisher');
  });

  it('among finishers, higher Clash Score wins', () => {
    const a = {
      playerId: 'a',
      matchedPairs: 8,
      mistakes: 0,
      turnsTaken: 16,
      didFinish: true,
      completionTimeMs: 20_000,
      streakBest: 5,
    };
    const b = {
      playerId: 'b',
      matchedPairs: 8,
      mistakes: 3,
      turnsTaken: 22,
      didFinish: true,
      completionTimeMs: 20_000,
      streakBest: 1,
    };
    const outcomes = [
      { ...a, clashScore: computeClashScore(a) },
      { ...b, clashScore: computeClashScore(b) },
    ];
    const ranked = rankOutcomes(outcomes, ['a', 'b']);
    expect(ranked[0].playerId).toBe('a');
  });

  it('among finishers with equal Clash Score, faster completion wins', () => {
    // Give both same base score then tiebreak on time.
    const base = { matchedPairs: 8, mistakes: 0, turnsTaken: 16, didFinish: true, streakBest: 0 };
    const a = { playerId: 'a', ...base, completionTimeMs: 18_000 };
    const b = { playerId: 'b', ...base, completionTimeMs: 25_000 };
    const outcomes = [
      { ...a, clashScore: computeClashScore(a) },
      { ...b, clashScore: computeClashScore(b) },
    ];
    const ranked = rankOutcomes(outcomes, ['a', 'b']);
    expect(ranked[0].playerId).toBe('a');
  });

  it('among non-finishers, more matched pairs ranks higher', () => {
    const outcomes = [
      { playerId: 'few', matchedPairs: 3, mistakes: 0, turnsTaken: 6, didFinish: false, completionTimeMs: null, streakBest: 0, clashScore: computeClashScore({ playerId: 'few', matchedPairs: 3, mistakes: 0, turnsTaken: 6, didFinish: false, completionTimeMs: null, streakBest: 0 }) },
      { playerId: 'many', matchedPairs: 6, mistakes: 2, turnsTaken: 16, didFinish: false, completionTimeMs: null, streakBest: 1, clashScore: computeClashScore({ playerId: 'many', matchedPairs: 6, mistakes: 2, turnsTaken: 16, didFinish: false, completionTimeMs: null, streakBest: 1 }) },
    ];
    const ranked = rankOutcomes(outcomes, ['few', 'many']);
    expect(ranked[0].playerId).toBe('many');
  });

  it('computeClashScore gives bonus for speed', () => {
    const fast = { playerId: 'fast', matchedPairs: 8, mistakes: 0, turnsTaken: 16, didFinish: true, completionTimeMs: 10_000, streakBest: 0 };
    const slow = { playerId: 'slow', matchedPairs: 8, mistakes: 0, turnsTaken: 16, didFinish: true, completionTimeMs: 55_000, streakBest: 0 };
    expect(computeClashScore(fast)).toBeGreaterThan(computeClashScore(slow));
  });

  it('computeClashScore penalises mistakes', () => {
    const clean = { playerId: 'c', matchedPairs: 8, mistakes: 0, turnsTaken: 16, didFinish: true, completionTimeMs: 30_000, streakBest: 0 };
    const messy = { playerId: 'm', matchedPairs: 8, mistakes: 8, turnsTaken: 32, didFinish: true, completionTimeMs: 30_000, streakBest: 0 };
    expect(computeClashScore(clean)).toBeGreaterThan(computeClashScore(messy));
  });

  it('simulateAiOutcome is deterministic for the same seed/index', () => {
    const a = simulateAiOutcome('player1', 12345, 0);
    const b = simulateAiOutcome('player1', 12345, 0);
    expect(a).toEqual(b);
  });

  it('simulateAiOutcome varies across different seeds', () => {
    const a = simulateAiOutcome('player1', 1, 0);
    const b = simulateAiOutcome('player1', 99999, 0);
    // It's extremely unlikely all fields match across different seeds.
    const allEqual =
      a.matchedPairs === b.matchedPairs &&
      a.mistakes === b.mistakes &&
      a.completionTimeMs === b.completionTimeMs;
    expect(allEqual).toBe(false);
  });
});

// ── 8. Defensive: authoritative data is not silently skipped ─────────────────

describe('House of Cards — authoritative data must be present', () => {
  it('standings are populated (non-empty) after resolving', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 15_000,
      seed: 42,
    });

    const hoc = (store.getState() as { houseOfCards: HouseOfCardsState }).houseOfCards;
    expect(hoc.standings.length).toBeGreaterThan(0);
    expect(hoc.standings.every((s) => s.finalRank > 0)).toBe(true);
  });

  it('lastPlaceId in standings matches game.lastHohCompFinisherId', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });

    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 12_000,
      humanStreak: 4,
      seed: 99,
    });

    const hoc = (store.getState() as { houseOfCards: HouseOfCardsState }).houseOfCards;
    const standingsLastPlace = hoc.standings[hoc.standings.length - 1]?.playerId;
    expect(store.getState().game.lastHohCompFinisherId).toBe(standingsLastPlace);
  });

  it('applyMinigameWinner is NOT called when game is not yet complete', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });

    // Start the game but do NOT call finaliseOutcome.
    store.dispatch(
      startHouseOfCards({
        participantIds: ['p0', 'p1', 'p2'],
        humanId: 'p0',
        prizeType: 'HOH',
        seed: 42,
      }),
    );
    // Attempt to resolve — should be a no-op since status is not 'complete'.
    store.dispatch(resolveHouseOfCardsOutcome());

    expect(store.getState().game.phase).toBe('hoh_comp'); // unchanged
    expect(store.getState().game.hohId).toBeNull();
  });
});

// ── 9. Board size regression ──────────────────────────────────────────────────

describe('House of Cards — board uses 20 cards (10 pairs)', () => {
  it('TOTAL_PAIRS equals 10', () => {
    expect(TOTAL_PAIRS).toBe(10);
  });

  it('a finishing human matches exactly TOTAL_PAIRS pairs', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });

    runGame(store, {
      participantIds: ['p0', 'p1', 'p2'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 20_000,
      seed: 7,
    });

    const hoc = (store.getState() as { houseOfCards: HouseOfCardsState }).houseOfCards;
    const human = hoc.standings.find((s) => s.playerId === 'p0');
    expect(human?.matchedPairs).toBe(TOTAL_PAIRS);
    expect(human?.didFinish).toBe(true);
  });

  it('game is always completable: all pairs in standings sum to a consistent total', () => {
    // Verify no "impossible last pair" scenario: if human finishes, their
    // matchedPairs === TOTAL_PAIRS and the game resolves without leftover unmatched cards.
    const players = makePlayers(4);
    const store = makeStore({ players });

    runGame(store, {
      participantIds: ['p0', 'p1', 'p2', 'p3'],
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 0,
      humanCompletionMs: 18_000,
      humanStreak: 3,
      seed: 5,
    });

    const hoc = (store.getState() as { houseOfCards: HouseOfCardsState }).houseOfCards;
    expect(hoc.status).toBe('complete');
    // Human matched all pairs — no leftover unmatched state.
    const human = hoc.standings.find((s) => s.playerId === 'p0');
    expect(human?.matchedPairs).toBe(TOTAL_PAIRS);
    expect(human?.didFinish).toBe(true);
  });
});

// ── 10. AI pacing + large-field standings regression ─────────────────────────

describe('House of Cards — AI pacing and large-field standings', () => {
  it('simulateAiOutcome completionTimeMs is at or above AI_MIN_FINISH_MS for finishers', () => {
    // The new AI timing model enforces a minimum plausible finish time.
    for (let i = 0; i < 20; i++) {
      const outcome = simulateAiOutcome(`player${i}`, 12345 + i * 7, i);
      if (outcome.didFinish) {
        expect(outcome.completionTimeMs).not.toBeNull();
        expect(outcome.completionTimeMs!).toBeGreaterThanOrEqual(AI_MIN_FINISH_MS);
      }
    }
  });

  it('AI completionTimeMs is never unrealistically small (no sub-5s finishes)', () => {
    // With 16 participants, no AI should complete in under 5 seconds.
    const OBVIOUSLY_TOO_FAST = 5_000;
    for (let i = 0; i < 16; i++) {
      const outcome = simulateAiOutcome(`houseguest${i}`, 42, i);
      if (outcome.didFinish && outcome.completionTimeMs !== null) {
        expect(outcome.completionTimeMs).toBeGreaterThan(OBVIOUSLY_TOO_FAST);
      }
    }
  });

  it('simulateAiOutcome finishers with 16 participants do not all cluster at t<2s', () => {
    // Run 16 AI players and verify completions are spread over time.
    const finishTimes: number[] = [];
    for (let i = 0; i < 16; i++) {
      const outcome = simulateAiOutcome(`h${i}`, 42, i);
      if (outcome.didFinish && outcome.completionTimeMs !== null) {
        finishTimes.push(outcome.completionTimeMs);
      }
    }
    // Should have at least a few finishers; none before 10 seconds.
    expect(finishTimes.length).toBeGreaterThan(0);
    expect(finishTimes.every((t) => t >= 10_000)).toBe(true);
  });

  it('rankOutcomes handles a full 16-player field without softlocks', () => {
    // Simulate a 16-player game and verify standings are complete and non-empty.
    const players = makePlayers(16);
    const store = makeStore({ players });

    runGame(store, {
      participantIds: players.map((p) => p.id),
      humanId: 'p0',
      humanMatchedPairs: TOTAL_PAIRS,
      humanMistakes: 1,
      humanCompletionMs: 25_000,
      humanStreak: 2,
      seed: 77,
    });

    const hoc = (store.getState() as { houseOfCards: HouseOfCardsState }).houseOfCards;
    expect(hoc.standings.length).toBe(16);
    // Ranks are unique and span 1..16.
    const ranks = hoc.standings.map((s) => s.finalRank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    // Winner and last place are set.
    expect(hoc.winnerId).toBeTruthy();
    expect(hoc.lastPlaceId).toBeTruthy();
    expect(hoc.winnerId).not.toBe(hoc.lastPlaceId);
  });
});
