import { describe, expect, it } from 'vitest';
import { chooseAiEvictionVote } from '../../src/store/gameSlice';
import type { GameState, Player } from '../../src/types';

function player(id: string): Player {
  return {
    id,
    name: id,
    isUser: false,
    status: 'active',
    stats: { lohWins: 0, posWins: 0, timesNominated: 1 },
  } as Player;
}

describe('relationship-aware AI eviction decisions', () => {
  it('normally protects an ally instead of voting randomly', () => {
    const state = {
      week: 4,
      lohId: 'loh',
      players: [player('voter'), player('ally'), player('other')],
      strategicRelationships: {
        voter: {
          ally: { affinity: 75, tags: ['alliance'] },
          other: { affinity: 0, tags: [] },
        },
      },
    } as GameState;

    const votesAgainstAlly = Array.from({ length: 100 }, (_, seed) =>
      chooseAiEvictionVote(state, 'voter', ['ally', 'other'], seed),
    ).filter((vote) => vote === 'ally').length;

    expect(votesAgainstAlly).toBeGreaterThan(0);
    expect(votesAgainstAlly).toBeLessThanOrEqual(22);
  });

  it('protects the stronger relationship when neither nominee is tagged as an ally', () => {
    const state = {
      week: 4,
      lohId: 'loh',
      players: [player('voter'), player('close'), player('distant')],
      strategicRelationships: {
        voter: {
          close: { affinity: 80, tags: [] },
          distant: { affinity: 5, tags: [] },
        },
      },
    } as GameState;

    expect(chooseAiEvictionVote(state, 'voter', ['close', 'distant'], 42)).toBe('distant');
  });
});
