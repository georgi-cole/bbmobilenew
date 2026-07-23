import { describe, expect, it } from 'vitest';
import gameReducer, {
  advance,
  chooseAiEvictionVote,
  setDramaSocialMode,
} from '../../src/store/gameSlice';
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

function userPlayer(id: string): Player {
  return { ...player(id), isUser: true };
}

describe('relationship-aware AI eviction decisions', () => {
  it('persists the Drama Mode gameplay switch', () => {
    const initial = gameReducer(undefined, { type: 'test/init' });
    expect(gameReducer(initial, setDramaSocialMode(true)).dramaSocialMode).toBe(true);
  });

  it('uses bonds, betrayals, rivalries, and suspicion for Drama Mode nominations', () => {
    const initial = gameReducer(undefined, { type: 'test/init' });
    const loh = { ...player('loh'), status: 'loh' as const };
    const candidates = [
      player('betrayer'),
      player('ally'),
      player('romance'),
      player('protected'),
      player('target'),
      player('suspicious'),
    ];
    const state = {
      ...initial,
      phase: 'nominations' as const,
      lohId: loh.id,
      players: [loh, ...candidates],
      nomineeIds: [],
      dramaSocialMode: true,
      strategicRelationships: {
        [loh.id]: {
          betrayer: { affinity: 10, tags: ['betrayal'] },
          ally: { affinity: 70, tags: ['alliance'] },
          romance: { affinity: 60, tags: ['romance'] },
          protected: { affinity: 40, tags: ['protection'] },
          target: { affinity: 0, tags: ['target', 'rivalry'] },
          suspicious: { affinity: 0, tags: ['suspicious', 'unreliable'] },
        },
      },
    };

    const result = gameReducer(state, advance());
    expect(result.nomineeIds).toContain('betrayer');
    expect(result.nomineeIds).toContain('target');
    expect(result.nomineeIds).not.toContain('ally');
  });

  it('does not treat the human as an automatic eviction threat', () => {
    const voters = Array.from({ length: 12 }, (_, index) => player(`voter-${index}`));
    const state = {
      week: 4,
      lohId: 'loh',
      players: [...voters, userPlayer('user'), player('ai')],
      strategicRelationships: {},
    } as GameState;

    const votes = voters.map((voter) =>
      chooseAiEvictionVote(state, voter.id, ['user', 'ai'], 42),
    );

    expect(new Set(votes)).toEqual(new Set(['user', 'ai']));
  });

  it('uses accomplishments rather than player type to identify a threat', () => {
    const provenThreat = player('proven-threat');
    provenThreat.stats = { lohWins: 2, posWins: 1, timesNominated: 1 };
    const state = {
      week: 4,
      lohId: 'loh',
      players: [player('voter'), userPlayer('user'), provenThreat],
      strategicRelationships: {},
    } as GameState;

    expect(chooseAiEvictionVote(state, 'voter', ['user', 'proven-threat'], 42))
      .toBe('proven-threat');
  });
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
