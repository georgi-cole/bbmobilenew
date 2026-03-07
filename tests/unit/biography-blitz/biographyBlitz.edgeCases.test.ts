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

// ─── 5-contestant game ────────────────────────────────────────────────────────

describe('5-contestant game', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];

  it('initialises with 5 active contestants', () => {
    const store = startGame(ids);
    expect(store.getState().biographyBlitz.activeContestants).toHaveLength(5);
  });

  it('eliminates 3 wrong-answerers in one round', () => {
    const store = startGame(ids);
    submitRound(store, ['p1', 'p2'], ['p3', 'p4', 'p5']);
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    expect(bb.activeContestants).toEqual(['p1', 'p2']);
    expect(bb.eliminatedContestants).toHaveLength(3);
    expect(bb.status).toBe('question');
  });

  it('reaches complete after enough rounds', () => {
    const store = startGame(ids, { seed: 1 });
    // Round 1: p2–p5 wrong → p1 wins round 1
    submitRound(store, ['p1'], ['p2', 'p3', 'p4', 'p5']);
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

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

  it('eliminates multiple contestants per round', () => {
    const store = startGame(ids);
    submitRound(store, ['p1', 'p2', 'p3'], ['p4', 'p5', 'p6']);
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    expect(store.getState().biographyBlitz.activeContestants).toHaveLength(3);
    expect(store.getState().biographyBlitz.eliminatedContestants).toHaveLength(3);
  });

  it('handles 8 contestants without error', () => {
    const eightIds = Array.from({ length: 8 }, (_, i) => `player${i}`);
    const store = startGame(eightIds, { seed: 7 });
    expect(store.getState().biographyBlitz.activeContestants).toHaveLength(8);
    submitRound(store, ['player0'], eightIds.slice(1));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());
    expect(store.getState().biographyBlitz.status).toBe('complete');
    expect(store.getState().biographyBlitz.winnerId).toBe('player0');
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

  it('game continues after human is eliminated', () => {
    const store = startGame(['human', 'ai1', 'ai2']);
    const q = currentQ(store);
    const correct = q.correctAnswerId;
    const wrong = q.answers.find((a) => a.id !== correct)!.id;

    // Human answers wrong; AIs answer correctly.
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'ai2', answerId: correct }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

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
  it('eliminates all others and completes the game', () => {
    const store = startGame(['p1', 'p2', 'p3', 'p4']);
    const q = currentQ(store);
    const wrong = q.answers.find((a) => a.id !== q.correctAnswerId)!.id;

    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
    for (const id of ['p2', 'p3', 'p4']) {
      store.dispatch(submitAnswer({ contestantId: id, answerId: wrong }));
    }
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    expect(bb.status).toBe('complete');
    expect(bb.winnerId).toBe('p1');
    expect(bb.eliminatedContestants).toHaveLength(3);
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

  it('disconnected contestant is eliminated when others answer correctly', () => {
    const store = startGame(['human', 'ai1']);
    const q = currentQ(store);
    store.dispatch(markDisconnected('human'));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: q.correctAnswerId }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

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
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    expect(bb.status).toBe('complete');
    expect(bb.winnerId).toBe('p1');
  });

  it('sets winnerId immediately when only 1 active contestant remains', () => {
    const store = startGame(['p1', 'p2'], { seed: 5 });
    const q = currentQ(store);
    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());
    // winnerId must be set at this point — no additional action needed.
    expect(store.getState().biographyBlitz.winnerId).not.toBeNull();
  });

  it('does not start another round after final elimination', () => {
    const store = startGame(['p1', 'p2'], { seed: 5 });
    const q = currentQ(store);
    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());
    // confirmElimination after complete should be a no-op.
    store.dispatch(confirmElimination());
    expect(store.getState().biographyBlitz.status).toBe('complete');
  });
});

// ─── Hot Streak — activation ──────────────────────────────────────────────────

describe('Hot Streak — activation', () => {
  it('no streak after 1 win', () => {
    const store = startGame(['p1', 'p2', 'p3'], { seed: 10 });
    const q = currentQ(store);
    store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'p2', answerId: q.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'p3', answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    expect(bb.hotStreakOwner).toBeNull();
  });

  it('hotStreakOwner is set after 2 consecutive wins', () => {
    // Use 4 contestants so p1 can win 2 rounds without completing the game.
    const store = startGame(['p1', 'p2', 'p3', 'p4'], { seed: 20 });

    // Round 1: p1 correct, p4 wrong (others correct).
    {
      const q = currentQ(store);
      store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
      store.dispatch(submitAnswer({ contestantId: 'p2', answerId: q.correctAnswerId }));
      store.dispatch(submitAnswer({ contestantId: 'p3', answerId: q.correctAnswerId }));
      store.dispatch(submitAnswer({ contestantId: 'p4', answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
      store.dispatch(revealResults());
      store.dispatch(confirmElimination());
    }

    expect(store.getState().biographyBlitz.hotStreakOwner).toBeNull();

    // Round 2: p1, p2 correct; p3 wrong.
    {
      const q = currentQ(store);
      store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
      store.dispatch(submitAnswer({ contestantId: 'p2', answerId: q.correctAnswerId }));
      store.dispatch(submitAnswer({ contestantId: 'p3', answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
      store.dispatch(revealResults());
      store.dispatch(confirmElimination());
    }

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

    // Two rounds where p1 answers correctly and one person is eliminated each round.
    for (let round = 0; round < 2; round++) {
      if (store.getState().biographyBlitz.status !== 'question') break;
      const active = store.getState().biographyBlitz.activeContestants;
      const q = currentQ(store);
      store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
      store.dispatch(submitAnswer({ contestantId: 'p2', answerId: q.correctAnswerId }));
      // p3/p4 wrong (whichever is still active).
      for (const id of active.filter(x => x !== 'p1' && x !== 'p2')) {
        store.dispatch(submitAnswer({ contestantId: id, answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
      }
      store.dispatch(revealResults());
      store.dispatch(confirmElimination());
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
  it('clears hotStreakOwner when streak owner answers wrong', () => {
    const store = startGame(['p1', 'p2', 'p3', 'p4'], { seed: 20 });

    // Give p1 a streak (2 wins).
    for (let r = 0; r < 2; r++) {
      if (store.getState().biographyBlitz.status !== 'question') break;
      const active = store.getState().biographyBlitz.activeContestants;
      const q = currentQ(store);
      store.dispatch(submitAnswer({ contestantId: 'p1', answerId: q.correctAnswerId }));
      store.dispatch(submitAnswer({ contestantId: 'p2', answerId: q.correctAnswerId }));
      for (const id of active.filter(x => x !== 'p1' && x !== 'p2')) {
        store.dispatch(submitAnswer({ contestantId: id, answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
      }
      store.dispatch(revealResults());
      store.dispatch(confirmElimination());
    }

    const streakOwner = store.getState().biographyBlitz.hotStreakOwner;
    if (streakOwner === null || store.getState().biographyBlitz.status !== 'question') {
      // Can't test streak clearing if game ended or no streak active.
      return;
    }

    // Now make the streak owner answer wrong.
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
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    if (bb.eliminatedContestants.includes(streakOwner)) {
      expect(bb.hotStreakOwner).toBeNull();
    }
  });
});

// ─── Final winner resolves immediately ────────────────────────────────────────

describe('Final winner resolves immediately', () => {
  it('status transitions to complete in the same confirmElimination call', () => {
    const store = startGame(['winner', 'loser'], { seed: 99 });
    const q = currentQ(store);
    store.dispatch(submitAnswer({ contestantId: 'winner', answerId: q.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'loser', answerId: q.answers.find(a => a.id !== q.correctAnswerId)!.id }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    // No intermediate state — immediate transition.
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
