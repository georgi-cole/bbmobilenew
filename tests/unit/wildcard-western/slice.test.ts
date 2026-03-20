/**
 * Unit tests — Wildcard Western slice.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import wildcardWesternReducer, {
  initWildcardWestern,
  advanceIntro,
  dealCardsAction,
  advanceCardReveal,
  advancePairIntro,
  openBuzzWindow,
  playerBuzz,
  buzzTimeout,
  playerAnswer,
  answerTimeout,
  advanceResolution,
  playerChooseElimination,
  playerChooseNextPair,
  resetWildcardWestern,
} from '../../../src/features/wildcardWestern/wildcardWesternSlice';
import { WILDCARD_QUESTIONS } from '../../../src/features/wildcardWestern/wildcardWesternQuestions';

const SEED = 42;
const PLAYERS = ['alice', 'bob', 'carol', 'dave'];

function createTestStore() {
  return configureStore({
    reducer: {
      wildcardWestern: wildcardWesternReducer,
    },
  });
}

type TestStore = ReturnType<typeof createTestStore>;

/** Returns the correct answer index for the current question. */
function getCorrectAnswerIndex(store: TestStore): 0 | 1 | 2 {
  const { currentQuestionId } = store.getState().wildcardWestern;
  const question = WILDCARD_QUESTIONS.find((q) => q.id === currentQuestionId)!;
  return question.correctIndex;
}

/** Returns an incorrect answer index for the current question. */
function getWrongAnswerIndex(store: TestStore): 0 | 1 | 2 {
  const { currentQuestionId } = store.getState().wildcardWestern;
  const question = WILDCARD_QUESTIONS.find((q) => q.id === currentQuestionId)!;
  return ([0, 1, 2] as const).find((i) => i !== question.correctIndex)!;
}

/** Advances the test store to an active duel with the buzz window open. */
function reachBuzzOpen(store: TestStore) {
  store.dispatch(advanceIntro());
  store.dispatch(dealCardsAction());
  store.dispatch(advanceCardReveal());
  store.dispatch(advancePairIntro());
  store.dispatch(openBuzzWindow());
}

