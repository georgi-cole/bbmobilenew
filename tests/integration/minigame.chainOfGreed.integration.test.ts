import { describe, expect, it } from 'vitest';
import { getMinigameAiModel } from '../../src/ai/competition';
import { getGame } from '../../src/minigames/registry';
import reactComponents from '../../src/minigames/reactComponents';

describe('Chain of Greed registry wiring', () => {
  it('registers Chain of Greed as an authoritative React minigame', () => {
    const entry = getGame('chainOfGreed');
    expect(entry).toBeDefined();
    expect(entry?.implementation).toBe('react');
    expect(entry?.reactComponentKey).toBe('ChainOfGreed');
    expect(entry?.authoritative).toBe(true);
    expect(entry?.scoringAdapter).toBe('authoritative');
    expect(entry?.retired).toBe(false);
  });

  it('maps the react component key and AI metadata', () => {
    expect(reactComponents.ChainOfGreed).toBeTypeOf('function');
    expect(getMinigameAiModel('chainOfGreed')).toMatchObject({
      key: 'chainOfGreed',
      category: 'mental',
    });
  });
});
