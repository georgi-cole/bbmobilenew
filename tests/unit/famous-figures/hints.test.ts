/**
 * Unit tests for the Famous Figures hint ladder.
 *
 * Runtime prefers all five curated dataset hints. Generated name clues are
 * retained only as a fallback for older or incomplete rows.
 */
import { describe, expect, it } from 'vitest';
import { getFinalNameHintText, getHintText } from '../../../src/games/famous-figures/hints';
import type { FigureRow } from '../../../src/games/famous-figures/model';

function makeFigure(overrides: Partial<FigureRow> & { canonicalName: string }): FigureRow {
  return {
    normalizedName: overrides.canonicalName.toLowerCase(),
    acceptedAliases: [],
    normalizedAliases: [],
    hints: [
      'Dataset hint one',
      'Dataset hint two',
      'Dataset hint three',
      'Dataset hint four',
      'Dataset hint five',
    ],
    baseClueFact: 'A famous figure.',
    difficulty: 'medium',
    category: 'test',
    era: 'Modern',
    ...overrides,
  };
}

describe('getHintText - curated dataset hints', () => {
  const figure = makeFigure({
    canonicalName: 'Marie Curie',
    hints: [
      'Custom content hint 1',
      'Custom content hint 2',
      'Custom content hint 3',
      'Custom content hint 4',
      'Custom content hint 5',
    ],
  });

  it('returns every custom dataset hint in order', () => {
    expect(getHintText(figure, 0)).toBe('Custom content hint 1');
    expect(getHintText(figure, 1)).toBe('Custom content hint 2');
    expect(getHintText(figure, 2)).toBe('Custom content hint 3');
    expect(getHintText(figure, 3)).toBe('Custom content hint 4');
    expect(getHintText(figure, 4)).toBe('Custom content hint 5');
  });
});

describe('getHintText - generated fallback for incomplete rows', () => {
  const makeLegacyFigure = (canonicalName: string) =>
    makeFigure({
      canonicalName,
      hints: ['Dataset hint one', 'Dataset hint two', '', '', ''],
    });

  it('falls back to generated initials for a two-part name', () => {
    const figure = makeLegacyFigure('Albert Einstein');

    expect(getHintText(figure, 0)).toBe('Dataset hint one');
    expect(getHintText(figure, 1)).toBe('Dataset hint two');
    expect(getHintText(figure, 2)).toContain("'A'");
    expect(getHintText(figure, 2).toLowerCase()).toContain('first name');
    expect(getHintText(figure, 3)).toContain("'E'");
    expect(getHintText(figure, 3).toLowerCase()).toContain('last name');

    const finalHint = getHintText(figure, 4);
    expect(finalHint).toContain('Albert');
    expect(finalHint).toContain("'E'");
    expect(finalHint).toMatch(/^First name:/i);
  });

  it('falls back to mononym initial, length, and name reveal', () => {
    const figure = makeLegacyFigure('Cleopatra');

    expect(getHintText(figure, 2)).toContain("'C'");
    expect(getHintText(figure, 2).toLowerCase()).not.toContain('first name');
    expect(getHintText(figure, 3)).toContain('9');
    expect(getHintText(figure, 4)).toBe('Name: Cleopatra');
  });

  it('ignores common suffixes when generating fallback last-name clues', () => {
    expect(getHintText(makeLegacyFigure('Martin Luther King Jr'), 3)).toContain("'K'");
    expect(getHintText(makeLegacyFigure('Robert Downey Sr'), 3)).toContain("'D'");
    expect(getHintText(makeLegacyFigure('Henry Ford III'), 3)).toContain("'F'");

    const finalHint = getHintText(makeLegacyFigure('Martin Luther King Jr'), 4);
    expect(finalHint).toContain('Martin');
    expect(finalHint).toContain("'K'");
    expect(finalHint).toMatch(/^First name:/i);
  });
});

describe('getHintText - out-of-range index', () => {
  const figure = makeFigure({ canonicalName: 'Albert Einstein' });

  it('throws RangeError for index 5', () => {
    expect(() => getHintText(figure, 5)).toThrow(RangeError);
  });

  it('throws RangeError for negative index', () => {
    expect(() => getHintText(figure, -1)).toThrow(RangeError);
  });
});

describe('getFinalNameHintText', () => {
  it('uses the first two letters of a first name', () => {
    expect(getFinalNameHintText(makeFigure({ canonicalName: 'Harry Styles' }))).toBe(
      "First name starts with 'Ha'",
    );
  });

  it('uses a mononym without calling it a first name', () => {
    expect(getFinalNameHintText(makeFigure({ canonicalName: 'Cher' }))).toBe(
      "Name starts with 'Ch'",
    );
  });
});

