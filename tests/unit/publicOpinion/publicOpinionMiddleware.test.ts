import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import type { Player } from '../../../src/types';
import publicOpinionReducer, {
  initializeProfiles,
} from '../../../src/publicOpinion/publicOpinionSlice';
import { publicOpinionMiddleware } from '../../../src/publicOpinion/publicOpinionMiddleware';

interface TestGameState {
  phase: string;
  week: number;
  hohId: string | null;
  povWinnerId: string | null;
  nomineeIds: string[];
  players: Player[];
  seed: number;
}

function makePlayer(
  id: string,
  name: string,
  status: Player['status'] = 'active',
): Player {
  return {
    id,
    name,
    avatar: '🙂',
    status,
  };
}

function makeGameState(overrides: Partial<TestGameState> = {}): TestGameState {
  return {
    phase: 'eviction_results',
    week: 2,
    hohId: null,
    povWinnerId: null,
    nomineeIds: [],
    players: [makePlayer('p1', 'Aria'), makePlayer('p2', 'Kian')],
    seed: 42,
    ...overrides,
  };
}

function gameReducer(state: TestGameState = makeGameState(), action: { type: string; payload?: Partial<TestGameState> }) {
  if (action.type === 'game/forcePhase' || action.type === 'game/setPhase' || action.type === 'game/advance') {
    return {
      ...state,
      ...(action.payload ?? {}),
    };
  }
  return state;
}

describe('publicOpinionMiddleware', () => {
  it('keeps an evicted houseguest approval frozen at the last in-game value', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState(),
      },
    });

    store.dispatch(initializeProfiles(['p1', 'p2']));

    store.dispatch({
      type: 'game/forcePhase',
      payload: {
        phase: 'week_end',
        players: [makePlayer('p1', 'Aria', 'jury'), makePlayer('p2', 'Kian', 'active')],
      },
    });

    const state = store.getState();
    expect(state.publicOpinion.profiles.p1.approval).toBe(50);
  });

  it('generates public requests only for active houseguests', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({
          players: [makePlayer('p1', 'Aria', 'active'), makePlayer('p2', 'Kian', 'jury')],
        }),
      },
    });

    store.dispatch(initializeProfiles(['p1', 'p2']));

    store.dispatch({
      type: 'game/forcePhase',
      payload: {
        phase: 'week_end',
        players: [makePlayer('p1', 'Aria', 'active'), makePlayer('p2', 'Kian', 'jury')],
      },
    });

    const state = store.getState();
    expect(state.publicOpinion.directions.every((direction) => direction.playerId === 'p1')).toBe(true);
  });
});
