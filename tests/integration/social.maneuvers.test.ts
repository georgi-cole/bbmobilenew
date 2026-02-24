// Integration tests for the SocialManeuvers subsystem.
//
// Validates:
//  1. SOCIAL_ACTIONS contains expected entries with correct shape.
//  2. normalizeCost / normalizeActionCost handle numbers and object shapes.
//  3. SocialEnergyBank.get / set / add read/write Redux state.
//  4. getActionById returns correct definitions.
//  5. getAvailableActions filters by current energy.
//  6. executeAction deducts energy, updates relationships, records log.
//  7. executeAction returns failure when actor lacks energy (no state mutation).
//  8. executeAction returns failure for unknown action id.
//  9. Redux selectors selectEnergyBank and selectSessionLogs are correct.
// 10. updateRelationship reducer merges affinity and tags.

import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import socialReducer, {
  selectEnergyBank,
  selectInfluenceBank,
  selectInfoBank,
  selectSessionLogs,
  setEnergyBankEntry,
  setInfluenceBankEntry,
  setInfoBankEntry,
  applyEnergyDelta,
  applyInfluenceDelta,
  applyInfoDelta,
  recordSocialAction,
  updateRelationship,
} from '../../src/social/socialSlice';
import { SOCIAL_ACTIONS } from '../../src/social/socialActions';
import { normalizeCost, normalizeActionCost, normalizeActionCosts } from '../../src/social/smExecNormalize';
import {
  initEnergyBank,
  get as bankGet,
  set as bankSet,
  add as bankAdd,
} from '../../src/social/SocialEnergyBank';
import {
  initManeuvers,
  getActionById,
  getAvailableActions,
  canAfford,
  executeAction,
} from '../../src/social/SocialManeuvers';
import { socialConfig } from '../../src/social/socialConfig';
import type { SocialActionLogEntry } from '../../src/social/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { social: socialReducer } });
}

// ── socialActions ──────────────────────────────────────────────────────────

describe('SOCIAL_ACTIONS definitions', () => {
  it('contains at least 5 actions', () => {
    expect(SOCIAL_ACTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('each action has required fields', () => {
    for (const action of SOCIAL_ACTIONS) {
      expect(typeof action.id).toBe('string');
      expect(typeof action.title).toBe('string');
      expect(['friendly', 'strategic', 'aggressive', 'alliance']).toContain(action.category);
      expect(action.baseCost).toBeDefined();
    }
  });

  it('includes compliment, rumor, whisper, proposeAlliance, startFight', () => {
    const ids = SOCIAL_ACTIONS.map((a) => a.id);
    expect(ids).toContain('compliment');
    expect(ids).toContain('rumor');
    expect(ids).toContain('whisper');
    expect(ids).toContain('proposeAlliance');
    expect(ids).toContain('startFight');
  });

  it('compliment is friendly with cost 1', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'compliment')!;
    expect(action.category).toBe('friendly');
    expect(action.baseCost).toBe(1);
  });

  it('startFight has outcomeTag conflict', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'startFight')!;
    expect(action.outcomeTag).toBe('conflict');
  });
});

// ── smExecNormalize ────────────────────────────────────────────────────────

describe('normalizeCost', () => {
  it('returns a number as-is', () => {
    expect(normalizeCost(3)).toBe(3);
  });

  it('returns energy field from object', () => {
    expect(normalizeCost({ energy: 2, info: 1 })).toBe(2);
  });

  it('falls back to 1 when object has no energy field', () => {
    expect(normalizeCost({ info: 1 })).toBe(1);
  });

  it('returns 1 for undefined', () => {
    expect(normalizeCost(undefined)).toBe(1);
  });

  it('returns 1 for null', () => {
    expect(normalizeCost(null)).toBe(1);
  });

  it('returns 1 when energy field is NaN', () => {
    expect(normalizeCost({ energy: NaN })).toBe(1);
  });

  it('returns 1 when energy field is Infinity', () => {
    expect(normalizeCost({ energy: Infinity })).toBe(1);
  });

  it('returns 1 when energy field is negative', () => {
    expect(normalizeCost({ energy: -5 })).toBe(1);
  });
});

