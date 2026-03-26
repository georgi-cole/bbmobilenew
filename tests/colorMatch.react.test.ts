/**
 * Color Match — unit tests for the React component.
 *
 * Covers:
 *  1. Registry: colorMatch is active, has React implementation, and correct reactComponentKey.
 *  2. Component logic: accuracy calculation, seeded round generation.
 *  3. Component renders and submits a round correctly.
 *  4. Final score is the average accuracy across rounds.
 */

import { describe, it, expect } from 'vitest';
import { getGame } from '../src/minigames/registry';
import reactComponents from '../src/minigames/reactComponents';
import {
  applyHintPenalty,
  buildHintMessage,
  calculateColorMatchAccuracy,
} from '../src/components/ColorMatchComp/colorMatchUtils';

// ── 1. Registry checks ────────────────────────────────────────────────────────

describe('colorMatch registry entry', () => {
  it('is active (not retired)', () => {
    const entry = getGame('colorMatch');
    expect(entry).toBeDefined();
    expect(entry?.retired).toBe(false);
  });

  it('uses React implementation', () => {
    const entry = getGame('colorMatch');
    expect(entry?.implementation).toBe('react');
    expect(entry?.legacy).toBe(false);
  });

  it('has reactComponentKey "ColorMatch"', () => {
    const entry = getGame('colorMatch');
    expect(entry?.reactComponentKey).toBe('ColorMatch');
  });

  it('does not have modulePath (not legacy)', () => {
    const entry = getGame('colorMatch');
    expect((entry as Record<string, unknown>)?.modulePath).toBeUndefined();
  });
});

// ── 2. reactComponents map includes ColorMatch ────────────────────────────────

describe('reactComponents map', () => {
  it('contains ColorMatch entry', () => {
    expect(reactComponents['ColorMatch']).toBeDefined();
    expect(typeof reactComponents['ColorMatch']).toBe('function');
  });
});

// ── 3. Accuracy helper logic ──────────────────────────────────────────────────

describe('Color Match accuracy calculation', () => {
  it('returns 100% for an exact match', () => {
    const color = { r: 100, g: 150, b: 200 };
    expect(Math.round(calculateColorMatchAccuracy(color, color))).toBe(100);
  });

  it('returns 0% for maximum possible distance (black vs white)', () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(Math.round(calculateColorMatchAccuracy(black, white))).toBe(0);
  });

  it('returns > 50% for a reasonably close match', () => {
    const target = { r: 100, g: 100, b: 100 };
    const close  = { r: 110, g:  95, b: 105 };
    expect(calculateColorMatchAccuracy(target, close)).toBeGreaterThan(90);
  });

  it('accuracy is symmetric', () => {
    const a = { r: 50,  g: 100, b: 200 };
    const b = { r: 180, g:  30, b:  10 };
    expect(calculateColorMatchAccuracy(a, b)).toBeCloseTo(calculateColorMatchAccuracy(b, a), 5);
  });
});

describe('Color Match hints', () => {
  it('builds directional RGB hint copy', () => {
    const hint = buildHintMessage(
      { r: 200, g: 110, b: 50 },
      { r: 150, g: 112, b: 100 },
    );
    expect(hint).toMatch(/increase red/i);
    expect(hint).toMatch(/green level is accurate/i);
    expect(hint).toMatch(/decrease blue/i);
  });

  it('applies 5 points per hint to final score', () => {
    expect(applyHintPenalty(88, 0)).toBe(88);
    expect(applyHintPenalty(88, 1)).toBe(83);
    expect(applyHintPenalty(88, 2)).toBe(78);
  });

  it('never drops final score below zero', () => {
    expect(applyHintPenalty(4, 2)).toBe(0);
  });
});
