import { describe, expect, it } from 'vitest';
import { getGame } from '../../../src/minigames/registry';

describe('Find Your Twin rules stories', () => {
  it('introduces Benny and Lenny in the South Park story', () => {
    const game = getGame('castleRescue');

    expect(game?.title).toBe('Find Your Twin');
    expect(game?.description).toContain('Benny and Lenny');
    expect(game?.description).toContain('South Park');
    expect(game?.description).toContain('before time runs out');
  });

  it('frames Part 2 as their Romanian castle visit', () => {
    const game = getGame('castleRescue2');

    expect(game?.title).toBe('Find Your Twin 2: Lost Again');
    expect(game?.description).toContain('Romania');
    expect(game?.description).toContain('before the castle closes');
  });
});
