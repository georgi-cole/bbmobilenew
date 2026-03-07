/**
 * Unit tests for the Famous Figures hint ladder.
 *
 * Hint mapping (0-based index):
 *   0 → dataset hints[0]
 *   1 → dataset hints[1]
 *   2 → generated "First name starts with 'X'" (or mononym variant)
 *   3 → generated "Last name starts with 'Y'" (or mononym fallback)
 *   4 → generated "First name: <FirstName>. Last name starts with '<Initial>'."
 *        Reveals the full first name and last-name initial; for mononyms
 *        reveals the full single name.
 */
import { describe, it, expect } from 'vitest';
import { getHintText } from '../../../src/games/famous-figures/hints';
import type { FigureRow } from '../../../src/games/famous-figures/model';

// ─── Helper: minimal FigureRow factory ───────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getHintText — standard two-part name', () => {
  const figure = makeFigure({ canonicalName: 'Albert Einstein' });

  it('hint 0 returns dataset hints[0]', () => {
    expect(getHintText(figure, 0)).toBe('Dataset hint one');
  });

  it('hint 1 returns dataset hints[1]', () => {
    expect(getHintText(figure, 1)).toBe('Dataset hint two');
  });

  it('hint 2 contains first name initial', () => {
    const text = getHintText(figure, 2);
    expect(text).toContain("'A'");
    expect(text.toLowerCase()).toContain('first name');
  });

  it('hint 3 contains last name initial', () => {
    const text = getHintText(figure, 3);
    expect(text).toContain("'E'");
    expect(text.toLowerCase()).toContain('last name');
  });

  it('hint 4 reveals full first name and last-name initial', () => {
    const text = getHintText(figure, 4);
    // Must reveal the full first name
    expect(text).toContain('Albert');
    // Must reveal the last-name initial
    expect(text).toContain("'E'");
    // Must use the required format
    expect(text).toMatch(/^First name:/i);
    expect(text).toContain("Last name starts with");
    // Must NOT be the "Either X or Y" decoy format
    expect(text).not.toMatch(/^Either/i);
  });
});

describe('getHintText — mononym (single name)', () => {
  const figure = makeFigure({ canonicalName: 'Cleopatra' });

  it('hint 2 mentions the single initial without "First name"', () => {
    const text = getHintText(figure, 2);
    expect(text).toContain("'C'");
    // Should NOT say "First name" for mononyms
    expect(text.toLowerCase()).not.toContain('first name');
  });

  it('hint 3 returns a letter-count fallback for mononyms', () => {
    const text = getHintText(figure, 3);
    expect(text).toContain('9'); // "Cleopatra" has 9 letters
  });

  it('hint 4 reveals the full single name for mononyms', () => {
    const text = getHintText(figure, 4);
    expect(text).toContain('Cleopatra');
    // Must NOT be the "Either X or Y" decoy format
    expect(text).not.toMatch(/^Either/i);
  });
});

describe('getHintText — regnal / multi-word last name', () => {
  const figure = makeFigure({ canonicalName: 'Napoleon Bonaparte' });

  it('hint 2 shows N for Napoleon', () => {
    const text = getHintText(figure, 2);
    expect(text).toContain("'N'");
  });

  it('hint 3 shows B for Bonaparte', () => {
    const text = getHintText(figure, 3);
    expect(text).toContain("'B'");
  });

  it('hint 4 reveals full first name and last-name initial', () => {
    const text = getHintText(figure, 4);
    expect(text).toContain('Napoleon');
    expect(text).toContain("'B'");
    expect(text).toMatch(/^First name:/i);
    expect(text).not.toMatch(/^Either/i);
  });
});

describe('getHintText — dataset hints use custom content', () => {
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

  it('hint 0 returns the custom dataset hints[0]', () => {
    expect(getHintText(figure, 0)).toBe('Custom content hint 1');
  });

  it('hint 1 returns the custom dataset hints[1]', () => {
    expect(getHintText(figure, 1)).toBe('Custom content hint 2');
  });

  it('hint 2 is generated (not from dataset)', () => {
    const text = getHintText(figure, 2);
    expect(text).not.toBe('Custom content hint 3');
    expect(text).toContain("'M'");
  });

  it('hint 4 reveals full first name "Marie" and last-name initial "C"', () => {
    const text = getHintText(figure, 4);
    expect(text).toContain('Marie');
    expect(text).toContain("'C'");
    expect(text).toMatch(/^First name:/i);
  });
});

describe('getHintText — suffix stripping', () => {
  it('ignores trailing "Jr" when choosing last name initial', () => {
    const figure = makeFigure({ canonicalName: 'Martin Luther King Jr' });
    // hint 3 should be "K" for King, not "J" for Jr
    expect(getHintText(figure, 3)).toContain("'K'");
  });

  it('ignores trailing "Sr" when choosing last name initial', () => {
    const figure = makeFigure({ canonicalName: 'Robert Downey Sr' });
    expect(getHintText(figure, 3)).toContain("'D'");
  });

  it('ignores trailing Roman numeral suffix (III) when choosing last name', () => {
    const figure = makeFigure({ canonicalName: 'Henry Ford III' });
    expect(getHintText(figure, 3)).toContain("'F'");
  });

  it('hint 4 reveals full first name and respects suffix stripping (last initial from King, not Jr)', () => {
    const figure = makeFigure({ canonicalName: 'Martin Luther King Jr' });
    const text = getHintText(figure, 4);
    expect(text).toContain('Martin');
    expect(text).toContain("'K'");
    expect(text).toMatch(/^First name:/i);
    expect(text).not.toMatch(/^Either/i);
  });
});

describe('getHintText — out-of-range index', () => {
  const figure = makeFigure({ canonicalName: 'Albert Einstein' });

  it('throws RangeError for index 5', () => {
    expect(() => getHintText(figure, 5)).toThrow(RangeError);
  });

  it('throws RangeError for negative index', () => {
    expect(() => getHintText(figure, -1)).toThrow(RangeError);
  });
});
