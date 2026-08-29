import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import cwgoReducer, {
  confirmDuelElimination,
  confirmMassElimination,
  revealDuelResults,
  revealMassResults,
  setGuesses,
  setResponseTimes,
  startCwgoCompetition,
} from '../src/features/cwgo/cwgoCompetitionSlice';
import { CWGO_QUESTIONS } from '../src/features/cwgo/cwgoQuestions';

function makeStore() {
  return configureStore({ reducer: { cwgo: cwgoReducer } });
}

function start(store: ReturnType<typeof makeStore>, ids: string[]) {
  store.dispatch(startCwgoCompetition({ participantIds: ids, prizeType: 'LOH', seed: 42 }));
  return CWGO_QUESTIONS[store.getState().cwgo.questionIdx].answer;
}

function submitAllZeroRound(
  store: ReturnType<typeof makeStore>,
  responseTimes: Record<string, number>,
) {
  const ids = store.getState().cwgo.aliveIds;
  store.dispatch(setGuesses(Object.fromEntries(ids.map((id) => [id, 0]))));
  store.dispatch(setResponseTimes(responseTimes));
  store.dispatch(revealMassResults());
  store.dispatch(confirmMassElimination());
}

function reachTwoPlayerFinal(store: ReturnType<typeof makeStore>) {
  start(store, ['a', 'b', 'c', 'd']);
  submitAllZeroRound(store, { a: 9_000, b: 1_000, c: 2_000, d: 3_000 });
  expect(store.getState().cwgo.aliveIds).toEqual(['b', 'c', 'd']);
  expect(store.getState().cwgo.status).toBe('mass_input');

  submitAllZeroRound(store, { b: 9_000, c: 1_000, d: 2_000 });
  expect(store.getState().cwgo.aliveIds).toEqual(['c', 'd']);
  expect(store.getState().cwgo.status).toBe('duel_input');
}

describe('cwgoCompetitionSlice — strict qualifier', () => {
  it('eliminates every player who goes over when at least two survivors remain', () => {
    const store = makeStore();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const answer = start(store, ids);
    store.dispatch(setGuesses({
      a: Math.max(0, answer - 1),
      b: Math.max(0, answer - 2),
      c: Math.max(0, answer - 3),
      d: Math.max(0, answer - 4),
      e: answer + 1,
      f: answer + 2,
    }));
    store.dispatch(revealMassResults());
    expect(store.getState().cwgo.lastEliminated).toEqual(['e', 'f']);
    store.dispatch(confirmMassElimination());
    expect(store.getState().cwgo.aliveIds).toEqual(['a', 'b', 'c', 'd']);
    expect(store.getState().cwgo.status).toBe('mass_input');
  });

  it('redraws with no elimination when everyone goes over', () => {
    const store = makeStore();
    const ids = ['a', 'b', 'c', 'd'];
    const answer = start(store, ids);
    store.dispatch(setGuesses(Object.fromEntries(ids.map((id, index) => [id, answer + index + 1]))));
    store.dispatch(revealMassResults());
    store.dispatch(confirmMassElimination());
    expect(store.getState().cwgo.aliveIds).toEqual(ids);
    expect(store.getState().cwgo.eliminationOrder).toEqual([]);
    expect(store.getState().cwgo.status).toBe('mass_input');
  });

  it('eliminates only the slower tied furthest valid guess and keeps three players qualifying', () => {
    const store = makeStore();
    start(store, ['a', 'b', 'c', 'd']);
    store.dispatch(setGuesses({ a: 0, b: 0, c: 0, d: 0 }));
    store.dispatch(setResponseTimes({ a: 2_000, b: 7_000, c: 5_000, d: 4_000 }));
    store.dispatch(revealMassResults());
    store.dispatch(confirmMassElimination());
    expect(store.getState().cwgo.aliveIds).toEqual(['a', 'c', 'd']);
    expect(store.getState().cwgo.stage).toBe('qualifier');
    expect(store.getState().cwgo.playerScores).toEqual({});
    expect(store.getState().cwgo.status).toBe('mass_input');
  });

  it('starts a two-player final when strict elimination leaves two survivors', () => {
    const store = makeStore();
    const answer = start(store, ['a', 'b', 'c', 'd', 'e']);
    store.dispatch(setGuesses({
      a: Math.max(0, answer - 1),
      b: Math.max(0, answer - 2),
      c: answer + 1,
      d: answer + 2,
      e: answer + 3,
    }));
    store.dispatch(revealMassResults());
    store.dispatch(confirmMassElimination());
    expect(store.getState().cwgo.aliveIds).toEqual(['a', 'b']);
    expect(store.getState().cwgo.status).toBe('duel_input');
    expect(store.getState().cwgo.playerScores).toMatchObject({ a: 3, b: 3 });
  });

  it('preserves a two-player final instead of collapsing directly to one survivor', () => {
    const store = makeStore();
    const answer = start(store, ['a', 'b', 'c', 'd']);
    store.dispatch(setGuesses({
      a: Math.max(0, answer - 1),
      b: answer + 1,
      c: answer + 2,
      d: answer + 3,
    }));
    store.dispatch(revealMassResults());
    store.dispatch(confirmMassElimination());
    expect(store.getState().cwgo.status).toBe('duel_input');
    expect(store.getState().cwgo.aliveIds).toEqual(['a', 'b']);
    expect(store.getState().cwgo.playerScores).toMatchObject({ a: 3, b: 3 });
  });
});

