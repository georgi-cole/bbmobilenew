import { describe, expect, it } from 'vitest';
import { FAMOUS_FIGURES } from '../../../src/features/famousFigures/famousFiguresSlice';
import { normalizeForMatching } from '../../../src/games/famous-figures/fuzzy';

describe('Famous Figures replacement data bank', () => {
  it('contains the 200 popular figure replacement entries', () => {
    expect(FAMOUS_FIGURES).toHaveLength(200);
    expect(FAMOUS_FIGURES[0].canonicalName).toBe('Mickey Mouse');
    expect(FAMOUS_FIGURES.at(-1)?.canonicalName).toBe('Cristiano Ronaldo');
    expect(FAMOUS_FIGURES.some((figure) => figure.canonicalName === 'Leonardo da Vinci')).toBe(false);
  });

  it('keeps matching fields in sync with the game normalizer', () => {
    for (const figure of FAMOUS_FIGURES) {
      expect(figure.normalizedName).toBe(normalizeForMatching(figure.canonicalName));
      expect(figure.normalizedAliases).toEqual(figure.acceptedAliases.map(normalizeForMatching));
      expect(figure.hints).toHaveLength(5);
    }
  });
});