describe('normalizeActionCost', () => {
  it('returns numeric baseCost unchanged', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'compliment')!;
    expect(normalizeActionCost(action)).toBe(1);
  });

  it('returns energy field for object baseCost', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'whisper')!;
    expect(normalizeActionCost(action)).toBe(1);
  });
});

// ── SocialEnergyBank ───────────────────────────────────────────────────────

describe('SocialEnergyBank – Redux-backed operations', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
    initEnergyBank(store);
  });

  it('get returns 0 for unknown player', () => {
    expect(bankGet('nobody')).toBe(0);
  });

  it('set writes to Redux state', () => {
    bankSet('p1', 5);
    expect(store.getState().social.energyBank['p1']).toBe(5);
  });

  it('get reads from Redux state after set', () => {
    bankSet('p1', 7);
    expect(bankGet('p1')).toBe(7);
  });

  it('add increases energy and returns new value', () => {
    bankSet('p1', 4);
    const result = bankAdd('p1', 3);
    expect(result).toBe(7);
    expect(store.getState().social.energyBank['p1']).toBe(7);
  });

  it('add with negative delta decreases energy', () => {
    bankSet('p1', 5);
    const result = bankAdd('p1', -2);
    expect(result).toBe(3);
  });
});

// ── socialSlice new reducers ───────────────────────────────────────────────

describe('socialSlice – new reducers', () => {
  it('setEnergyBankEntry sets player energy', () => {
    const store = makeStore();
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));
    expect(store.getState().social.energyBank['p1']).toBe(10);
  });

  it('applyEnergyDelta adds delta to existing energy', () => {
    const store = makeStore();
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));
    store.dispatch(applyEnergyDelta({ playerId: 'p1', delta: -2 }));
    expect(store.getState().social.energyBank['p1']).toBe(3);
  });

  it('applyEnergyDelta from zero adds delta', () => {
    const store = makeStore();
    store.dispatch(applyEnergyDelta({ playerId: 'p1', delta: 4 }));
    expect(store.getState().social.energyBank['p1']).toBe(4);
  });

  it('recordSocialAction appends to sessionLogs', () => {
    const store = makeStore();
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: 'p1',
          targetId: 'p2',
          cost: 1,
          delta: 0,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      }),
    );
    expect(store.getState().social.sessionLogs).toHaveLength(1);
  });

  it('updateRelationship creates a new relationship entry', () => {
    const store = makeStore();
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 0.1 }));
    expect(store.getState().social.relationships['p1']['p2'].affinity).toBeCloseTo(0.1);
  });

  it('updateRelationship does not create an entry when delta is 0 and no tags', () => {
    const store = makeStore();
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 0 }));
    expect(store.getState().social.relationships['p1']?.['p2']).toBeUndefined();
  });

  it('updateRelationship accumulates affinity on existing entry', () => {
    const store = makeStore();
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 0.1 }));
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 0.05 }));
    expect(store.getState().social.relationships['p1']['p2'].affinity).toBeCloseTo(0.15);
  });

  it('updateRelationship merges tags without duplicates', () => {
    const store = makeStore();
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 0, tags: ['ally'] }));
    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: 0, tags: ['ally', 'shield'] }),
    );
    const tags = store.getState().social.relationships['p1']['p2'].tags;
    expect(tags).toContain('ally');
    expect(tags).toContain('shield');
    expect(tags.filter((t) => t === 'ally').length).toBe(1);
  });
});

// ── SocialManeuvers selectors ─────────────────────────────────────────────

describe('selectEnergyBank and selectSessionLogs', () => {
  it('selectEnergyBank returns the energyBank subtree', () => {
    const store = makeStore();
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 3 }));
    const bank = selectEnergyBank(store.getState());
    expect(bank['p1']).toBe(3);
  });

  it('selectSessionLogs returns sessionLogs array', () => {
    const store = makeStore();
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: 'p1',
          targetId: 'p2',
          cost: 1,
          delta: 0,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      }),
    );
    const logs = selectSessionLogs(store.getState());
    expect(logs).toHaveLength(1);
  });
});

// ── getActionById ─────────────────────────────────────────────────────────

