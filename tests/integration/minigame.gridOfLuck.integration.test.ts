import { describe, expect, it } from 'vitest';
import { getGame } from '../../src/minigames/registry';
import reactComponents from '../../src/minigames/reactComponents';

describe('Grid of Luck registry wiring', () => {
  it('registers Grid of Luck as a React authoritative minigame', () => {
    const entry = getGame('gridOfLuck');
    expect(entry).toBeDefined();
    expect(entry?.implementation).toBe('react');
    expect(entry?.reactComponentKey).toBe('GridOfLuck');
    expect(entry?.authoritative).toBe(true);
    expect(entry?.scoringAdapter).toBe('authoritative');
    expect(entry?.instructions.length).toBeGreaterThan(0);
  });

  it('maps the react component key to the Grid of Luck component', () => {
    expect(reactComponents.GridOfLuck).toBeTypeOf('function');
  });
});
