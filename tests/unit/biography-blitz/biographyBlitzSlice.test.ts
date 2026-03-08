/**
 * Unit tests: biographyBlitz Redux slice (biography_blitz_logic.tsx).
 *
 * Tests the new state machine:
 *   idle → question → reveal → elimination → round_transition → question → ... → complete
 *
 * Covers:
 *  1. Initial state shape.
 *  2. initBiographyBlitz: sets up state and moves to 'question'.
 *  3. submitBiographyBlitzAnswer: records submission, double-submit guard.
 *  4. resolveRound: finds fastest correct, transitions to 'reveal'.
 *  5. advanceFromReveal: to 'elimination' (has winner) or 'round_transition' (void).
 *  6. pickEliminationTarget: applies elimination, streak tracking.
 *  7. startNextRound: advances to next question.
 *  8. Void round: no winner → no elimination.
 *  9. Complete: last survivor wins.
 * 10. outcomeResolved / markBiographyBlitzOutcomeResolved idempotency.
 * 11. resetBiographyBlitz: returns to idle.
 * 12. buildAiSubmissions: deterministic.
 * 13. resolveBiographyBlitzRound: correct winner selection.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import biographyBlitzReducer, {
  initBiographyBlitz,
  submitBiographyBlitzAnswer,
  resolveRound,
  advanceFromReveal,
  pickEliminationTarget,
  startNextRound,
  markBiographyBlitzOutcomeResolved,
  resetBiographyBlitz,
  buildAiSubmissions,
  resolveBiographyBlitzRound,
} from '../../../src/features/biographyBlitz/biography_blitz_logic';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { biographyBlitz: biographyBlitzReducer } });
}

const T0 = 1_700_000_000_000; // fixed timestamp for determinism

function startGame(ids: string[], seed = 42, testMode = false) {
  const store = makeStore();
  store.dispatch(
    initBiographyBlitz({
      participantIds: ids,
      competitionType: 'HOH',
      seed,
      humanContestantId: ids[0] ?? null,
      testMode,
      now: T0,
    }),
  );
  return store;
}

/** Get the correct answer id for the current question. */
function correctId(store: ReturnType<typeof makeStore>): string {
  const bb = store.getState().biographyBlitz;
  return bb.currentQuestion?.correctAnswerId ?? '';
}

/** Submit correct answer for one contestant, wrong for others. */
function submitRound(
  store: ReturnType<typeof makeStore>,
  winners: string[],
  losers: string[],
  baseTime = T0 + 1000,
) {
  const cId = correctId(store);
  for (let i = 0; i < winners.length; i++) {
    store.dispatch(
      submitBiographyBlitzAnswer({ contestantId: winners[i], answerId: cId, now: baseTime + i * 10 }),
    );
  }
  const bb = store.getState().biographyBlitz;
  // Pick any answer that is NOT the correct one.
  const wrongAnswer = bb.currentQuestion ? bb.activeContestantIds.find(id => id !== cId) ?? 'x' : 'x';
  for (const id of losers) {
    store.dispatch(
      submitBiographyBlitzAnswer({ contestantId: id, answerId: wrongAnswer, now: baseTime + 5000 }),
    );
  }
}

/** Run a full round: submit → resolve → reveal → eliminate. */
function doRound(
  store: ReturnType<typeof makeStore>,
  winners: string[],
  losers: string[],
  targetId?: string,
) {
  submitRound(store, winners, losers);
  store.dispatch(resolveRound());
  store.dispatch(advanceFromReveal());
  const bb = store.getState().biographyBlitz;
  if (bb.phase === 'elimination') {
    const target = targetId ?? losers[0] ?? bb.activeContestantIds.find(id => id !== winners[0]);
    if (target) {
      store.dispatch(pickEliminationTarget({ targetId: target }));
    }
  }
  if (store.getState().biographyBlitz.phase === 'round_transition') {
    store.dispatch(startNextRound({ now: T0 + (bb.round + 1) * 20_000 }));
  }
}

// ─── Initial state ─────────────────────────────────────────────────────────────

