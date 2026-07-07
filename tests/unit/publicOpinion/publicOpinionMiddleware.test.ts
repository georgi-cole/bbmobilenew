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
  lohId: string | null;
  posWinnerId: string | null;
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
    lohId: null,
    posWinnerId: null,
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

  it('dispatches mission progress for AI nominations on nomination_results', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({ phase: 'nomination_ceremony', week: 1, lohId: 'p1' }),
      },
    });

    store.dispatch(initializeProfiles(['p1', 'p2', 'p3']));
    store.dispatch(addDirection(makeDirection({
      id: 'target-dir',
      type: 'target_player',
      playerId: 'p1',
      relatedPlayerId: 'p2',
      status: 'active',
      progressPercent: 0,
    })));

    // Simulate advance() result: nomination_results phase, AI LOH (awaitingNominations=false),
    // nomineeIds already populated.
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'nomination_results',
        lohId: 'p1',
        nomineeIds: ['p2'],
        awaitingNominations: false,
        week: 1,
      },
    });

    const dir = store.getState().publicOpinion.directions.find((d) => d.id === 'target-dir');
    // Progress should have advanced
    expect((dir?.progressPercent ?? 0)).toBeGreaterThan(0);
  });

  it('dispatches mission progress for AI votes at eviction_results', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({ phase: 'live_vote', week: 1 }),
      },
    });

    store.dispatch(initializeProfiles(['p1', 'p2', 'p3']));
    store.dispatch(addDirection(makeDirection({
      id: 'vote-dir',
      type: 'target_player',
      playerId: 'p1',
      relatedPlayerId: 'p2',
      status: 'active',
      progressPercent: 0,
    })));

    // Simulate advance() to eviction_results with AI votes recorded
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'eviction_results',
        nomineeIds: ['p2', 'p3'],
        votes: { p1: 'p2' },  // p1 voted to evict p2 (the mission target)
        week: 1,
      },
    });

    const dir = store.getState().publicOpinion.directions.find((d) => d.id === 'vote-dir');
    expect((dir?.progressPercent ?? 0)).toBeGreaterThan(0);
  });

  it('background drift does not create feed entries', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        publicOpinion: publicOpinionReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(publicOpinionMiddleware),
      preloadedState: {
        game: makeGameState({ phase: 'week_end', week: 1 }),
      },
    });

    store.dispatch(initializeProfiles(['p1', 'p2', 'p3']));

    // Fire week_start transition (generates headlines for some players, drift for others)
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'week_start',
        week: 2,
        players: [
          makePlayer('p1', 'Aria'),
          makePlayer('p2', 'Kian'),
          makePlayer('p3', 'Rae'),
        ],
        seed: 42,
      },
    });

    const { feed } = store.getState().publicOpinion;
    // Only headline events should appear in the feed — drift is silent (addToFeed: false)
    for (const entry of feed) {
      expect(entry.isHeadline).toBe(true);
    }
    // Feed should only contain the 2-3 headline events, not 5 entries (one per player)
    expect(feed.length).toBeLessThanOrEqual(3);
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

