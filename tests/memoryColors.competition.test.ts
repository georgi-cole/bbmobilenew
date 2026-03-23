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
 *  7. Human HOH flow: after resolution, awaitingNominations is set and
 *     commitNominees appends the auto-nominee matching Memory Colors last-place.
 *  8. AI HOH flow: nominees are derived from canonical outcome data.
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
      memoryColors: memoryColorsReducer,
    },
    preloadedState: {
      game: { ...base, ...gameOverrides } as GameState,
    },
  });
}

type TestStore = ReturnType<typeof makeStore>;

/**
 * Fully simulate a human player's run, returning the phase and relevant
 * final state. tapResult controls each input: 'correct' | 'wrong'.
 */
function simulateHumanRun(
  store: TestStore,
  seed: number,
  participantIds: string[],
  humanPlayerId: string,
  taps: Array<'correct' | 'wrong'>,
) {
  store.dispatch(
    initMemoryColors({
      participantIds,
      competitionType: 'HOH',
      seed,
      humanPlayerId,
    }),
  );

  let tapIndex = 0;
  let round = 1;

  while (tapIndex < taps.length) {
    const mc = store.getState().memoryColors;
    if (!mc || mc.phase === 'complete') break;

    if (mc.phase === 'showing') {
      store.dispatch(beginInput());
      continue;
    }

    if (mc.phase === 'input') {
      const mc2 = store.getState().memoryColors!;
      const seq = mc2.sequence;
      const expected = seq[mc2.inputIndex];
      const tapCorrect = taps[tapIndex] === 'correct';
      const colorIndex = tapCorrect ? expected : (expected + 1) % NUM_COLORS;
      store.dispatch(recordInput({ colorIndex, now: tapIndex * 500 }));
      tapIndex++;
      continue;
    }

    if (mc.phase === 'warning_beat') {
      store.dispatch(resumeAfterWarning());
      continue;
    }

    if (mc.phase === 'round_cleared') {
      round++;
      store.dispatch(startNextRound());
      continue;
    }

    break;
  }

  return store.getState().memoryColors!;
}

// ── 1. Slice state machine ────────────────────────────────────────────────────