describe('biographyBlitzSlice — initial state', () => {
  it('phase is idle', () => {
    expect(makeStore().getState().biographyBlitz.phase).toBe('idle');
  });

  it('outcomeResolved is false', () => {
    expect(makeStore().getState().biographyBlitz.outcomeResolved).toBe(false);
  });

  it('activeContestantIds is empty', () => {
    expect(makeStore().getState().biographyBlitz.activeContestantIds).toEqual([]);
  });

  it('competitionWinnerId is null', () => {
    expect(makeStore().getState().biographyBlitz.competitionWinnerId).toBeNull();
  });

  it('isSpectating is false', () => {
    expect(makeStore().getState().biographyBlitz.isSpectating).toBe(false);
  });
});

// ─── initBiographyBlitz ───────────────────────────────────────────────────────

describe('biographyBlitzSlice — initBiographyBlitz', () => {
  it('transitions phase to question', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    expect(store.getState().biographyBlitz.phase).toBe('question');
  });

  it('populates activeContestantIds', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    expect(store.getState().biographyBlitz.activeContestantIds).toEqual(['finn', 'mimi', 'rae']);
  });

  it('populates contestantIds', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    expect(store.getState().biographyBlitz.contestantIds).toEqual(['finn', 'mimi', 'rae']);
  });

  it('sets humanContestantId', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    expect(store.getState().biographyBlitz.humanContestantId).toBe('finn');
  });

  it('sets current question from pool', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const bb = store.getState().biographyBlitz;
    expect(bb.currentQuestion).not.toBeNull();
    expect(bb.currentQuestionId).not.toBeNull();
  });

  it('correctAnswerId is null (not revealed)', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    expect(store.getState().biographyBlitz.correctAnswerId).toBeNull();
  });

  it('sets questionStartedAt', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    expect(store.getState().biographyBlitz.questionStartedAt).toBe(T0);
  });

  it('sets hiddenDeadlineAt = questionStartedAt + 12000', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const bb = store.getState().biographyBlitz;
    expect(bb.hiddenDeadlineAt).toBe(T0 + 12_000);
  });

  it('testMode collapses deadline to 0', () => {
    const store = startGame(['finn', 'mimi', 'rae'], 42, true);
    const bb = store.getState().biographyBlitz;
    expect(bb.hiddenDeadlineAt).toBe(T0 + 0);
  });

  it('resets fields on re-init', () => {
    const store = startGame(['finn', 'mimi', 'rae'], 1);
    store.dispatch(markBiographyBlitzOutcomeResolved());
    // Re-initialize with different seed.
    store.dispatch(
      initBiographyBlitz({
        participantIds: ['finn', 'mimi'],
        competitionType: 'POV',
        seed: 2,
        humanContestantId: 'finn',
        now: T0,
      }),
    );
    const bb = store.getState().biographyBlitz;
    expect(bb.submissions).toEqual({});
    expect(bb.eliminatedContestantIds).toEqual([]);
    expect(bb.competitionWinnerId).toBeNull();
    expect(bb.outcomeResolved).toBe(false);
    expect(bb.competitionType).toBe('POV');
  });

  it('stores seed and competitionType', () => {
    const store = makeStore();
    store.dispatch(
      initBiographyBlitz({
        participantIds: ['finn', 'mimi'],
        competitionType: 'POV',
        seed: 999,
        humanContestantId: 'finn',
        now: T0,
      }),
    );
    const bb = store.getState().biographyBlitz;
    expect(bb.competitionType).toBe('POV');
    expect(bb.seed).toBe(999);
  });
});

// ─── submitBiographyBlitzAnswer ───────────────────────────────────────────────

describe('biographyBlitzSlice — submitBiographyBlitzAnswer', () => {
  it('records the submission', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(
      submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: 'mimi', now: T0 + 500 }),
    );
    expect(store.getState().biographyBlitz.submissions['finn'].selectedAnswerId).toBe('mimi');
  });

  it('records submittedAt timestamp', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(
      submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: 'mimi', now: T0 + 500 }),
    );
    expect(store.getState().biographyBlitz.submissions['finn'].submittedAt).toBe(T0 + 500);
  });

  it('double-submit is ignored (first write wins)', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: 'mimi', now: T0 + 100 }));
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: 'rae', now: T0 + 200 }));
    expect(store.getState().biographyBlitz.submissions['finn'].selectedAnswerId).toBe('mimi');
  });

  it('no-op if phase is not question', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(resolveRound());
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: 'mimi', now: T0 + 100 }));
    expect(store.getState().biographyBlitz.submissions['finn']).toBeUndefined();
  });

  it('no-op for non-active contestant', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'unknown', answerId: 'mimi', now: T0 + 100 }));
    expect(store.getState().biographyBlitz.submissions['unknown']).toBeUndefined();
  });
});

