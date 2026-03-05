/**
 * Unit tests: resolveCompetitionOutcome idempotency via outcomeResolved flag.
 *
 * Verifies that:
 *  1. outcomeResolved starts as false.
 *  2. markCwgoOutcomeResolved sets it to true.
 *  3. resetCwgo resets outcomeResolved back to false.
 *  4. The slice accepts the markCwgoOutcomeResolved action correctly.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import cwgoReducer, {
  startCwgoCompetition,
  markCwgoOutcomeResolved,
  resetCwgo,
} from '../../src/features/cwgo/cwgoCompetitionSlice';

function makeStore() {
  return configureStore({ reducer: { cwgo: cwgoReducer } });
}

describe('cwgoCompetitionSlice — outcomeResolved idempotency', () => {
  it('outcomeResolved is false in initialState', () => {
    const store = makeStore();
    expect(store.getState().cwgo.outcomeResolved).toBe(false);
  });

  it('outcomeResolved is false after startCwgoCompetition', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({ participantIds: ['a', 'b'], prizeType: 'HOH', seed: 1 }));
    expect(store.getState().cwgo.outcomeResolved).toBe(false);
  });

  it('markCwgoOutcomeResolved sets outcomeResolved to true', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({ participantIds: ['a', 'b'], prizeType: 'HOH', seed: 1 }));
    store.dispatch(markCwgoOutcomeResolved());
    expect(store.getState().cwgo.outcomeResolved).toBe(true);
  });

  it('resetCwgo resets outcomeResolved back to false', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({ participantIds: ['a', 'b'], prizeType: 'HOH', seed: 1 }));
    store.dispatch(markCwgoOutcomeResolved());
    expect(store.getState().cwgo.outcomeResolved).toBe(true);
    store.dispatch(resetCwgo());
    expect(store.getState().cwgo.outcomeResolved).toBe(false);
  });

  it('startCwgoCompetition after a resolved competition resets outcomeResolved', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({ participantIds: ['a', 'b'], prizeType: 'HOH', seed: 1 }));
    store.dispatch(markCwgoOutcomeResolved());
    // Start a new competition
    store.dispatch(startCwgoCompetition({ participantIds: ['c', 'd'], prizeType: 'POV', seed: 2 }));
    expect(store.getState().cwgo.outcomeResolved).toBe(false);
  });
});