describe('getActionById', () => {
  it('returns the correct definition for a known id', () => {
    const action = getActionById('rumor');
    expect(action).toBeDefined();
    expect(action!.category).toBe('aggressive');
  });

  it('returns undefined for unknown id', () => {
    expect(getActionById('nonexistent')).toBeUndefined();
  });
});

// ── getAvailableActions ───────────────────────────────────────────────────

describe('getAvailableActions', () => {
  beforeEach(() => {
    const store = makeStore();
    initManeuvers(store);
    // Energy not set → starts at 0
  });

  it('returns only zero-cost actions when player has no energy', () => {
    const store = makeStore();
    initManeuvers(store);
    // idle has baseCost 0, so it should still be available even with 0 energy
    const available = getAvailableActions('p1');
    for (const action of available) {
      expect(normalizeActionCost(action)).toBeLessThanOrEqual(0);
    }
  });

  it('returns only affordable actions', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 1 }));
    // Only actions with cost ≤ 1 should appear
    const available = getAvailableActions('p1');
    for (const action of available) {
      expect(normalizeActionCost(action)).toBeLessThanOrEqual(1);
    }
  });

  it('returns all actions when player has sufficient energy', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 100 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 100 }));
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 100 }));
    expect(getAvailableActions('p1').length).toBe(SOCIAL_ACTIONS.length);
  });

  it('accepts an optional state snapshot', () => {
    const store = makeStore();
    initManeuvers(store);
    const snapshot = {
      social: { energyBank: { p1: 2 }, relationships: {}, sessionLogs: [] },
    };
    const available = getAvailableActions('p1', snapshot);
    for (const action of available) {
      expect(normalizeActionCost(action)).toBeLessThanOrEqual(2);
    }
  });
});

// ── executeAction ─────────────────────────────────────────────────────────

describe('executeAction – happy path', () => {
  it('returns success with correct delta and newEnergy', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));

    const result = executeAction('p1', 'p2', 'compliment');
    expect(result.success).toBe(true);
    expect(result.newEnergy).toBe(4); // 5 - cost(1)
  });

  it('deducts energy from Redux state', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));

    executeAction('p1', 'p2', 'compliment');
    expect(store.getState().social.energyBank['p1']).toBe(4);
  });

  it('appends an entry to sessionLogs', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));

    executeAction('p1', 'p2', 'compliment');
    expect(store.getState().social.sessionLogs).toHaveLength(1);
  });

  it('session log entry contains expected fields', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));

    executeAction('p1', 'p2', 'compliment');
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry;
    expect(entry.actionId).toBe('compliment');
    expect(entry.actorId).toBe('p1');
    expect(entry.targetId).toBe('p2');
    expect(typeof entry.cost).toBe('number');
    expect(typeof entry.delta).toBe('number');
    expect(entry.outcome).toBe('success');
  });

  it('updates relationship affinity in Redux state', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    // Use 'ally' which produces a non-zero delta via socialConfig.friendlyActions
    executeAction('p1', 'p2', 'ally');
    const rel = store.getState().social.relationships['p1']?.['p2'];
    expect(rel).toBeDefined();
    expect(rel!.affinity).toBe(socialConfig.affinityDeltas.friendlySuccess);
  });

  it.todo(
    'applies the correct affinity delta for a friendly action (success) – TODO: add compliment to socialConfig.actionCategories.friendlyActions so computeOutcomeDelta returns a non-zero delta',
  );

  it('tags relationship with outcomeTag when action has one', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    executeAction('p1', 'p2', 'startFight');
    const rel = store.getState().social.relationships['p1']?.['p2'];
    expect(rel?.tags).toContain('conflict');
  });

  it('multiple executions accumulate session logs', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    executeAction('p1', 'p2', 'compliment');
    executeAction('p1', 'p2', 'compliment');
    expect(store.getState().social.sessionLogs).toHaveLength(2);
  });
});

