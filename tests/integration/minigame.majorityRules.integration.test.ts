import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import majorityRulesReducer, {
  advanceIntro,
  advanceReveal,
  initMajorityRules,
  markMajorityRulesOutcomeResolved,
  rollThreeWayDuel,
  setThreeWayDuelPick,
  useHint,
  type MajorityRulesState,
} from '../../src/features/majorityRules/majorityRulesSlice';
import { resolveMajorityRulesOutcome } from '../../src/features/majorityRules/thunks';
import {
  MAJORITY_RULES_QUESTIONS,
  initializeThreeWayDice,
  resolveThreeWayDiceRoll,
} from '../../src/features/majorityRules/helpers';
import { getGame } from '../../src/minigames/registry';

function makeStore(initialMajorityRules?: Partial<MajorityRulesState>) {
  const gameReducer = (
    state = {
      phase: 'loh_comp',
      lohId: null as string | null,
      applyCount: 0,
    },
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === 'game/applyMinigameWinner') {
      const payload = action.payload as { winnerId: string };
      return {
        ...state,
        lohId: payload.winnerId,
        phase: 'loh_results',
        applyCount: state.applyCount + 1,
      };
    }
    return state;
  };

  return configureStore({
    reducer: {
      majorityRules: majorityRulesReducer,
      game: gameReducer,
    },
    preloadedState: initialMajorityRules
      ? {
          majorityRules: {
            phase: 'complete',
            competitionType: 'LOH',
            seed: 7,
            participantIds: ['p1', 'p2', 'p3'],
            activeIds: ['p2'],
            eliminatedIds: ['p3', 'p1'],
            humanPlayerId: 'p1',
            roundNumber: 3,
            revoteNumber: 0,
            currentQuestion: null,
            usedQuestionIds: [],
            draftAnswers: {},
            previousDistribution: null,
            blockedAnswers: {},
            doubleEliminationArmed: false,
            hintInventories: {},
            roundHintUsedBy: null,
            roundHintType: null,
            roundHintTargetId: null,
            roundHintPollEstimate: null,
            roundHintPeekedAnswers: null,
            revealState: null,
            threeWayDuel: null,
            finalDuel: null,
            winnerId: 'p2',
            outcomeResolved: false,
            ...initialMajorityRules,
          },
        }
      : undefined,
  });
}

describe('majorityRules registry entry', () => {
  it('exists and is configured as an authoritative react game', () => {
    const entry = getGame('majorityRules');
    expect(entry).toBeDefined();
    expect(entry?.implementation).toBe('react');
    expect(entry?.reactComponentKey).toBe('MajorityRules');
    expect(entry?.authoritative).toBe(true);
    expect(entry?.scoringAdapter).toBe('authoritative');
    expect(entry?.resultMode).toBe('placement');
  });

  it('documents the updated hint and split-vote tiebreak rules in the instructions', () => {
    const entry = getGame('majorityRules');
    expect(entry?.instructions).toContain(
      'You get 3 hints for the whole game, and each hint can only be used once.',
    );
    expect(entry?.instructions).toContain(
      "If all 3 answers are split evenly, everyone re-votes up to 3 times before a 3-way dice tiebreaker.",
    );
  });
});

describe('resolveMajorityRulesOutcome', () => {
  it('dispatches applyMinigameWinner only once', async () => {
    const store = makeStore({});

    await store.dispatch(resolveMajorityRulesOutcome());
    expect(store.getState().game.lohId).toBe('p2');
    expect(store.getState().game.applyCount).toBe(1);

    await store.dispatch(resolveMajorityRulesOutcome());
    expect(store.getState().game.applyCount).toBe(1);
  });

  it('respects the explicit outcomeResolved guard', async () => {
    const store = makeStore({});
    store.dispatch(markMajorityRulesOutcomeResolved());
    await store.dispatch(resolveMajorityRulesOutcome());
    expect(store.getState().game.applyCount).toBe(0);
  });
});

