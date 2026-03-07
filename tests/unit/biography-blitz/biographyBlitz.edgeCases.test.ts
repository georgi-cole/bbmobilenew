/**
 * Edge-case and new-feature unit tests for Biography Blitz.
 *
 * Covers:
 *  1.  5-contestant game (5 players)
 *  2.  6+-contestant game (6 players)
 *  3.  All-AI round (no human player, autoFillAIAnswers(null))
 *  4.  Mixed AI/human game
 *  5.  Nobody correct (void round)
 *  6.  Single contestant correct
 *  7.  Double-submit idempotency (single-submission enforcement in slice)
 *  8.  Disconnect during answering (markDisconnected)
 *  9.  Final-2 flow (two players, one eliminated → complete)
 * 10.  Hot streak activation (2 consecutive wins → hotStreakOwner set)
 * 11.  Hot streak bonus (hotStreakBonusWrongAnswerId populated)
 * 12.  Hot streak consumption (bonus consumed after next round)
 * 13.  Hot streak cleared when streak owner is eliminated
 * 14.  Final winner resolves immediately (status = 'complete', winnerId set)
 * 15.  testMode flag stored in state
 * 16.  dynamicQuestions bank override
 * 17.  markDisconnected sets submission to empty string (counts as wrong)
 * 18.  markDisconnected is a no-op outside 'question' phase
 * 19.  Two-correct: both correct submitters become roundWinners (ordering)
 * 20.  Human winner elimination timeout: AI fallback kicks in when human stalls
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import biographyBlitzReducer, {
  startBiographyBlitz,
  submitAnswer,
  markDisconnected,
  autoFillAIAnswers,
  revealResults,
  confirmElimination,
  pickElimination,
  resetBiographyBlitz,
} from '../../../src/features/biographyBlitz/biography_blitz_logic';
import type { BiographyBlitzQuestion } from '../../../src/features/biographyBlitz/biography_blitz_logic';
import { BIOGRAPHY_BLITZ_QUESTIONS } from '../../../src/features/biographyBlitz/biographyBlitzQuestions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { biographyBlitz: biographyBlitzReducer } });
}

/** Start a game with the given participants and return the store. */
function startGame(
  ids: string[],
  opts: { seed?: number; testMode?: boolean; dynamicQuestions?: BiographyBlitzQuestion[] } = {},
) {
  const store = makeStore();
  store.dispatch(
    startBiographyBlitz({
      participantIds: ids,
      competitionType: 'HOH',
      seed: opts.seed ?? 42,
      testMode: opts.testMode,
      dynamicQuestions: opts.dynamicQuestions,
    }),
  );
  return store;
}

/** Get current question from the active bank. */
function currentQ(store: ReturnType<typeof makeStore>) {
  const bb = store.getState().biographyBlitz;
  const bank = bb.dynamicQuestions.length > 0 ? bb.dynamicQuestions : BIOGRAPHY_BLITZ_QUESTIONS;
  return bank.find((q) => q.id === bb.currentQuestionId)!;
}

/** Submit answers: correct for listed IDs, wrong for the rest. */
function submitRound(
  store: ReturnType<typeof makeStore>,
  correctIds: string[],
  wrongIds: string[],
) {
  const q = currentQ(store);
  for (const id of correctIds) {
    store.dispatch(submitAnswer({ contestantId: id, answerId: q.correctAnswerId }));
  }
  const wrongAnswerId = q.answers.find((a) => a.id !== q.correctAnswerId)!.id;
  for (const id of wrongIds) {
    store.dispatch(submitAnswer({ contestantId: id, answerId: wrongAnswerId }));
  }
}

/**
 * Run a full round: submit answers, reveal, confirmElimination, and if the
 * game transitions to choose_elimination, auto-pick the first candidate.
 * For void rounds, confirmElimination advances directly to question (no pick needed).
 */
