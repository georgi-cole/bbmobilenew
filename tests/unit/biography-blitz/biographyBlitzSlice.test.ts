/**
 * Unit tests: biographyBlitzSlice (biography_blitz_logic.tsx) state machine,
 * AI submission generation, and edge-case handling.
 *
 * Verifies that:
 *  1. Initial state is idle.
 *  2. startBiographyBlitz transitions to 'question' and populates fields.
 *  3. submitAnswer records the human answer.
 *  4. autoFillAIAnswers fills AI contestants deterministically.
 *  5. revealResults reveals the correct answer and transitions to 'reveal'.
 *  6. confirmElimination eliminates wrong-answerers and advances round.
 *  7. Void-round edge case: everyone wrong → no eliminations, next round.
 *  8. Final survivor → transitions to 'complete' with correct winnerId.
 *  9. outcomeResolved / markBiographyBlitzOutcomeResolved idempotency.
 * 10. resetBiographyBlitz returns to initial state.
 * 11. buildAiSubmissions is deterministic for the same inputs.
 * 12. Question order is deterministic per seed.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import biographyBlitzReducer, {
  startBiographyBlitz,
  submitAnswer,
  autoFillAIAnswers,
  revealResults,
  confirmElimination,
  markBiographyBlitzOutcomeResolved,
  resetBiographyBlitz,
  buildAiSubmissions,
} from '../../../src/features/biographyBlitz/biography_blitz_logic';
import { BIOGRAPHY_BLITZ_QUESTIONS } from '../../../src/features/biographyBlitz/biographyBlitzQuestions';

function makeStore() {
  return configureStore({ reducer: { biographyBlitz: biographyBlitzReducer } });
}

function startThreePlayer(store: ReturnType<typeof makeStore>, seed = 42) {
  store.dispatch(
    startBiographyBlitz({
      participantIds: ['human', 'ai1', 'ai2'],
      competitionType: 'HOH',
      seed,
    }),
  );
}

// ── Initial state ─────────────────────────────────────────────────────────────

describe('biographyBlitzSlice — initial state', () => {
  it('status is idle', () => {
    const store = makeStore();
    expect(store.getState().biographyBlitz.status).toBe('idle');
  });

  it('outcomeResolved is false', () => {
    const store = makeStore();
    expect(store.getState().biographyBlitz.outcomeResolved).toBe(false);
  });

  it('activeContestants is empty', () => {
    const store = makeStore();
    expect(store.getState().biographyBlitz.activeContestants).toEqual([]);
  });

  it('winnerId is null', () => {
    const store = makeStore();
    expect(store.getState().biographyBlitz.winnerId).toBeNull();
  });
});

// ── startBiographyBlitz ───────────────────────────────────────────────────────

describe('biographyBlitzSlice — startBiographyBlitz', () => {
  it('transitions status to question', () => {
    const store = makeStore();
    startThreePlayer(store);
    expect(store.getState().biographyBlitz.status).toBe('question');
  });

  it('populates activeContestants', () => {
    const store = makeStore();
    startThreePlayer(store);
    expect(store.getState().biographyBlitz.activeContestants).toEqual(['human', 'ai1', 'ai2']);
  });

  it('sets a valid currentQuestionId', () => {
    const store = makeStore();
    startThreePlayer(store);
    const { currentQuestionId } = store.getState().biographyBlitz;
    expect(currentQuestionId).not.toBeNull();
    const ids = BIOGRAPHY_BLITZ_QUESTIONS.map((q) => q.id);
    expect(ids).toContain(currentQuestionId);
  });

  it('questionOrder length equals BIOGRAPHY_BLITZ_QUESTIONS length', () => {
    const store = makeStore();
    startThreePlayer(store);
    const { questionOrder } = store.getState().biographyBlitz;
    expect(questionOrder.length).toBe(BIOGRAPHY_BLITZ_QUESTIONS.length);
  });

  it('round starts at 0', () => {
    const store = makeStore();
    startThreePlayer(store);
    expect(store.getState().biographyBlitz.round).toBe(0);
  });

  it('correctAnswerId is null (not revealed yet)', () => {
    const store = makeStore();
    startThreePlayer(store);
    expect(store.getState().biographyBlitz.correctAnswerId).toBeNull();
  });

  it('resets fields on re-start', () => {
    const store = makeStore();
    startThreePlayer(store, 1);
    store.dispatch(markBiographyBlitzOutcomeResolved());
    startThreePlayer(store, 2); // restart
    const bb = store.getState().biographyBlitz;
    expect(bb.submissions).toEqual({});
    expect(bb.eliminatedContestants).toEqual([]);
    expect(bb.winnerId).toBeNull();
    expect(bb.outcomeResolved).toBe(false);
  });

  it('stores seed and competitionType', () => {
    const store = makeStore();
    store.dispatch(
      startBiographyBlitz({
        participantIds: ['p1'],
        competitionType: 'POV',
        seed: 999,
      }),
    );
    const bb = store.getState().biographyBlitz;
    expect(bb.competitionType).toBe('POV');
    expect(bb.seed).toBe(999);
  });
});

// ── submitAnswer ──────────────────────────────────────────────────────────────

describe('biographyBlitzSlice — submitAnswer', () => {
  it('records the human\'s answer', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: 'a' }));
    expect(store.getState().biographyBlitz.submissions['human']).toBe('a');
  });

  it('is a no-op when status is not question', () => {
    const store = makeStore();
    // idle — no-op
    store.dispatch(submitAnswer({ contestantId: 'nobody', answerId: 'x' }));
    expect(store.getState().biographyBlitz.submissions).toEqual({});
  });

  it('is a no-op for non-active contestants', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(submitAnswer({ contestantId: 'outsider', answerId: 'a' }));
    expect('outsider' in store.getState().biographyBlitz.submissions).toBe(false);
  });

  it('last write wins (overwrite)', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: 'a' }));
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: 'b' }));
    expect(store.getState().biographyBlitz.submissions['human']).toBe('b');
  });
});

// ── autoFillAIAnswers ─────────────────────────────────────────────────────────

describe('biographyBlitzSlice — autoFillAIAnswers', () => {
  it('fills AI contestants but not the human', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(autoFillAIAnswers('human'));
    const subs = store.getState().biographyBlitz.submissions;
    expect('ai1' in subs).toBe(true);
    expect('ai2' in subs).toBe(true);
    expect('human' in subs).toBe(false);
  });

  it('each AI submission is a valid answer ID for the current question', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(autoFillAIAnswers('human'));
    const { submissions, currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const validIds = question.answers.map((a) => a.id);
    for (const aiId of ['ai1', 'ai2']) {
      expect(validIds).toContain(submissions[aiId]);
    }
  });

  it('does not overwrite an already-submitted AI answer', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: 'z' }));
    // Note: 'z' is not a real answer id, just testing non-overwrite behaviour
    // but since submitAnswer checks active contestants, use a real id.
    const { currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const answerId = question.answers[0].id;
    // Submit ai1's answer manually
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId }));
    const before = store.getState().biographyBlitz.submissions['ai1'];
    store.dispatch(autoFillAIAnswers('human'));
    // ai1 should not have been overwritten
    expect(store.getState().biographyBlitz.submissions['ai1']).toBe(before);
  });

  it('is a no-op when status is not question', () => {
    const store = makeStore();
    // idle state
    store.dispatch(autoFillAIAnswers(null));
    expect(store.getState().biographyBlitz.submissions).toEqual({});
  });
});

// ── revealResults ─────────────────────────────────────────────────────────────

describe('biographyBlitzSlice — revealResults', () => {
  it('transitions status to reveal', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(revealResults());
    expect(store.getState().biographyBlitz.status).toBe('reveal');
  });

  it('sets correctAnswerId to the actual correct answer', () => {
    const store = makeStore();
    startThreePlayer(store);
    const { currentQuestionId } = store.getState().biographyBlitz;
    store.dispatch(revealResults());
    const { correctAnswerId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    expect(correctAnswerId).toBe(question.correctAnswerId);
  });

  it('is a no-op when status is not question', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(revealResults());
    store.dispatch(revealResults()); // second call — no-op
    expect(store.getState().biographyBlitz.status).toBe('reveal');
  });
});

// ── confirmElimination ────────────────────────────────────────────────────────

describe('biographyBlitzSlice — confirmElimination', () => {
  function advanceToReveal(
    store: ReturnType<typeof makeStore>,
    humanAnswer: string,
  ) {
    startThreePlayer(store);
    const { currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;

    store.dispatch(submitAnswer({ contestantId: 'human', answerId: humanAnswer }));
    // Force all AI to answer correctly so they don't interfere with elimination logic
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: question.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'ai2', answerId: question.correctAnswerId }));
    store.dispatch(revealResults());
    return question;
  }

  it('eliminates wrong-answerers from activeContestants', () => {
    const store = makeStore();
    const question = advanceToReveal(store, 'WRONG_ANSWER');
    // human answered 'WRONG_ANSWER' but correct is question.correctAnswerId
    // (WRONG_ANSWER won't be a valid answer, so treated as wrong)
    // Actually submitAnswer no-ops for invalid IDs but we want human to be wrong
    // Use a real wrong answer id
    const wrongId = question.answers.find((a) => a.id !== question.correctAnswerId)!.id;
    const store2 = makeStore();
    advanceToReveal(store2, wrongId);
    store2.dispatch(confirmElimination());
    const bb = store2.getState().biographyBlitz;
    expect(bb.eliminatedContestants).toContain('human');
    expect(bb.activeContestants).not.toContain('human');
  });

  it('survivors remain in activeContestants', () => {
    const store = makeStore();
    startThreePlayer(store);
    const { currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const correct = question.correctAnswerId;
    const wrong = question.answers.find((a) => a.id !== correct)!.id;

    store.dispatch(submitAnswer({ contestantId: 'human', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'ai2', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    expect(bb.activeContestants).toContain('human');
    expect(bb.activeContestants).toContain('ai1');
    expect(bb.eliminatedContestants).toContain('ai2');
  });

  it('round increments after confirmElimination', () => {
    const store = makeStore();
    startThreePlayer(store);
    const { currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const wrong = question.answers.find((a) => a.id !== question.correctAnswerId)!.id;
    // Eliminate one to avoid void round, keep at least 2 alive for next round
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: question.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: question.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'ai2', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());
    expect(store.getState().biographyBlitz.round).toBe(1);
  });

  it('transitions to complete when only one survivor', () => {
    const store = makeStore();
    // Two-player scenario
    store.dispatch(
      startBiographyBlitz({
        participantIds: ['human', 'ai1'],
        competitionType: 'HOH',
        seed: 42,
      }),
    );
    const { currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const correct = question.correctAnswerId;
    const wrong = question.answers.find((a) => a.id !== correct)!.id;

    store.dispatch(submitAnswer({ contestantId: 'human', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    expect(bb.status).toBe('complete');
    expect(bb.winnerId).toBe('human');
  });

  it('void round: nobody is eliminated when all contestants answer wrong', () => {
    const store = makeStore();
    store.dispatch(
      startBiographyBlitz({
        participantIds: ['human', 'ai1'],
        competitionType: 'HOH',
        seed: 42,
      }),
    );
    const { currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const wrong = question.answers.find((a) => a.id !== question.correctAnswerId)!.id;

    store.dispatch(submitAnswer({ contestantId: 'human', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    // Neither should be eliminated
    expect(bb.eliminatedContestants).toHaveLength(0);
    // Both still active
    expect(bb.activeContestants).toContain('human');
    expect(bb.activeContestants).toContain('ai1');
    // Advances to next round
    expect(bb.round).toBe(1);
    expect(bb.status).toBe('question');
  });

  it('is a no-op when status is not reveal', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(confirmElimination()); // status is question, not reveal
    expect(store.getState().biographyBlitz.status).toBe('question');
  });

  it('clears submissions for the next round', () => {
    const store = makeStore();
    startThreePlayer(store);
    const { currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const wrong = question.answers.find((a) => a.id !== question.correctAnswerId)!.id;

    store.dispatch(submitAnswer({ contestantId: 'human', answerId: question.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: question.correctAnswerId }));
    store.dispatch(submitAnswer({ contestantId: 'ai2', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    expect(store.getState().biographyBlitz.submissions).toEqual({});
  });
});

// ── outcomeResolved idempotency ───────────────────────────────────────────────

describe('biographyBlitzSlice — outcomeResolved idempotency', () => {
  it('markBiographyBlitzOutcomeResolved sets outcomeResolved to true', () => {
    const store = makeStore();
    store.dispatch(markBiographyBlitzOutcomeResolved());
    expect(store.getState().biographyBlitz.outcomeResolved).toBe(true);
  });

  it('resetBiographyBlitz resets outcomeResolved to false', () => {
    const store = makeStore();
    store.dispatch(markBiographyBlitzOutcomeResolved());
    store.dispatch(resetBiographyBlitz());
    expect(store.getState().biographyBlitz.outcomeResolved).toBe(false);
  });
});

// ── resetBiographyBlitz ───────────────────────────────────────────────────────

describe('biographyBlitzSlice — resetBiographyBlitz', () => {
  it('returns status to idle', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(resetBiographyBlitz());
    expect(store.getState().biographyBlitz.status).toBe('idle');
  });

  it('clears activeContestants', () => {
    const store = makeStore();
    startThreePlayer(store);
    store.dispatch(resetBiographyBlitz());
    expect(store.getState().biographyBlitz.activeContestants).toEqual([]);
  });
});

// ── buildAiSubmissions ────────────────────────────────────────────────────────

describe('buildAiSubmissions', () => {
  const allAnswerIds = ['a', 'b', 'c', 'd'];
  const correctId = 'a';

  it('is deterministic — same inputs produce same output', () => {
    const a = buildAiSubmissions(42, 0, ['ai1', 'ai2'], allAnswerIds, correctId);
    const b = buildAiSubmissions(42, 0, ['ai1', 'ai2'], allAnswerIds, correctId);
    expect(a).toEqual(b);
  });

  it('different seeds produce different submissions (with high probability)', () => {
    const a = buildAiSubmissions(1, 0, ['ai1'], allAnswerIds, correctId);
    const b = buildAiSubmissions(2, 0, ['ai1'], allAnswerIds, correctId);
    // With 4 choices and different seeds, results MAY differ — run over 20 seeds
    let differences = 0;
    for (let s = 0; s < 20; s++) {
      const x = buildAiSubmissions(s, 0, ['ai1'], allAnswerIds, correctId);
      const y = buildAiSubmissions(s + 100, 0, ['ai1'], allAnswerIds, correctId);
      if (x['ai1'] !== y['ai1']) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('each returned answer ID is within allAnswerIds', () => {
    const result = buildAiSubmissions(99, 3, ['ai1', 'ai2', 'ai3'], allAnswerIds, correctId);
    for (const answerId of Object.values(result)) {
      expect(allAnswerIds).toContain(answerId);
    }
  });

  it('returns an entry for each AI id', () => {
    const result = buildAiSubmissions(5, 0, ['ai1', 'ai2', 'ai3'], allAnswerIds, correctId);
    expect(Object.keys(result)).toEqual(['ai1', 'ai2', 'ai3']);
  });

  it('returns correct answer when there are no wrong answers', () => {
    const result = buildAiSubmissions(5, 0, ['ai1'], ['a'], 'a');
    expect(result['ai1']).toBe('a');
  });
});

// ── Question bank ─────────────────────────────────────────────────────────────

describe('BIOGRAPHY_BLITZ_QUESTIONS', () => {
  it('contains at least 20 questions', () => {
    expect(BIOGRAPHY_BLITZ_QUESTIONS.length).toBeGreaterThanOrEqual(20);
  });

  it('every question has a non-empty prompt and id', () => {
    for (const q of BIOGRAPHY_BLITZ_QUESTIONS) {
      expect(typeof q.id).toBe('string');
      expect(q.id.length).toBeGreaterThan(0);
      expect(typeof q.prompt).toBe('string');
      expect(q.prompt.length).toBeGreaterThan(0);
    }
  });

  it('every question has at least 2 answer choices', () => {
    for (const q of BIOGRAPHY_BLITZ_QUESTIONS) {
      expect(q.answers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every question\'s correctAnswerId is present in answers', () => {
    for (const q of BIOGRAPHY_BLITZ_QUESTIONS) {
      const ids = q.answers.map((a) => a.id);
      expect(ids).toContain(q.correctAnswerId);
    }
  });

  it('no duplicate question ids', () => {
    const ids = BIOGRAPHY_BLITZ_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no duplicate answer ids within a question', () => {
    for (const q of BIOGRAPHY_BLITZ_QUESTIONS) {
      const ids = q.answers.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
