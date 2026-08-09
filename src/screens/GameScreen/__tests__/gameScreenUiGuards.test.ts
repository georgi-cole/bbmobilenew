import { describe, expect, it } from 'vitest';
import { shouldShowGameControlDock } from '../gameScreenUiGuards';

describe('shouldShowGameControlDock', () => {
  it('shows the dock on the main game screen when no blockers are active', () => {
    expect(shouldShowGameControlDock(true, [false, false, false])).toBe(true);
  });

  it('keeps the dock mounted on the main game screen even while flows are blocking', () => {
    expect(shouldShowGameControlDock(true, [false, true, false])).toBe(true);
  });

  it('hides the dock before gameplay starts', () => {
    expect(shouldShowGameControlDock(false, [false, false])).toBe(false);
  });

  it('keeps the dock visible for terminal survivor runs so the end modal can mount', () => {
    expect(shouldShowGameControlDock(false, [false, false], true)).toBe(true);
  });
});
