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
} from '../../../src/features/majorityRules/helpers';

const question = MAJORITY_RULES_QUESTIONS[0];

describe('majorityRules logic', () => {
  it('simulates AI ballots deterministically from seed and round data', () => {
    const first = simulateMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3', 'human'],
      humanPlayerId: 'human',
      humanAnswer: 'a',
      inventories: {
        p1: { peekTwoUsed: false, followPlayerUsed: false },
        p2: { peekTwoUsed: false, followPlayerUsed: false },
        p3: { peekTwoUsed: false, followPlayerUsed: false },
        human: { peekTwoUsed: false, followPlayerUsed: false },
      },
      seed: 77,
      roundNumber: 2,
      question,
      previousDistribution: { a: 2, b: 1, c: 0 },
      blockedAnswers: {},
    });
    const second = simulateMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3', 'human'],
      humanPlayerId: 'human',
      humanAnswer: 'a',
      inventories: {
        p1: { peekTwoUsed: false, followPlayerUsed: false },
        p2: { peekTwoUsed: false, followPlayerUsed: false },
        p3: { peekTwoUsed: false, followPlayerUsed: false },
        human: { peekTwoUsed: false, followPlayerUsed: false },
      },
      seed: 77,
      roundNumber: 2,
      question,
      previousDistribution: { a: 2, b: 1, c: 0 },
      blockedAnswers: {},
    });

    expect(first).toEqual(second);
  });

  it('uses the expanded question bank and shuffles seeded question options', () => {
    expect(MAJORITY_RULES_QUESTIONS).toHaveLength(200);

    const seededQuestion = pickMajorityRulesQuestion(17, 1, []);
    const baseQuestion = MAJORITY_RULES_QUESTIONS.find((entry) => entry.id === seededQuestion.id);

    expect(baseQuestion).toBeDefined();
    expect(seededQuestion.options.map((option) => option.text)).not.toEqual(
      baseQuestion?.options.map((option) => option.text),
    );
  });

  it('flags unanimous rounds without eliminating anyone', () => {
    const result = resolveMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3', 'p4'],
      answers: { p1: 'a', p2: 'a', p3: 'a', p4: 'a' },
      question,
      eliminationCount: 1,
      seed: 10,
      roundNumber: 1,
    });

    expect(result.kind).toBe('unanimous');
    expect(result.eliminatedIds).toEqual([]);
  });

  it('eliminates every player tied in the minority', () => {
    const result = resolveMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3', 'p4'],
      answers: { p1: 'a', p2: 'a', p3: 'b', p4: 'c' },
      question,
      eliminationCount: 1,
      seed: 12,
      roundNumber: 1,
    });

    expect(result.kind).toBe('elimination');
    expect(result.tiedOptionIds.sort()).toEqual(['b', 'c']);
    expect(result.eliminatedIds.sort()).toEqual(['p3', 'p4']);
  });

  it('keeps elimination normal even when a caller requests double elimination', () => {
    const result = resolveMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      answers: { p1: 'a', p2: 'a', p3: 'a', p4: 'b', p5: 'b', p6: 'c' },
      question,
      eliminationCount: 2,
      seed: 45,
      roundNumber: 3,
    });

    expect(result.kind).toBe('elimination');
    expect(result.eliminatedIds).toEqual(['p6']);
  });

  it('respects revote answer blocks when recomputing AI answers', () => {
    const answers = buildBaseAiAnswers({
      activeIds: ['p1', 'p2', 'p3'],
      humanPlayerId: null,
      seed: 91,
      roundNumber: 4,
      question,
      previousDistribution: { a: 1, b: 1, c: 1 },
      blockedAnswers: { p1: 'a', p2: 'b', p3: 'c' },
    });

    expect(answers.p1).not.toBe('a');
    expect(answers.p2).not.toBe('b');
    expect(answers.p3).not.toBe('c');
  });

  it('handles dice duel pressure, cancellation, and sudden death deterministically', () => {
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
