/**
 * Tests for getRelationshipTone utility.
 *
 * Covers:
 *  1. Returns 'none' for undefined.
 *  2. Returns 'none' for null.
 *  3. Returns 'none' for NaN.
 *  4. Normalized range: value > 0.5 → 'good'.
 *  5. Normalized range: value < -0.5 → 'bad'.
 *  6. Normalized range: value between -0.5 and 0.5 → 'neutral'.
 *  7. Normalized boundary: exactly 0.5 → 'neutral'.
 *  8. Normalized boundary: exactly -0.5 → 'neutral'.
 *  9. Normalized boundary: exactly 1 → 'good'.
 * 10. Normalized boundary: exactly -1 → 'bad'.
 * 11. Percent range: value >= 60 → 'good'.
 * 12. Percent range: value <= 40 → 'bad'.
 * 13. Percent range: value between 40 and 60 → 'neutral'.
 * 14. Percent boundary: exactly 60 → 'good'.
 * 15. Percent boundary: exactly 40 → 'bad'.
 */

import { describe, it, expect } from 'vitest';
import { getRelationshipTone } from '../relationshipOutline';

describe('getRelationshipTone', () => {
  it('returns "none" for undefined', () => {
    expect(getRelationshipTone(undefined)).toBe('none');
  });

  it('returns "none" for null', () => {
    expect(getRelationshipTone(null)).toBe('none');
  });

  it('returns "none" for NaN', () => {
    expect(getRelationshipTone(NaN)).toBe('none');
  });

  // ── Normalized range [-1, 1] ──────────────────────────────────────────────

  it('returns "good" for normalized value > 0.5 (e.g. 0.75)', () => {
    expect(getRelationshipTone(0.75)).toBe('good');
  });

  it('returns "bad" for normalized value < -0.5 (e.g. -0.75)', () => {
    expect(getRelationshipTone(-0.75)).toBe('bad');
  });

  it('returns "neutral" for normalized value between -0.5 and 0.5 (e.g. 0.0)', () => {
    expect(getRelationshipTone(0.0)).toBe('neutral');
  });

  it('returns "neutral" for normalized value exactly 0.5', () => {
    expect(getRelationshipTone(0.5)).toBe('neutral');
  });

  it('returns "neutral" for normalized value exactly -0.5', () => {
    expect(getRelationshipTone(-0.5)).toBe('neutral');
  });

  it('returns "good" for normalized value exactly 1', () => {
    expect(getRelationshipTone(1)).toBe('good');
  });

  it('returns "bad" for normalized value exactly -1', () => {
    expect(getRelationshipTone(-1)).toBe('bad');
  });

  // ── Percent range [0, 100] ────────────────────────────────────────────────

  it('returns "good" for percent value >= 60 (e.g. 75)', () => {
    expect(getRelationshipTone(75)).toBe('good');
  });

  it('returns "bad" for percent value <= 40 (e.g. 25)', () => {
    expect(getRelationshipTone(25)).toBe('bad');
  });

  it('returns "neutral" for percent value between 40 and 60 (e.g. 50)', () => {
    expect(getRelationshipTone(50)).toBe('neutral');
  });

  it('returns "good" for percent value exactly 60', () => {
    expect(getRelationshipTone(60)).toBe('good');
  });

  it('returns "bad" for percent value exactly 40', () => {
    expect(getRelationshipTone(40)).toBe('bad');
  });

  // ── Values just outside normalized range trigger percent logic ────────────

  it('treats value just above 1 (e.g. 1.5) as percent — returns "bad" (1.5 <= 40)', () => {
    expect(getRelationshipTone(1.5)).toBe('bad');
  });

  it('treats value just above 1 (e.g. 75) as percent — returns "good"', () => {
    expect(getRelationshipTone(75)).toBe('good');
  });

  it('treats value just below -1 (e.g. -2) as percent — returns "bad"', () => {
    expect(getRelationshipTone(-2)).toBe('bad');
  });
});
