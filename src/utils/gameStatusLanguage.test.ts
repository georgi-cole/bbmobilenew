import { describe, expect, it } from 'vitest';
import { formatCycleAriaLabel, formatCycleLabel, formatPhaseLabel } from './gameStatusLanguage';

describe('game status language', () => {
  it('uses player-facing phase names instead of implementation keys', () => {
    expect(formatPhaseLabel('nominations')).toBe('Nominations');
    expect(formatPhaseLabel('pos_ceremony')).toBe('Safety ceremony');
    expect(formatPhaseLabel('eviction_results')).toBe('Elimination');
  });

  it('separates compact visible cycle text from its full accessible label', () => {
    expect(formatCycleLabel(2, 4)).toBe('S02D4');
    expect(formatCycleAriaLabel(2, 4)).toBe('Season 2, day 4');
  });
});
