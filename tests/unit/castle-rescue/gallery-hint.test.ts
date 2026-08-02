import { describe, expect, it } from 'vitest';
import { chooseClassicTwinHintPortraits } from '../../../src/minigames/castleRescue/CastleRescueGame';

describe('Find Your Twin classic memory-wall hint', () => {
  it('always places Lia beside mirrored Lia labelled Ali', () => {
    const portraits = chooseClassicTwinHintPortraits([5, 0, 9, 3]);

    expect(portraits).toHaveLength(4);
    expect(portraits[0]).toEqual({
      name: 'LIA',
      file: 'Lia_avatar.webp',
      mirrored: false,
    });
    expect(portraits[1]).toEqual({
      name: 'ALI',
      file: 'Lia_avatar.webp',
      mirrored: true,
    });
  });

  it('uses two distinct non-Lia portraits from the seeded room selection', () => {
    const portraits = chooseClassicTwinHintPortraits([0, 8, 8, 12]);

    expect(portraits.slice(2).map((portrait) => portrait.name)).toEqual(['RAE', 'FINN']);
    expect(new Set(portraits.slice(2).map((portrait) => portrait.file)).size).toBe(2);
  });
});
