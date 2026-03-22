import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import publicOpinionReducer, {
  initializeProfiles,
  updateApproval,
  addDirection,
  resolveDirection,
  pruneExpiredDirections,
} from '../../../src/publicOpinion/publicOpinionSlice';
import type { PublicDirection } from '../../../src/publicOpinion/types';

function makeStore() {
  return configureStore({
    reducer: { publicOpinion: publicOpinionReducer },
  });
}

function makeDirection(overrides: Partial<PublicDirection> = {}): PublicDirection {
  return {
    id: 'dir-1',
    type: 'win_competition',
    playerId: 'p1',
    description: 'Win the next competition!',
    status: 'active',
    createdWeek: 1,
    expiresAtWeek: 3,
    approvalDelta: 5,
    ...overrides,
  };
}

describe('publicOpinionSlice', () => {
  it('initializeProfiles sets approval to 50 for all players', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3']));
    const { profiles } = store.getState().publicOpinion;
    expect(profiles['p1'].approval).toBe(50);
    expect(profiles['p2'].approval).toBe(50);
    expect(profiles['p3'].approval).toBe(50);
  });

  it('initializeProfiles does not overwrite existing profiles', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(updateApproval({ playerId: 'p1', delta: 10, reason: 'test', week: 1 }));
    store.dispatch(initializeProfiles(['p1', 'p2']));
    const { profiles } = store.getState().publicOpinion;
    expect(profiles['p1'].approval).toBe(60); // not reset
    expect(profiles['p2'].approval).toBe(50);
  });

  it('updateApproval clamps to 0', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(updateApproval({ playerId: 'p1', delta: -100, reason: 'test', week: 1 }));
    expect(store.getState().publicOpinion.profiles['p1'].approval).toBe(0);
  });

  it('updateApproval clamps to 100', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(updateApproval({ playerId: 'p1', delta: 100, reason: 'test', week: 1 }));
    expect(store.getState().publicOpinion.profiles['p1'].approval).toBe(100);
  });

  it('updateApproval adds a feed entry', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(updateApproval({ playerId: 'p1', delta: 5, reason: 'Won HOH', week: 1 }));
    const { feed } = store.getState().publicOpinion;
    expect(feed.length).toBe(1);
    expect(feed[0].text).toBe('Won HOH');
    expect(feed[0].delta).toBe(5);
  });

  it('addDirection adds to directions array', () => {
    const store = makeStore();
    store.dispatch(addDirection(makeDirection()));
    const { directions } = store.getState().publicOpinion;
    expect(directions).toHaveLength(1);
    expect(directions[0].id).toBe('dir-1');
  });

  it('resolveDirection updates status to completed and increments count', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(addDirection(makeDirection()));
    store.dispatch(resolveDirection({ directionId: 'dir-1', status: 'completed', week: 2 }));
    const { directions, profiles } = store.getState().publicOpinion;
    expect(directions[0].status).toBe('completed');
    expect(directions[0].completedWeek).toBe(2);
    expect(profiles['p1'].completedDirectionCount).toBe(1);
  });

  it('resolveDirection updates status to failed', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(addDirection(makeDirection()));
    store.dispatch(resolveDirection({ directionId: 'dir-1', status: 'failed', week: 2 }));
    const { directions } = store.getState().publicOpinion;
    expect(directions[0].status).toBe('failed');
  });

  it('pruneExpiredDirections marks active directions whose expiresAtWeek < week as expired', () => {
    const store = makeStore();
    store.dispatch(addDirection(makeDirection({ id: 'dir-1', expiresAtWeek: 3 })));
    store.dispatch(addDirection(makeDirection({ id: 'dir-2', expiresAtWeek: 5 })));
    store.dispatch(pruneExpiredDirections({ week: 4 }));
    const { directions } = store.getState().publicOpinion;
    expect(directions.find((d) => d.id === 'dir-1')?.status).toBe('expired');
    expect(directions.find((d) => d.id === 'dir-2')?.status).toBe('active');
  });

  it('resets on game/resetGame', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(addDirection(makeDirection()));
    store.dispatch({ type: 'game/resetGame' });
    const state = store.getState().publicOpinion;
    expect(state.profiles).toEqual({});
    expect(state.directions).toHaveLength(0);
    expect(state.feed).toHaveLength(0);
  });
});
