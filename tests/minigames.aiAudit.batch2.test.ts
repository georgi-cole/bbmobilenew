import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import {
  MAJORITY_RULES_QUESTIONS,
  buildBaseAiAnswers,
  initializeDiceDuel,
  pickAiDuelNumber,
  pickMajorityRulesQuestion,
  resolveDiceDuelRoll,
  resolveMajorityRulesBallot,
  simulateMajorityRulesBallot,
} from '../src/features/majorityRules/helpers';
import houseOfCardsReducer, {
  computeClashScore,
  finaliseOutcome,
  rankOutcomes,
  simulateAiOutcome,
  startHouseOfCards,
  type HouseOfCardsState,
} from '../src/features/houseOfCards/houseOfCardsSlice';
import famousFiguresReducer, {
  FAMOUS_FIGURES,
  advancePlayerCursor,
  endRound,
  finishAllRounds,
  getPlayerFigureIndex,
  nextRound,
  startFamousFigures,
  submitPlayerGuess,
  type FamousFiguresState,
} from '../src/features/famousFigures/famousFiguresSlice';

const majorityQuestion = MAJORITY_RULES_QUESTIONS[0];

function makeHouseStore(preloaded?: Partial<HouseOfCardsState>) {
  return configureStore({
    reducer: { houseOfCards: houseOfCardsReducer },
    preloadedState: preloaded ? { houseOfCards: { ...houseOfCardsReducer(undefined, { type: '@@init' }), ...preloaded } } : undefined,
  });
}

function getHouseState(store: ReturnType<typeof makeHouseStore>) {
  return store.getState().houseOfCards;
}

function makeFiguresStore(preloaded?: Partial<FamousFiguresState>) {
  return configureStore({
    reducer: { famousFigures: famousFiguresReducer },
    preloadedState: preloaded ? { famousFigures: { ...famousFiguresReducer(undefined, { type: '@@init' }), ...preloaded } } : undefined,
  });
}

function getFiguresState(store: ReturnType<typeof makeFiguresStore>) {
  return store.getState().famousFigures;
}

