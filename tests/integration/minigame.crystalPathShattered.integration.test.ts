import { describe, expect, it } from 'vitest';
import { getMinigameAiModel } from '../../src/ai/competition';
import { getGame } from '../../src/minigames/registry';
import reactComponents from '../../src/minigames/reactComponents';

describe('Crystal Path: Infinity registry wiring', () => {
  it('registers Crystal Path: Infinity as an authoritative React minigame', () => {
    const entry = getGame('crystal_path_shattered');
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('Crystal Path: Infinity');
    expect(entry?.implementation).toBe('react');
    expect(entry?.reactComponentKey).toBe('CrystalPathShattered');
    expect(entry?.authoritative).toBe(true);
    expect(entry?.scoringAdapter).toBe('authoritative');
    expect(entry?.retired).toBe(false);
    expect(entry?.instructions.join(' ')).toMatch(/uninterrupted run/i);
    expect(entry?.instructions.join(' ')).not.toMatch(/300 SP|-10|-15|-20|5-second/i);
  });

  it('keeps Crystal Path: Infinity out of the generic react component map and preserves AI metadata', () => {
    expect(reactComponents.CrystalPathShattered).toBeUndefined();
    expect(getMinigameAiModel('crystal_path_shattered')).toMatchObject({
      key: 'crystal_path_shattered',
      category: 'endurance',
      scoreDirection: 'higher-is-better',
    });
  });
});
