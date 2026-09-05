import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import publicOpinionReducer, {
  initializeProfiles,
  updateApproval,
  addDirection,
  resolveDirection,
  pruneExpiredDirections,
} from '../../../src/publicOpinion/publicOpinionSlice';
import { publicOpinionConfig } from '../../../src/publicOpinion/publicOpinionConfig';
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
    approvalDelta: publicOpinionConfig.directionRewards.success,
    ...overrides,
  };
}

describe('publicOpinionSlice', () => {
  it('initializeProfiles sets approval to DEFAULT_APPROVAL for all players', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3']));
    const { profiles } = store.getState().publicOpinion;
    expect(profiles['p1'].approval).toBe(publicOpinionConfig.DEFAULT_APPROVAL);
    expect(profiles['p2'].approval).toBe(publicOpinionConfig.DEFAULT_APPROVAL);
    expect(profiles['p3'].approval).toBe(publicOpinionConfig.DEFAULT_APPROVAL);
  });

  it('initializeProfiles does not overwrite existing profiles', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(updateApproval({ playerId: 'p1', delta: 10, reason: 'test', week: 1 }));
    store.dispatch(initializeProfiles(['p1', 'p2']));
    const { profiles } = store.getState().publicOpinion;
    expect(profiles['p1'].approval).toBe(publicOpinionConfig.DEFAULT_APPROVAL + 10); // not reset
    expect(profiles['p2'].approval).toBe(publicOpinionConfig.DEFAULT_APPROVAL);
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
    store.dispatch(updateApproval({ playerId: 'p1', delta: 5, reason: 'Won LOH', week: 1 }));
    const { feed } = store.getState().publicOpinion;
    expect(feed.length).toBe(1);
    expect(feed[0].text.length).toBeGreaterThan(0);
    expect(feed[0].text).not.toContain('LOH');
    expect(feed[0].delta).toBe(5);
    expect(feed[0].reason).toBe('Won LOH');
  });

  it('updateApproval with addToFeed:false updates approval silently without a feed entry', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(updateApproval({ playerId: 'p1', delta: 5, reason: 'drift', week: 1, addToFeed: false }));
    const { profiles, feed } = store.getState().publicOpinion;
    expect(profiles['p1'].approval).toBe(publicOpinionConfig.DEFAULT_APPROVAL + 5);
    expect(feed.length).toBe(0);
  });

  it('turns competition outcomes into Game rating changes and recomputes the overall average', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(updateApproval({ playerId: 'p1', delta: 3, reason: 'hoh_win', week: 1 }));

    const profile = store.getState().publicOpinion.profiles['p1'];
    expect(profile.audienceBreakdown?.gameplay).toBe(59);
    expect(profile.audienceBreakdown?.charisma).toBe(50);
    expect(profile.audienceBreakdown?.integrity).toBe(50);
    expect(profile.approval).toBe(53);
    expect(profile.audienceBreakdown?.recentChanges[0]).toMatchObject({
      metric: 'gameplay',
      delta: 3,
      reason: 'hoh_win',
    });
  });

  it('makes integrity carry the largest share of a promise-break reaction', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(updateApproval({ playerId: 'p1', delta: -2, reason: 'vote_promise_broken', week: 2 }));

    const breakdown = store.getState().publicOpinion.profiles['p1'].audienceBreakdown!;
    expect(breakdown.integrity).toBeLessThan(breakdown.charisma);
    expect(breakdown.integrity).toBeLessThan(breakdown.gameplay);
    expect(breakdown.recentChanges[0].metric).toBe('integrity');
  });
  it('addDirection adds to directions array', () => {
    const store = makeStore();
    store.dispatch(addDirection(makeDirection()));
    const { directions } = store.getState().publicOpinion;
    expect(directions).toHaveLength(1);
    expect(directions[0].id).toBe('dir-1');
  });

  it('resolveDirection updates status to completed, increments count, and applies approval delta', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(addDirection(makeDirection()));
    store.dispatch(resolveDirection({ directionId: 'dir-1', status: 'completed', week: 2 }));
    const { directions, profiles } = store.getState().publicOpinion;
    expect(directions[0].status).toBe('completed');
    expect(directions[0].completedWeek).toBe(2);
    expect(profiles['p1'].completedDirectionCount).toBe(1);
    // completed applies success reward
    expect(profiles['p1'].approval).toBe(
      publicOpinionConfig.DEFAULT_APPROVAL + publicOpinionConfig.directionRewards.success,
    );
  });

  it('resolveDirection updates status to failed and applies fail penalty', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(addDirection(makeDirection()));
    store.dispatch(resolveDirection({ directionId: 'dir-1', status: 'failed', week: 2 }));
    const { directions, profiles } = store.getState().publicOpinion;
    expect(directions[0].status).toBe('failed');
    // failed applies fail penalty
    expect(profiles['p1'].approval).toBe(
      publicOpinionConfig.DEFAULT_APPROVAL + publicOpinionConfig.directionRewards.fail,
    );
  });

  it('resolveDirection expired does not apply approval delta', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['p1']));
    store.dispatch(addDirection(makeDirection()));
    store.dispatch(resolveDirection({ directionId: 'dir-1', status: 'expired', week: 3 }));
    const { profiles } = store.getState().publicOpinion;
    expect(profiles['p1'].approval).toBe(publicOpinionConfig.DEFAULT_APPROVAL);
  });

  it('pruneExpiredDirections marks active directions whose expiresAtWeek <= week as expired', () => {
    const store = makeStore();
    store.dispatch(addDirection(makeDirection({ id: 'dir-1', expiresAtWeek: 3 })));
    store.dispatch(addDirection(makeDirection({ id: 'dir-2', expiresAtWeek: 5 })));
    store.dispatch(pruneExpiredDirections({ week: 3 }));
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
