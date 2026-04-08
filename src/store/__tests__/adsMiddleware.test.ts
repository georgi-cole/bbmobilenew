import { describe, expect, it, vi } from 'vitest';
import { adsMiddleware } from '../adsMiddleware';
import { recordLastCompLastPlace } from '../adsSlice';

// Minimal store state helpers
function makeState(phase: string, humanId: string) {
  return {
    game: {
      phase,
      players: [{ id: humanId, isUser: true }],
    },
  };
}

function runMiddleware(
  action: unknown,
  phase: string,
  humanId: string,
) {
  const dispatched: unknown[] = [];
  const api = {
    getState: () => makeState(phase, humanId),
    dispatch: (a: unknown) => { dispatched.push(a); },
  };
  const next = vi.fn();
  // @ts-expect-error — simplified middleware invocation for testing
  adsMiddleware(api)(next)(action);
  return { dispatched, next };
}

describe('adsMiddleware — completeMinigame last-place detection', () => {
  it('records loh last place when human is lastPlaceId in loh_comp', () => {
    const action = {
      type: 'game/completeMinigame',
      payload: { humanScore: 10, lastPlaceId: 'player-1' },
    };
    const { dispatched } = runMiddleware(action, 'loh_comp', 'player-1');
    expect(dispatched).toContainEqual(recordLastCompLastPlace('loh'));
  });

  it('does not record loh last place when human is not lastPlaceId in loh_comp', () => {
    const action = {
      type: 'game/completeMinigame',
      payload: { humanScore: 90, lastPlaceId: 'player-2' },
    };
    const { dispatched } = runMiddleware(action, 'loh_comp', 'player-1');
    expect(dispatched).not.toContainEqual(recordLastCompLastPlace('loh'));
  });

  it('records pos last place when human is lastPlaceId in pos_comp', () => {
    const action = {
      type: 'game/completeMinigame',
      payload: { humanScore: 5, lastPlaceId: 'player-1' },
    };
    const { dispatched } = runMiddleware(action, 'pos_comp', 'player-1');
    expect(dispatched).toContainEqual(recordLastCompLastPlace('pos'));
  });

  it('does not record pos last place when human is not lastPlaceId in pos_comp', () => {
    const action = {
      type: 'game/completeMinigame',
      payload: { humanScore: 80, lastPlaceId: 'player-2' },
    };
    const { dispatched } = runMiddleware(action, 'pos_comp', 'player-1');
    expect(dispatched).not.toContainEqual(recordLastCompLastPlace('pos'));
  });
});

describe('adsMiddleware — applyMinigameWinner last-place detection', () => {
  it('records loh last place when explicit lastPlaceId matches human (no participants)', () => {
    const action = {
      type: 'game/applyMinigameWinner',
      payload: { winnerId: 'player-2', lastPlaceId: 'player-1' },
    };
    const { dispatched } = runMiddleware(action, 'loh_comp', 'player-1');
    expect(dispatched).toContainEqual(recordLastCompLastPlace('loh'));
  });

  it('records pos last place when explicit lastPlaceId matches human (no participants)', () => {
    const action = {
      type: 'game/applyMinigameWinner',
      payload: { winnerId: 'player-2', lastPlaceId: 'player-1' },
    };
    const { dispatched } = runMiddleware(action, 'pos_comp', 'player-1');
    expect(dispatched).toContainEqual(recordLastCompLastPlace('pos'));
  });

  it('does not record last place when explicit lastPlaceId does not match human', () => {
    const action = {
      type: 'game/applyMinigameWinner',
      payload: { winnerId: 'player-1', lastPlaceId: 'player-2' },
    };
    const { dispatched } = runMiddleware(action, 'pos_comp', 'player-1');
    expect(dispatched).not.toContainEqual(recordLastCompLastPlace('pos'));
    expect(dispatched).not.toContainEqual(recordLastCompLastPlace('loh'));
  });

  it('validates lastPlaceId against participants when participants are provided', () => {
    // Human is lastPlaceId and is in participants — should record
    const action = {
      type: 'game/applyMinigameWinner',
      payload: {
        winnerId: 'player-2',
        lastPlaceId: 'player-1',
        participants: ['player-1', 'player-2'],
      },
    };
    const { dispatched } = runMiddleware(action, 'pos_comp', 'player-1');
    expect(dispatched).toContainEqual(recordLastCompLastPlace('pos'));
  });

  it('falls back to score derivation when no lastPlaceId but scores are provided', () => {
    const action = {
      type: 'game/applyMinigameWinner',
      payload: {
        winnerId: 'player-2',
        participants: ['player-1', 'player-2'],
        scores: { 'player-1': 10, 'player-2': 90 },
      },
    };
    const { dispatched } = runMiddleware(action, 'loh_comp', 'player-1');
    expect(dispatched).toContainEqual(recordLastCompLastPlace('loh'));
  });

  it('does not record last place when no lastPlaceId and no scores are provided', () => {
    const action = {
      type: 'game/applyMinigameWinner',
      payload: { winnerId: 'player-2' },
    };
    const { dispatched } = runMiddleware(action, 'pos_comp', 'player-1');
    expect(dispatched).not.toContainEqual(recordLastCompLastPlace('pos'));
  });
});
