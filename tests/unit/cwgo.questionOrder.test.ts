/**
 * Unit tests: questionOrder generation and usage.
 *
 * Verifies that:
 *  1. questionOrder is initialised as an array of all valid question indices.
 *  2. questionOrder varies across different seeds.
 *  3. Same seed always produces the same questionOrder (deterministic).
 *  4. questionIdx is taken from questionOrder at round 0.
 *  5. Across rounds the questionIdx follows questionOrder (wrapping at end).
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import cwgoReducer, {
  startCwgoCompetition,
  setGuesses,
  revealMassResults,
  confirmMassElimination,
} from '../../src/features/cwgo/cwgoCompetitionSlice';
import { CWGO_QUESTIONS } from '../../src/features/cwgo/cwgoQuestions';

function makeStore() {
  return configureStore({ reducer: { cwgo: cwgoReducer } });
}

describe('cwgoCompetitionSlice — questionOrder', () => {
  it('questionOrder contains all valid question indices exactly once', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({ participantIds: ['a', 'b'], prizeType: 'LOH', seed: 42 }));
    const { questionOrder } = store.getState().cwgo;

    expect(questionOrder).toHaveLength(CWGO_QUESTIONS.length);
    const sorted = [...questionOrder].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: CWGO_QUESTIONS.length }, (_, i) => i));
  });

  it('same seed always produces the same questionOrder (deterministic)', () => {
    const store1 = makeStore();
    const store2 = makeStore();
    store1.dispatch(startCwgoCompetition({ participantIds: ['a', 'b'], prizeType: 'LOH', seed: 99 }));
    store2.dispatch(startCwgoCompetition({ participantIds: ['c', 'd'], prizeType: 'POS', seed: 99 }));
    expect(store1.getState().cwgo.questionOrder).toEqual(store2.getState().cwgo.questionOrder);
  });

  it('different seeds produce different questionOrders', () => {
    const orders = new Set<string>();
    for (let s = 1; s <= 20; s++) {
      const store = makeStore();
      store.dispatch(startCwgoCompetition({ participantIds: ['a', 'b'], prizeType: 'LOH', seed: s }));
      orders.add(JSON.stringify(store.getState().cwgo.questionOrder));
    }
    // With 20 different seeds we expect at least 15 unique orders
    expect(orders.size).toBeGreaterThanOrEqual(15);
  });

  it('questionIdx at round 0 equals questionOrder[0]', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({ participantIds: ['a', 'b'], prizeType: 'LOH', seed: 7 }));
    const { questionIdx, questionOrder } = store.getState().cwgo;
    expect(questionIdx).toBe(questionOrder[0]);
  });

  it('questionIdx advances to questionOrder[round] when the final starts', async () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({
      participantIds: ['alice', 'bob', 'carol', 'dave', 'eve'],
      prizeType: 'LOH',
      seed: 555,
    }));

    const { CWGO_QUESTIONS: questions } = await import('../../src/features/cwgo/cwgoQuestions');
    const { questionIdx } = store.getState().cwgo;
    const answer = questions[questionIdx].answer;

    // alice+bob+carol go under (survive), dave+eve go over (eliminated) → 3 survive → choose_duel
    store.dispatch(setGuesses({
      alice: Math.max(1, answer - 1),
      bob: Math.max(1, answer - 2),
      carol: Math.max(1, answer - 3),
      dave: answer + 100,
      eve: answer + 200,
    }));
    store.dispatch(revealMassResults());
    store.dispatch(confirmMassElimination());
    expect(store.getState().cwgo.status).toBe('choose_duel');
    expect(store.getState().cwgo.stage).toBe('final');

    const finalState = store.getState().cwgo;
    expect(finalState.round).toBe(1);
    expect(finalState.questionIdx).toBe(finalState.questionOrder[1 % finalState.questionOrder.length]);
  });
});