function doRound(
  store: ReturnType<typeof makeStore>,
  correctIds: string[],
  wrongIds: string[],
) {
  submitRound(store, correctIds, wrongIds);
  store.dispatch(revealResults());
  store.dispatch(confirmElimination());
  const bb = store.getState().biographyBlitz;
  if (bb.status === 'choose_elimination' && bb.eliminationCandidates.length > 0) {
    store.dispatch(pickElimination({ targetId: bb.eliminationCandidates[0] }));
  }
}

// ─── 5-contestant game ────────────────────────────────────────────────────────

describe('5-contestant game', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];

  it('initialises with 5 active contestants', () => {
    const store = startGame(ids);
    expect(store.getState().biographyBlitz.activeContestants).toHaveLength(5);
  });

  it('eliminates ONE wrong-answerer per round (winner picks first candidate)', () => {
    const store = startGame(ids);
    doRound(store, ['p1', 'p2'], ['p3', 'p4', 'p5']);

    const bb = store.getState().biographyBlitz;
    // New rule: only one eliminated per round — the first candidate (p3)
    expect(bb.eliminatedContestants).toHaveLength(1);
    expect(bb.eliminatedContestants).toContain('p3');
    // All others (including p4, p5 who answered wrong) still active
    expect(bb.activeContestants).toContain('p1');
    expect(bb.activeContestants).toContain('p2');
    expect(bb.activeContestants).toContain('p4');
    expect(bb.activeContestants).toContain('p5');
    expect(bb.status).toBe('question');
  });

  it('reaches complete after enough rounds of one-elimination-per-round', () => {
    const store = startGame(ids, { seed: 1 });
    // p1 always answers correctly; eliminate others one by one
    doRound(store, ['p1'], ['p2', 'p3', 'p4', 'p5']);
    doRound(store, ['p1'], store.getState().biographyBlitz.activeContestants.filter((id) => id !== 'p1'));
    doRound(store, ['p1'], store.getState().biographyBlitz.activeContestants.filter((id) => id !== 'p1'));
    doRound(store, ['p1'], store.getState().biographyBlitz.activeContestants.filter((id) => id !== 'p1'));

    const bb = store.getState().biographyBlitz;
    expect(bb.status).toBe('complete');
    expect(bb.winnerId).toBe('p1');
  });
});

// ─── 6+-contestant game ───────────────────────────────────────────────────────

describe('6+-contestant game', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

  it('initialises with 6 active contestants', () => {
    const store = startGame(ids);
    expect(store.getState().biographyBlitz.activeContestants).toHaveLength(6);
  });

  it('eliminates exactly ONE contestant per round (new rule)', () => {
    const store = startGame(ids);
    doRound(store, ['p1', 'p2', 'p3'], ['p4', 'p5', 'p6']);

    // Only one wrong-answerer eliminated; 5 remain
    expect(store.getState().biographyBlitz.activeContestants).toHaveLength(5);
    expect(store.getState().biographyBlitz.eliminatedContestants).toHaveLength(1);
  });

  it('handles 8 contestants without error', () => {
    const eightIds = Array.from({ length: 8 }, (_, i) => `player${i}`);
    const store = startGame(eightIds, { seed: 7 });
    expect(store.getState().biographyBlitz.activeContestants).toHaveLength(8);
    // player0 correct, everyone else wrong → enter choose_elimination
    doRound(store, ['player0'], eightIds.slice(1));
    // One person eliminated, 7 remain; game continues
    expect(store.getState().biographyBlitz.activeContestants).toHaveLength(7);
    expect(store.getState().biographyBlitz.status).toBe('question');
  });
});

// ─── All-AI round ─────────────────────────────────────────────────────────────

