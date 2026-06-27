import { describe, expect, it } from 'vitest';

import {
  buildBaseAiAnswers,
  buildPeekPreview,
  buildPollEstimate,
  countAnswerDistribution,
  initializeDiceDuel,
  initializeThreeWayDice,
  pickAiDuelNumber,
  pickMajorityRulesQuestion,
  resolveDiceDuelRoll,
  resolveMajorityRulesBallot,
  resolveThreeWayDiceRoll,
  simulateMajorityRulesBallot,
  type MajorityRulesHintInventory,
  type MajorityRulesQuestion,
  type MajorityRulesQuestionOption,
} from '../src/features/majorityRules/helpers';

const QUESTION: MajorityRulesQuestion = {
  id: 'q-majority-rules-audit',
  prompt: 'What would most people choose?',
  options: [
    { id: 'a', label: 'A', text: 'Alpha', baseBias: 0.92 },
    { id: 'b', label: 'B', text: 'Beta', baseBias: 0.66 },
    { id: 'c', label: 'C', text: 'Gamma', baseBias: 0.24 },
  ] as [MajorityRulesQuestionOption, MajorityRulesQuestionOption, MajorityRulesQuestionOption],
};

const EXHAUSTED_INVENTORY: MajorityRulesHintInventory = {
  pollHintUsed: true,
  peekTwoUsed: true,
  followPlayerUsed: true,
};

describe('Majority Rules', () => {
  it('keeps question selection and polls deterministic', () => {
    const picked = pickMajorityRulesQuestion(12, 1, []);
    expect(picked.options).toHaveLength(3);
    expect(picked.options.map((option) => option.id)).toEqual(['a', 'b', 'c']);
    expect(picked.options.map((option) => option.label)).toEqual(['A', 'B', 'C']);
    expect(pickMajorityRulesQuestion(12, 1, [])).toEqual(picked);

    const distribution = countAnswerDistribution(
      { p1: 'a', p2: 'b', p3: 'a', p4: 'c' },
      QUESTION.options,
    );
    expect(distribution).toEqual({ a: 2, b: 1, c: 1 });

    const poll = buildPollEstimate(distribution, 99, 2, 'viewer');
    expect(Object.keys(poll)).toEqual(['a', 'b', 'c']);
    expect(Object.values(poll).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('resolves ballots across unanimous, elimination, and revote states', () => {
    const unanimous = resolveMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3'],
      answers: { p1: 'a', p2: 'a', p3: 'a' },
      question: QUESTION,
      eliminationCount: 1,
    });
    expect(unanimous.kind).toBe('unanimous');
    expect(unanimous.eliminatedIds).toEqual([]);

    const elimination = resolveMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3', 'p4'],
      answers: { p1: 'a', p2: 'a', p3: 'b', p4: 'c' },
      question: QUESTION,
      eliminationCount: 2,
    });
    expect(elimination.kind).toBe('elimination');
    expect(elimination.eliminatedIds.sort()).toEqual(['p3', 'p4']);
    expect(elimination.minorityOptionId).toBeNull();

    const revote = resolveMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3', 'p4'],
      answers: { p1: 'a', p2: 'a', p3: 'b', p4: 'b' },
      question: QUESTION,
      eliminationCount: 1,
    });
    expect(revote.kind).toBe('revote');
    expect(revote.tiedOptionIds.sort()).toEqual(['a', 'b']);
  });

  it('applies hint-aware simulation without breaking the human vote', () => {
    const activeIds = ['human', 'ai-1', 'ai-2', 'ai-3'];
    const blockedAnswers = { 'ai-2': 'c' };
    const baseAiAnswers = buildBaseAiAnswers({
      activeIds,
      humanPlayerId: 'human',
      seed: 11,
      roundNumber: 1,
      question: QUESTION,
      previousDistribution: { a: 2, b: 1, c: 1 },
      blockedAnswers,
    });

    expect(Object.keys(baseAiAnswers).sort()).toEqual(['ai-1', 'ai-2', 'ai-3']);
    expect(baseAiAnswers['ai-2']).not.toBe('c');

    const preview = buildPeekPreview({
      activeIds,
      viewerId: 'human',
      seed: 11,
      roundNumber: 1,
      question: QUESTION,
      baseAiAnswers,
      blockedAnswers,
    });
    expect(Object.keys(preview).length).toBeLessThanOrEqual(2);
    expect(preview.human).toBeUndefined();

    const simulation = simulateMajorityRulesBallot({
      activeIds,
      humanPlayerId: 'human',
      humanAnswer: 'b',
      humanHint: null,
      inventories: {
        'ai-1': { ...EXHAUSTED_INVENTORY },
        'ai-2': { ...EXHAUSTED_INVENTORY },
        'ai-3': { ...EXHAUSTED_INVENTORY },
      },
      seed: 11,
      roundNumber: 1,
      question: QUESTION,
      previousDistribution: { a: 2, b: 1, c: 1 },
      blockedAnswers,
    });

    expect(simulation.aiHintDecision).toBeNull();
    expect(simulation.answers.human).toBe('b');
    expect(Object.values(simulation.distribution).reduce((sum, value) => sum + value, 0)).toBe(4);
  });

  it('keeps the dice tie-break helpers deterministic', () => {
    const duel = initializeDiceDuel(['alice', 'bob']);
    expect(duel.currentRollerId).toBe('alice');
    expect(pickAiDuelNumber(7, 'alice', [1, 2, 3])).toBeGreaterThanOrEqual(4);
    expect(pickAiDuelNumber(7, 'alice', [1, 2, 3])).toBeLessThanOrEqual(6);

    const duelWithChoice = {
      ...duel,
      chosenNumbers: { alice: 3, bob: 5 },
    };
    const result = resolveDiceDuelRoll(duelWithChoice, 99);
    expect(result.duel.turnCount).toBe(1);
    expect(result.duel.lastRoll).toBeTruthy();
    expect(result.duel.lastRoll?.playerId).toBe('alice');
    expect(result.duel.lastRoll?.value).toBeGreaterThanOrEqual(1);
    expect(result.duel.lastRoll?.value).toBeLessThanOrEqual(6);

    let threeWay = initializeThreeWayDice(['a', 'b', 'c']);
    threeWay = {
      ...threeWay,
      chosenNumbers: { a: 1, b: 2, c: 3 },
    };
    const step1 = resolveThreeWayDiceRoll(threeWay, 7);
    const step2 = resolveThreeWayDiceRoll(step1.duel, 7);
    const step3 = resolveThreeWayDiceRoll(step2.duel, 7);
    expect(step3.duel.roundCount).toBe(1);
    expect(step3.duel.lastRoundResult).not.toBeNull();
  });
});
