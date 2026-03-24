import { describe, it, expect } from 'vitest';
import reactComponents from '../src/minigames/reactComponents';
import { getGame } from '../src/minigames/registry';

describe('BullseyeBlitz reactComponents wiring', () => {
  it('registers targetPractice in the generic React component map', () => {
    const game = getGame('targetPractice');

    expect(game?.implementation).toBe('react');
    expect(game?.reactComponentKey).toBe('BullseyeBlitz');
    const mappedComponent = game?.reactComponentKey
      ? reactComponents[game.reactComponentKey]
      : undefined;
    expect(mappedComponent).toBeDefined();
  });
});