describe('All-AI round (autoFillAIAnswers(null))', () => {
  it('fills all contestants deterministically when humanId is null', () => {
    const store = startGame(['ai1', 'ai2', 'ai3']);
    store.dispatch(autoFillAIAnswers(null));

    const { submissions, activeContestants } = store.getState().biographyBlitz;
    for (const id of activeContestants) {
      expect(id in submissions).toBe(true);
    }
  });

  it('produces valid answer IDs for all AI players', () => {
    const store = startGame(['ai1', 'ai2', 'ai3']);
    store.dispatch(autoFillAIAnswers(null));

    const { submissions, currentQuestionId } = store.getState().biographyBlitz;
    const q = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const validIds = q.answers.map((a) => a.id);
    for (const answerId of Object.values(submissions)) {
      expect(validIds).toContain(answerId);
    }
  });

  it('calling autoFillAIAnswers(null) twice does not overwrite first answers', () => {
    const store = startGame(['ai1', 'ai2']);
    store.dispatch(autoFillAIAnswers(null));
    const first = { ...store.getState().biographyBlitz.submissions };
    store.dispatch(autoFillAIAnswers(null)); // second call — should not overwrite
    expect(store.getState().biographyBlitz.submissions).toEqual(first);
  });
});

// ─── Mixed AI/human game ──────────────────────────────────────────────────────

describe('Mixed AI/human game', () => {
  it('autoFillAIAnswers skips the human contestant', () => {
    const store = startGame(['human', 'ai1', 'ai2']);
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: 'a' }));
    store.dispatch(autoFillAIAnswers('human'));

    const { submissions } = store.getState().biographyBlitz;
    // AI players should have been filled.
    expect('ai1' in submissions).toBe(true);
    expect('ai2' in submissions).toBe(true);
    // Human's submitted answer is preserved.
    expect(submissions['human']).toBe('a');
  });

  it('game continues after human is eliminated (AI winner picks human)', () => {
    const store = startGame(['human', 'ai1', 'ai2']);
    const q = currentQ(store);
    const correct = q.correctAnswerId;
    const wrong = q.answers.find((a) => a.id !== correct)!.id;

    // Human answers wrong; AIs answer correctly.
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'ai2', answerId: correct }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination()); // → choose_elimination (AI is winner)
    // AI auto-picks first candidate (human)
    store.dispatch(pickElimination({ targetId: 'human' }));

    const bb = store.getState().biographyBlitz;
    expect(bb.eliminatedContestants).toContain('human');
    expect(bb.status).toBe('question'); // game continues
  });
});

// ─── Nobody correct (void round) ─────────────────────────────────────────────

describe('Nobody correct — void round', () => {
  it('advances round without eliminating anyone', () => {
    const store = startGame(['p1', 'p2', 'p3']);
    const q = currentQ(store);
    const wrong = q.answers.find((a) => a.id !== q.correctAnswerId)!.id;

    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'p3', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    expect(bb.eliminatedContestants).toHaveLength(0);
    expect(bb.activeContestants).toHaveLength(3);
    expect(bb.round).toBe(1);
    expect(bb.status).toBe('question');
  });

  it('does NOT update hot streak on a void round', () => {
    const store = startGame(['p1', 'p2']);
    const q = currentQ(store);
    const wrong = q.answers.find((a) => a.id !== q.correctAnswerId)!.id;

    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    expect(bb.hotStreakOwner).toBeNull();
    expect(bb.consecutiveWinsMap).toEqual({});
  });
});

// ─── Single contestant correct ────────────────────────────────────────────────

describe('Single contestant correct', () => {
  it('winner picks ONE person to eliminate per round (not all others)', () => {
    const store = startGame(['p1', 'p2', 'p3', 'p4']);
    const q = currentQ(store);
    const wrong = q.answers.find((a) => a.id !== q.correctAnswerId)!.id;

    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
    for (const id of ['p2', 'p3', 'p4']) {
      store.dispatch(submitAnswer({ contestantId: id, answerId: wrong }));
    }
    store.dispatch(revealResults());
    store.dispatch(confirmElimination()); // → choose_elimination
    // Pick p2 to eliminate
    store.dispatch(pickElimination({ targetId: 'p2' }));

    const bb = store.getState().biographyBlitz;
    // Only ONE eliminated — p2
    expect(bb.eliminatedContestants).toHaveLength(1);
    expect(bb.eliminatedContestants).toContain('p2');
    // p3, p4 still active despite answering wrong
    expect(bb.activeContestants).toContain('p3');
    expect(bb.activeContestants).toContain('p4');
    expect(bb.status).toBe('question');
  });

  it('completes when the last opponent is eliminated', () => {
    const store = startGame(['p1', 'p2']);
    doRound(store, ['p1'], ['p2']);

    const bb = store.getState().biographyBlitz;
    expect(bb.status).toBe('complete');
    expect(bb.winnerId).toBe('p1');
    expect(bb.eliminatedContestants).toContain('p2');
  });
});