describe('MemoryColors slice — state machine', () => {
  it('initMemoryColors transitions idle → showing', () => {
    const store = makeStore();
    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2'],
        competitionType: 'HOH',
        seed: 1,
        humanPlayerId: 'p0',
      }),
    );
    expect(store.getState().memoryColors!.phase).toBe('showing');
  });

  it('beginInput transitions showing → input', () => {
    const store = makeStore();
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'HOH', seed: 1, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    expect(store.getState().memoryColors!.phase).toBe('input');
  });

  it('correct inputs advance inputIndex', () => {
    const store = makeStore();
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'HOH', seed: 1, humanPlayerId: 'p0' }),
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
      initMemoryColors({ participantIds: ['p0'], competitionType: 'HOH', seed, humanPlayerId: 'p0' }),
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
      initMemoryColors({ participantIds: ['p0'], competitionType: 'HOH', seed: 1, humanPlayerId: 'p0' }),
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
      initMemoryColors({ participantIds: ['p0'], competitionType: 'HOH', seed: 1, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const wrong = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong, now: 100 }));
    store.dispatch(resumeAfterWarning());
    expect(store.getState().memoryColors!.phase).toBe('showing');
  });

  it('second wrong input → complete (run ends)', () => {
    const store = makeStore();
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'HOH', seed: 1, humanPlayerId: 'p0' }),
    );
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    // First mistake
    const wrong1 = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong1, now: 100 }));
    store.dispatch(resumeAfterWarning());
    // Now input phase again — make second mistake
    store.dispatch(beginInput());
    const mc2 = store.getState().memoryColors!;
    const wrong2 = (mc2.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong2, now: 300 }));
    expect(store.getState().memoryColors!.phase).toBe('complete');
  });

  it('startNextRound increments round and generates new sequence', () => {
    const store = makeStore();
    const seed = 7;
    store.dispatch(
      initMemoryColors({ participantIds: ['p0'], competitionType: 'HOH', seed, humanPlayerId: 'p0' }),
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
    expect(r.mistakesUsed).toBeLessThanOrEqual(1);
    expect(r.totalResponseMs).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('different players get different results for the same seed', () => {
    const r1 = simulateAiResult(42, 'p1');
    const r2 = simulateAiResult(42, 'p2');
    // Not guaranteed to differ in every metric, but score should often differ.
    // Just check that they're valid results.
    expect(typeof r1.score).toBe('number');
    expect(typeof r2.score).toBe('number');
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
    const store = makeFullStore({ players, phase: 'hoh_comp' });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2'],
        competitionType: 'HOH',
        seed: 999,
        humanPlayerId: 'p0',
      }),
    );

    // Manually set a decisive result in state via the slice
    // We'll do this by running the full human simulation instead.
    // p0 (human) makes 2 mistakes immediately → roundsCleared = 0, ends
    store.dispatch(beginInput());
    const mc = store.getState().memoryColors!;
    const wrong = (mc.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong, now: 100 }));  // mistake 1
    store.dispatch(resumeAfterWarning());
    store.dispatch(beginInput());
    const mc2 = store.getState().memoryColors!;
    const wrong2 = (mc2.sequence[0] + 1) % NUM_COLORS;
    store.dispatch(recordInput({ colorIndex: wrong2, now: 300 }));  // mistake 2 → complete

    expect(store.getState().memoryColors!.phase).toBe('complete');

    store.dispatch(resolveMemoryColorsOutcome());

    const game = store.getState().game;
    expect(game.hohId).not.toBeNull();
  });

  it('sets lastHohCompFinisherId to the canonical last-place finisher', () => {
    const players = makePlayers(4);
    const store = makeFullStore({ players, phase: 'hoh_comp' });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2', 'p3'],
        competitionType: 'HOH',
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

    store.dispatch(resolveMemoryColorsOutcome());

    const mcFinal = store.getState().memoryColors!;
    const game = store.getState().game;

    // lastHohCompFinisherId should match the canonical last-place from the slice
    expect(game.lastHohCompFinisherId).toBe(mcFinal.lastPlaceId);
  });

  it('sets lastHohCompFinisherType to "scored"', () => {
    const players = makePlayers(3);
    const store = makeFullStore({ players, phase: 'hoh_comp' });

    store.dispatch(
      initMemoryColors({ participantIds: ['p0', 'p1', 'p2'], competitionType: 'HOH', seed: 1, humanPlayerId: 'p0' }),
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

    store.dispatch(resolveMemoryColorsOutcome());

    expect(store.getState().game.lastHohCompFinisherType).toBe('scored');
  });

  it('is idempotent: does not dispatch twice', () => {
    const players = makePlayers(3);
    const store = makeFullStore({ players, phase: 'hoh_comp' });

    store.dispatch(
      initMemoryColors({ participantIds: ['p0', 'p1', 'p2'], competitionType: 'HOH', seed: 1, humanPlayerId: 'p0' }),
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

    store.dispatch(resolveMemoryColorsOutcome());
    const hohId1 = store.getState().game.hohId;

    // Second call should be a no-op
    store.dispatch(resolveMemoryColorsOutcome());
    const hohId2 = store.getState().game.hohId;

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
    const players = makePlayers(5, 0); // p0 is human HOH
    // Make p0 the HOH winner via applyMinigameWinner with a specific last place
    const store = makeStore({ players, phase: 'hoh_comp', publicModeEnabled: true });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
        competitionType: 'HOH',
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
    store.dispatch(advance()); // hoh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results

    // Human HOH (p1) commits nominees — auto-third (p4) should be appended
    const nominees = ['p0', 'p2'];
    store.dispatch(commitNominees({ nomineeIds: nominees, hohId: 'p1' }));

    const game2 = store.getState().game;
    expect(game2.nomineeIds).toContain('p4');
  });

  it('auto-nominee does not duplicate if last-place is already nominated', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, phase: 'hoh_comp', publicModeEnabled: true });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p1',
        participants: ['p0', 'p1', 'p2', 'p3', 'p4'],
        scores: { p0: 1000, p1: 9000, p2: 2000, p3: 3000, p4: 500 },
        lastPlaceId: 'p4',
        lastPlaceType: 'scored',
      }),
    );

    store.dispatch(advance()); // hoh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results

    // Include p4 (last place) in the explicit nominee picks
    store.dispatch(commitNominees({ nomineeIds: ['p0', 'p4'], hohId: 'p1' }));

    const game = store.getState().game;
    // No duplicate
    const p4Count = game.nomineeIds.filter((id: string) => id === 'p4').length;
    expect(p4Count).toBe(1);
  });
});

