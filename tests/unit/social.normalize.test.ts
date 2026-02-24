// Unit tests for smExecNormalize helpers.
//
// Validates:
//  1. normalizeAuxCost returns 0 for plain numbers and missing/invalid fields.
//  2. normalizeAuxCost returns correct field values from cost objects.
//  3. normalizeActionCosts returns { energy, influence, info } with influence/info
//     scaled to integer points (×100).
//  4. normalizeActionYields scales yields to integer points (×100).

import { describe, it, expect } from 'vitest';
import {
  normalizeAuxCost,
  normalizeActionCosts,
  normalizeActionYields,
} from '../../src/social/smExecNormalize';
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

// ── normalizeActionCosts — integer-point scaling (×100) ───────────────────

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

  it('scales influence and info to integer points (×100)', () => {
    const action: SocialActionDefinition = {
      id: 'test',
      title: 'Test',
      category: 'strategic',
      baseCost: { energy: 2, influence: 1.0, info: 3.0 },
    };
    expect(normalizeActionCosts(action)).toEqual({ energy: 2, influence: 100, info: 300 });
  });

  it('scales fractional float values correctly', () => {
    const action: SocialActionDefinition = {
      id: 'test',
      title: 'Test',
      category: 'strategic',
      baseCost: { energy: 1, influence: 0.02, info: 1.5 },
    };
    expect(normalizeActionCosts(action)).toEqual({ energy: 1, influence: 2, info: 150 });
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

  it('whisper ({ energy: 1 }) has energy=1, influence=0, info=0 (no info cost; yields info)', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'whisper')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 1, influence: 0, info: 0 });
  });

  it('proposeAlliance ({ energy: 3, info: 2.0 }) has energy=3, influence=0, info=200', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'proposeAlliance')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 3, influence: 0, info: 200 });
  });

  it('rumor ({ energy: 2, info: 1.0 }) has energy=2, influence=0, info=100', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'rumor')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 2, influence: 0, info: 100 });
  });

  it('vote_rally ({ energy: 2, influence: 5.0 }) has energy=2, influence=500, info=0', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'vote_rally')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 2, influence: 500, info: 0 });
  });

  it('favor_request ({ energy: 1, influence: 2.0 }) has energy=1, influence=200, info=0', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'favor_request')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 1, influence: 200, info: 0 });
  });

  it('idle (baseCost: 0) has energy=0, influence=0, info=0', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'idle')!;
    expect(normalizeActionCosts(action)).toEqual({ energy: 0, influence: 0, info: 0 });
  });
});

// ── normalizeActionYields — integer-point scaling (×100) ──────────────────

describe('normalizeActionYields', () => {
  it('returns { influence: 0, info: 0 } when action has no yields', () => {
    const action: SocialActionDefinition = {
      id: 'test',
      title: 'Test',
      category: 'friendly',
      baseCost: 1,
    };
    expect(normalizeActionYields(action)).toEqual({ influence: 0, info: 0 });
  });

  it('scales influence yield to integer points (×100)', () => {
    const action: SocialActionDefinition = {
      id: 'test',
      title: 'Test',
      category: 'friendly',
      baseCost: 1,
      yields: { influence: 0.02 },
    };
    expect(normalizeActionYields(action)).toEqual({ influence: 2, info: 0 });
  });

  it('scales info yield to integer points (×100)', () => {
    const action: SocialActionDefinition = {
      id: 'test',
      title: 'Test',
      category: 'strategic',
      baseCost: 1,
      yields: { info: 1.0 },
    };
    expect(normalizeActionYields(action)).toEqual({ influence: 0, info: 100 });
  });

  it('compliment yields influence: 2 pts (0.02 × 100)', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'compliment')!;
    expect(normalizeActionYields(action)).toEqual({ influence: 2, info: 0 });
  });

  it('whisper yields info: 100 pts (1.0 × 100)', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'whisper')!;
    expect(normalizeActionYields(action)).toEqual({ influence: 0, info: 100 });
  });

  it('proposeAlliance yields influence: 6 pts (0.06 × 100)', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'proposeAlliance')!;
    expect(normalizeActionYields(action)).toEqual({ influence: 6, info: 0 });
  });

  it('vote_rally yields influence: 4 pts (0.04 × 100)', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'vote_rally')!;
    expect(normalizeActionYields(action)).toEqual({ influence: 4, info: 0 });
  });
});

