import { describe, expect, it } from 'vitest';
import { getMinigameAiModel } from '../../src/ai/competition';
import { getGame } from '../../src/minigames/registry';
import reactComponents from '../../src/minigames/reactComponents';

describe('Crystal Path: Shattered registry wiring', () => {
  it('registers Crystal Path: Shattered as an authoritative React minigame', () => {
    const entry = getGame('crystal_path_shattered');
    expect(entry).toBeDefined();
    expect(entry?.implementation).toBe('react');
    expect(entry?.reactComponentKey).toBe('CrystalPathShattered');
    expect(entry?.authoritative).toBe(true);
    expect(entry?.scoringAdapter).toBe('authoritative');
    expect(entry?.retired).toBe(false);
  });

  it('maps the react component key and AI metadata', () => {
    expect(reactComponents.CrystalPathShattered).toBeTypeOf('function');
    expect(getMinigameAiModel('crystal_path_shattered')).toMatchObject({
      key: 'crystal_path_shattered',
      category: 'endurance',
      scoreDirection: 'higher-is-better',
    });
  });
});