describe('wildcardWesternSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initialization', () => {
    it('initializes with correct state', () => {
      store.dispatch(
        initWildcardWestern({
          participantIds: PLAYERS,
          prizeType: 'HOH',
          seed: SEED,
          humanPlayerId: 'alice',
        }),
      );

      const state = store.getState().wildcardWestern;

      expect(state.phase).toBe('intro');
      expect(state.participantIds).toEqual(PLAYERS);
      expect(state.aliveIds).toEqual(PLAYERS);
      expect(state.eliminatedIds).toEqual([]);
      expect(state.humanPlayerId).toBe('alice');
      expect(state.seed).toBe(SEED);
      expect(state.prizeType).toBe('HOH');
    });
  });

  describe('card dealing', () => {
    beforeEach(() => {
      store.dispatch(
        initWildcardWestern({
          participantIds: PLAYERS,
          prizeType: 'HOH',
          seed: SEED,
          humanPlayerId: 'alice',
        }),
      );
      store.dispatch(advanceIntro());
    });

    it('advances from intro to cardDeal', () => {
      const state = store.getState().wildcardWestern;
      expect(state.phase).toBe('cardDeal');
    });

    it('deals unique cards to all players', () => {
      store.dispatch(dealCardsAction());
      const state = store.getState().wildcardWestern;

      expect(state.phase).toBe('cardReveal');
      expect(Object.keys(state.cardsByPlayerId)).toHaveLength(PLAYERS.length);

      const values = Object.values(state.cardsByPlayerId);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('assigns cards in range 1-99', () => {
      store.dispatch(dealCardsAction());
      const state = store.getState().wildcardWestern;

      for (const value of Object.values(state.cardsByPlayerId)) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(99);
      }
    });
  });

  describe('first pair selection', () => {
    beforeEach(() => {
      store.dispatch(
        initWildcardWestern({
          participantIds: PLAYERS,
          prizeType: 'HOH',
          seed: SEED,
          humanPlayerId: 'alice',
        }),
      );
      store.dispatch(advanceIntro());
      store.dispatch(dealCardsAction());
    });

    it('selects lowest vs highest card holders', () => {
      store.dispatch(advanceCardReveal());
      const state = store.getState().wildcardWestern;

      expect(state.phase).toBe('pairIntro');
      expect(state.currentPair).toHaveLength(2);

      const [low, high] = state.currentPair!;
      const lowCard = state.cardsByPlayerId[low];
      const highCard = state.cardsByPlayerId[high];

      for (const id of PLAYERS) {
        const card = state.cardsByPlayerId[id];
        expect(card).toBeGreaterThanOrEqual(lowCard);
        expect(card).toBeLessThanOrEqual(highCard);
      }
    });

    it('uses duelQuestion before opening the buzz window', () => {
      store.dispatch(advanceCardReveal());
      store.dispatch(advancePairIntro());

      const afterQuestionReveal = store.getState().wildcardWestern;
      expect(afterQuestionReveal.phase).toBe('duelQuestion');
      expect(afterQuestionReveal.currentQuestionId).not.toBeNull();
      expect(afterQuestionReveal.buzzWindowUntil).toBe(0);

      store.dispatch(openBuzzWindow());
      const afterBuzzOpens = store.getState().wildcardWestern;
      expect(afterBuzzOpens.phase).toBe('buzzOpen');
      expect(afterBuzzOpens.buzzWindowUntil).toBeGreaterThan(0);
    });
  });

  describe('buzz mechanics', () => {
    beforeEach(() => {
      store.dispatch(
        initWildcardWestern({
          participantIds: PLAYERS,
          prizeType: 'HOH',
          seed: SEED,
          humanPlayerId: 'alice',
        }),
      );
      reachBuzzOpen(store);
    });

    it('only allows current pair to buzz', () => {
      const state = store.getState().wildcardWestern;
      const [p1, p2] = state.currentPair!;
      const nonParticipant = PLAYERS.find((id) => id !== p1 && id !== p2)!;

      store.dispatch(playerBuzz({ playerId: nonParticipant }));
      const stateAfter = store.getState().wildcardWestern;

      expect(stateAfter.buzzedBy).toBeNull();
      expect(stateAfter.phase).toBe('buzzOpen');
    });

    it('allows current pair player to buzz', () => {
      const state = store.getState().wildcardWestern;
      const [p1] = state.currentPair!;

      store.dispatch(playerBuzz({ playerId: p1 }));
      const stateAfter = store.getState().wildcardWestern;

      expect(stateAfter.buzzedBy).toBe(p1);
      expect(stateAfter.phase).toBe('answerOpen');
    });

    it('locks out second buzz', () => {
      const state = store.getState().wildcardWestern;
      const [p1, p2] = state.currentPair!;

      store.dispatch(playerBuzz({ playerId: p1 }));
      store.dispatch(playerBuzz({ playerId: p2 }));

      const stateAfter = store.getState().wildcardWestern;
      expect(stateAfter.buzzedBy).toBe(p1);
    });
  });

  describe('answer mechanics', () => {
    beforeEach(() => {
      store.dispatch(
        initWildcardWestern({
          participantIds: PLAYERS,
          prizeType: 'HOH',
          seed: SEED,
          humanPlayerId: 'alice',
        }),
      );
      reachBuzzOpen(store);
    });

    it('correct answer eliminates opponent', () => {
      const state = store.getState().wildcardWestern;
      const [p1, p2] = state.currentPair!;

      store.dispatch(playerBuzz({ playerId: p1 }));

      // Look up the actual correct answer index from the question bank
      const questionId = state.currentQuestionId;
      const question = WILDCARD_QUESTIONS.find((q) => q.id === questionId)!;
      const correctIdx = question.correctIndex;

      store.dispatch(playerAnswer({ answerIndex: correctIdx }));
      const stateAfter = store.getState().wildcardWestern;

      expect(stateAfter.phase).toBe('resolution');
      expect(stateAfter.duelResolved).toBe(true);
      // Buzzer survived (p2 was eliminated or we moved to chooseElimination)
      expect(stateAfter.aliveIds).toContain(p1);
      expect(stateAfter.aliveIds).not.toContain(p2);
    });

    it('answer timeout eliminates buzzer', () => {
      const state = store.getState().wildcardWestern;
      const [p1] = state.currentPair!;

      store.dispatch(playerBuzz({ playerId: p1 }));
      store.dispatch(answerTimeout());

      const stateAfter = store.getState().wildcardWestern;

      expect(stateAfter.phase).toBe('resolution');
      expect(stateAfter.lastEliminatedId).toBe(p1);
      expect(stateAfter.aliveIds).not.toContain(p1);
    });
  });

  describe('buzz timeout', () => {
    beforeEach(() => {
      store.dispatch(
        initWildcardWestern({
          participantIds: PLAYERS,
          prizeType: 'HOH',
          seed: SEED,
          humanPlayerId: 'alice',
        }),
      );
      reachBuzzOpen(store);
    });

    it('eliminates both players when >2 alive', () => {
      const stateBefore = store.getState().wildcardWestern;
      const [p1, p2] = stateBefore.currentPair!;

      store.dispatch(buzzTimeout());
      const stateAfter = store.getState().wildcardWestern;

      expect(stateAfter.phase).toBe('resolution');
      expect(stateAfter.aliveIds).not.toContain(p1);
      expect(stateAfter.aliveIds).not.toContain(p2);
      expect(stateAfter.lastDuelOutcome).toBe('nobuzz');
    });

    it('redraws question when exactly 2 alive (final duel)', () => {
      // Eliminate all but 2 by driving through phase transitions
      store.dispatch(playerBuzz({ playerId: store.getState().wildcardWestern.currentPair![0] }));
      store.dispatch(playerAnswer({ answerIndex: getCorrectAnswerIndex(store) }));
      store.dispatch(advanceResolution());

      // Drive state machine until we reach buzzOpen with exactly 2 alive
      for (let i = 0; i < 100; i++) {
        const s = store.getState().wildcardWestern;
        if (s.phase === 'buzzOpen' && s.aliveIds.length === 2) break;
        if (s.phase === 'gameOver' || s.phase === 'complete') break;

        if (s.phase === 'chooseElimination') {
          const target = s.aliveIds.find((id) => id !== s.eliminationChooserId)!;
          store.dispatch(playerChooseElimination({ targetId: target }));
        } else if (s.phase === 'chooseNextPair') {
          const pair = [s.aliveIds[0], s.aliveIds[1]] as [string, string];
          store.dispatch(playerChooseNextPair({ pair }));
        } else if (s.phase === 'finalDuel') {
          store.dispatch(advancePairIntro());
        } else if (s.phase === 'duelQuestion') {
          store.dispatch(openBuzzWindow());
        } else if (s.phase === 'pairIntro') {
          store.dispatch(advancePairIntro());
        } else if (s.phase === 'buzzOpen') {
          // >2 alive and got a buzz open — drive duel forward
          store.dispatch(buzzTimeout());
          store.dispatch(advanceResolution());
        } else {
          break;
        }
      }

      const finalState = store.getState().wildcardWestern;
      if (finalState.aliveIds.length === 2 && finalState.phase === 'buzzOpen') {
        store.dispatch(buzzTimeout());
        const afterTimeout = store.getState().wildcardWestern;
        // Final-two no-buzz should redraw (phase goes to finalDuel) instead of eliminating both.
        expect(afterTimeout.phase).toBe('finalDuel');
        expect(afterTimeout.aliveIds).toHaveLength(2);
      }
    });
  });

  describe('elimination chooser', () => {
    beforeEach(() => {
      store.dispatch(
        initWildcardWestern({
          participantIds: PLAYERS,
          prizeType: 'HOH',
          seed: SEED,
          humanPlayerId: 'alice',
        }),
      );
      reachBuzzOpen(store);
    });

    it('cannot eliminate self', () => {
      const state = store.getState().wildcardWestern;
      const [p1] = state.currentPair!;

      store.dispatch(playerBuzz({ playerId: p1 }));
      store.dispatch(playerAnswer({ answerIndex: getCorrectAnswerIndex(store) }));
      store.dispatch(advanceResolution());

      const afterResolution = store.getState().wildcardWestern;
      if (afterResolution.phase === 'chooseElimination') {
        const chooser = afterResolution.eliminationChooserId!;
        const aliveBefore = [...afterResolution.aliveIds];

        store.dispatch(playerChooseElimination({ targetId: chooser }));

        const afterChoice = store.getState().wildcardWestern;
        expect(afterChoice.aliveIds).toEqual(aliveBefore);
        expect(afterChoice.phase).toBe('chooseElimination');
      }
    });

    it('cannot eliminate already eliminated player', () => {
      const state = store.getState().wildcardWestern;
      store.dispatch(playerBuzz({ playerId: state.currentPair![0] }));
      store.dispatch(playerAnswer({ answerIndex: getCorrectAnswerIndex(store) }));
      store.dispatch(advanceResolution());

      const afterResolution = store.getState().wildcardWestern;
      if (afterResolution.phase === 'chooseElimination') {
        const eliminated = afterResolution.eliminatedIds[0];
        const aliveBefore = [...afterResolution.aliveIds];

        store.dispatch(playerChooseElimination({ targetId: eliminated }));

        const afterChoice = store.getState().wildcardWestern;
        expect(afterChoice.aliveIds).toEqual(aliveBefore);
        expect(afterChoice.phase).toBe('chooseElimination');
      }
    });
  });

  describe('idempotency', () => {
    beforeEach(() => {
      store.dispatch(
        initWildcardWestern({
          participantIds: PLAYERS,
          prizeType: 'HOH',
          seed: SEED,
          humanPlayerId: 'alice',
        }),
      );
      reachBuzzOpen(store);
    });

    it('prevents double resolution via duelResolved flag', () => {
      const state = store.getState().wildcardWestern;
      const [p1] = state.currentPair!;

      store.dispatch(playerBuzz({ playerId: p1 }));
      store.dispatch(playerAnswer({ answerIndex: getWrongAnswerIndex(store) }));

      const afterFirst = store.getState().wildcardWestern;
      const eliminatedFirst = [...afterFirst.eliminatedIds];

      // Second dispatch of playerAnswer should be ignored (duelResolved guard)
      store.dispatch(playerAnswer({ answerIndex: getCorrectAnswerIndex(store) }));

      const afterSecond = store.getState().wildcardWestern;
      expect(afterSecond.eliminatedIds).toEqual(eliminatedFirst);
    });
  });

  describe('reset', () => {
    it('returns to idle state', () => {
      store.dispatch(
        initWildcardWestern({
          participantIds: PLAYERS,
          prizeType: 'HOH',
          seed: SEED,
          humanPlayerId: 'alice',
        }),
      );
      store.dispatch(advanceIntro());
      store.dispatch(resetWildcardWestern());

      const state = store.getState().wildcardWestern;
      expect(state.phase).toBe('idle');
      expect(state.participantIds).toEqual([]);
    });
  });
});