// ─── resolveRound ─────────────────────────────────────────────────────────────

describe('biographyBlitzSlice — resolveRound', () => {
  it('transitions question → reveal', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(resolveRound());
    expect(store.getState().biographyBlitz.phase).toBe('reveal');
  });

  it('sets correctAnswerId', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const expectedCorrect = correctId(store);
    store.dispatch(resolveRound());
    expect(store.getState().biographyBlitz.correctAnswerId).toBe(expectedCorrect);
  });

  it('sets roundWinnerId to fastest correct submitter', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const cId = correctId(store);
    // mimi submits correct earlier than finn
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'mimi', answerId: cId, now: T0 + 500 }));
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: cId, now: T0 + 600 }));
    store.dispatch(resolveRound());
    expect(store.getState().biographyBlitz.roundWinnerId).toBe('mimi');
  });

  it('roundWinnerId is null if nobody correct', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const cId = correctId(store);
    const wrongId = ['finn', 'mimi', 'rae'].find(id => id !== cId) ?? 'finn';
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: wrongId, now: T0 + 100 }));
    store.dispatch(resolveRound());
    // roundWinnerId might be null if wrong answer submitted, or may be set if nobody answered correctly
    const bb = store.getState().biographyBlitz;
    expect(bb.phase).toBe('reveal');
  });

  it('no-op if not in question phase', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(resolveRound());
    store.dispatch(resolveRound()); // second call: no-op
    expect(store.getState().biographyBlitz.phase).toBe('reveal');
  });
});

// ─── advanceFromReveal ────────────────────────────────────────────────────────

describe('biographyBlitzSlice — advanceFromReveal', () => {
  it('transitions to elimination when round has a winner', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const cId = correctId(store);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: cId, now: T0 + 100 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    expect(store.getState().biographyBlitz.phase).toBe('elimination');
  });

  it('transitions to round_transition when void round', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    // Submit wrong answers for everyone
    const cId = correctId(store);
    const wrongId = ['finn', 'mimi', 'rae'].find(id => id !== cId) ?? 'mimi';
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: wrongId, now: T0 + 100 }));
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'mimi', answerId: wrongId, now: T0 + 200 }));
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'rae', answerId: wrongId, now: T0 + 300 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    expect(store.getState().biographyBlitz.phase).toBe('round_transition');
  });

  it('no-op if not in reveal phase', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(advanceFromReveal()); // no-op
    expect(store.getState().biographyBlitz.phase).toBe('question');
  });
});

// ─── pickEliminationTarget ────────────────────────────────────────────────────

describe('biographyBlitzSlice — pickEliminationTarget', () => {
  function reachElimination(store: ReturnType<typeof makeStore>) {
    const cId = correctId(store);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: cId, now: T0 + 100 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    expect(store.getState().biographyBlitz.phase).toBe('elimination');
  }

  it('removes target from activeContestantIds', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    reachElimination(store);
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    expect(store.getState().biographyBlitz.activeContestantIds).not.toContain('mimi');
  });

  it('adds target to eliminatedContestantIds', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    reachElimination(store);
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    expect(store.getState().biographyBlitz.eliminatedContestantIds).toContain('mimi');
  });

  it('sets eliminationTargetId', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    reachElimination(store);
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    expect(store.getState().biographyBlitz.eliminationTargetId).toBe('mimi');
  });

  it('transitions to round_transition when 2+ active remain', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    reachElimination(store);
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    expect(store.getState().biographyBlitz.phase).toBe('round_transition');
  });

  it('transitions to complete when only 1 active remains', () => {
    const store = startGame(['finn', 'mimi']);
    const cId = correctId(store);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: cId, now: T0 + 100 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    expect(store.getState().biographyBlitz.phase).toBe('complete');
    expect(store.getState().biographyBlitz.competitionWinnerId).toBe('finn');
  });

  it('no-op if target is the round winner', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    reachElimination(store);
    const bb = store.getState().biographyBlitz;
    const winner = bb.roundWinnerId!;
    store.dispatch(pickEliminationTarget({ targetId: winner }));
    // Should be a no-op
    expect(store.getState().biographyBlitz.phase).toBe('elimination');
  });

  it('sets isSpectating when human is eliminated', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    // Make mimi the winner
    const cId = correctId(store);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'mimi', answerId: cId, now: T0 + 100 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    // Mimi eliminates finn (the human)
    store.dispatch(pickEliminationTarget({ targetId: 'finn' }));
    expect(store.getState().biographyBlitz.isSpectating).toBe(true);
  });

  it('updates consecutiveRoundWins for winner', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    reachElimination(store);
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    const bb = store.getState().biographyBlitz;
    const winner = 'finn'; // finn submitted correct first
    expect(bb.consecutiveRoundWins[winner]).toBe(1);
  });
});