describe('executeAction – failure cases', () => {
  it('returns failure for unknown action id', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    const result = executeAction('p1', 'p2', 'unknown_action_xyz');
    expect(result.success).toBe(false);
  });

  it('does not mutate state for unknown action id', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    executeAction('p1', 'p2', 'unknown_action_xyz');
    expect(store.getState().social.sessionLogs).toHaveLength(0);
    expect(store.getState().social.energyBank['p1']).toBe(10);
  });

  it('returns failure when player lacks energy', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 0 }));

    const result = executeAction('p1', 'p2', 'compliment');
    expect(result.success).toBe(false);
  });

  it('does not deduct energy on insufficient funds', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 0 }));

    executeAction('p1', 'p2', 'compliment');
    expect(store.getState().social.energyBank['p1']).toBe(0);
  });

  it('does not append to sessionLogs on failure', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 0 }));

    executeAction('p1', 'p2', 'compliment');
    expect(store.getState().social.sessionLogs).toHaveLength(0);
  });

  it('supports forced failure outcome', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    const result = executeAction('p1', 'p2', 'compliment', { outcome: 'failure' });
    expect(result.success).toBe(true);
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry;
    expect(entry.outcome).toBe('failure');
  });
});

// ── Integration: computeOutcomeDelta wired through executeAction ──────────

describe('executeAction – outcome delta from SocialPolicy', () => {
  it('delta for ally (friendly, socialConfig) is positive on success', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    const result = executeAction('p1', 'p2', 'ally');
    expect(result.success).toBe(true);
    expect(result.delta).toBe(socialConfig.affinityDeltas.friendlySuccess);
  });

  it('delta for betray (aggressive, socialConfig) is negative on success', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    const result = executeAction('p1', 'p2', 'betray');
    expect(result.success).toBe(true);
    expect(result.delta).toBe(socialConfig.affinityDeltas.aggressiveSuccess);
  });

  it('delta for compliment (not yet in socialConfig categories) is 0', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    const result = executeAction('p1', 'p2', 'compliment');
    // compliment is not in socialConfig.actionCategories so delta = 0
    expect(result.delta).toBe(0);
  });
});

// ── SocialEnergyBank energy clamping ──────────────────────────────────────

describe('SocialEnergyBank – energy clamped at 0', () => {
  it('add with delta that would produce negative energy clamps at 0', () => {
    const store = makeStore();
    initEnergyBank(store);
    bankSet('p1', 2);
    const result = bankAdd('p1', -10);
    expect(result).toBe(0);
    expect(store.getState().social.energyBank['p1']).toBe(0);
  });
});

// ── canAfford ──────────────────────────────────────────────────────────────

describe('canAfford', () => {
  it('returns true when all resource balances are sufficient', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 2 }));
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 3 }));
    expect(canAfford('p1', { energy: 5, influence: 2, info: 3 })).toBe(true);
  });

  it('returns false when energy is insufficient', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 0 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 5 }));
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 5 }));
    expect(canAfford('p1', { energy: 1, influence: 0, info: 0 })).toBe(false);
  });

  it('returns false when influence is insufficient', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }));
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 10 }));
    expect(canAfford('p1', { energy: 1, influence: 1, info: 0 })).toBe(false);
  });

  it('returns false when info is insufficient', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 10 }));
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 0 }));
    expect(canAfford('p1', { energy: 1, influence: 0, info: 1 })).toBe(false);
  });

  it('accepts a state snapshot with optional influenceBank/infoBank', () => {
    const store = makeStore();
    initManeuvers(store);
    const snapshot = {
      social: { energyBank: { p1: 5 }, influenceBank: { p1: 2 }, infoBank: { p1: 3 }, relationships: {}, sessionLogs: [] },
    };
    expect(canAfford('p1', { energy: 5, influence: 2, info: 3 }, snapshot)).toBe(true);
    expect(canAfford('p1', { energy: 5, influence: 3, info: 0 }, snapshot)).toBe(false);
  });

  it('treats missing influenceBank/infoBank in snapshot as 0', () => {
    const store = makeStore();
    initManeuvers(store);
    const snapshot = {
      social: { energyBank: { p1: 5 }, relationships: {}, sessionLogs: [] },
    };
    // influence and info are absent → treated as 0
    expect(canAfford('p1', { energy: 5, influence: 0, info: 0 }, snapshot)).toBe(true);
    expect(canAfford('p1', { energy: 5, influence: 1, info: 0 }, snapshot)).toBe(false);
  });
});

// ── multi-resource getAvailableActions ────────────────────────────────────

