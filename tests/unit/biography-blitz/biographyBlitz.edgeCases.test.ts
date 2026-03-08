/**
 * Edge-case unit tests for the new Biography Blitz state machine.
 *
 * Covers:
 *  1.  2-player game (fastest path to winner)
 *  2.  5-player game
 *  3.  All wrong: void round → no elimination
 *  4.  Only one correct: that person wins the round
 *  5.  Two correct: earlier timestamp wins
 *  6.  Double-submit ignored (first write wins)
 *  7.  Elimination target = winner → no-op
 *  8.  Elimination target not active → no-op
 *  9.  Human eliminated → isSpectating = true
 * 10.  Non-human winner → human is not eliminated
 * 11.  Hot streak: 2 consecutive wins activates hotStreakContestantId
 * 12.  Hot streak resets when streak holder does NOT win a round
 * 13.  Hot streak clears when streak holder is eliminated
 * 14.  testMode: hiddenDeadlineAt collapses to questionStartedAt
 * 15.  resolveBiographyBlitzHumanContestantId: returns correct id
 * 16.  chooseBiographyBlitzEliminationTarget: excludes winner
 * 17.  canBiographyBlitzContestantAnswer: correct conditions
 * 18.  Void round does not decrement activeContestantIds
 * 19.  Multiple void rounds in sequence
 * 20.  Final survivor wins immediately on pickEliminationTarget
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
  resolveBiographyBlitzHumanContestantId,
  chooseBiographyBlitzEliminationTarget,
  canBiographyBlitzContestantAnswer,
} from '../../../src/features/biographyBlitz/biography_blitz_logic';

const T0 = 1_700_000_000_000;

function makeStore() {
  return configureStore({ reducer: { biographyBlitz: biographyBlitzReducer } });
}

function startGame(
  ids: string[],
  opts: { seed?: number; testMode?: boolean; humanId?: string } = {},
) {
  const store = makeStore();
  store.dispatch(
    initBiographyBlitz({
      participantIds: ids,
      competitionType: 'HOH',
      seed: opts.seed ?? 42,
      humanContestantId: opts.humanId ?? ids[0] ?? null,
      testMode: opts.testMode ?? false,
      now: T0,
    }),
  );
  return store;
}

function correctId(store: ReturnType<typeof makeStore>): string {
  return store.getState().biographyBlitz.currentQuestion?.correctAnswerId ?? '';
}

function wrongId(store: ReturnType<typeof makeStore>): string {
  const bb = store.getState().biographyBlitz;
  const cId = bb.currentQuestion?.correctAnswerId ?? '';
  return bb.activeContestantIds.find(id => id !== cId) ?? cId;
}

// Make everyone submit wrong answers.
function allWrong(store: ReturnType<typeof makeStore>) {
  const bb = store.getState().biographyBlitz;
  const w = wrongId(store);
  bb.activeContestantIds.forEach((id, i) => {
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: id, answerId: w, now: T0 + i * 100 }));
  });
}

// Make one person win correctly, rest wrong.
function singleWinner(store: ReturnType<typeof makeStore>, winnerId: string) {
  const bb = store.getState().biographyBlitz;
  const cId = correctId(store);
  const w = wrongId(store);
  store.dispatch(submitBiographyBlitzAnswer({ contestantId: winnerId, answerId: cId, now: T0 + 100 }));
  bb.activeContestantIds.filter(id => id !== winnerId).forEach((id, i) => {
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: id, answerId: w, now: T0 + 200 + i * 50 }));
  });
}

// ─── 1. Two-player game ───────────────────────────────────────────────────────
describe('edge cases — 2 player game', () => {
  it('completes in one round when one correct', () => {
    const store = startGame(['finn', 'mimi']);
    const cId = correctId(store);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: cId, now: T0 + 100 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    expect(store.getState().biographyBlitz.phase).toBe('complete');
    expect(store.getState().biographyBlitz.competitionWinnerId).toBe('finn');
  });
});

// ─── 2. Five-player game ──────────────────────────────────────────────────────
describe('edge cases — 5 player game', () => {
  const ids = ['finn', 'mimi', 'rae', 'zara', 'kai'];
  it('starts with 5 active contestants', () => {
    const store = startGame(ids);
    expect(store.getState().biographyBlitz.activeContestantIds.length).toBe(5);
  });
});

// ─── 3. All wrong: void round ─────────────────────────────────────────────────
describe('edge cases — void round (all wrong)', () => {
  it('nobody is eliminated', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    allWrong(store);
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    expect(store.getState().biographyBlitz.phase).toBe('round_transition');
    expect(store.getState().biographyBlitz.activeContestantIds.length).toBe(3);
    expect(store.getState().biographyBlitz.roundWinnerId).toBeNull();
  });
});

// ─── 4. Only one correct ──────────────────────────────────────────────────────
describe('edge cases — only one correct', () => {
  it('that person is roundWinnerId', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    singleWinner(store, 'mimi');
    store.dispatch(resolveRound());
    expect(store.getState().biographyBlitz.roundWinnerId).toBe('mimi');
  });
});

// ─── 5. Two correct: earlier timestamp wins ───────────────────────────────────
describe('edge cases — tie-break by timestamp', () => {
  it('earlier submission wins', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const cId = correctId(store);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'rae', answerId: cId, now: T0 + 300 }));
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'mimi', answerId: cId, now: T0 + 100 })); // earlier
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: cId, now: T0 + 200 }));
    store.dispatch(resolveRound());
    expect(store.getState().biographyBlitz.roundWinnerId).toBe('mimi');
  });
});

// ─── 6. Double-submit ─────────────────────────────────────────────────────────
describe('edge cases — double submit ignored', () => {
  it('first write wins', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: 'mimi', now: T0 + 100 }));
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: 'rae', now: T0 + 200 }));
    expect(store.getState().biographyBlitz.submissions['finn'].selectedAnswerId).toBe('mimi');
  });
});

// ─── 7. Cannot eliminate round winner ────────────────────────────────────────
describe('edge cases — cannot eliminate winner', () => {
  it('pick winner as target is no-op', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    singleWinner(store, 'finn');
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    const winner = store.getState().biographyBlitz.roundWinnerId!;
    store.dispatch(pickEliminationTarget({ targetId: winner }));
    expect(store.getState().biographyBlitz.phase).toBe('elimination'); // no change
  });
});

// ─── 8. Cannot eliminate inactive contestant ──────────────────────────────────
describe('edge cases — cannot eliminate non-active contestant', () => {
  it('pick invalid target is no-op', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    singleWinner(store, 'finn');
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));  // valid
    store.dispatch(startNextRound({ now: T0 + 20_000 }));
    // Now try to pick 'mimi' again (already eliminated)
    singleWinner(store, 'finn');
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' })); // no-op
    expect(store.getState().biographyBlitz.phase).toBe('elimination'); // stuck, no valid pick
  });
});

// ─── 9. Human eliminated → isSpectating ──────────────────────────────────────
describe('edge cases — human eliminated', () => {
  it('isSpectating becomes true', () => {
    const store = startGame(['finn', 'mimi', 'rae'], { humanId: 'finn' });
    singleWinner(store, 'mimi'); // ai wins
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'finn' })); // eliminate human
    expect(store.getState().biographyBlitz.isSpectating).toBe(true);
  });
});

// ─── 10. Non-human winner → human not affected ───────────────────────────────
describe('edge cases — ai wins but human survives', () => {
  it('human remains active', () => {
    const store = startGame(['finn', 'mimi', 'rae'], { humanId: 'finn' });
    singleWinner(store, 'mimi');
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'rae' })); // eliminate ai, not human
    expect(store.getState().biographyBlitz.activeContestantIds).toContain('finn');
    expect(store.getState().biographyBlitz.isSpectating).toBe(false);
  });
});

// ─── 11. Hot streak activation ───────────────────────────────────────────────
describe('edge cases — hot streak', () => {
  it('hotStreakContestantId set after 2 consecutive wins', () => {
    const store = startGame(['finn', 'mimi', 'rae', 'kai']);
    // Round 1: finn wins
    singleWinner(store, 'finn');
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    store.dispatch(startNextRound({ now: T0 + 20_000 }));
    // Round 2: finn wins again
    singleWinner(store, 'finn');
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'rae' }));
    expect(store.getState().biographyBlitz.hotStreakContestantId).toBe('finn');
  });

  it('hotStreakContestantId is null after only 1 win', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    singleWinner(store, 'finn');
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    expect(store.getState().biographyBlitz.hotStreakContestantId).toBeNull();
  });
});

// ─── 12. Hot streak resets ────────────────────────────────────────────────────
describe('edge cases — hot streak reset', () => {
  it('streak resets when holder does not win', () => {
    const store = startGame(['finn', 'mimi', 'rae', 'kai']);
    // Give finn 2 wins
    singleWinner(store, 'finn');
    store.dispatch(resolveRound()); store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    store.dispatch(startNextRound({ now: T0 + 20_000 }));
    singleWinner(store, 'finn');
    store.dispatch(resolveRound()); store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'rae' }));
    expect(store.getState().biographyBlitz.hotStreakContestantId).toBe('finn');
    store.dispatch(startNextRound({ now: T0 + 40_000 }));
    // Round 3: kai wins instead
    singleWinner(store, 'kai');
    store.dispatch(resolveRound()); store.dispatch(advanceFromReveal());
    // Not picking finn (finn doesn't win)
    store.dispatch(pickEliminationTarget({ targetId: 'finn' })); // kai eliminates finn
    // After this round, finn is eliminated, streak should reset
    expect(store.getState().biographyBlitz.hotStreakContestantId).not.toBe('finn');
  });
});

// ─── 13. Hot streak clears when streak holder eliminated ─────────────────────
describe('edge cases — hot streak holder eliminated', () => {
  it('hotStreakContestantId cleared when holder is eliminated', () => {
    const store = startGame(['finn', 'mimi', 'rae', 'kai']);
    // finn gets 2 wins
    singleWinner(store, 'finn');
    store.dispatch(resolveRound()); store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    store.dispatch(startNextRound({ now: T0 + 20_000 }));
    singleWinner(store, 'finn');
    store.dispatch(resolveRound()); store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'rae' }));
    expect(store.getState().biographyBlitz.hotStreakContestantId).toBe('finn');
    store.dispatch(startNextRound({ now: T0 + 40_000 }));
    // kai wins and eliminates finn (the streak holder)
    singleWinner(store, 'kai');
    store.dispatch(resolveRound()); store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'finn' }));
    expect(store.getState().biographyBlitz.hotStreakContestantId).toBeNull();
    expect(store.getState().biographyBlitz.consecutiveRoundWins['finn']).toBeUndefined();
  });
});

// ─── 14. testMode deadline ────────────────────────────────────────────────────
describe('edge cases — testMode', () => {
  it('hiddenDeadlineAt collapses to questionStartedAt', () => {
    const store = startGame(['finn', 'mimi'], { testMode: true });
    const bb = store.getState().biographyBlitz;
    expect(bb.hiddenDeadlineAt).toBe(bb.questionStartedAt);
  });
});

// ─── 15. resolveBiographyBlitzHumanContestantId ──────────────────────────────
describe('resolveBiographyBlitzHumanContestantId', () => {
  it('returns id when it is in participantIds', () => {
    const result = resolveBiographyBlitzHumanContestantId(['finn', 'mimi', 'rae'], 'finn');
    expect(result).toBe('finn');
  });

  it('returns null when id is not in participantIds', () => {
    const result = resolveBiographyBlitzHumanContestantId(['finn', 'mimi'], 'unknown');
    expect(result).toBeNull();
  });

  it('returns null when isHumanId is null', () => {
    const result = resolveBiographyBlitzHumanContestantId(['finn', 'mimi'], null);
    expect(result).toBeNull();
  });
});

// ─── 16. chooseBiographyBlitzEliminationTarget ───────────────────────────────
describe('chooseBiographyBlitzEliminationTarget', () => {
  it('never returns the winner', () => {
    const active = ['finn', 'mimi', 'rae', 'kai'];
    for (let i = 0; i < 10; i++) {
      const target = chooseBiographyBlitzEliminationTarget(active, 'finn', i * 100, i);
      expect(target).not.toBe('finn');
    }
  });

  it('returns null when no valid targets', () => {
    const result = chooseBiographyBlitzEliminationTarget(['finn'], 'finn', 42, 0);
    expect(result).toBeNull();
  });

  it('returns a valid active contestant', () => {
    const active = ['finn', 'mimi', 'rae'];
    const target = chooseBiographyBlitzEliminationTarget(active, 'finn', 42, 0);
    expect(['mimi', 'rae']).toContain(target);
  });
});

// ─── 17. canBiographyBlitzContestantAnswer ───────────────────────────────────
describe('canBiographyBlitzContestantAnswer', () => {
  it('returns true when all conditions met', () => {
    const store = startGame(['finn', 'mimi']);
    const bb = store.getState().biographyBlitz;
    expect(canBiographyBlitzContestantAnswer(bb, 'finn', T0 + 100)).toBe(true);
  });

  it('returns false when not in question phase', () => {
    const store = startGame(['finn', 'mimi']);
    store.dispatch(resolveRound());
    const bb = store.getState().biographyBlitz;
    expect(canBiographyBlitzContestantAnswer(bb, 'finn', T0 + 100)).toBe(false);
  });

  it('returns false when already submitted', () => {
    const store = startGame(['finn', 'mimi']);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: 'mimi', now: T0 + 100 }));
    const bb = store.getState().biographyBlitz;
    expect(canBiographyBlitzContestantAnswer(bb, 'finn', T0 + 200)).toBe(false);
  });

  it('returns false when deadline passed', () => {
    const store = startGame(['finn', 'mimi']);
    const bb = store.getState().biographyBlitz;
    const past = (bb.hiddenDeadlineAt ?? T0 + 12_000) + 100;
    expect(canBiographyBlitzContestantAnswer(bb, 'finn', past)).toBe(false);
  });

  it('returns false for eliminated contestant', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const cId = correctId(store);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: cId, now: T0 + 100 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    store.dispatch(startNextRound({ now: T0 + 20_000 }));
    const bb = store.getState().biographyBlitz;
    expect(canBiographyBlitzContestantAnswer(bb, 'mimi', T0 + 20_100)).toBe(false);
  });
});

// ─── 18. Void round: activeContestantIds unchanged ───────────────────────────
describe('edge cases — void round preserves active list', () => {
  it('activeContestantIds same after void round', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    const before = [...store.getState().biographyBlitz.activeContestantIds];
    allWrong(store);
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(startNextRound({ now: T0 + 20_000 }));
    expect(store.getState().biographyBlitz.activeContestantIds).toEqual(before);
  });
});

// ─── 19. Multiple void rounds ─────────────────────────────────────────────────
describe('edge cases — multiple void rounds', () => {
  it('survives 3 void rounds without elimination', () => {
    const store = startGame(['finn', 'mimi', 'rae']);
    for (let i = 0; i < 3; i++) {
      allWrong(store);
      store.dispatch(resolveRound());
      store.dispatch(advanceFromReveal());
      store.dispatch(startNextRound({ now: T0 + (i + 1) * 20_000 }));
    }
    expect(store.getState().biographyBlitz.activeContestantIds.length).toBe(3);
    expect(store.getState().biographyBlitz.eliminatedContestantIds.length).toBe(0);
  });
});

// ─── 20. Final survivor wins immediately ──────────────────────────────────────
describe('edge cases — final survivor', () => {
  it('phase is complete and competitionWinnerId set immediately', () => {
    const store = startGame(['finn', 'mimi']);
    const cId = correctId(store);
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: cId, now: T0 + 100 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));
    const bb = store.getState().biographyBlitz;
    expect(bb.phase).toBe('complete');
    expect(bb.competitionWinnerId).not.toBeNull();
    // No additional startNextRound needed
    expect(bb.activeContestantIds.length).toBe(1);
  });
});