describe('majorityRules initialization flow', () => {
  it('skips straight into the final duel flow when only two participants start', () => {
    const store = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
    });

    store.dispatch(
      initMajorityRules({
        participantIds: ['p1', 'p2'],
        competitionType: 'LOH',
        seed: 11,
        humanPlayerId: 'p1',
      }),
    );

    expect(store.getState().majorityRules.phase).toBe('intro');
    expect(store.getState().majorityRules.currentQuestion).toBeNull();

    store.dispatch(advanceIntro());

    const majorityRules = store.getState().majorityRules;
    expect(majorityRules.phase).toBe('final_duel_pick');
    expect(majorityRules.finalDuel?.finalists).toEqual(['p1', 'p2']);
    expect(majorityRules.finalDuel?.chosenNumbers.p2).toBeTypeOf('number');
  });

  it('does not arm double elimination after a unanimous reveal', () => {
    const question = MAJORITY_RULES_QUESTIONS[0];
    const store = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
      preloadedState: {
        majorityRules: {
          phase: 'reveal',
          competitionType: 'LOH',
          seed: 11,
          participantIds: ['p1', 'p2', 'p3', 'p4'],
          activeIds: ['p1', 'p2', 'p3', 'p4'],
          eliminatedIds: [],
          humanPlayerId: 'p1',
          roundNumber: 1,
          revoteNumber: 0,
          currentQuestion: question,
          usedQuestionIds: [question.id],
          draftAnswers: {},
          previousDistribution: null,
          blockedAnswers: {},
          doubleEliminationArmed: true,
          hintInventories: {},
          roundHintUsedBy: null,
          roundHintType: null,
          roundHintTargetId: null,
          roundHintPollEstimate: null,
          roundHintPeekedAnswers: null,
          revealState: {
            result: {
              kind: 'unanimous',
              distribution: { a: 4, b: 0, c: 0 },
              answers: { p1: 'a', p2: 'a', p3: 'a', p4: 'a' },
              eliminatedIds: [],
              minorityOptionId: 'a',
              tiedOptionIds: [],
              eliminationCount: 1,
            },
            revoteNumber: 0,
          },
          threeWayDuel: null,
          finalDuel: null,
          winnerId: null,
          outcomeResolved: false,
        },
      },
    });

    store.dispatch(advanceReveal());

    const majorityRules = store.getState().majorityRules;
    expect(majorityRules.phase).toBe('question');
    expect(majorityRules.doubleEliminationArmed).toBe(false);
  });

  it('spends the poll hint once for the whole game', () => {
    const store = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
    });

    store.dispatch(
      initMajorityRules({
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        competitionType: 'LOH',
        seed: 17,
        humanPlayerId: 'p1',
      }),
    );
    store.dispatch(advanceIntro());
    store.dispatch(useHint({ playerId: 'p1', hintType: 'pollHint' }));

    const spentState = store.getState().majorityRules;
    expect(spentState.hintInventories.p1.pollHintUsed).toBe(true);
    expect(spentState.roundHintType).toBe('pollHint');

    const retryStore = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
      preloadedState: {
        majorityRules: {
          ...spentState,
          roundHintUsedBy: null,
          roundHintType: null,
          roundHintPollEstimate: null,
          roundHintPeekedAnswers: null,
        },
      },
    });

    retryStore.dispatch(useHint({ playerId: 'p1', hintType: 'pollHint' }));

    const retriedState = retryStore.getState().majorityRules;
    expect(retriedState.roundHintUsedBy).toBeNull();
    expect(retriedState.roundHintType).toBeNull();
    expect(retriedState.roundHintPollEstimate).toBeNull();
  });

  it('moves a third straight 3-player draw into the 3-way dice tiebreak', () => {
    const question = MAJORITY_RULES_QUESTIONS[0];
    const store = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
      preloadedState: {
        majorityRules: {
          phase: 'reveal',
          competitionType: 'LOH',
          seed: 23,
          participantIds: ['p1', 'p2', 'p3'],
          activeIds: ['p1', 'p2', 'p3'],
          eliminatedIds: [],
          humanPlayerId: 'p1',
          roundNumber: 4,
          revoteNumber: 2,
          currentQuestion: question,
          usedQuestionIds: [question.id],
          draftAnswers: {},
          previousDistribution: null,
          blockedAnswers: { p1: 'a', p2: 'b', p3: 'c' },
          doubleEliminationArmed: false,
          hintInventories: {
            p1: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
            p2: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
            p3: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
          },
          roundHintUsedBy: null,
          roundHintType: null,
          roundHintTargetId: null,
          roundHintPollEstimate: null,
          roundHintPeekedAnswers: null,
          revealState: {
            result: {
              kind: 'revote',
              distribution: { a: 1, b: 1, c: 1 },
              answers: { p1: 'a', p2: 'b', p3: 'c' },
              eliminatedIds: [],
              minorityOptionId: null,
              tiedOptionIds: ['a', 'b', 'c'],
              eliminationCount: 1,
            },
            revoteNumber: 2,
          },
          threeWayDuel: null,
          finalDuel: null,
          winnerId: null,
          outcomeResolved: false,
        },
      },
    });

    store.dispatch(advanceReveal());

    const majorityRules = store.getState().majorityRules;
    expect(majorityRules.phase).toBe('three_way_duel_pick');
    expect(majorityRules.threeWayDuel?.finalists).toEqual(['p1', 'p2', 'p3']);
    expect(majorityRules.threeWayDuel?.chosenNumbers.p1).toBeNull();
    expect(majorityRules.threeWayDuel?.chosenNumbers.p2).toBeTypeOf('number');
    expect(majorityRules.threeWayDuel?.chosenNumbers.p3).toBeTypeOf('number');
  });

  it('eliminates the third player after a 3-way dice tie and advances to the final duel', () => {
    // Known-good seed for this exact 3-way duel setup:
    // p1 picks 6, p2 picks 1, p3 picks 2 -> p2 is eliminated and p1/p3 advance.
    const seed = 1;
    const store = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
      preloadedState: {
        majorityRules: {
          phase: 'three_way_duel_pick',
          competitionType: 'LOH',
          seed: seed!,
          participantIds: ['p1', 'p2', 'p3'],
          activeIds: ['p1', 'p2', 'p3'],
          eliminatedIds: [],
          humanPlayerId: 'p1',
          roundNumber: 4,
          revoteNumber: 0,
          currentQuestion: null,
          usedQuestionIds: [],
          draftAnswers: {},
          previousDistribution: null,
          blockedAnswers: {},
          doubleEliminationArmed: false,
          hintInventories: {
            p1: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
            p2: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
            p3: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
          },
          roundHintUsedBy: null,
          roundHintType: null,
          roundHintTargetId: null,
          roundHintPollEstimate: null,
          roundHintPeekedAnswers: null,
          revealState: null,
          threeWayDuel: {
            finalists: ['p1', 'p2', 'p3'],
            chosenNumbers: { p1: null, p2: 1, p3: 2 },
            currentRoundRolls: { p1: null, p2: null, p3: null },
            currentRollerId: 'p1',
            roundCount: 0,
            turnCount: 0,
            lastRoll: null,
            lastRoundResult: null,
          },
          finalDuel: null,
          winnerId: null,
          outcomeResolved: false,
        },
      },
    });

    store.dispatch(setThreeWayDuelPick({ playerId: 'p1', value: 6 }));
    expect(store.getState().majorityRules.phase).toBe('three_way_duel_roll');

    store.dispatch(rollThreeWayDuel());
    store.dispatch(rollThreeWayDuel());
    store.dispatch(rollThreeWayDuel());

    const majorityRules = store.getState().majorityRules;
    expect(majorityRules.phase).toBe('final_duel_pick');
    expect(majorityRules.eliminatedIds).toEqual(['p2']);
    expect(majorityRules.activeIds).toEqual(['p1', 'p3']);
    expect(majorityRules.finalDuel?.finalists).toEqual(['p1', 'p3']);
  });
});
