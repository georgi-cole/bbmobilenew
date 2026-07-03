import { describe, expect, it } from 'vitest';
import { shouldShowGameControlDock } from '../gameScreenUiGuards';

describe('shouldShowGameControlDock', () => {
  it('shows the dock on the main game screen when no blockers are active', () => {
    expect(shouldShowGameControlDock(true, [false, false, false])).toBe(true);
  });

  it('hides the dock whenever a fullscreen blocker is active', () => {
    expect(shouldShowGameControlDock(true, [false, true, false])).toBe(false);
  });

  it('hides the dock before gameplay starts', () => {
    expect(shouldShowGameControlDock(false, [false, false])).toBe(false);
  });
});