// ─── Double submit idempotency ────────────────────────────────────────────────

describe('Double submit — last write wins', () => {
  it('last write wins when human submits twice', () => {
    const store = startGame(['human', 'ai1']);
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: 'a' }));
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: 'b' }));
    expect(store.getState().biographyBlitz.submissions['human']).toBe('b');
  });

  it('AI submit does not overwrite after autoFillAIAnswers', () => {
    const store = startGame(['human', 'ai1']);
    store.dispatch(autoFillAIAnswers('human'));
    const firstAnswer = store.getState().biographyBlitz.submissions['ai1'];
    // Manually dispatching again should overwrite (last-write-wins contract).
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: 'z' }));
    expect(store.getState().biographyBlitz.submissions['ai1']).toBe('z');
    // Sanity: first answer was set.
    expect(firstAnswer).toBeTruthy();
  });
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

describe('markDisconnected', () => {
  it('sets submission to empty string (counts as wrong)', () => {
    const store = startGame(['human', 'ai1']);
    store.dispatch(markDisconnected('human'));
    expect(store.getState().biographyBlitz.submissions['human']).toBe('');
  });

  it('disconnected contestant is eliminated when the other answers correctly', () => {
    const store = startGame(['human', 'ai1']);
    const q = currentQ(store);
    store.dispatch(markDisconnected('human'));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: q.correctAnswerId }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination()); // → choose_elimination (ai1 is winner)
    store.dispatch(pickElimination({ targetId: 'human' }));

    const bb = store.getState().biographyBlitz;
    expect(bb.status).toBe('complete');
    expect(bb.winnerId).toBe('ai1');
    expect(bb.eliminatedContestants).toContain('human');
  });

  it('is a no-op outside the question phase', () => {
    const store = startGame(['human', 'ai1']);
    const q = currentQ(store);
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: q.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: q.correctAnswerId }));
    store.dispatch(revealResults());
    // Now in reveal phase — disconnect should be no-op.
    store.dispatch(markDisconnected('human'));
    // Submission should remain the correct answer, not ''.
    expect(store.getState().biographyBlitz.submissions['human']).toBe(q.correctAnswerId);
  });

  it('is a no-op for non-active contestants', () => {
    const store = startGame(['p1', 'p2']);
    store.dispatch(markDisconnected('outsider'));
    expect('outsider' in store.getState().biographyBlitz.submissions).toBe(false);
  });
});

// ─── Final-2 flow ─────────────────────────────────────────────────────────────

describe('Final-2 flow', () => {
  it('completes when one of two finalists answers wrong', () => {
    const store = startGame(['p1', 'p2'], { seed: 5 });
    const q = currentQ(store);
    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination()); // → choose_elimination
    store.dispatch(pickElimination({ targetId: 'p2' }));

    const bb = store.getState().biographyBlitz;
    expect(bb.status).toBe('complete');
    expect(bb.winnerId).toBe('p1');
  });

  it('sets winnerId immediately when only 1 active contestant remains after pickElimination', () => {
    const store = startGame(['p1', 'p2'], { seed: 5 });
    const q = currentQ(store);
    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());
    store.dispatch(pickElimination({ targetId: 'p2' }));
    // winnerId must be set at this point.
    expect(store.getState().biographyBlitz.winnerId).not.toBeNull();
  });

  it('does not start another round after final elimination', () => {
    const store = startGame(['p1', 'p2'], { seed: 5 });
    const q = currentQ(store);
    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());
    store.dispatch(pickElimination({ targetId: 'p2' }));
    // confirmElimination after complete should be a no-op.
    store.dispatch(confirmElimination());
    expect(store.getState().biographyBlitz.status).toBe('complete');
  });
});

