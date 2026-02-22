// Integration tests for SocialPolicy.
//
// Validates:
//  1. chooseActionFor returns a valid action id from socialConfig.actionWeights.
//  2. chooseActionFor is deterministic for the same seed and player id.
//  3. chooseTargetsFor returns ally targets for friendly actions.
//  4. chooseTargetsFor returns enemy targets for aggressive actions.
//  5. chooseTargetsFor falls back to first eligible player when no match.
//  6. computeOutcomeDelta returns correct deltas for friendly/aggressive actions.

import { describe, it, expect } from 'vitest';
import {
  chooseActionFor,
  chooseTargetsFor,
  computeOutcomeDelta,
} from '../../src/social/SocialPolicy';
import { socialConfig } from '../../src/social/socialConfig';
import type { PolicyContext } from '../../src/social/types';

const PLAYERS = [
  { id: 'p1', status: 'active' },
  { id: 'p2', status: 'active' },
  { id: 'p3', status: 'active' },
  { id: 'p4', status: 'evicted' },
];

const BASE_CONTEXT: PolicyContext = {
  relationships: {},
  players: PLAYERS,
  seed: 42,
};

describe('SocialPolicy – chooseActionFor', () => {
  it('returns a valid action from actionWeights', () => {
    const action = chooseActionFor('p1', BASE_CONTEXT);
    expect(Object.keys(socialConfig.actionWeights)).toContain(action);
  });

  it('is deterministic for the same seed and playerId', () => {
    const a = chooseActionFor('p1', BASE_CONTEXT);
    const b = chooseActionFor('p1', BASE_CONTEXT);
    expect(a).toBe(b);
  });

  it('returns different actions for players with sufficiently different ids', () => {
    // 'p1' (idSum=161) and 'AAAAAA' (idSum=390) produce different LCG seeds with seed=42
    const a1 = chooseActionFor('p1', BASE_CONTEXT);
    const a2 = chooseActionFor('AAAAAA', BASE_CONTEXT);
    expect(a1).not.toBe(a2);
  });

  it('returns idle when actionWeights is empty', () => {
    const saved = { ...socialConfig.actionWeights };
    // Clear all entries
    for (const k of Object.keys(socialConfig.actionWeights)) {
      delete socialConfig.actionWeights[k];
    }
    const action = chooseActionFor('p1', BASE_CONTEXT);
    expect(action).toBe('idle');
    // Restore
    Object.assign(socialConfig.actionWeights, saved);
  });
});

describe('SocialPolicy – chooseTargetsFor', () => {
  it('returns an ally for friendly actions when one exists', () => {
    const ctx: PolicyContext = {
      ...BASE_CONTEXT,
      relationships: {
        p1: {
          p2: { affinity: 0.8, tags: [] },
          p3: { affinity: -0.8, tags: [] },
        },
      },
    };
    const targets = chooseTargetsFor('p1', 'ally', ctx);
    expect(targets).toEqual(['p2']);
  });

  it('returns an enemy for aggressive actions when one exists', () => {
    const ctx: PolicyContext = {
      ...BASE_CONTEXT,
      relationships: {
        p1: {
          p2: { affinity: 0.8, tags: [] },
          p3: { affinity: -0.8, tags: [] },
        },
      },
    };
    const targets = chooseTargetsFor('p1', 'nominate', ctx);
    expect(targets).toEqual(['p3']);
  });

  it('falls back to first eligible player when no ally/enemy found', () => {
    const targets = chooseTargetsFor('p1', 'ally', BASE_CONTEXT);
    // No relationships defined; p4 is evicted, so p2 is first eligible
    expect(targets).toHaveLength(1);
    expect(['p2', 'p3']).toContain(targets[0]);
  });

  it('excludes the actor itself', () => {
    const targets = chooseTargetsFor('p1', 'idle', BASE_CONTEXT);
    expect(targets).not.toContain('p1');
  });

  it('excludes evicted players', () => {
    const targets = chooseTargetsFor('p1', 'idle', BASE_CONTEXT);
    expect(targets).not.toContain('p4');
  });

  it('returns empty array when no eligible targets exist', () => {
    const ctx: PolicyContext = {
      ...BASE_CONTEXT,
      players: [{ id: 'p1', status: 'active' }],
    };
    expect(chooseTargetsFor('p1', 'ally', ctx)).toEqual([]);
  });
});

describe('SocialPolicy – computeOutcomeDelta', () => {
  it('returns friendlySuccess delta for ally + success', () => {
    expect(computeOutcomeDelta('ally', 'p1', 'p2', 'success')).toBe(
      socialConfig.affinityDeltas.friendlySuccess,
    );
  });

  it('returns friendlyFailure delta for protect + failure', () => {
    expect(computeOutcomeDelta('protect', 'p1', 'p2', 'failure')).toBe(
      socialConfig.affinityDeltas.friendlyFailure,
    );
  });

  it('returns aggressiveSuccess delta for nominate + success', () => {
    expect(computeOutcomeDelta('nominate', 'p1', 'p2', 'success')).toBe(
      socialConfig.affinityDeltas.aggressiveSuccess,
    );
  });

  it('returns aggressiveFailure delta for betray + failure', () => {
    expect(computeOutcomeDelta('betray', 'p1', 'p2', 'failure')).toBe(
      socialConfig.affinityDeltas.aggressiveFailure,
    );
  });

  it('returns 0 for unknown action', () => {
    expect(computeOutcomeDelta('unknown_action', 'p1', 'p2', 'success')).toBe(0);
  });
});
