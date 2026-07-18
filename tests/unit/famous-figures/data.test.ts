import { describe, expect, it } from 'vitest';
import {
  FAMOUS_FIGURES,
  buildAiSubmissionsForRound,
  getFamousFiguresAiPlan,
} from '../../../src/features/famousFigures/famousFiguresSlice';
import { normalizeForMatching } from '../../../src/games/famous-figures/fuzzy';
import { getHintText } from '../../../src/games/famous-figures/hints';

describe('Famous Figures replacement data bank', () => {
  it('contains the 200 popular figure replacement entries', () => {
    expect(FAMOUS_FIGURES).toHaveLength(200);
    expect(FAMOUS_FIGURES[0].canonicalName).toBe('Mickey Mouse');
    expect(FAMOUS_FIGURES.at(-1)?.canonicalName).toBe('Cristiano Ronaldo');
    expect(FAMOUS_FIGURES.some((figure) => figure.category === 'fictional character')).toBe(true);
  });

  it('keeps matching fields in sync with the game normalizer', () => {
    for (const figure of FAMOUS_FIGURES) {
      expect(figure.normalizedName).toBe(normalizeForMatching(figure.canonicalName));
      expect(figure.normalizedAliases).toEqual(figure.acceptedAliases.map(normalizeForMatching));
      expect(figure.hints).toHaveLength(5);
    }
  });

  it('assigns every figure to one of five internal recognizability bands', () => {
    const allowed = new Set(['very_easy', 'easy', 'medium', 'hard', 'very_hard']);
    for (const figure of FAMOUS_FIGURES) {
      expect(allowed.has(figure.difficulty)).toBe(true);
    }
    for (const difficulty of allowed) {
      expect(FAMOUS_FIGURES.some((figure) => figure.difficulty === difficulty)).toBe(true);
    }
    expect(FAMOUS_FIGURES.find((figure) => figure.canonicalName === 'Charlie Chaplin')?.difficulty).toBe('very_easy');
  });

  it('makes recognizable figures more accurate and faster without eliminating late solves', () => {
    const charlieIndex = FAMOUS_FIGURES.findIndex((figure) => figure.canonicalName === 'Charlie Chaplin');
    const veryHardIndex = FAMOUS_FIGURES.findIndex((figure) => figure.difficulty === 'very_hard');
    const aiIds = Array.from({ length: 240 }, (_, index) => `realism-ai-${index}`);

    const charlieCorrect = aiIds.filter((id) =>
      buildAiSubmissionsForRound([id], charlieIndex, 0, () => 0.417)[id],
    ).length;
    const veryHardCorrect = aiIds.filter((id) =>
      buildAiSubmissionsForRound([id], veryHardIndex, 0, () => 0.417)[id],
    ).length;
    const easyPlans = aiIds.map((id) => getFamousFiguresAiPlan(91, 0, id, 'very_easy'));
    const hardPlans = aiIds.map((id) => getFamousFiguresAiPlan(91, 0, id, 'very_hard'));
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(charlieCorrect).toBeGreaterThan(veryHardCorrect + 80);
    expect(average(easyPlans.map((plan) => plan.clueNumber))).toBeLessThan(
      average(hardPlans.map((plan) => plan.clueNumber)),
    );
    expect(average(easyPlans.map((plan) => plan.delayMs))).toBeLessThan(
      average(hardPlans.map((plan) => plan.delayMs)),
    );
    expect([...easyPlans, ...hardPlans].every((plan) => plan.clueNumber >= 2)).toBe(true);
    expect([...easyPlans, ...hardPlans].every((plan) => plan.delayMs >= 1800)).toBe(true);
    expect(easyPlans.some((plan) => plan.clueNumber >= 4)).toBe(true);
    expect(hardPlans.some((plan) => plan.clueNumber <= 3)).toBe(true);
  });

  it('keeps obvious answers out of the opening clue and early hints', () => {
    const protectedEntries = ['Jerry Mouse', 'Zelda'];

    for (const name of protectedEntries) {
      const figure = FAMOUS_FIGURES.find((entry) => entry.canonicalName === name);
      expect(figure).toBeDefined();
      expect(`${figure?.baseClueFact} ${figure?.hints[0]} ${figure?.hints[1]}`.toLowerCase()).not.toContain(
        normalizeForMatching(name).split(' ')[0],
      );
    }
  });

  it('uses curated late hints instead of generated name reveals', () => {
    const jerry = FAMOUS_FIGURES.find((figure) => figure.canonicalName === 'Jerry Mouse');
    const zelda = FAMOUS_FIGURES.find((figure) => figure.canonicalName === 'Zelda');

    expect(jerry).toBeDefined();
    expect(zelda).toBeDefined();
    expect(jerry ? getHintText(jerry, 4) : '').toBe('Rival name: Tom.');
    expect(zelda ? getHintText(zelda, 4) : '').toBe('The franchise title includes her name.');
  });
});
