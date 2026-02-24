// Unit tests for smExecNormalize helpers.
//
// Validates:
//  1. normalizeAuxCost returns 0 for plain numbers and missing/invalid fields.
//  2. normalizeAuxCost returns correct field values from cost objects.
//  3. normalizeActionCosts returns { energy, influence, info } with correct defaults.

import { describe, it, expect } from 'vitest';
import { normalizeAuxCost, normalizeActionCosts } from '../../src/social/smExecNormalize';
import { SOCIAL_ACTIONS } from '../../src/social/socialActions';
import type { SocialActionDefinition } from '../../src/social/socialActions';

// ── normalizeAuxCost ──────────────────────────────────────────────────────

describe('normalizeAuxCost', () => {
  it('returns 0 for undefined', () => {
    expect(normalizeAuxCost(undefined, 'influence')).toBe(0);
    expect(normalizeAuxCost(undefined, 'info')).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(normalizeAuxCost(null, 'influence')).toBe(0);
    expect(normalizeAuxCost(null, 'info')).toBe(0);
  });

  it('returns 0 for a plain number (energy-only cost)', () => {
    expect(normalizeAuxCost(3, 'influence')).toBe(0);
    expect(normalizeAuxCost(2, 'info')).toBe(0);
  });

  it('returns 0 when the requested field is absent from the object', () => {
    expect(normalizeAuxCost({ energy: 2 }, 'influence')).toBe(0);
    expect(normalizeAuxCost({ energy: 1, influence: 1 }, 'info')).toBe(0);
  });

  it('returns the field value when present and valid', () => {
    expect(normalizeAuxCost({ energy: 1, influence: 2 }, 'influence')).toBe(2);
    expect(normalizeAuxCost({ energy: 1, info: 3 }, 'info')).toBe(3);
  });

  it('returns 0 when field is NaN', () => {
    expect(normalizeAuxCost({ influence: NaN }, 'influence')).toBe(0);
    expect(normalizeAuxCost({ info: NaN }, 'info')).toBe(0);
  });

  it('returns 0 when field is Infinity', () => {
    expect(normalizeAuxCost({ influence: Infinity }, 'influence')).toBe(0);
    expect(normalizeAuxCost({ info: Infinity }, 'info')).toBe(0);
  });

  it('returns 0 when field is negative', () => {
    expect(normalizeAuxCost({ influence: -1 }, 'influence')).toBe(0);
    expect(normalizeAuxCost({ info: -5 }, 'info')).toBe(0);
  });

  it('returns 0 when field is 0 (no cost)', () => {
    expect(normalizeAuxCost({ influence: 0 }, 'influence')).toBe(0);
    expect(normalizeAuxCost({ info: 0 }, 'info')).toBe(0);
  });
});

// ── normalizeActionCosts ──────────────────────────────────────────────────

describe('normalizeActionCosts', () => {
  it('returns { energy: baseCost, influence: 0, info: 0 } for a plain-number cost', () => {
    const action: SocialActionDefinition = {
      id: 'test',
      title: 'Test',
      category: 'friendly',
      baseCost: 2,
    };
    expect(normalizeActionCosts(action)).toEqual({ energy: 2, influence: 0, info: 0 });
  });

  it('returns energy default 1 when baseCost is undefined-like (object with no energy)', () => {
    const action: SocialActionDefinition = {
      id: 'test',
      title: 'Test',
      category: 'friendly',
      baseCost: {},
    };
    expect(normalizeActionCosts(action)).toEqual({ energy: 1, influence: 0, info: 0 });
  });

  it('extracts energy, influence and info from a full cost object', () => {
    const action: SocialActionDefinition = {
      id: 'test',
      title: 'Test',
      category: 'strategic',
      baseCost: { energy: 2, influence: 1, info: 3 },
    };
    expect(normalizeActionCosts(action)).toEqual({ energy: 2, influence: 1, info: 3 });
  });

  it('defaults influence and info to 0 when not in the object', () => {
    const action: SocialActionDefinition = {
      id: 'test',
      title: 'Test',
      category: 'strategic',
      baseCost: { energy: 1 },
    };
    expect(normalizeActionCosts(action)).toEqual({ energy: 1, influence: 0, info: 0 });
  });

  it('compliment (baseCost: 1) has energy=1, influence=0, info=0', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'compliment')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 1, influence: 0, info: 0 });
  });

  it('whisper ({ energy: 1, info: 1 }) has energy=1, influence=0, info=1', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'whisper')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 1, influence: 0, info: 1 });
  });

  it('proposeAlliance ({ energy: 3, influence: 1 }) has energy=3, influence=1, info=0', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'proposeAlliance')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 3, influence: 1, info: 0 });
  });

  it('rumor ({ energy: 2, info: 1 }) has energy=2, influence=0, info=1', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'rumor')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 2, influence: 0, info: 1 });
  });

  it('idle (baseCost: 0) has energy=0, influence=0, info=0', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'idle')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 0, influence: 0, info: 0 });
  });
});