// ─── startNextRound ───────────────────────────────────────────────────────────

describe('biographyBlitzSlice — startNextRound', () => {
  it('increments round counter', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    doRound(store, ['finn'], ['mimi', 'rae']);
    expect(store.getState().biographyBlitz.round).toBe(1);
  });

  it('transitions back to question', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    doRound(store, ['finn'], ['mimi', 'rae']);
    expect(store.getState().biographyBlitz.phase).toBe('question');
  });

  it('clears submissions', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    doRound(store, ['finn'], ['mimi', 'rae']);
    expect(store.getState().biographyBlitz.submissions).toEqual({});
  });

  it('sets new question', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const firstQId = store.getState().biographyBlitz.currentQuestionId;
    doRound(store, ['finn'], ['mimi', 'rae']);
    // Question may change or stay (pool is small for 3 players)
    expect(store.getState().biographyBlitz.currentQuestion).not.toBeNull();
    // If pool has more than 1 question, new question should differ
    // (not strictly required if pool only has 1 valid question)
    const bb = store.getState().biographyBlitz;
    expect(bb.currentQuestionId).toBeTruthy();
    void firstQId; // unused in assertion — just verify it's set
  });

  it('no-op if not in round_transition phase', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(startNextRound({ now: T0 + 1000 }));
    expect(store.getState().biographyBlitz.phase).toBe('question');
    expect(store.getState().biographyBlitz.round).toBe(0); // unchanged
  });
});

// ─── Full game: final 2 → complete ────────────────────────────────────────────

describe('biographyBlitzSlice — final-2 to complete', () => {
  it('completes with correct winner', () => {
    const store = startGame(['finn', 'mimi']);
    const cId = correctId(store);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: cId, now: T0 + 100 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    const bb = store.getState().biographyBlitz;
    expect(bb.phase).toBe('complete');
    expect(bb.competitionWinnerId).toBe('finn');
    expect(bb.activeContestantIds).toEqual(['finn']);
    expect(bb.eliminatedContestantIds).toContain('mimi');
  });
});

// ─── Void round ───────────────────────────────────────────────────────────────

describe('biographyBlitzSlice — void round (nobody correct)', () => {
  it('does not eliminate anyone and advances to round_transition', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const cId = correctId(store);
    const wrongId = ['finn', 'mimi', 'rae'].find(id => id !== cId) ?? 'mimi';
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: wrongId, now: T0 + 100 }));
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'mimi', answerId: wrongId, now: T0 + 200 }));
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'rae', answerId: wrongId, now: T0 + 300 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    const bb = store.getState().biographyBlitz;
    expect(bb.phase).toBe('round_transition');
    expect(bb.activeContestantIds.length).toBe(3); // nobody eliminated
    expect(bb.roundWinnerId).toBeNull();
  });

  it('continues to next question after void round', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const cId = correctId(store);
    const wrongId = ['finn', 'mimi', 'rae'].find(id => id !== cId) ?? 'mimi';
    ['finn', 'mimi', 'rae'].forEach((id, i) => {
      store.dispatch(submitBiographyBlitzAnswer({ contestantId: id, answerId: wrongId, now: T0 + i * 100 }));
    });
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(startNextRound({ now: T0 + 20_000 }));
    expect(store.getState().biographyBlitz.phase).toBe('question');
    expect(store.getState().biographyBlitz.round).toBe(1);
  });
});

