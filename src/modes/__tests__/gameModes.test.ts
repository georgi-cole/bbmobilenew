import { describe, expect, it } from 'vitest';
import { isPublicModeEnabled, isSocialModeEnabled } from '../gameModes';

describe('game mode config', () => {
  it('disables public and social modes in Survivor', () => {
    expect(isPublicModeEnabled('survivor')).toBe(false);
    expect(isSocialModeEnabled('survivor')).toBe(false);
  });

  it('keeps public and social modes enabled in Classic', () => {
    expect(isPublicModeEnabled('classic')).toBe(true);
    expect(isSocialModeEnabled('classic')).toBe(true);
  });
});