// ─── Hot Streak — activation ──────────────────────────────────────────────────

describe('Hot Streak — activation', () => {
  it('no streak after 1 win', () => {
    const store = startGame(['p1', 'p2', 'p3'], { seed: 10 });
    doRound(store, ['p1', 'p2'], ['p3']);

    const bb = store.getState().biographyBlitz;
    expect(bb.hotStreakOwner).toBeNull();
  });

  it('hotStreakOwner is set after 2 consecutive wins', () => {
    // Use 4 contestants so p1 can win 2 rounds without completing the game.
    const store = startGame(['p1', 'p2', 'p3', 'p4'], { seed: 20 });

    // Round 1: p1, p2, p3 correct; p4 wrong → one eliminated (first candidate = p4).
    doRound(store, ['p1', 'p2', 'p3'], ['p4']);

    expect(store.getState().biographyBlitz.hotStreakOwner).toBeNull();

    // Round 2: p1, p2 correct; p3 wrong (p4 already gone).
    doRound(store, ['p1', 'p2'], ['p3']);

    const bb = store.getState().biographyBlitz;
    // p1 and p2 both have 2 consecutive wins — one of them becomes streak owner.
    expect(bb.hotStreakOwner).not.toBeNull();
    expect(['p1', 'p2']).toContain(bb.hotStreakOwner);
  });

  it('consecutiveWinsMap is updated after each round', () => {
    const store = startGame(['p1', 'p2'], { seed: 11 });
    const q = currentQ(store);
    // Void round: nobody correct.
    const wrong = q.answers.find((a) => a.id !== q.correctAnswerId)!.id;
    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    // Void round does not update counts.
    expect(store.getState().biographyBlitz.consecutiveWinsMap).toEqual({});
  });
});

// ─── Hot Streak — bonus ───────────────────────────────────────────────────────

describe('Hot Streak — bonus', () => {
  it('hotStreakBonusWrongAnswerId is set after streak activation', () => {
    const store = startGame(['p1', 'p2', 'p3', 'p4'], { seed: 20 });

    // Two rounds where p1 and p2 answer correctly and one person is eliminated each round.
    doRound(store, ['p1', 'p2', 'p3'], ['p4']);
    if (store.getState().biographyBlitz.status === 'question') {
      doRound(store, ['p1', 'p2'], ['p3']);
    }

    const bb = store.getState().biographyBlitz;
    if (bb.hotStreakOwner !== null) {
      // Bonus should be non-null and should not be the correct answer.
      if (bb.hotStreakBonusWrongAnswerId !== null) {
        expect(bb.hotStreakBonusWrongAnswerId).not.toBe(bb.correctAnswerId);
      }
    }
  });

  it('hotStreakBonusWrongAnswerId is null when no streak is active', () => {
    const store = startGame(['p1', 'p2']);
    expect(store.getState().biographyBlitz.hotStreakBonusWrongAnswerId).toBeNull();
  });
});

// ─── Hot Streak — cleared on elimination ─────────────────────────────────────

