import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import cwgoReducer, {
  chooseDuelPair,
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

function reachThreePlayerFinal(store: ReturnType<typeof makeStore>) {
  const answer = start(store, ['a', 'b', 'c', 'd']);
  store.dispatch(setGuesses({ a: answer - 10, b: answer - 5, c: answer - 3, d: answer - 1 }));
  store.dispatch(revealMassResults());
  store.dispatch(confirmMassElimination());
}

describe('cwgoCompetitionSlice — strict qualifier', () => {
  it('eliminates every player who goes over and continues above three survivors', () => {
    const store = makeStore();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const answer = start(store, ids);
    store.dispatch(setGuesses({ a: answer - 1, b: answer - 2, c: answer - 3, d: answer - 4, e: answer + 1, f: answer + 2 }));
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

  it('eliminates only the slower tied furthest valid guess and starts a three-player final', () => {
    const store = makeStore();
    const answer = start(store, ['a', 'b', 'c', 'd']);
    store.dispatch(setGuesses({ a: answer - 10, b: answer - 10, c: answer - 2, d: answer - 1 }));
    store.dispatch(setResponseTimes({ a: 2_000, b: 7_000, c: 5_000, d: 4_000 }));
    store.dispatch(revealMassResults());
    store.dispatch(confirmMassElimination());
    expect(store.getState().cwgo.aliveIds).toEqual(['a', 'c', 'd']);
    expect(store.getState().cwgo.stage).toBe('final');
    expect(store.getState().cwgo.playerScores).toMatchObject({ a: 3, c: 3, d: 3 });
    expect(store.getState().cwgo.status).toBe('choose_duel');
  });

  it('starts a two-player final when strict elimination leaves two survivors', () => {
    const store = makeStore();
    const answer = start(store, ['a', 'b', 'c', 'd', 'e']);
    store.dispatch(setGuesses({ a: answer - 1, b: answer - 2, c: answer + 1, d: answer + 2, e: answer + 3 }));
    store.dispatch(revealMassResults());
    store.dispatch(confirmMassElimination());
    expect(store.getState().cwgo.aliveIds).toEqual(['a', 'b']);
    expect(store.getState().cwgo.status).toBe('duel_input');
    expect(store.getState().cwgo.playerScores).toMatchObject({ a: 3, b: 3 });
  });

  it('declares an immediate winner when strict elimination leaves one survivor', () => {
    const store = makeStore();
    const answer = start(store, ['a', 'b', 'c', 'd']);
    store.dispatch(setGuesses({ a: answer - 1, b: answer + 1, c: answer + 2, d: answer + 3 }));
    store.dispatch(revealMassResults());
    store.dispatch(confirmMassElimination());
    expect(store.getState().cwgo.status).toBe('complete');
    expect(store.getState().cwgo.aliveIds).toEqual(['a']);
  });
});

describe('cwgoCompetitionSlice — three-life final', () => {
  it('uses response time to break an equal duel guess', () => {
    const store = makeStore();
    reachThreePlayerFinal(store);
    store.dispatch(chooseDuelPair(['b', 'c']));
    const answer = CWGO_QUESTIONS[store.getState().cwgo.questionIdx].answer;
    store.dispatch(setGuesses({ b: answer, c: answer }));
    store.dispatch(setResponseTimes({ b: 6_000, c: 3_000 }));
    store.dispatch(revealDuelResults());
    expect(store.getState().cwgo.duelWinnerId).toBe('c');
  });

  it('redraws an all-over duel without taking a life', () => {
    const store = makeStore();
    reachThreePlayerFinal(store);
    const pair: [string, string] = ['b', 'c'];
    store.dispatch(chooseDuelPair(pair));
    const answer = CWGO_QUESTIONS[store.getState().cwgo.questionIdx].answer;
    store.dispatch(setGuesses({ b: answer + 1, c: answer + 2 }));
    store.dispatch(revealDuelResults());
    store.dispatch(confirmDuelElimination());
    expect(store.getState().cwgo.playerScores).toMatchObject({ b: 3, c: 3 });
    expect(store.getState().cwgo.duelPair).toEqual(pair);
    expect(store.getState().cwgo.status).toBe('duel_input');
  });

  it('removes one life per duel and eliminates at zero', () => {
    const store = makeStore();
    reachThreePlayerFinal(store);
    const rounds: Array<{ pair: [string, string]; winner: string }> = [
      { pair: ['b', 'c'], winner: 'b' },
      { pair: ['c', 'd'], winner: 'd' },
      { pair: ['b', 'c'], winner: 'b' },
    ];
    for (let duel = 0; duel < 3; duel += 1) {
      const { pair, winner } = rounds[duel];
      if (store.getState().cwgo.status === 'choose_duel') store.dispatch(chooseDuelPair(pair));
      const answer = CWGO_QUESTIONS[store.getState().cwgo.questionIdx].answer;
      const loser = pair.find((id) => id !== winner)!;
      store.dispatch(setGuesses({ [winner]: answer, [loser]: answer + 1 }));
      store.dispatch(revealDuelResults());
      store.dispatch(confirmDuelElimination());
      expect(store.getState().cwgo.playerScores.c).toBe(2 - duel);
    }
    expect(store.getState().cwgo.aliveIds).not.toContain('c');
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