describe('getAvailableActions – multi-resource filtering', () => {
  it('filters out actions that require influence when player has none', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));
    // No influence → proposeAlliance ({ energy: 3, influence: 1 }) must be excluded
    const available = getAvailableActions('p1');
    const ids = available.map((a) => a.id);
    expect(ids).not.toContain('proposeAlliance');
  });

  it('filters out actions that require info when player has none', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));
    // No info → whisper ({ energy: 1, info: 1 }) and rumor ({ energy: 2, info: 1 }) excluded
    const available = getAvailableActions('p1');
    const ids = available.map((a) => a.id);
    expect(ids).not.toContain('whisper');
    expect(ids).not.toContain('rumor');
  });

  it('includes multi-resource actions when all resources are available', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 10 }));
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 10 }));
    const available = getAvailableActions('p1');
    const ids = available.map((a) => a.id);
    expect(ids).toContain('proposeAlliance');
    expect(ids).toContain('whisper');
    expect(ids).toContain('rumor');
  });
});

// ── executeAction – multi-resource deductions ─────────────────────────────

describe('executeAction – multi-resource deductions', () => {
  it('deducts info cost when executing whisper', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 3 }));

    executeAction('p1', 'p2', 'whisper');
    expect(store.getState().social.infoBank['p1']).toBe(2); // 3 - 1
  });

  it('deducts influence cost when executing proposeAlliance', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 2 }));

    executeAction('p1', 'p2', 'proposeAlliance');
    expect(store.getState().social.influenceBank['p1']).toBe(1); // 2 - 1
  });

  it('returns failure when info is insufficient for whisper', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));
    // No info set → 0 < 1 required

    const result = executeAction('p1', 'p2', 'whisper');
    expect(result.success).toBe(false);
    expect(result.summary).toBe('Insufficient resources');
  });

  it('does not mutate any state when info is insufficient', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));

    executeAction('p1', 'p2', 'whisper');
    expect(store.getState().social.energyBank['p1']).toBe(5);
    expect(store.getState().social.sessionLogs).toHaveLength(0);
  });

  it('applies influence yield on successful compliment', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }));

    executeAction('p1', 'p2', 'compliment', { outcome: 'success' });
    expect(store.getState().social.influenceBank['p1']).toBe(1); // 0 + yield(1)
  });

  it('does not apply influence yield on failure', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }));

    executeAction('p1', 'p2', 'compliment', { outcome: 'failure' });
    expect(store.getState().social.influenceBank['p1']).toBe(0); // no yield on failure
  });
});

// ── executeAction – balancesAfter in session log ──────────────────────────

describe('executeAction – balancesAfter in sessionLogs', () => {
  it('session log entry contains costs with all three resources', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 2 }));

    executeAction('p1', 'p2', 'whisper');
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry;
    expect(entry.costs).toEqual({ energy: 1, influence: 0, info: 1 });
  });

  it('session log entry contains balancesAfter', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }));
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 2 }));

    // whisper: energy-1=4, info-1=1; whisper yields influence+1=1
    executeAction('p1', 'p2', 'whisper', { outcome: 'success' });
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry;
    expect(entry.balancesAfter).toEqual({ energy: 4, influence: 1, info: 1 });
  });

  it('session log entry contains yieldsApplied for actions with yields', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));

    executeAction('p1', 'p2', 'compliment', { outcome: 'success' });
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry;
    expect(entry.yieldsApplied).toBeDefined();
    expect(entry.yieldsApplied?.influence).toBe(1);
  });

  it('session log entry does not have yieldsApplied for actions without yields', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }));

    executeAction('p1', 'p2', 'ally');
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry;
    expect(entry.yieldsApplied).toBeUndefined();
  });

  it('selectInfluenceBank and selectInfoBank return correct values after action', () => {
    const store = makeStore();
    initManeuvers(store);
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 3 }));
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 2 }));

    executeAction('p1', 'p2', 'proposeAlliance');
    const influenceBank = selectInfluenceBank(store.getState());
    const infoBank = selectInfoBank(store.getState());
    expect(influenceBank['p1']).toBe(2); // 3 - 1
    expect(infoBank['p1']).toBe(2); // unchanged
  });
});
