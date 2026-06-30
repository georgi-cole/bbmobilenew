import { describe, expect, it } from 'vitest';
import { FAMOUS_FIGURES } from '../../../src/features/famousFigures/famousFiguresSlice';
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

  it('preserves easy, medium, and hard difficulty bands for AI balancing', () => {
    expect(FAMOUS_FIGURES.some((figure) => figure.difficulty === 'easy')).toBe(true);
    expect(FAMOUS_FIGURES.some((figure) => figure.difficulty === 'medium')).toBe(true);
    expect(FAMOUS_FIGURES.some((figure) => figure.difficulty === 'hard')).toBe(true);
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
