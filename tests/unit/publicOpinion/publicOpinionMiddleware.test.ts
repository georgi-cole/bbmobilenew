import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import type { Player } from '../../../src/types';
import publicOpinionReducer, {
  initializeProfiles,
  addDirection,
} from '../../../src/publicOpinion/publicOpinionSlice';
import { publicOpinionMiddleware } from '../../../src/publicOpinion/publicOpinionMiddleware';
import type { PublicDirection } from '../../../src/publicOpinion/types';

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

function makeDirection(overrides: Partial<PublicDirection> = {}): PublicDirection {
  return {
    id: 'dir-1',
    type: 'win_competition',
    playerId: 'p1',
    description: 'Aria, win the next competition!',
    status: 'active',
    createdWeek: 1,
    expiresAtWeek: 2,
    approvalDelta: 5,
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

  it('prunes directions using the upcoming cycle week at week_end', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({ week: 1 }),
      },
    });

    store.dispatch(initializeProfiles(['p1', 'p2']));
    store.dispatch(addDirection(makeDirection({ expiresAtWeek: 2 })));

    store.dispatch({
      type: 'game/forcePhase',
      payload: {
        phase: 'week_end',
      },
    });

    const expiredDirection = store.getState().publicOpinion.directions.find((direction) => direction.id === 'dir-1');
    expect(expiredDirection?.status).toBe('expired');
  });
});
