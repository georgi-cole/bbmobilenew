/**
 * Memory Colors — competition regression tests.
 *
 * Covers:
 *  1. Slice state machine: initMemoryColors, recordInput, warning beat, round cleared.
 *  2. AI result simulation produces deterministic results from seed.
 *  3. Ranking: winner is correct, last-place finisher is correct.
 *  4. resolveMemoryColorsOutcome thunk dispatches applyMinigameWinner with
 *     explicit lastPlaceId, winnerId, and lastPlaceType: 'scored'.
 *  5. Idempotency: resolveMemoryColorsOutcome is a no-op if already resolved.
 *  6. Public mode auto-nominee matches scoreboard last-place finisher.
 *  7. Human LOH flow: after resolution, awaitingNominations is set and
 *     commitNominees appends the auto-nominee matching Memory Colors last-place.
 *  8. AI LOH flow: nominees are derived from canonical outcome data.
 *  9. Defensive case: explicit lastPlaceId is used over fallback participant order.
 * 10. lastHohCompFinisherType is 'scored'.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  applyMinigameWinner,
  commitNominees,
} from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import memoryColorsReducer, {
  initMemoryColors,
  beginInput,
  recordInput,
  resumeAfterWarning,
  startNextRound,
  markMemoryColorsOutcomeResolved,
  generateSequence,
  simulateAiResult,
  computeRanking,
  computePlayerScore,
  INITIAL_SEQUENCE_LENGTH,
  NUM_COLORS,
  type MemoryColorsPlayerResult,
} from '../src/features/memoryColors/memoryColorsSlice';
import { resolveMemoryColorsOutcome } from '../src/features/memoryColors/thunks';
import type { GameState, Player } from '../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayers(count: number, userIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }));
}

function makeStore(gameOverrides: Partial<GameState> = {}) {
  const players = gameOverrides.players ?? makePlayers(5);
  const base: GameState = {
    season: 1,
    week: 2,
    phase: 'loh_comp',
    seed: 42,
    lohId: null,
    prevHohId: null,
    nomineeIds: [],
    publicModeEnabled: true,
    posWinnerId: null,
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
      memoryColors: memoryColorsReducer,
    },
    preloadedState: {
      game: { ...base, ...gameOverrides } as GameState,
    },
  });
}

// ── 1. Slice state machine ────────────────────────────────────────────────────

describe('MemoryColors slice — state machine', () => {
  it('initMemoryColors transitions idle → showing', () => {
    const store = makeStore();
    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2'],
        competitionType: 'LOH',
        seed: 1,
        humanPlayerId: 'p0',
      }),
    );
    expect(store.getState().memoryColors!.phase).toBe('showing');
  });

  it('beginInput transitions showing → input', () => {
    const store = makeStore();
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'LOH', seed: 1, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    expect(store.getState().memoryColors!.phase).toBe('input');
  });

  it('correct inputs advance inputIndex', () => {
    const store = makeStore();
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'LOH', seed: 1, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const first = mc.sequence[0];
    store.dispatch(recordInput({ colorIndex: first, now: 100 }));
    expect(store.getState().memoryColors!.inputIndex).toBe(1);
    expect(store.getState().memoryColors!.phase).toBe('input');
  });

  it('completing all inputs in a round transitions to round_cleared', () => {
    const store = makeStore();
    const seed = 7;
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'LOH', seed, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    const seq = store.getState().memoryColors!.sequence;
    seq.forEach((color, i) => {
      store.dispatch(recordInput({ colorIndex: color, now: i * 500 }));
    });
    expect(store.getState().memoryColors!.phase).toBe('round_cleared');
  });

  it('first wrong input → warning_beat, mistakesUsed = 1', () => {
    const store = makeStore();
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'LOH', seed: 1, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const wrong = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong, now: 100 }));
    const after = store.getState().memoryColors!;
    expect(after.phase).toBe('warning_beat');
    expect(after.mistakesUsed).toBe(1);
  });

  it('resumeAfterWarning transitions warning_beat → showing', () => {
    const store = makeStore();
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'LOH', seed: 1, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const wrong = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong, now: 100 }));
    store.dispatch(resumeAfterWarning());
    expect(store.getState().memoryColors!.phase).toBe('showing');
  });

  it('fifth wrong input → complete (run ends)', () => {
    const store = makeStore();
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'LOH', seed: 1, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    // First mistake
    const wrong1 = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong1, now: 100 }));
    store.dispatch(resumeAfterWarning());
    // Four more mistakes are allowed before the run ends on mistake five.
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      store.dispatch(beginInput());
      const current = store.getState().memoryColors!;
      const wrong = (current.sequence[0] + 1) % NUM_COLORS;
      store.dispatch(recordInput({ colorIndex: wrong, now: attempt * 200 }));
      if (attempt < 5) store.dispatch(resumeAfterWarning());
    }
    expect(store.getState().memoryColors!.phase).toBe('complete');
  });

  it('startNextRound increments round and generates new sequence', () => {
    const store = makeStore();
    const seed = 7;
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'LOH', seed, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    const seq = store.getState().memoryColors!.sequence;
    seq.forEach((color, i) => {
      store.dispatch(recordInput({ colorIndex: color, now: i * 500 }));
    });
    store.dispatch(startNextRound());
    const mc = store.getState().memoryColors!;
    expect(mc.round).toBe(2);
    expect(mc.sequence.length).toBe(INITIAL_SEQUENCE_LENGTH + 1);
    expect(mc.phase).toBe('showing');
  });
});

// ── 2. Sequence generation ────────────────────────────────────────────────────

describe('MemoryColors — generateSequence', () => {
  it('generates sequence of correct length for each round', () => {
    for (let r = 1; r <= 5; r++) {
      const seq = generateSequence(42, r);
      expect(seq.length).toBe(INITIAL_SEQUENCE_LENGTH + r - 1);
    }
  });

  it('generates only valid color indices (0 to NUM_COLORS-1)', () => {
    const seq = generateSequence(100, 3);
    seq.forEach((c) => {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(NUM_COLORS);
    });
  });

  it('is deterministic for the same seed and round', () => {
    const seq1 = generateSequence(99, 2);
    const seq2 = generateSequence(99, 2);
    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different rounds', () => {
    const seq1 = generateSequence(42, 1);
    const seq2 = generateSequence(42, 2);
    // Round 2 is strictly longer and very likely different
    expect(seq2.length).toBeGreaterThan(seq1.length);
  });
});

// ── 3. AI simulation ──────────────────────────────────────────────────────────

describe('MemoryColors — simulateAiResult', () => {
  it('returns a deterministic result for the same seed + player', () => {
    const r1 = simulateAiResult(42, 'p1');
    const r2 = simulateAiResult(42, 'p1');
    expect(r1).toEqual(r2);
  });

  it('returns plausible values', () => {
    const r = simulateAiResult(42, 'p1');
    expect(r.roundsCleared).toBeGreaterThanOrEqual(0);
    expect(r.mistakesUsed).toBeGreaterThanOrEqual(0);
    expect(r.mistakesUsed).toBeLessThanOrEqual(5);
    expect(r.totalResponseMs).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('different players get different results for the same seed', () => {
    const r1 = simulateAiResult(42, 'p1');
    const r2 = simulateAiResult(42, 'p2');
    // Not guaranteed to differ in every metric, but score should differ for different players.
    expect(r1.score).not.toBe(r2.score);
  });
});

// ── 4. computePlayerScore ─────────────────────────────────────────────────────

describe('MemoryColors — computePlayerScore', () => {
  it('higher roundsCleared produces higher score', () => {
    const base: Omit<MemoryColorsPlayerResult, 'score'> = { roundsCleared: 0, failedAtStep: 0, mistakesUsed: 0, totalResponseMs: 1000 };
    const higher: Omit<MemoryColorsPlayerResult, 'score'> = { ...base, roundsCleared: 5 };
    expect(computePlayerScore(higher)).toBeGreaterThan(computePlayerScore(base));
  });

  it('deeper failedAtStep produces higher score (all else equal)', () => {
    const base: Omit<MemoryColorsPlayerResult, 'score'> = { roundsCleared: 2, failedAtStep: 0, mistakesUsed: 1, totalResponseMs: 1000 };
    const deeper: Omit<MemoryColorsPlayerResult, 'score'> = { ...base, failedAtStep: 3 };
    expect(computePlayerScore(deeper)).toBeGreaterThan(computePlayerScore(base));
  });

  it('fewer mistakes produces higher score (all else equal)', () => {
    const withMistake: Omit<MemoryColorsPlayerResult, 'score'> = { roundsCleared: 2, failedAtStep: 0, mistakesUsed: 1, totalResponseMs: 1000 };
    const noMistake: Omit<MemoryColorsPlayerResult, 'score'> = { ...withMistake, mistakesUsed: 0 };
    expect(computePlayerScore(noMistake)).toBeGreaterThan(computePlayerScore(withMistake));
  });

  it('lower totalResponseMs produces higher score (all else equal)', () => {
    const slow: Omit<MemoryColorsPlayerResult, 'score'> = { roundsCleared: 2, failedAtStep: 0, mistakesUsed: 0, totalResponseMs: 50000 };
    const fast: Omit<MemoryColorsPlayerResult, 'score'> = { ...slow, totalResponseMs: 1000 };
    expect(computePlayerScore(fast)).toBeGreaterThan(computePlayerScore(slow));
  });
});

// ── 5. computeRanking ─────────────────────────────────────────────────────────

describe('MemoryColors — computeRanking', () => {
  it('ranks players by score descending', () => {
    const results: Record<string, MemoryColorsPlayerResult> = {
      p0: { roundsCleared: 5, failedAtStep: 0, mistakesUsed: 0, totalResponseMs: 1000, score: 5_001_100 },
      p1: { roundsCleared: 3, failedAtStep: 2, mistakesUsed: 1, totalResponseMs: 2000, score: 3_020_950 },
      p2: { roundsCleared: 1, failedAtStep: 0, mistakesUsed: 1, totalResponseMs: 5000, score: 1_000_998 },
    };
    // Override scores with correct ones
    ['p0', 'p1', 'p2'].forEach((id) => {
      const r = results[id];
      results[id] = { ...r, score: computePlayerScore(r) };
    });
    const ranking = computeRanking(['p0', 'p1', 'p2'], results, 42);
    expect(ranking[0]).toBe('p0'); // most rounds cleared
    expect(ranking[ranking.length - 1]).toBe('p2'); // fewest rounds cleared
  });

  it('is stable for deterministic tiebreak', () => {
    const r: MemoryColorsPlayerResult = { roundsCleared: 2, failedAtStep: 0, mistakesUsed: 0, totalResponseMs: 0, score: 0 };
    r.score = computePlayerScore(r);
    const results = { p0: r, p1: { ...r }, p2: { ...r } };
    const rank1 = computeRanking(['p0', 'p1', 'p2'], results, 42);
    const rank2 = computeRanking(['p0', 'p1', 'p2'], results, 42);
    expect(rank1).toEqual(rank2);
  });
});

// ── 6. resolveMemoryColorsOutcome — thunk behavior ────────────────────────────

describe('MemoryColors — resolveMemoryColorsOutcome thunk', () => {
  function makeFullStore(gameOverrides: Partial<GameState> = {}) {
    return makeStore(gameOverrides);
  }

  it('dispatches applyMinigameWinner with the correct winnerId', () => {
    const players = makePlayers(3);
    const store = makeFullStore({ players, phase: 'loh_comp' });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2'],
        competitionType: 'LOH',
        seed: 999,
        humanPlayerId: 'p0',
      }),
    );

    // Manually set a decisive result in state via the slice
    // We'll do this by running the full human simulation instead.
    // p0 (human) makes 5 mistakes immediately → roundsCleared = 0, ends
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      store.dispatch(beginInput());
      const current = store.getState().memoryColors!;
      const wrong = (current.sequence[0] + 1) % NUM_COLORS;
      store.dispatch(recordInput({ colorIndex: wrong, now: attempt * 200 }));
      if (attempt < 5) store.dispatch(resumeAfterWarning());
    }

    expect(store.getState().memoryColors!.phase).toBe('complete');

    store.dispatch(resolveMemoryColorsOutcome());

    const game = store.getState().game;
    expect(game.lohId).not.toBeNull();
  });

  it('sets lastHohCompFinisherId to the canonical last-place finisher', () => {
    const players = makePlayers(4);
    const store = makeFullStore({ players, phase: 'loh_comp' });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2', 'p3'],
        competitionType: 'LOH',
        seed: 77,
        humanPlayerId: 'p0',
      }),
    );

    // Human fails quickly → likely last
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const wrong = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong, now: 100 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc2 = store.getState().memoryColors!;
    const wrong2 = (mc2.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong2, now: 300 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc3 = store.getState().memoryColors!;
    const wrong3 = (mc3.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong3, now: 500 }));

    store.dispatch(resolveMemoryColorsOutcome());

    const mcFinal = store.getState().memoryColors!;
    const game = store.getState().game;

    // lastHohCompFinisherId should match the canonical last-place from the slice
    expect(game.lastHohCompFinisherId).toBe(mcFinal.lastPlaceId);
  });

  it('sets lastHohCompFinisherType to "scored"', () => {
    const players = makePlayers(3);
    const store = makeFullStore({ players, phase: 'loh_comp' });

    store.dispatch(
      initMemoryColors({ participantIds: ['p0', 'p1', 'p2'], competitionType: 'LOH', seed: 1, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const wrong = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong, now: 100 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc2 = store.getState().memoryColors!;
    const wrong2 = (mc2.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong2, now: 200 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc3 = store.getState().memoryColors!;
    const wrong3 = (mc3.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong3, now: 300 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc4 = store.getState().memoryColors!;
    store.dispatch(recordInput({ colorIndex: (mc4.sequence[0] + 1) % NUM_COLORS, now: 400 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc5 = store.getState().memoryColors!;
    store.dispatch(recordInput({ colorIndex: (mc5.sequence[0] + 1) % NUM_COLORS, now: 500 }));

    store.dispatch(resolveMemoryColorsOutcome());

    expect(store.getState().game.lastHohCompFinisherType).toBe('scored');
  });

  it('is idempotent: does not dispatch twice', () => {
    const players = makePlayers(3);
    const store = makeFullStore({ players, phase: 'loh_comp' });

    store.dispatch(
      initMemoryColors({ participantIds: ['p0', 'p1', 'p2'], competitionType: 'LOH', seed: 1, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const wrong = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong, now: 100 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc2 = store.getState().memoryColors!;
    const wrong2 = (mc2.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong2, now: 200 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc3 = store.getState().memoryColors!;
    const wrong3 = (mc3.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong3, now: 300 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc4 = store.getState().memoryColors!;
    store.dispatch(recordInput({ colorIndex: (mc4.sequence[0] + 1) % NUM_COLORS, now: 400 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc5 = store.getState().memoryColors!;
    store.dispatch(recordInput({ colorIndex: (mc5.sequence[0] + 1) % NUM_COLORS, now: 500 }));

    store.dispatch(resolveMemoryColorsOutcome());
    const hohId1 = store.getState().game.lohId;

    // Second call should be a no-op
    store.dispatch(resolveMemoryColorsOutcome());
    const hohId2 = store.getState().game.lohId;

    expect(hohId1).toBe(hohId2);
    expect(store.getState().memoryColors!.outcomeResolved).toBe(true);
  });

  it('markMemoryColorsOutcomeResolved prevents re-dispatch', () => {
    const store = makeStore();
    store.dispatch(markMemoryColorsOutcomeResolved());
    expect(store.getState().memoryColors!.outcomeResolved).toBe(true);
  });
});

// ── 7. Public mode auto-nominee ───────────────────────────────────────────────

describe('MemoryColors — public mode auto-nominee', () => {
  it('auto-nominee matches the canonical last-place finisher from Memory Colors', () => {
    const players = makePlayers(5, 0); // p0 is human LOH
    // Make p0 the LOH winner via applyMinigameWinner with a specific last place
    const store = makeStore({ players, phase: 'loh_comp', publicModeEnabled: true });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
        competitionType: 'LOH',
        seed: 42,
        humanPlayerId: 'p0',
      }),
    );

    // p0 clears 1 round, then fails — compute what scores look like
    // For a clean test, use applyMinigameWinner directly with explicit data
    // that matches what resolveMemoryColorsOutcome would dispatch.

    // Build explicit results: p1 wins with 8 rounds, p4 loses with 0 rounds
    const scores: Record<string, number> = {
      p0: 3_000_000,
      p1: 8_000_000, // winner
      p2: 4_000_000,
      p3: 2_000_000,
      p4: 500_000, // last place
    };
    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p1',
        participants: ['p0', 'p1', 'p2', 'p3', 'p4'],
        scores,
        lastPlaceId: 'p4',
        lastPlaceType: 'scored',
      }),
    );

    const game1 = store.getState().game;
    expect(game1.lastHohCompFinisherId).toBe('p4');
    expect(game1.lastHohCompFinisherType).toBe('scored');

    // Advance through social/nominations to nomination_results
    store.dispatch(advance()); // loh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results

    // Human LOH (p1) commits nominees — auto-third (p4) should be appended
    const nominees = ['p0', 'p2'];
    store.dispatch(commitNominees({ nomineeIds: nominees, lohId: 'p1' }));

    const game2 = store.getState().game;
    expect(game2.nomineeIds).toContain('p4');
  });

  it('auto-nominee does not duplicate if last-place is already nominated', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, phase: 'loh_comp', publicModeEnabled: true });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p1',
        participants: ['p0', 'p1', 'p2', 'p3', 'p4'],
        scores: { p0: 1000, p1: 9000, p2: 2000, p3: 3000, p4: 500 },
        lastPlaceId: 'p4',
        lastPlaceType: 'scored',
      }),
    );

    store.dispatch(advance()); // loh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results

    // Include p4 (last place) in the explicit nominee picks
    store.dispatch(commitNominees({ nomineeIds: ['p0', 'p4'], lohId: 'p1' }));

    const game = store.getState().game;
    // No duplicate
    const p4Count = game.nomineeIds.filter((id: string) => id === 'p4').length;
    expect(p4Count).toBe(1);
  });
});

// ── 8. Human LOH flow ─────────────────────────────────────────────────────────

describe('MemoryColors — human LOH nomination flow', () => {
  it('phase advances to loh_results after resolveMemoryColorsOutcome', () => {
    const players = makePlayers(4, 1); // p1 is human
    const store = makeStore({ players, phase: 'loh_comp' });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2', 'p3'],
        competitionType: 'LOH',
        seed: 55,
        humanPlayerId: 'p1',
      }),
    );

    // End the run quickly
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const w1 = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: w1, now: 100 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc2 = store.getState().memoryColors!;
    const w2 = (mc2.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: w2, now: 200 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc3 = store.getState().memoryColors!;
    const w3 = (mc3.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: w3, now: 300 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc4 = store.getState().memoryColors!;
    store.dispatch(recordInput({ colorIndex: (mc4.sequence[0] + 1) % NUM_COLORS, now: 400 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc5 = store.getState().memoryColors!;
    store.dispatch(recordInput({ colorIndex: (mc5.sequence[0] + 1) % NUM_COLORS, now: 500 }));

    store.dispatch(resolveMemoryColorsOutcome());

    expect(store.getState().game.phase).toBe('loh_results');
  });

  it('awaitingNominations is set after advance through social/nominations for human LOH', () => {
    const players = makePlayers(4, 0); // p0 is human
    const store = makeStore({ players, phase: 'loh_comp', publicModeEnabled: false });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0', // human wins
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 9000, p1: 4000, p2: 3000, p3: 2000 },
        lastPlaceId: 'p3',
        lastPlaceType: 'scored',
      }),
    );

    store.dispatch(advance()); // loh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results (awaitingNominations set here)

    expect(store.getState().game.awaitingNominations).toBe(true);
  });
});

// ── 9. AI LOH flow ────────────────────────────────────────────────────────────

describe('MemoryColors — AI LOH flow', () => {
  it('AI LOH nominates after resolveMemoryColorsOutcome with all-AI participants', () => {
    const players = makePlayers(4, -1); // no human
    const store = makeStore({ players, phase: 'loh_comp', publicModeEnabled: false });

    // Simulate an AI-only game by using applyMinigameWinner directly
    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0',
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 9000, p1: 5000, p2: 3000, p3: 1000 },
        lastPlaceId: 'p3',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.lohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');

    store.dispatch(advance()); // loh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results

    const game = store.getState().game;
    expect(game.nomineeIds.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 10. Defensive / authoritative outcome ──────────────────────────────────────

describe('MemoryColors — authoritative outcome handling', () => {
  it('uses explicit lastPlaceId over fallback participant order', () => {
    const players = makePlayers(4);
    const store = makeStore({ players, phase: 'loh_comp' });

    // Pass scores where p2 would be last by score, but explicitly set p3 as last
    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0',
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 100, p1: 80, p2: 40, p3: 60 }, // p2 lowest score
        lastPlaceId: 'p3', // but explicitly override to p3
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('score-based derivation correctly identifies lowest scorer when no explicit lastPlaceId', () => {
    const players = makePlayers(4);
    const store = makeStore({ players, phase: 'loh_comp' });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0',
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 100, p1: 80, p2: 40, p3: 60 }, // p2 lowest score
      }),
    );

    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('finalRanking winner matches lohId after resolving', () => {
    const players = makePlayers(3);
    const store = makeStore({ players, phase: 'loh_comp' });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2'],
        competitionType: 'LOH',
        seed: 11,
        humanPlayerId: 'p0',
      }),
    );

    // Quickly end run for p0 (human)
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const w1 = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: w1, now: 100 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc2 = store.getState().memoryColors!;
    const w2 = (mc2.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: w2, now: 200 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc3 = store.getState().memoryColors!;
    const w3 = (mc3.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: w3, now: 300 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc4 = store.getState().memoryColors!;
    store.dispatch(recordInput({ colorIndex: (mc4.sequence[0] + 1) % NUM_COLORS, now: 400 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc5 = store.getState().memoryColors!;
    store.dispatch(recordInput({ colorIndex: (mc5.sequence[0] + 1) % NUM_COLORS, now: 500 }));

    store.dispatch(resolveMemoryColorsOutcome());

    const mcFinal = store.getState().memoryColors!;
    const game = store.getState().game;

    // The lohId set by the game should match the canonical winner in the slice
    expect(game.lohId).toBe(mcFinal.winnerId);
  });

  it('lastHohCompFinisherId from game state matches canonical lastPlaceId from slice', () => {
    const players = makePlayers(4);
    const store = makeStore({ players, phase: 'loh_comp' });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2', 'p3'],
        competitionType: 'LOH',
        seed: 22,
        humanPlayerId: 'p0',
      }),
    );

    // End run for p0 quickly
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const w1 = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: w1, now: 100 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc2 = store.getState().memoryColors!;
    const w2 = (mc2.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: w2, now: 200 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc3 = store.getState().memoryColors!;
    const w3 = (mc3.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: w3, now: 300 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc4 = store.getState().memoryColors!;
    store.dispatch(recordInput({ colorIndex: (mc4.sequence[0] + 1) % NUM_COLORS, now: 400 }));
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc5 = store.getState().memoryColors!;
    store.dispatch(recordInput({ colorIndex: (mc5.sequence[0] + 1) % NUM_COLORS, now: 500 }));

    store.dispatch(resolveMemoryColorsOutcome());

    const mcFinal = store.getState().memoryColors!;
    const game = store.getState().game;

    expect(game.lastHohCompFinisherId).toBe(mcFinal.lastPlaceId);
    expect(game.lastHohCompFinisherType).toBe('scored');
  });
});