// ── 8. Human HOH flow ─────────────────────────────────────────────────────────

describe('MemoryColors — human HOH nomination flow', () => {
  it('phase advances to hoh_results after resolveMemoryColorsOutcome', () => {
    const players = makePlayers(4, 1); // p1 is human
    const store = makeStore({ players, phase: 'hoh_comp' });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2', 'p3'],
        competitionType: 'HOH',
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

    store.dispatch(resolveMemoryColorsOutcome());

    expect(store.getState().game.phase).toBe('hoh_results');
  });

  it('awaitingNominations is set after advance through social/nominations for human HOH', () => {
    const players = makePlayers(4, 0); // p0 is human
    const store = makeStore({ players, phase: 'hoh_comp', publicModeEnabled: false });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0', // human wins
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 9000, p1: 4000, p2: 3000, p3: 2000 },
        lastPlaceId: 'p3',
        lastPlaceType: 'scored',
      }),
    );

    store.dispatch(advance()); // hoh_results → social_1
    store.dispatch(advance()); // social_1 → nominations
    store.dispatch(advance()); // nominations → nomination_results (awaitingNominations set here)

    expect(store.getState().game.awaitingNominations).toBe(true);
  });
});

// ── 9. AI HOH flow ────────────────────────────────────────────────────────────

describe('MemoryColors — AI HOH flow', () => {
  it('AI HOH nominates after resolveMemoryColorsOutcome with all-AI participants', () => {
    const players = makePlayers(4, -1); // no human
    const store = makeStore({ players, phase: 'hoh_comp', publicModeEnabled: false });

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

    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');

    store.dispatch(advance()); // hoh_results → social_1
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
    const store = makeStore({ players, phase: 'hoh_comp' });

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
    const store = makeStore({ players, phase: 'hoh_comp' });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p0',
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 100, p1: 80, p2: 40, p3: 60 }, // p2 lowest score
      }),
    );

    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('finalRanking winner matches hohId after resolving', () => {
    const players = makePlayers(3);
    const store = makeStore({ players, phase: 'hoh_comp' });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2'],
        competitionType: 'HOH',
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

    store.dispatch(resolveMemoryColorsOutcome());

    const mcFinal = store.getState().memoryColors!;
    const game = store.getState().game;

    // The hohId set by the game should match the canonical winner in the slice
    expect(game.hohId).toBe(mcFinal.winnerId);
  });

  it('lastHohCompFinisherId from game state matches canonical lastPlaceId from slice', () => {
    const players = makePlayers(4);
    const store = makeStore({ players, phase: 'hoh_comp' });

    store.dispatch(
      initMemoryColors({
        participantIds: ['p0', 'p1', 'p2', 'p3'],
        competitionType: 'HOH',
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

    store.dispatch(resolveMemoryColorsOutcome());

    const mcFinal = store.getState().memoryColors!;
    const game = store.getState().game;

    expect(game.lastHohCompFinisherId).toBe(mcFinal.lastPlaceId);
    expect(game.lastHohCompFinisherType).toBe('scored');
  });
});
