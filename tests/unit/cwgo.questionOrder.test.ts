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
  setResponseTimes,
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

  it('questionIdx advances to questionOrder[round] after a qualifier round', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({
      participantIds: ['alice', 'bob', 'carol', 'dave'],
      prizeType: 'LOH',
      seed: 555,
    }));

    // All guesses are valid and equal, so response time removes only the slowest
    // contestant. Three remain and continue qualifying on the next question.
    store.dispatch(setGuesses({ alice: 0, bob: 0, carol: 0, dave: 0 }));
    store.dispatch(setResponseTimes({ alice: 9_000, bob: 1_000, carol: 2_000, dave: 3_000 }));
    store.dispatch(revealMassResults());
    store.dispatch(confirmMassElimination());
    expect(store.getState().cwgo.status).toBe('mass_input');
    expect(store.getState().cwgo.stage).toBe('qualifier');

    const nextState = store.getState().cwgo;
    expect(nextState.round).toBe(1);
    expect(nextState.questionIdx).toBe(nextState.questionOrder[1 % nextState.questionOrder.length]);
  });
});
