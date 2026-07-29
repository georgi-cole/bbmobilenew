import { describe, expect, it } from 'vitest';
import { isPublicModeEnabled, isSocialModeEnabled } from '../gameModes';

describe('game mode config', () => {
  it('keeps Reality social simulation active without public mode in Survival', () => {
    expect(isPublicModeEnabled('survival')).toBe(false);
    expect(isSocialModeEnabled('survival')).toBe(true);
  });

  it('keeps public and social modes enabled in Classic', () => {
    expect(isPublicModeEnabled('classic')).toBe(true);
    expect(isSocialModeEnabled('classic')).toBe(true);
  });
});