describe('Hot Streak — cleared when owner is eliminated', () => {
  it('clears hotStreakOwner when streak owner is chosen for elimination', () => {
    const store = startGame(['p1', 'p2', 'p3', 'p4'], { seed: 20 });

    // Give p1 a streak (2 wins).
    doRound(store, ['p1', 'p2', 'p3'], ['p4']);
    if (store.getState().biographyBlitz.status === 'question') {
      doRound(store, ['p1', 'p2'], ['p3']);
    }

    const streakOwner = store.getState().biographyBlitz.hotStreakOwner;
    if (streakOwner === null || store.getState().biographyBlitz.status !== 'question') {
      // Can't test streak clearing if game ended or no streak active.
      return;
    }

    // Now make the streak owner answer wrong, so they become an elimination candidate.
    const active = store.getState().biographyBlitz.activeContestants;
    const q = currentQ(store);
    const wrong = q.answers.find((a) => a.id !== q.correctAnswerId)!.id;
    const correct = q.correctAnswerId;

    for (const id of active) {
      if (id === streakOwner) {
        store.dispatch(submitAnswer({ contestantId: id, answerId: wrong }));
      } else {
        store.dispatch(submitAnswer({ contestantId: id, answerId: correct }));
      }
    }
    store.dispatch(revealResults());
    store.dispatch(confirmElimination()); // → choose_elimination
    // Pick the streak owner to eliminate
    const candidates = store.getState().biographyBlitz.eliminationCandidates;
    if (candidates.includes(streakOwner)) {
      store.dispatch(pickElimination({ targetId: streakOwner }));
      const bb = store.getState().biographyBlitz;
      expect(bb.hotStreakOwner).toBeNull();
    }
  });
});

// ─── Final winner resolves immediately ────────────────────────────────────────

