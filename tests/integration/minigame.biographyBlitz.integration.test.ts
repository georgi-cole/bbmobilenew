/**
 * Integration smoke tests — Biography Blitz minigame.
 *
 * Verifies:
 *  1. The registry biographyBlitz entry uses implementation='react' with
 *     reactComponentKey='BiographyBlitz'.
 *  2. The slice correctly initialises on startBiographyBlitz.
 *  3. A full single-elimination scenario (2 players, 1 round) resolves to
 *     'complete' with the correct winner.
 *  4. resolveBiographyBlitzOutcome dispatches applyMinigameWinner exactly once
 *     and is idempotent (outcomeResolved guard).
 *  5. Question order is deterministic — same seed always picks the same first
 *     question.
 *  6. Question order varies across seeds.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import biographyBlitzReducer, {
  startBiographyBlitz,
  submitAnswer,
  revealResults,
  confirmElimination,
  markBiographyBlitzOutcomeResolved,
} from '../../src/features/biographyBlitz/biography_blitz_logic';
import { resolveBiographyBlitzOutcome } from '../../src/features/biographyBlitz/thunks';
import { BIOGRAPHY_BLITZ_QUESTIONS } from '../../src/features/biographyBlitz/biographyBlitzQuestions';
import { getGame } from '../../src/minigames/registry';

// ── Minimal store for integration testing ─────────────────────────────────────

function makeIntegrationStore(initialGamePhase: string = 'hoh_comp') {
  // Stub game slice with just enough shape to satisfy the thunk
  const gameReducer = (
    state = { phase: initialGamePhase, hohId: null, povWinnerId: null },
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === 'game/applyMinigameWinner') {
      if (initialGamePhase === 'hoh_comp') {
        return { ...state, hohId: action.payload, phase: 'hoh_results' };
      }
      return { ...state, povWinnerId: action.payload, phase: 'pov_results' };
    }
    return state;
  };

  return configureStore({
    reducer: {
      biographyBlitz: biographyBlitzReducer,
      game: gameReducer,
    },
  });
}

// ── Registry wiring ───────────────────────────────────────────────────────────

describe('Registry — biographyBlitz entry', () => {
  it('exists in the registry', () => {
    const entry = getGame('biographyBlitz');
    expect(entry).toBeDefined();
  });

  it('uses implementation="react"', () => {
    const entry = getGame('biographyBlitz');
    expect(entry?.implementation).toBe('react');
    expect(entry?.legacy).toBe(false);
  });

  it('uses reactComponentKey="BiographyBlitz"', () => {
    const entry = getGame('biographyBlitz');
    expect(entry?.reactComponentKey).toBe('BiographyBlitz');
  });

  it('has authoritative=true and scoringAdapter="authoritative"', () => {
    const entry = getGame('biographyBlitz');
    expect(entry?.authoritative).toBe(true);
    expect(entry?.scoringAdapter).toBe('authoritative');
  });

  it('has category="trivia"', () => {
    const entry = getGame('biographyBlitz');
    expect(entry?.category).toBe('trivia');
  });

  it('does NOT reference any legacy modulePath', () => {
    const entry = getGame('biographyBlitz');
    expect(entry?.modulePath).toBeUndefined();
  });
});

// ── Slice initialisation ──────────────────────────────────────────────────────

describe('biographyBlitzSlice — startBiographyBlitz integration', () => {
  it('transitions status to question', () => {
    const store = makeIntegrationStore();
    store.dispatch(
      startBiographyBlitz({ participantIds: ['alice', 'bob'], competitionType: 'HOH', seed: 1 }),
    );
    expect(store.getState().biographyBlitz.status).toBe('question');
  });

  it('populates aliveContestants from participantIds', () => {
    const store = makeIntegrationStore();
    const ids = ['alice', 'bob', 'carol'];
    store.dispatch(startBiographyBlitz({ participantIds: ids, competitionType: 'HOH', seed: 2 }));
    expect(store.getState().biographyBlitz.activeContestants).toEqual(ids);
  });
});

// ── Full elimination scenario ─────────────────────────────────────────────────

describe('Biography Blitz — full 2-player elimination scenario', () => {
  it('completes with the correct winner (human answers correctly)', () => {
    const store = makeIntegrationStore('hoh_comp');
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
    expect(bb.eliminatedContestants).toContain('ai1');
  });

  it('completes with AI winner when human answers wrong', () => {
    const store = makeIntegrationStore('hoh_comp');
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

    store.dispatch(submitAnswer({ contestantId: 'human', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: correct }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const bb = store.getState().biographyBlitz;
    expect(bb.status).toBe('complete');
    expect(bb.winnerId).toBe('ai1');
  });
});

// ── Outcome thunk — idempotency ───────────────────────────────────────────────

describe('resolveBiographyBlitzOutcome — idempotency', () => {
  function buildCompleteStore(phase: 'hoh_comp' | 'pov_comp', competitionType: 'HOH' | 'POV') {
    const store = makeIntegrationStore(phase);
    store.dispatch(
      startBiographyBlitz({
        participantIds: ['winner', 'loser'],
        competitionType,
        seed: 7,
      }),
    );
    const { currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const correct = question.correctAnswerId;
    const wrong = question.answers.find((a) => a.id !== correct)!.id;
    store.dispatch(submitAnswer({ contestantId: 'winner', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'loser', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());
    return store;
  }

  it('dispatches applyMinigameWinner for HOH competition', () => {
    const store = buildCompleteStore('hoh_comp', 'HOH');
    expect(store.getState().biographyBlitz.status).toBe('complete');
    store.dispatch(resolveBiographyBlitzOutcome());
    expect(store.getState().biographyBlitz.outcomeResolved).toBe(true);
    // game slice should have received the winner
    expect((store.getState() as { game: { hohId: string | null } }).game.hohId).toBe('winner');
  });

  it('dispatches applyMinigameWinner for POV competition', () => {
    const store = buildCompleteStore('pov_comp', 'POV');
    store.dispatch(resolveBiographyBlitzOutcome());
    expect(
      (store.getState() as { game: { povWinnerId: string | null } }).game.povWinnerId,
    ).toBe('winner');
  });

  it('is idempotent — second dispatch is a no-op', () => {
    const store = buildCompleteStore('hoh_comp', 'HOH');
    store.dispatch(resolveBiographyBlitzOutcome());
    store.dispatch(resolveBiographyBlitzOutcome()); // second call
    // hohId should still be 'winner', not changed
    expect((store.getState() as { game: { hohId: string | null } }).game.hohId).toBe('winner');
    expect(store.getState().biographyBlitz.outcomeResolved).toBe(true);
  });

  it('is a no-op when status is not complete', () => {
    const store = makeIntegrationStore('hoh_comp');
    store.dispatch(
      startBiographyBlitz({ participantIds: ['a', 'b'], competitionType: 'HOH', seed: 1 }),
    );
    store.dispatch(resolveBiographyBlitzOutcome());
    // status is still question, so outcome should NOT have been resolved
    expect(store.getState().biographyBlitz.outcomeResolved).toBe(false);
  });

  it('is a no-op when game phase does not match competition type', () => {
    // HOH competition but game is in pov_comp — should log error and not dispatch
    const store = makeIntegrationStore('pov_comp');
    store.dispatch(
      startBiographyBlitz({
        participantIds: ['winner', 'loser'],
        competitionType: 'HOH', // mismatch
        seed: 7,
      }),
    );
    const { currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const correct = question.correctAnswerId;
    const wrong = question.answers.find((a) => a.id !== correct)!.id;
    store.dispatch(submitAnswer({ contestantId: 'winner', answerId: correct }));
    store.dispatch(submitAnswer({ contestantId: 'loser', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.dispatch(resolveBiographyBlitzOutcome());
    consoleSpy.mockRestore();

    expect(store.getState().biographyBlitz.outcomeResolved).toBe(false);
  });

  it('outcomeResolved guard prevents re-dispatch after markBiographyBlitzOutcomeResolved', () => {
    const store = buildCompleteStore('hoh_comp', 'HOH');
    store.dispatch(markBiographyBlitzOutcomeResolved());
    store.dispatch(resolveBiographyBlitzOutcome());
    // hohId should remain null since we marked resolved before dispatching
    expect((store.getState() as { game: { hohId: string | null } }).game.hohId).toBeNull();
  });
});

// ── Question order determinism ─────────────────────────────────────────────────

describe('Question order — determinism', () => {
  it('same seed always picks the same first question', () => {
    for (const seed of [0, 1, 42, 999, 0xdeadbeef]) {
      const s1 = makeIntegrationStore();
      const s2 = makeIntegrationStore();
      s1.dispatch(startBiographyBlitz({ participantIds: ['a'], competitionType: 'HOH', seed }));
      s2.dispatch(startBiographyBlitz({ participantIds: ['a'], competitionType: 'HOH', seed }));
      expect(s1.getState().biographyBlitz.currentQuestionId).toBe(
        s2.getState().biographyBlitz.currentQuestionId,
      );
    }
  });

  it('different seeds usually pick different first questions', () => {
    const firstQuestions = new Set<string | null>();
    for (let seed = 0; seed < 30; seed++) {
      const store = makeIntegrationStore();
      store.dispatch(
        startBiographyBlitz({ participantIds: ['a'], competitionType: 'HOH', seed }),
      );
      firstQuestions.add(store.getState().biographyBlitz.currentQuestionId);
    }
    // 30 seeds should produce at least 5 distinct first questions
    expect(firstQuestions.size).toBeGreaterThan(5);
  });
});

// ── Multi-round progression ────────────────────────────────────────────────────

describe('Biography Blitz — multi-round progression', () => {
  it('advances through multiple rounds until one survivor', () => {
    const store = makeIntegrationStore();
    store.dispatch(
      startBiographyBlitz({
        participantIds: ['human', 'ai1', 'ai2'],
        competitionType: 'HOH',
        seed: 100,
      }),
    );

    // Round 1: ai2 answers wrong, human and ai1 answer correctly → ai2 eliminated
    {
      const { currentQuestionId } = store.getState().biographyBlitz;
      const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
      const correct = question.correctAnswerId;
      const wrong = question.answers.find((a) => a.id !== correct)!.id;

      store.dispatch(submitAnswer({ contestantId: 'human', answerId: correct }));
      store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: correct }));
      store.dispatch(submitAnswer({ contestantId: 'ai2', answerId: wrong }));
      store.dispatch(revealResults());
      store.dispatch(confirmElimination());

      expect(store.getState().biographyBlitz.status).toBe('question');
      expect(store.getState().biographyBlitz.activeContestants).toEqual(['human', 'ai1']);
      expect(store.getState().biographyBlitz.round).toBe(1);
    }

    // Round 2: ai1 answers wrong, human answers correctly → ai1 eliminated → complete
    {
      const { currentQuestionId } = store.getState().biographyBlitz;
      const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
      const correct = question.correctAnswerId;
      const wrong = question.answers.find((a) => a.id !== correct)!.id;

      store.dispatch(submitAnswer({ contestantId: 'human', answerId: correct }));
      store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: wrong }));
      store.dispatch(revealResults());
      store.dispatch(confirmElimination());
    }

    const bb = store.getState().biographyBlitz;
    expect(bb.status).toBe('complete');
    expect(bb.winnerId).toBe('human');
    expect(bb.eliminatedContestants).toContain('ai2');
    expect(bb.eliminatedContestants).toContain('ai1');
  });

  it('question ID changes between rounds', () => {
    // seed=50: deterministically places different questions at index 0 and 1
    const store = makeIntegrationStore();
    store.dispatch(
      startBiographyBlitz({
        participantIds: ['human', 'ai1'],
        competitionType: 'HOH',
        seed: 50,
      }),
    );

    const firstQuestionId = store.getState().biographyBlitz.currentQuestionId;

    // Void round (everyone wrong) to advance without eliminating anyone
    const { currentQuestionId } = store.getState().biographyBlitz;
    const question = BIOGRAPHY_BLITZ_QUESTIONS.find((q) => q.id === currentQuestionId)!;
    const wrong = question.answers.find((a) => a.id !== question.correctAnswerId)!.id;
    store.dispatch(submitAnswer({ contestantId: 'human', answerId: wrong }));
    store.dispatch(submitAnswer({ contestantId: 'ai1', answerId: wrong }));
    store.dispatch(revealResults());
    store.dispatch(confirmElimination());

    const secondQuestionId = store.getState().biographyBlitz.currentQuestionId;
    expect(store.getState().biographyBlitz.round).toBe(1);
    // For seed=50 the shuffled order places different questions at positions 0 and 1.
    expect(secondQuestionId).not.toBe(firstQuestionId);
    // Both IDs must be valid question IDs from the bank.
    const validIds = BIOGRAPHY_BLITZ_QUESTIONS.map((q) => q.id);
    expect(validIds).toContain(firstQuestionId);
    expect(validIds).toContain(secondQuestionId);
  });
});
