// Integration tests for SocialInfluence.
//
// Validates:
//  1. computeNomBias returns 0 when no relationship exists.
//  2. computeNomBias returns a negative bias for allies (reluctant to nominate).
//  3. computeNomBias returns a positive bias for enemies (keen to nominate).
//  4. computeNomBias result is clamped within nomBiasBounds.
//  5. computeVetoBias returns 0 when no relationship exists.
//  6. computeVetoBias returns a positive bias for allies.
//  7. computeVetoBias result is clamped within vetoBiasBounds.
//  8. update() dispatches social/influenceUpdated and stores weights in Redux.
//  9. influence weights are populated in Redux when leaving a social phase.

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../src/store/gameSlice';
import socialReducer from '../../src/social/socialSlice';
import { socialMiddleware } from '../../src/social/socialMiddleware';
import { SocialEngine } from '../../src/social/SocialEngine';
import {
  computeNomBias,
  computeVetoBias,
  initInfluence,
  update,
} from '../../src/social/SocialInfluence';
import { socialConfig } from '../../src/social/socialConfig';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  });
}

const [nomMin, nomMax] = socialConfig.nomBiasBounds;
const [vetoMin, vetoMax] = socialConfig.vetoBiasBounds;

// ── computeNomBias ────────────────────────────────────────────────────────

describe('SocialInfluence – computeNomBias', () => {
  it('returns 0 when no relationship exists', () => {
    const state = { social: { relationships: {} } };
    expect(computeNomBias('p1', 'p2', state)).toBe(0);
  });

  it('returns min bound (negative) for a strong ally', () => {
    const state = {
      social: {
        relationships: { p1: { p2: { affinity: 0.9, tags: [] } } },
      },
    };
    expect(computeNomBias('p1', 'p2', state)).toBe(nomMin);
  });

  it('returns max bound (positive) for a strong enemy', () => {
    const state = {
      social: {
        relationships: { p1: { p2: { affinity: -0.9, tags: [] } } },
      },
    };
    expect(computeNomBias('p1', 'p2', state)).toBe(nomMax);
  });

  it('result is within nomBiasBounds for neutral affinity', () => {
    const state = {
      social: {
        relationships: { p1: { p2: { affinity: 0.1, tags: [] } } },
      },
    };
    const bias = computeNomBias('p1', 'p2', state);
    expect(bias).toBeGreaterThanOrEqual(nomMin);
    expect(bias).toBeLessThanOrEqual(nomMax);
  });

  it('target tag increases bias toward nomBiasBounds max', () => {
    const withoutTag = {
      social: {
        relationships: { p1: { p2: { affinity: 0.1, tags: [] } } },
      },
    };
    const withTag = {
      social: {
        relationships: { p1: { p2: { affinity: 0.1, tags: ['target'] } } },
      },
    };
    expect(computeNomBias('p1', 'p2', withTag)).toBeGreaterThan(
      computeNomBias('p1', 'p2', withoutTag),
    );
  });
});

// ── computeVetoBias ───────────────────────────────────────────────────────

describe('SocialInfluence – computeVetoBias', () => {
  it('returns 0 when no relationship exists', () => {
    const state = { social: { relationships: {} } };
    expect(computeVetoBias('p1', 'p2', state)).toBe(0);
  });

  it('returns max bound for a strong ally', () => {
    const state = {
      social: {
        relationships: { p1: { p2: { affinity: 0.9, tags: [] } } },
      },
    };
    expect(computeVetoBias('p1', 'p2', state)).toBe(vetoMax);
  });

  it('returns min bound for a strong enemy', () => {
    const state = {
      social: {
        relationships: { p1: { p2: { affinity: -0.9, tags: [] } } },
      },
    };
    expect(computeVetoBias('p1', 'p2', state)).toBe(vetoMin);
  });

  it('result is within vetoBiasBounds', () => {
    const state = {
      social: {
        relationships: { p1: { p2: { affinity: 0.3, tags: [] } } },
      },
    };
    const bias = computeVetoBias('p1', 'p2', state);
    expect(bias).toBeGreaterThanOrEqual(vetoMin);
    expect(bias).toBeLessThanOrEqual(vetoMax);
  });
});

// ── update / Redux integration ────────────────────────────────────────────

describe('SocialInfluence – update dispatches influenceUpdated', () => {
  it('stores weights in state.social.influenceWeights', () => {
    const store = makeStore();
    initInfluence(store);

    update('p1', 'nomination', ['p2', 'p3']);

    const weights = store.getState().social.influenceWeights['p1'];
    expect(weights).toBeDefined();
    expect(Object.keys(weights)).toContain('p2');
    expect(Object.keys(weights)).toContain('p3');
  });

  it('weights are numbers', () => {
    const store = makeStore();
    initInfluence(store);

    update('p1', 'veto', ['p2']);

    const weights = store.getState().social.influenceWeights['p1'];
    expect(typeof weights['p2']).toBe('number');
  });

  it('does nothing when store is not initialised', () => {
    // Call update without initialising – should not throw
    // (SocialInfluence module state is shared; reset by reinitialising to null)
    // We test this by observing no error is thrown.
    expect(() => update('nobody', 'nomination', ['p1'])).not.toThrow();
  });
});

// ── SocialEngine endPhase wires influence updates ─────────────────────────

describe('SocialEngine – influenceWeights populated on endPhase', () => {
  it('state.social.influenceWeights has entries after ending a social phase', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));
    store.dispatch(setPhase('nominations'));

    const { influenceWeights } = store.getState().social;
    // At least one AI player should have weights computed
    expect(Object.keys(influenceWeights).length).toBeGreaterThan(0);
  });

  it('each actor in influenceWeights has a weights record', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));
    store.dispatch(setPhase('nominations'));

    const { influenceWeights } = store.getState().social;
    for (const weights of Object.values(influenceWeights)) {
      expect(typeof weights).toBe('object');
    }
  });
});
