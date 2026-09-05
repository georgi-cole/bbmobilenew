import { describe, expect, it } from 'vitest';
import { minigameAiRegistry } from '../../../src/ai/competition/minigameAiRegistry';
import {
  CAPITALIZATION_CONTINENTS,
  CAPITALIZATION_COUNTRIES_BY_CONTINENT,
} from '../../../src/components/Capitalization/capitalizationData';
import {
  CAPITALIZATION_QUESTIONS_PER_CONTINENT,
  CAPITALIZATION_TOTAL_QUESTIONS,
  buildCapitalizationQuestionSet,
  computeCapitalizationQuestionScore,
  createCapitalizationAiRng,
  createCapitalizationStandings,
  eliminateCapitalizationField,
  isCapitalAnswerAccepted,
  rankCapitalizationStandings,
  resolveCapitalizationRunSeed,
  simulateCapitalizationAiPerformance,
} from '../../../src/components/Capitalization/capitalizationUtils';
import { getGame } from '../../../src/minigames/registry';
import reactComponents from '../../../src/minigames/reactComponents';

describe('Capitalization question set', () => {
  it('selects three non-Antarctica continents and nine total questions', () => {
    const set = buildCapitalizationQuestionSet(12345);

    expect(set.continents).toHaveLength(3);
    expect(set.questions).toHaveLength(CAPITALIZATION_TOTAL_QUESTIONS);
    expect(set.continents).not.toContain('Antarctica');
    expect(new Set(set.continents).size).toBe(3);

    for (let index = 0; index < set.continents.length; index += 1) {
      const block = set.questions.slice(
        index * CAPITALIZATION_QUESTIONS_PER_CONTINENT,
        (index + 1) * CAPITALIZATION_QUESTIONS_PER_CONTINENT,
      );
      expect(block.every((question) => question.continent === set.continents[index])).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(buildCapitalizationQuestionSet(77)).toEqual(buildCapitalizationQuestionSet(77));
  });

  it('uses fresh run seeds when no non-zero seed is provided', () => {
    expect(resolveCapitalizationRunSeed(undefined, () => 1234)).toBe(1234);
    expect(resolveCapitalizationRunSeed(0, () => 5678)).toBe(5678);
    expect(resolveCapitalizationRunSeed(77, () => 9999)).toBe(77);
  });
});

describe('Capitalization answer matching and scoring', () => {
  it('accepts punctuation, accents, and common alternate forms', () => {
    const unitedStates = CAPITALIZATION_COUNTRIES_BY_CONTINENT['North America']
      .find((country) => country.id === 'united-states');
    const brazil = CAPITALIZATION_COUNTRIES_BY_CONTINENT['South America']
      .find((country) => country.id === 'brazil');

    if (!unitedStates || !brazil) throw new Error('Fixture countries missing');

    expect(isCapitalAnswerAccepted('Washington DC', unitedStates)).toBe(true);
    expect(isCapitalAnswerAccepted('Washington, D.C.', unitedStates)).toBe(true);
    expect(isCapitalAnswerAccepted('Brasília', brazil)).toBe(true);
    expect(isCapitalAnswerAccepted('brasilia', brazil)).toBe(true);
  });

  it('rewards speed and first-try accuracy, while skips score zero', () => {
    const fastFirstTry = computeCapitalizationQuestionScore({
      guessed: true,
      attempts: 1,
      timeMs: 2_000,
    });
    const slowThirdTry = computeCapitalizationQuestionScore({
      guessed: true,
      attempts: 3,
      timeMs: 18_000,
    });
    const skipped = computeCapitalizationQuestionScore({
      guessed: false,
      skipped: true,
      attempts: 1,
      timeMs: 4_000,
    });

    expect(fastFirstTry).toBeGreaterThan(slowThirdTry);
    expect(slowThirdTry).toBeGreaterThan(0);
    expect(skipped).toBe(0);
    expect(computeCapitalizationQuestionScore({
      guessed: true,
      attempts: 1,
      timeMs: 2_000,
      hintUsed: true,
    })).toBe(Math.floor(fastFirstTry / 2));
  });
});

describe('Capitalization AI and eliminations', () => {
  it('simulates deterministic AI performance per participant and question', () => {
    const question = buildCapitalizationQuestionSet(91).questions[0];
    const participant = {
      id: 'ai-atlas',
      name: 'Atlas Byte',
      isHuman: false,
      precomputedScore: 82,
    };
    const first = simulateCapitalizationAiPerformance(
      { participant, question },
      createCapitalizationAiRng({
        seed: 91,
        questionNumber: question.questionNumber,
        participantId: participant.id,
      }),
    );
    const second = simulateCapitalizationAiPerformance(
      { participant, question },
      createCapitalizationAiRng({
        seed: 91,
        questionNumber: question.questionNumber,
        participantId: participant.id,
      }),
    );

    expect(second).toEqual(first);
  });

  it('uses a hint as the fallback when an AI cannot recall a very hard capital', () => {
    const oceaniaCountry = CAPITALIZATION_COUNTRIES_BY_CONTINENT.Oceania
      .find((country) => country.difficulty === 5);
    if (!oceaniaCountry) throw new Error('Very hard Oceania fixture missing');

    const rolls = [
      0.99, // recall fails against the 10% difficulty-five chance
      0.96, // still uses the 97% fallback hint chance
      0.2,  // recognizes the answer among the three hint options
      0.5,  // hint decision time
      0.5,  // base response time
      0.5,  // final response-time variation
    ];
    const performance = simulateCapitalizationAiPerformance(
      {
        participant: {
          id: 'ai-hinter',
          name: 'AI Hinter',
          isHuman: false,
          precomputedScore: 55,
        },
        question: {
          ...oceaniaCountry,
          continent: 'Oceania',
          questionNumber: 1,
        },
      },
      () => rolls.shift() ?? 0.5,
    );

    expect(performance).toMatchObject({
      guessed: true,
      attempts: 1,
      hintUsed: true,
    });
    expect(computeCapitalizationQuestionScore(performance)).toBeGreaterThan(0);
  });

  it('does not make the three-option hint an automatic correct answer', () => {
    const oceaniaCountry = CAPITALIZATION_COUNTRIES_BY_CONTINENT.Oceania
      .find((country) => country.difficulty === 5);
    if (!oceaniaCountry) throw new Error('Very hard Oceania fixture missing');

    const rolls = [0.99, 0.1, 0.99, 0.5, 0.5, 0.5];
    const performance = simulateCapitalizationAiPerformance(
      {
        participant: {
          id: 'ai-misses-hint',
          name: 'AI Misses Hint',
          isHuman: false,
          precomputedScore: 55,
        },
        question: {
          ...oceaniaCountry,
          continent: 'Oceania',
          questionNumber: 1,
        },
      },
      () => rolls.shift() ?? 0.5,
    );

    expect(performance).toMatchObject({
      guessed: false,
      attempts: 1,
      skipped: false,
      hintUsed: true,
    });
    expect(computeCapitalizationQuestionScore(performance)).toBe(0);
  });

  it('eliminates roughly thirty percent of the lowest-scoring active players, including the human', () => {
    const participants = [
      { id: 'human', name: 'You', isHuman: true, precomputedScore: 0 },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `ai-${index}`,
        name: `AI ${index}`,
        isHuman: false,
        precomputedScore: 50,
      })),
    ];
    const standings = createCapitalizationStandings(participants).map((standing) => ({
      ...standing,
      cumulativeScore: standing.isHuman ? -1 : Number(standing.participantId.replace('ai-', '')),
    }));

    const result = eliminateCapitalizationField(standings, 3);
    const ranked = rankCapitalizationStandings(result.standings);

    expect(result.eliminatedIds).toHaveLength(4);
    expect(result.eliminatedIds).toEqual(['human', 'ai-0', 'ai-1', 'ai-2']);
    expect(result.eliminatedIds).toContain('human');
    expect(ranked[ranked.length - 1].eliminatedAfterQuestion).toBe(3);
  });
});

describe('Capitalization registry wiring', () => {
  it('registers the game as an active React trivia minigame', () => {
    const entry = getGame('capitalization');

    expect(entry).toBeDefined();
    expect(entry?.retired).toBe(false);
    expect(entry?.implementation).toBe('react');
    expect(entry?.category).toBe('trivia');
    expect(entry?.reactComponentKey).toBe('Capitalization');
  });

  it('is present in the generic React component and AI registries', () => {
    expect(reactComponents.Capitalization).toBeDefined();
    expect(minigameAiRegistry.capitalization).toMatchObject({
      key: 'capitalization',
      category: 'mental',
      scoreDirection: 'higher-is-better',
    });
  });

  it('keeps Oceania as the Australia/New Zealand/Oceania bucket', () => {
    expect(CAPITALIZATION_CONTINENTS).toContain('Oceania');
    expect(CAPITALIZATION_COUNTRIES_BY_CONTINENT.Oceania.map((country) => country.name))
      .toEqual(expect.arrayContaining(['Australia', 'New Zealand']));
  });
});
