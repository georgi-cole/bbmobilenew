import { describe, expect, it } from 'vitest';
import { getDayStartShockObjectPronoun } from './DayStartShockPopup';

describe('getDayStartShockObjectPronoun', () => {
  it('uses the canonical female pronoun for a known housemate', () => {
    expect(getDayStartShockObjectPronoun({ id: 'bea', name: 'Bea' })).toBe('her');
  });

  it('uses the canonical male pronoun for a known housemate', () => {
    expect(getDayStartShockObjectPronoun({ id: 'finn', name: 'Finn' })).toBe('him');
  });

  it('uses a neutral pronoun when no canonical profile exists', () => {
    expect(getDayStartShockObjectPronoun({ id: 'custom-player', name: 'Custom Player' })).toBe('them');
  });
});
