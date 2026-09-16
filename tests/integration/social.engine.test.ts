// Integration tests for the Social Engine phase lifecycle.
//
// Validates:
//  1. Dispatching setPhase('social_1') populates state.social.energyBank via
//     socialMiddleware → SocialEngine.startPhase → social/engineReady.
//  2. Dispatching setPhase to a non-social phase afterwards triggers endPhase,
//     dispatching social/setLastReport and populating state.social.lastReport.
//  3. The advance action also triggers start/end correctly.
//  4. Normal mode carries unused energy into the calibrated +5 social_1 refill.

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../src/store/gameSlice';
import socialReducer, { setEnergyBankEntry } from '../../src/social/socialSlice';
import { relationshipResourcePolicyMiddleware } from '../../src/social/relationshipResourcePolicyMiddleware';
import { socialMiddleware } from '../../src/social/socialMiddleware';
import { SocialEngine } from '../../src/social/SocialEngine';

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(relationshipResourcePolicyMiddleware, socialMiddleware),
  });
}

describe('SocialEngine – phase lifecycle via middleware', () => {
  it('populates state.social.energyBank when entering social_1', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));

    const { energyBank } = store.getState().social;
    expect(Object.keys(energyBank).length).toBeGreaterThan(0);
    for (const value of Object.values(energyBank)) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it('carries unused normal-mode human energy and adds the calibrated 5-point batch', () => {
    const store = makeStore();
    SocialEngine.init(store);

    const human = store.getState().game.players.find((player) => player.isUser);
    expect(human).toBeDefined();
    store.dispatch(setEnergyBankEntry({ playerId: human!.id, value: 7 }));

    store.dispatch(setPhase('social_1'));

    // 7 retained + 5 new = 12. The calibrated cap limits future accumulation
    // without ever destructively shrinking a legitimately larger carried bank.
    expect(store.getState().social.energyBank[human!.id]).toBe(12);
  });

  it('populates state.social.energyBank when entering social_2', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_2'));

    const { energyBank } = store.getState().social;
    expect(Object.keys(energyBank).length).toBeGreaterThan(0);
  });

  it('populates state.social.lastReport when leaving a social phase', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));
    store.dispatch(setPhase('nominations'));

    const { lastReport } = store.getState().social;
    expect(lastReport).not.toBeNull();
    expect(lastReport?.week).toBeGreaterThanOrEqual(0);
    expect(typeof lastReport?.summary).toBe('string');
    expect(Array.isArray(lastReport?.players)).toBe(true);
    expect(lastReport?.id).toMatch(/^social_1_/);
  });

  it('energyBank in Redux is not cleared after ending a social phase (reflects last start)', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));
    const budgetsAfterStart = { ...store.getState().social.energyBank };

    store.dispatch(setPhase('nominations'));

    expect(Object.keys(store.getState().social.energyBank).sort()).toEqual(
      Object.keys(budgetsAfterStart).sort(),
    );
    expect(Object.keys(SocialEngine.getBudgets())).toHaveLength(0);
  });

  it('does not trigger endPhase if no social phase was active', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('loh_comp'));
    store.dispatch(setPhase('loh_results'));

    expect(store.getState().social.lastReport).toBeNull();
  });

  it('getBudgets() reflects engine internal budgets after startPhase', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));

    const budgets = SocialEngine.getBudgets();
    const { energyBank } = store.getState().social;
    expect(Object.keys(budgets).sort()).toEqual(Object.keys(energyBank).sort());
  });

  it('isPhaseActive() returns true while in a social phase', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));
    expect(SocialEngine.isPhaseActive()).toBe(true);

    store.dispatch(setPhase('nominations'));
    expect(SocialEngine.isPhaseActive()).toBe(false);
  });

  it('getLastReport() mirrors state.social.lastReport', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_2'));
    store.dispatch(setPhase('live_vote'));

    const report = SocialEngine.getLastReport();
    expect(report).not.toBeNull();
    expect(report?.id).toMatch(/^social_2_/);
    expect(report).toEqual(store.getState().social.lastReport);
  });

  it('direct social_1 → social_2 transition ends social_1 and starts social_2', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));
    expect(SocialEngine.isPhaseActive()).toBe(true);
    expect(store.getState().social.lastReport).toBeNull();

    store.dispatch(setPhase('social_2'));

    expect(store.getState().social.lastReport).not.toBeNull();
    expect(store.getState().social.lastReport?.id).toMatch(/^social_1_/);
    expect(SocialEngine.isPhaseActive()).toBe(true);
    expect(Object.keys(SocialEngine.getBudgets()).length).toBeGreaterThan(0);
  });
});
