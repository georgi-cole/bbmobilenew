import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import cwgoReducer, {
  chooseDuelPair,
  confirmDuelElimination,
  confirmMassElimination,
  revealDuelResults,
  revealMassResults,
  setGuesses,
  startCwgoCompetition,
  startCwgoFinal,
} from '../src/features/cwgo/cwgoCompetitionSlice';
import { CWGO_QUESTIONS } from '../src/features/cwgo/cwgoQuestions';
import { mulberry32 } from '../src/store/rng';

function makeStore() {
  return configureStore({ reducer: { cwgo: cwgoReducer } });
}

function completeHumanLeague(store: ReturnType<typeof makeStore>, participantIds: string[]) {
  store.dispatch(startCwgoCompetition({
    participantIds,
    prizeType: 'LOH',
    seed: 42,
    humanPlayerId: participantIds[0],
  }));
  const state = store.getState().cwgo;
  const answer = CWGO_QUESTIONS[state.questionIdx].answer;
  store.dispatch(setGuesses(Object.fromEntries(
    participantIds.map((id, index) => [id, Math.max(0, answer - index)]),
  )));
  store.dispatch(revealMassResults());
  store.dispatch(confirmMassElimination());
}

describe('cwgoCompetitionSlice — blackjack tournament league', () => {
  it('scores every head-to-head league result as +1/-1 and advances cutoff ties', () => {
    const store = makeStore();
    const ids = ['alice', 'bob', 'carol', 'dave'];
    completeHumanLeague(store, ids);

    const state = store.getState().cwgo;
    expect(state.status).toBe('league_results');
    expect(state.stage).toBe('league');
    expect(Object.values(state.leagueScores).reduce((sum, score) => sum + score, 0)).toBe(0);
    expect(state.leagueScores.alice).toBe(3);
    expect(state.leagueRankings[0]).toBe('alice');

    const cutoff = state.leagueScores[state.leagueRankings[2]];
    expect(state.finalistIds).toEqual(
      state.leagueRankings.filter((id) => state.leagueScores[id] >= cutoff),
    );
  });

  it('starts every finalist with three lives', () => {
    const store = makeStore();
    completeHumanLeague(store, ['alice', 'bob', 'carol', 'dave']);
    const finalists = [...(store.getState().cwgo.finalistIds ?? [])];

    store.dispatch(startCwgoFinal());
    const state = store.getState().cwgo;

    expect(state.stage).toBe('final');
    expect(state.aliveIds).toEqual(finalists);
    finalists.forEach((id) => expect(state.playerScores[id]).toBe(3));
    expect(['choose_duel', 'duel_input']).toContain(state.status);
  });

  it('removes one life per duel, eliminates at zero, and gives pairing control to the winner', () => {
    const store = makeStore();
    completeHumanLeague(store, ['alice', 'bob', 'carol', 'dave']);
    store.dispatch(startCwgoFinal());

    const pair = store.getState().cwgo.aliveIds.slice(0, 2) as [string, string];
    const winner = pair[0];
    const loser = pair[1];

    for (let duel = 0; duel < 3; duel += 1) {
      if (store.getState().cwgo.status === 'choose_duel') {
        store.dispatch(chooseDuelPair(pair));
      }
      const current = store.getState().cwgo;
      const answer = CWGO_QUESTIONS[current.questionIdx].answer;
      store.dispatch(setGuesses({ [winner]: answer, [loser]: answer + 1 }));
      store.dispatch(revealDuelResults());
      store.dispatch(confirmDuelElimination());

      const after = store.getState().cwgo;
      expect(after.playerScores[loser]).toBe(2 - duel);
      expect(after.leaderId).toBe(winner);
      if (duel < 2) expect(after.aliveIds).toContain(loser);
    }

    expect(store.getState().cwgo.aliveIds).not.toContain(loser);
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

describe('challenge seed uniqueness', () => {
  it('derives unique seeds for repeated challenge nonces', () => {
    const seeds = Array.from({ length: 10 }, (_, index) => (
      (mulberry32((99999 ^ (index + 1)) >>> 0)() * 0x100000000) >>> 0
    ));
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});