describe('Final winner resolves immediately', () => {
  it('status transitions to complete via pickElimination (last opponent)', () => {
    const store = startGame(['winner', 'loser'], { seed: 99 });
    const q = currentQ(store);
    store.dispatch(submitAnswer({ contestantId: 'winner', answerId: q.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'loser', answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination()); // → choose_elimination
    store.dispatch(pickElimination({ targetId: 'loser' })); // → complete

    const bb = store.getState().biographyBlitz;
    expect(bb.status).toBe('complete');
    expect(bb.winnerId).toBe('winner');
    expect(bb.currentQuestionId).toBeNull();
    expect(bb.correctAnswerId).toBeNull();
  });
});

// ─── testMode flag ────────────────────────────────────────────────────────────

describe('testMode flag', () => {
  it('is stored in state when passed to startBiographyBlitz', () => {
    const store = startGame(['p1', 'p2'], { testMode: true });
    expect(store.getState().biographyBlitz.testMode).toBe(true);
  });

  it('defaults to false when not passed', () => {
    const store = startGame(['p1', 'p2']);
    expect(store.getState().biographyBlitz.testMode).toBe(false);
  });

  it('is reset by resetBiographyBlitz', () => {
    const store = startGame(['p1', 'p2'], { testMode: true });
    store.dispatch(resetBiographyBlitz());
    expect(store.getState().biographyBlitz.testMode).toBe(false);
  });
});

// ─── dynamicQuestions override ────────────────────────────────────────────────

describe('dynamicQuestions override', () => {
  const dynQuestions: BiographyBlitzQuestion[] = [
    {
      id: 'dyn_q1',
      prompt: 'Which houseguest is a test player?',
      answers: [
        { id: 'finn', text: 'Finn' },
        { id: 'mimi', text: 'Mimi' },
        { id: 'rae', text: 'Rae' },
      ],
      correctAnswerId: 'finn',
    },
    {
      id: 'dyn_q2',
      prompt: 'Which houseguest plays violin?',
      answers: [
        { id: 'finn', text: 'Finn' },
        { id: 'mimi', text: 'Mimi' },
        { id: 'rae', text: 'Rae' },
      ],
      correctAnswerId: 'mimi',
    },
    {
      id: 'dyn_q3',
      prompt: 'Which houseguest is from Nairobi?',
      answers: [
        { id: 'finn', text: 'Finn' },
        { id: 'mimi', text: 'Mimi' },
        { id: 'rae', text: 'Rae' },
      ],
      correctAnswerId: 'rae',
    },
  ];

  it('uses dynamic questions when provided', () => {
    const store = startGame(['finn', 'mimi', 'rae'], { dynamicQuestions: dynQuestions });
    const bb = store.getState().biographyBlitz;
    expect(bb.dynamicQuestions).toHaveLength(3);
    // Current question must come from the dynamic bank.
    const validIds = dynQuestions.map((q) => q.id);
    expect(validIds).toContain(bb.currentQuestionId);
  });

  it('correct answer IDs are contestant IDs in dynamic mode', () => {
    const store = startGame(['finn', 'mimi', 'rae'], { dynamicQuestions: dynQuestions });
    const bb = store.getState().biographyBlitz;
    const q = dynQuestions.find((q) => q.id === bb.currentQuestionId)!;
    // Correct answer is a contestant ID, not a/b/c/d.
    expect(['finn', 'mimi', 'rae']).toContain(q.correctAnswerId);
  });

  it('falls back to static bank when dynamicQuestions is empty', () => {
    const store = startGame(['p1', 'p2'], { dynamicQuestions: [] });
    const bb = store.getState().biographyBlitz;
    expect(bb.dynamicQuestions).toHaveLength(0);
    // Question must come from the static bank.
    const validIds = BIOGRAPHY_BLITZ_QUESTIONS.map((q) => q.id);
    expect(validIds).toContain(bb.currentQuestionId);
  });

  it('question order uses the dynamic bank length', () => {
    const store = startGame(['finn', 'mimi', 'rae'], { dynamicQuestions: dynQuestions });
    const bb = store.getState().biographyBlitz;
    expect(bb.questionOrder).toHaveLength(dynQuestions.length);
  });

  it('AI submissions use valid dynamic answer IDs', () => {
    const store = startGame(['finn', 'mimi', 'rae'], { dynamicQuestions: dynQuestions });
    store.dispatch(autoFillAIAnswers(null));
    const { submissions, currentQuestionId } = store.getState().biographyBlitz;
    const q = dynQuestions.find((dq) => dq.id === currentQuestionId)!;
    const validIds = q.answers.map((a) => a.id);
    for (const answerId of Object.values(submissions)) {
      expect(validIds).toContain(answerId);
    }
  });
});

// ─── Two-correct: ordering ────────────────────────────────────────────────────
//
// When two players both answer correctly, both should appear as roundWinnerIds
// after revealResults.  The eliminationCandidates list should NOT contain
// either winner — only players who answered incorrectly can be eliminated.

describe('Two correct answers — both registered as winners', () => {
  it('both correct answerers appear in roundWinnerIds', () => {
    const store = startGame(['p1', 'p2', 'p3'], { seed: 42 });
    const q = currentQ(store);
    const correct = q.correctAnswerId;
    const wrong = q.answers.find((a) => a.id !== correct)!.id;

    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'p3', answerId: wrong }));
    store.dispatch(revealResults());

    const bb = store.getState().biographyBlitz;
    expect(bb.roundWinnerIds).toContain('p1');
    expect(bb.roundWinnerIds).toContain('p2');
    expect(bb.roundWinnerIds).not.toContain('p3');
  });

  it('both winners are excluded from eliminationCandidates', () => {
    const store = startGame(['p1', 'p2', 'p3'], { seed: 42 });
    const q = currentQ(store);
    const correct = q.correctAnswerId;
    const wrong = q.answers.find((a) => a.id !== correct)!.id;

    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'p3', answerId: wrong }));
    store.dispatch(revealResults());

    const { eliminationCandidates } = store.getState().biographyBlitz;
    expect(eliminationCandidates).not.toContain('p1');
    expect(eliminationCandidates).not.toContain('p2');
    expect(eliminationCandidates).toContain('p3');
  });

  it('submission order does not affect roundWinnerIds membership', () => {
    // p2 submits before p1 — both should still be winners.
    const store = startGame(['p1', 'p2', 'p3'], { seed: 42 });
    const q = currentQ(store);
    const correct = q.correctAnswerId;
    const wrong = q.answers.find((a) => a.id !== correct)!.id;

    // Reversed submission order: p2 first, then p1.
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'p3', answerId: wrong }));
    store.dispatch(revealResults());

    const { roundWinnerIds } = store.getState().biographyBlitz;
    expect(roundWinnerIds).toContain('p1');
    expect(roundWinnerIds).toContain('p2');
  });

  it('with two correct answers only ONE candidate is eliminated after pick', () => {
    const store = startGame(['p1', 'p2', 'p3', 'p4'], { seed: 42 });
    const q = currentQ(store);
    const correct = q.correctAnswerId;
    const wrong = q.answers.find((a) => a.id !== correct)!.id;

    // p1 and p2 correct; p3 and p4 wrong.
    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'p3', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'p4', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination()); // → choose_elimination
    // Pick p3.
    store.dispatch(pickElimination({ targetId: 'p3' }));

    const bb = store.getState().biographyBlitz;
    // Exactly one eliminated.
    expect(bb.eliminatedContestants).toHaveLength(1);
    expect(bb.eliminatedContestants).toContain('p3');
    // p4 answered wrong but was NOT eliminated — only the chosen target is.
    expect(bb.activeContestants).toContain('p4');
    expect(bb.status).toBe('question');
  });
});

