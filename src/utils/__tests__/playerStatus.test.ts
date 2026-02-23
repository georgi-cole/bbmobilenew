/**
 * Unit tests for src/utils/playerStatus.ts
 *
 * Covers:
 *  isEvicted
 *  1. Returns false for 'active' status.
 *  2. Returns false for 'nominated' status.
 *  3. Returns false for 'hoh' status.
 *  4. Returns false for 'pov' status.
 *  5. Returns true for 'evicted' status (pre-jury evictee).
 *  6. Returns true for 'jury' status (jury-house member).
 *
 *  isNonJury
 *  7. Returns false for 'active' status.
 *  8. Returns false for 'jury' status (jury members DID make jury).
 *  9. Returns true for 'evicted' status (pre-jury, didn't make jury).
 * 10. Returns false for 'hoh', 'pov', 'nominated', 'hoh+pov', 'nominated+pov'.
 */

import { describe, it, expect } from 'vitest';
import { isEvicted, isNonJury } from '../playerStatus';
import type { PlayerStatus } from '../../types';

// ── isEvicted ────────────────────────────────────────────────────────────────

describe('isEvicted', () => {
  const activeStatuses: PlayerStatus[] = ['active', 'nominated', 'hoh', 'pov', 'hoh+pov', 'nominated+pov'];

  for (const status of activeStatuses) {
    it(`returns false for status '${status}'`, () => {
      expect(isEvicted({ status })).toBe(false);
    });
  }

  it("returns true for status 'evicted' (pre-jury evictee)", () => {
    expect(isEvicted({ status: 'evicted' })).toBe(true);
  });

  it("returns true for status 'jury' (jury-house member)", () => {
    expect(isEvicted({ status: 'jury' })).toBe(true);
  });
});

// ── isNonJury ────────────────────────────────────────────────────────────────

describe('isNonJury', () => {
  const nonEvictedStatuses: PlayerStatus[] = ['active', 'nominated', 'hoh', 'pov', 'hoh+pov', 'nominated+pov', 'jury'];

  for (const status of nonEvictedStatuses) {
    it(`returns false for status '${status}'`, () => {
      expect(isNonJury({ status })).toBe(false);
    });
  }

  it("returns true for status 'evicted' (pre-jury, didn't make jury)", () => {
    expect(isNonJury({ status: 'evicted' })).toBe(true);
  });
});