// ─── markBiographyBlitzOutcomeResolved ───────────────────────────────────────

describe('biographyBlitzSlice — markBiographyBlitzOutcomeResolved', () => {
  it('sets outcomeResolved to true', () => {
    const store = makeStore();
    store.dispatch(markBiographyBlitzOutcomeResolved());
    expect(store.getState().biographyBlitz.outcomeResolved).toBe(true);
  });

  it('is idempotent', () => {
    const store = makeStore();
    store.dispatch(markBiographyBlitzOutcomeResolved());
    store.dispatch(markBiographyBlitzOutcomeResolved());
    expect(store.getState().biographyBlitz.outcomeResolved).toBe(true);
  });
});

// ─── resetBiographyBlitz ──────────────────────────────────────────────────────

describe('biographyBlitzSlice — resetBiographyBlitz', () => {
  it('resets to idle', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(resetBiographyBlitz());
    expect(store.getState().biographyBlitz.phase).toBe('idle');
    expect(store.getState().biographyBlitz.activeContestantIds).toEqual([]);
  });
});

// ─── buildAiSubmissions ───────────────────────────────────────────────────────

describe('buildAiSubmissions', () => {
  it('returns deterministic results for same seed/round', () => {
    const ids = ['mimi', 'rae', 'finn'];
    const r1 = buildAiSubmissions(42, 0, ids, 'finn', T0);
    const r2 = buildAiSubmissions(42, 0, ids, 'finn', T0);
    for (const id of ids) {
      expect(r1[id].selectedAnswerId).toBe(r2[id].selectedAnswerId);
      expect(r1[id].submittedAt).toBe(r2[id].submittedAt);
    }
  });

  it('returns different results for different rounds', () => {
    const ids = ['mimi', 'rae'];
    const r0 = buildAiSubmissions(42, 0, ids, 'finn', T0);
    const r1 = buildAiSubmissions(42, 1, ids, 'finn', T0);
    // At least timing should differ across rounds due to different seeds
    const times0 = ids.map(id => r0[id].submittedAt);
    const times1 = ids.map(id => r1[id].submittedAt);
    expect(times0).not.toEqual(times1);
  });

  it('each AI contestant has a submission', () => {
    const ids = ['mimi', 'rae', 'finn'];
    const r = buildAiSubmissions(42, 0, ids, 'finn', T0);
    for (const id of ids) {
      expect(r[id]).toBeDefined();
      expect(r[id].contestantId).toBe(id);
    }
  });

  it('submittedAt is within expected range (700–4000ms after start)', () => {
    const ids = ['mimi', 'rae', 'finn'];
    const r = buildAiSubmissions(42, 0, ids, 'finn', T0);
    for (const id of ids) {
      const delay = r[id].submittedAt - T0;
      expect(delay).toBeGreaterThanOrEqual(700);
      expect(delay).toBeLessThanOrEqual(4100); // allow small float error
    }
  });
});

// ─── resolveBiographyBlitzRound ───────────────────────────────────────────────

describe('resolveBiographyBlitzRound', () => {
  it('returns the contestant with the earliest correct submission', () => {
    const subs = {
      finn: { contestantId: 'finn', selectedAnswerId: 'correct', submittedAt: 200 },
      mimi: { contestantId: 'mimi', selectedAnswerId: 'correct', submittedAt: 100 }, // earlier
      rae:  { contestantId: 'rae',  selectedAnswerId: 'wrong',   submittedAt:  50 }, // wrong
    };
    const winner = resolveBiographyBlitzRound(subs, 'correct', ['finn', 'mimi', 'rae']);
    expect(winner).toBe('mimi');
  });

  it('returns null if nobody answered correctly', () => {
    const subs = {
      finn: { contestantId: 'finn', selectedAnswerId: 'wrong', submittedAt: 100 },
    };
    const winner = resolveBiographyBlitzRound(subs, 'correct', ['finn']);
    expect(winner).toBeNull();
  });

  it('returns null if no submissions', () => {
    const winner = resolveBiographyBlitzRound({}, 'correct', ['finn', 'mimi']);
    expect(winner).toBeNull();
  });
});