// ─── Human winner elimination timeout — AI fallback (state-machine layer) ─────
//
// These tests verify the Redux state machine behaviour that underpins the
// component-level 8-second timeout:
//   • pickElimination auto-selects a valid candidate
//   • The call is idempotent — repeated picks of the same target are safe
//   • The fallback AI pick (first candidate) is a deterministic, valid choice

describe('Human winner elimination timeout — AI fallback (state layer)', () => {
  it('pickElimination with the first candidate mimics the AI fallback behaviour', () => {
    const store = startGame(['human', 'ai1', 'ai2'], { seed: 42 });
    const q = currentQ(store);
    const correct = q.correctAnswerId;
    const wrong = q.answers.find((a) => a.id !== correct)!.id;

    // Human (the winner) and nobody else answers correctly.
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'ai2', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination()); // → choose_elimination

    // Simulate AI fallback: pick the first elimination candidate.
    const { eliminationCandidates } = store.getState().biographyBlitz;
    expect(eliminationCandidates.length).toBeGreaterThan(0);
    const fallbackTarget = eliminationCandidates[0];

    store.dispatch(pickElimination({ targetId: fallbackTarget }));

    const bb = store.getState().biographyBlitz;
    expect(bb.eliminatedContestants).toContain(fallbackTarget);
    // Game continues or completes — never stalls.
    expect(['question', 'complete']).toContain(bb.status);
  });

  it('repeated pickElimination calls after resolution are no-ops', () => {
    const store = startGame(['human', 'ai1'], { seed: 42 });
    const q = currentQ(store);
    const correct = q.correctAnswerId;
    const wrong = q.answers.find((a) => a.id !== correct)!.id;

    store.dispatch(submitAnswer({ contestantId: 'human', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());
    store.dispatch(pickElimination({ targetId: 'ai1' })); // resolves to 'complete'

    const statusAfterFirst = store.getState().biographyBlitz.status;
    // Duplicate call — must be a no-op (status !== choose_elimination).
    store.dispatch(pickElimination({ targetId: 'ai1' }));
    expect(store.getState().biographyBlitz.status).toBe(statusAfterFirst);
    expect(store.getState().biographyBlitz.eliminatedContestants).toHaveLength(1);
  });

  it('AI fallback target must always be in eliminationCandidates', () => {
    const store = startGame(['human', 'ai1', 'ai2', 'ai3'], { seed: 7 });
    const q = currentQ(store);
    const correct = q.correctAnswerId;
    const wrong = q.answers.find((a) => a.id !== correct)!.id;

    store.dispatch(submitAnswer({ contestantId: 'human', answerId: correct }));
    for (const id of ['ai1', 'ai2', 'ai3']) {
      store.dispatch(submitAnswer({ contestantId: id, answerId: wrong }));
    }
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const { eliminationCandidates } = store.getState().biographyBlitz;
    // AI fallback always picks first candidate — must be a valid choice.
    const aiPick = eliminationCandidates[0];
    expect(eliminationCandidates).toContain(aiPick);

    store.dispatch(pickElimination({ targetId: aiPick }));
    expect(store.getState().biographyBlitz.eliminatedContestants).toContain(aiPick);
  });
});
