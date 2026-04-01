import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import majorityRulesReducer, {
  advanceIntro,
  advanceReveal,
  initMajorityRules,
  markMajorityRulesOutcomeResolved,
  type MajorityRulesState,
} from '../../src/features/majorityRules/majorityRulesSlice';
import { resolveMajorityRulesOutcome } from '../../src/features/majorityRules/thunks';
import { MAJORITY_RULES_QUESTIONS } from '../../src/features/majorityRules/helpers';
import { getGame } from '../../src/minigames/registry';

function makeStore(initialMajorityRules?: Partial<MajorityRulesState>) {
  const gameReducer = (
    state = {
      phase: 'hoh_comp',
      hohId: null as string | null,
      applyCount: 0,
    },
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === 'game/applyMinigameWinner') {
      const payload = action.payload as { winnerId: string };
      return {
        ...state,
        hohId: payload.winnerId,
        phase: 'hoh_results',
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
            competitionType: 'HOH',
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

  it('documents the fully split round re-vote rule in the instructions', () => {
    const entry = getGame('majorityRules');
    expect(entry?.instructions).toContain(
      "If all 3 answers are split evenly, everyone re-votes until there's a clear majority and minority.",
    );
  });
});

describe('resolveMajorityRulesOutcome', () => {
  it('dispatches applyMinigameWinner only once', async () => {
    const store = makeStore({});

    await store.dispatch(resolveMajorityRulesOutcome());
    expect(store.getState().game.hohId).toBe('p2');
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
        competitionType: 'HOH',
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
          competitionType: 'HOH',
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
});
