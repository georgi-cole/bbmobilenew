// Integration tests for the socialAIDriver multi-resource affordability fix.
//
// Validates:
//  1. canAfford correctly gates action selection in the driver.
//  2. When an AI player has energy but lacks influence/info for an action,
//     the driver skips that action (actionsExecuted stays 0).
//  3. When all resources are available the driver executes the action normally.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import socialReducer, {
  setEnergyBankEntry,
  setInfluenceBankEntry,
  setInfoBankEntry,
} from '../../src/social/socialSlice';
import { initManeuvers, canAfford } from '../../src/social/SocialManeuvers';
import { normalizeActionCosts } from '../../src/social/smExecNormalize';
import { getActionById } from '../../src/social/SocialManeuvers';
import { setStore, start, stop, getStatus } from '../../src/social/socialAIDriver';
import { socialConfig } from '../../src/social/socialConfig';
import * as SocialPolicy from '../../src/social/SocialPolicy';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { social: socialReducer } });
}

function makeFullStore() {
  // Include a minimal game slice so the driver can read players
  return configureStore({
    reducer: {
      social: socialReducer,
      game: (
        state: { players: Array<{ id: string; status: string; isUser?: boolean }>; seed: number; week: number } = {
          players: [
            { id: 'ai1', status: 'active', isUser: false },
            { id: 'p_human', status: 'active', isUser: true },
          ],
          seed: 42,
          week: 1,
        },
      ) => state,
    },
  });
}

// ── canAfford unit tests (driver-context) ──────────────────────────────────

describe('canAfford – multi-resource combinations', () => {
  it('returns true when all costs are 0 and no banks are set', () => {
    const store = makeStore();
    initManeuvers(store);
    expect(canAfford('ai1', { energy: 0, influence: 0, info: 0 })).toBe(true);
  });

  it('returns false when influence is required but bank is empty', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'ai1', value: 10 }));
    // influenceBank not set → 0
    expect(canAfford('ai1', { energy: 1, influence: 1, info: 0 })).toBe(false);
  });

  it('returns false when info is required but bank is empty', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'ai1', value: 10 }));
    // infoBank not set → 0
    expect(canAfford('ai1', { energy: 1, influence: 0, info: 1 })).toBe(false);
  });

  it('returns true after provisioning all three resources', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'ai1', value: 5 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'ai1', value: 2 }));
    store.dispatch(setInfoBankEntry({ playerId: 'ai1', value: 3 }));
    expect(canAfford('ai1', { energy: 5, influence: 2, info: 3 })).toBe(true);
  });
});

// ── AI driver skips unaffordable multi-resource actions ───────────────────

describe('socialAIDriver – canAfford gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('executes 0 actions when chosen action requires influence but player has none', () => {
    const store = makeFullStore();
    initManeuvers(store);
    setStore(store);

    // Give the AI player energy but no influence
    store.dispatch(setEnergyBankEntry({ playerId: 'ai1', value: 5 }));
    // influenceBank left empty (0)

    // Force the AI to always choose proposeAlliance ({ energy:3, influence:1 })
    vi.spyOn(SocialPolicy, 'chooseActionFor').mockReturnValue('proposeAlliance');

    start();
    vi.advanceTimersByTime(socialConfig.tickIntervalMs);

    expect(getStatus().actionsExecuted).toBe(0);
  });

  it('executes 0 actions when chosen action requires info but player has none', () => {
    const store = makeFullStore();
    initManeuvers(store);
    setStore(store);

    // Give the AI player energy but no info
    store.dispatch(setEnergyBankEntry({ playerId: 'ai1', value: 5 }));
    // infoBank left empty (0)

    // Force the AI to always choose whisper ({ energy:1, info:1 })
    vi.spyOn(SocialPolicy, 'chooseActionFor').mockReturnValue('whisper');

    start();
    vi.advanceTimersByTime(socialConfig.tickIntervalMs);

    expect(getStatus().actionsExecuted).toBe(0);
  });

  it('executes actions when all resources are available', () => {
    const store = makeFullStore();
    initManeuvers(store);
    setStore(store);

    // Give the AI player all resources needed for ally (energy=3, no influence/info required)
    store.dispatch(setEnergyBankEntry({ playerId: 'ai1', value: 5 }));

    // Force the AI to choose ally (plain energy cost only)
    vi.spyOn(SocialPolicy, 'chooseActionFor').mockReturnValue('ally');
    vi.spyOn(SocialPolicy, 'chooseTargetsFor').mockReturnValue(['p_human']);

    start();
    vi.advanceTimersByTime(socialConfig.tickIntervalMs);

    expect(getStatus().actionsExecuted).toBeGreaterThan(0);
  });
});

// ── normalizeActionCosts integration with canAfford ───────────────────────

describe('normalizeActionCosts + canAfford integration', () => {
  it('proposeAlliance is unaffordable without influence', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    const action = getActionById('proposeAlliance')!;
    const costs = normalizeActionCosts(action);
    expect(costs).toEqual({ energy: 3, influence: 1, info: 0 });
    expect(canAfford('p1', costs)).toBe(false);
  });

  it('proposeAlliance becomes affordable when influence is provisioned', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 1 }));

    const action = getActionById('proposeAlliance')!;
    const costs = normalizeActionCosts(action);
    expect(canAfford('p1', costs)).toBe(true);
  });

  it('rumor is unaffordable without info', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    const action = getActionById('rumor')!;
    const costs = normalizeActionCosts(action);
    expect(costs).toEqual({ energy: 2, influence: 0, info: 1 });
    expect(canAfford('p1', costs)).toBe(false);
  });
});