describe('cwgoCompetitionSlice — two-player three-life final', () => {
  it('uses response time to break an equal duel guess', () => {
    const store = makeStore();
    reachTwoPlayerFinal(store);
    const answer = CWGO_QUESTIONS[store.getState().cwgo.questionIdx].answer;
    store.dispatch(setGuesses({ c: answer, d: answer }));
    store.dispatch(setResponseTimes({ c: 6_000, d: 3_000 }));
    store.dispatch(revealDuelResults());
    expect(store.getState().cwgo.duelWinnerId).toBe('d');
  });

  it('redraws an all-over duel without taking a life', () => {
    const store = makeStore();
    reachTwoPlayerFinal(store);
    const pair: [string, string] = ['c', 'd'];
    const answer = CWGO_QUESTIONS[store.getState().cwgo.questionIdx].answer;
    store.dispatch(setGuesses({ c: answer + 1, d: answer + 2 }));
    store.dispatch(revealDuelResults());
    store.dispatch(confirmDuelElimination());
    expect(store.getState().cwgo.playerScores).toMatchObject({ c: 3, d: 3 });
    expect(store.getState().cwgo.duelPair).toEqual(pair);
    expect(store.getState().cwgo.status).toBe('duel_input');
  });

  it('removes one life per duel and immediately rematches the same two finalists', () => {
    const store = makeStore();
    reachTwoPlayerFinal(store);

    for (let duel = 0; duel < 3; duel += 1) {
      const answer = CWGO_QUESTIONS[store.getState().cwgo.questionIdx].answer;
      store.dispatch(setGuesses({ c: answer, d: answer + 1 }));
      store.dispatch(revealDuelResults());
      store.dispatch(confirmDuelElimination());
      expect(store.getState().cwgo.playerScores.d).toBe(2 - duel);
      if (duel < 2) {
        expect(store.getState().cwgo.status).toBe('duel_input');
        expect(store.getState().cwgo.duelPair).toEqual(['c', 'd']);
      }
    }

    expect(store.getState().cwgo.status).toBe('complete');
    expect(store.getState().cwgo.aliveIds).toEqual(['c']);
  });
});

describe('cwgoCompetitionSlice — defensive seed', () => {
  it('uses a non-zero seed when seed=0 is passed', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({ participantIds: ['x'], prizeType: 'LOH', seed: 0 }));
    expect(store.getState().cwgo.seed).not.toBe(0);
  });

  it('preserves a non-zero seed as-is', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({ participantIds: ['x'], prizeType: 'LOH', seed: 12345 }));
    expect(store.getState().cwgo.seed).toBe(12345);
  });
});