describe('Batch 2 AI and progression audit', () => {
  describe('Majority Rules', () => {
    it('keeps AI ballots, revotes, and dice-duel resolution reachable', () => {
      const aiAnswers = buildBaseAiAnswers({
        activeIds: ['p1', 'p2', 'p3'],
        humanPlayerId: null,
        seed: 77,
        roundNumber: 2,
        question: majorityQuestion,
        previousDistribution: { a: 2, b: 1, c: 0 },
        blockedAnswers: { p1: 'a', p2: 'b', p3: 'c' },
      });

      expect(Object.keys(aiAnswers)).toHaveLength(3);
      expect(aiAnswers.p1).not.toBe('a');
      expect(aiAnswers.p2).not.toBe('b');
      expect(aiAnswers.p3).not.toBe('c');

      const simulation = simulateMajorityRulesBallot({
        activeIds: ['p1', 'p2', 'p3', 'human'],
        humanPlayerId: 'human',
        humanAnswer: 'a',
        humanHint: null,
        inventories: {
          p1: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
          p2: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
          p3: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
          human: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
        },
        seed: 77,
        roundNumber: 2,
        question: majorityQuestion,
        previousDistribution: { a: 2, b: 1, c: 0 },
        blockedAnswers: {},
      });

      expect(simulation.answers.human).toBe('a');
      expect(Object.values(simulation.answers).every((answer) => ['a', 'b', 'c'].includes(answer))).toBe(true);
      expect(simulation.distribution.a + simulation.distribution.b + simulation.distribution.c).toBe(4);
      expect(simulation.aiHintDecision === null || ['pollHint', 'peekTwo', 'followPlayer'].includes(simulation.aiHintDecision.type)).toBe(true);

      const unanimous = resolveMajorityRulesBallot({
        activeIds: ['p1', 'p2', 'p3', 'p4'],
        answers: { p1: 'a', p2: 'a', p3: 'a', p4: 'a' },
        question: majorityQuestion,
        eliminationCount: 1,
      });
      expect(unanimous.kind).toBe('unanimous');

      const tiedMinority = resolveMajorityRulesBallot({
        activeIds: ['p1', 'p2', 'p3', 'p4'],
        answers: { p1: 'a', p2: 'a', p3: 'b', p4: 'c' },
        question: majorityQuestion,
        eliminationCount: 1,
      });
      expect(tiedMinority.kind).toBe('elimination');
      expect(tiedMinority.eliminatedIds.sort()).toEqual(['p3', 'p4']);
      expect(tiedMinority.tiedOptionIds.sort()).toEqual(['b', 'c']);

      const revote = resolveMajorityRulesBallot({
        activeIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
        answers: { p1: 'a', p2: 'a', p3: 'a', p4: 'b', p5: 'b', p6: 'c' },
        question: majorityQuestion,
        eliminationCount: 2,
      });
      expect(revote.kind).toBe('elimination');
      expect(revote.eliminatedIds).toEqual(['p6']);

      const questionA = pickMajorityRulesQuestion(17, 1, []);
      const questionB = pickMajorityRulesQuestion(17, 1, []);
      expect(questionA).toEqual(questionB);
      expect(MAJORITY_RULES_QUESTIONS).toHaveLength(200);

      const duel = initializeDiceDuel(['alpha', 'beta']);
      duel.chosenNumbers.alpha = pickAiDuelNumber(5, 'alpha', []);
      duel.chosenNumbers.beta = pickAiDuelNumber(5, 'beta', [duel.chosenNumbers.alpha!]);

      let current = duel;
      let winnerId: string | null = null;
      for (let i = 0; i < 40 && !winnerId; i += 1) {
        const next = resolveDiceDuelRoll(current, 5);
        current = next.duel;
        winnerId = next.winnerId;
      }

      expect(current.turnCount).toBeGreaterThan(0);
      expect(current.roundCount).toBeGreaterThanOrEqual(0);
      expect(current.suddenDeath || winnerId !== null).toBe(true);
    });
  });

  describe('House of Cards', () => {
    it('keeps deterministic AI outcomes and ranking tie-breaks stable', () => {
      const ai1 = simulateAiOutcome('ai-1', 42, 1);
      const ai1Repeat = simulateAiOutcome('ai-1', 42, 1);
      const ai2 = simulateAiOutcome('ai-2', 42, 2);

      expect(ai1).toEqual(ai1Repeat);
      expect(ai1.playerId).toBe('ai-1');
      expect(ai2.playerId).toBe('ai-2');

      const score1 = computeClashScore(ai1);
      const score2 = computeClashScore(ai2);
      expect(score1).toBeGreaterThanOrEqual(0);
      expect(score2).toBeGreaterThanOrEqual(0);

      const store = makeHouseStore();
      store.dispatch(
        startHouseOfCards({
          participantIds: ['human', 'ai-1', 'ai-2', 'ai-3'],
          humanId: 'human',
          prizeType: 'LOH',
          seed: 42,
        }),
      );

      const stateAfterStart = getHouseState(store);
      expect(Object.keys(stateAfterStart.aiOutcomes)).toEqual(['ai-1', 'ai-2', 'ai-3']);
      expect(stateAfterStart.status).toBe('active');

      const humanOutcome = {
        playerId: 'human',
        matchedPairs: 10,
        mistakes: 1,
        turnsTaken: 22,
        didFinish: true,
        completionTimeMs: 18_000,
        streakBest: 4,
        clashScore: 0,
        finalRank: 0,
      };

      const ranked = rankOutcomes(
        [humanOutcome, ...Object.values(stateAfterStart.aiOutcomes)].map(({ clashScore: _clashScore, finalRank: _finalRank, ...outcome }) => outcome),
        stateAfterStart.participantIds,
      );
      expect(ranked).toHaveLength(4);
      expect(ranked[0]?.playerId).toBeTruthy();
      expect(ranked[ranked.length - 1]?.playerId).toBeTruthy();

      store.dispatch(
        finaliseOutcome({
          matchedPairs: 10,
          mistakes: 1,
          turnsTaken: 22,
          completionTimeMs: 18_000,
          streakBest: 4,
          humanId: 'human',
        }),
      );

      const completed = getHouseState(store);
      expect(completed.status).toBe('complete');
      expect(completed.winnerId).toBeTruthy();
      expect(completed.lastPlaceId).toBeTruthy();
      expect(completed.standings).toHaveLength(4);
      expect(completed.outcomeResolved).toBe(false);
    });
  });

  describe('Famous Figures', () => {
    it('keeps shared figure order, cursor progression, and match completion working', () => {
      const store = makeFiguresStore();
      store.dispatch(startFamousFigures({ participantIds: ['player-a', 'player-b'], competitionType: 'LOH', seed: 42 }));

      const state0 = getFiguresState(store);
      expect(state0.status).toBe('round_active');
      expect(state0.matchFigureOrder).toHaveLength(state0.totalRounds);
      expect(state0.playerFigureQueues['player-a']).toEqual(state0.matchFigureOrder);
      expect(state0.playerFigureQueues['player-b']).toEqual(state0.matchFigureOrder);

      const fig0 = FAMOUS_FIGURES[getPlayerFigureIndex(state0, 'player-a', 0)];
      const fig1 = FAMOUS_FIGURES[getPlayerFigureIndex(state0, 'player-a', 1)];
      const fig2 = FAMOUS_FIGURES[getPlayerFigureIndex(state0, 'player-a', 2)];

      store.dispatch(submitPlayerGuess({ playerId: 'player-a', guess: fig0.canonicalName, targetRound: 0 }));
      store.dispatch(advancePlayerCursor({ playerId: 'player-a', targetRound: 0 }));
      expect(getFiguresState(store).playerRoundCursor['player-a']).toBe(1);
      expect(getFiguresState(store).status).toBe('round_active');

      store.dispatch(submitPlayerGuess({ playerId: 'player-a', guess: fig1.canonicalName, targetRound: 1 }));
      store.dispatch(submitPlayerGuess({ playerId: 'player-a', guess: fig2.canonicalName, targetRound: 2 }));
      expect(getFiguresState(store).playerRoundCursor['player-a']).toBe(3);

      store.dispatch(endRound());
      store.dispatch(nextRound());
      expect(getFiguresState(store).currentRound).toBe(1);
      expect(getFiguresState(store).status).toBe('round_active');

      store.dispatch(finishAllRounds());
      const completed = getFiguresState(store);
      expect(completed.status).toBe('complete');
      expect(completed.winnerId).toBeTruthy();
      expect(completed.playerScores['player-a']).toBeGreaterThan(0);
      expect(completed.playerScores['player-b']).toBeGreaterThanOrEqual(0);
    });
  });
});
