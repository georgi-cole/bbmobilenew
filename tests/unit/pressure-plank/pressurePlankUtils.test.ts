import { describe, expect, it } from 'vitest';
import {
  computePlankDriftForce,
  computeSafeZoneHalfWidth,
  computeSafeZoneWidthPercent,
  isWithinSafeZone,
  OUT_OF_ZONE_GRACE_MS,
  SAFE_ZONE_INITIAL,
  SAFE_ZONE_MIN,
  updateOutOfZoneTimer,
} from '../../../src/components/PressurePlank/pressurePlankUtils';

describe('pressurePlankUtils', () => {
  it('shrinks the safe zone down to a 5% total width at endgame', () => {
    expect(computeSafeZoneHalfWidth(0)).toBe(SAFE_ZONE_INITIAL);
    expect(computeSafeZoneHalfWidth(999)).toBe(SAFE_ZONE_MIN);
    expect(computeSafeZoneWidthPercent(SAFE_ZONE_MIN)).toBe(5);
  });

  it('treats the safe-zone boundary as inclusive', () => {
    expect(isWithinSafeZone(5, SAFE_ZONE_MIN)).toBe(true);
    expect(isWithinSafeZone(-5, SAFE_ZONE_MIN)).toBe(true);
    expect(isWithinSafeZone(5.01, SAFE_ZONE_MIN)).toBe(false);
  });

  it('allows up to one second outside the zone and resets on recovery', () => {
    expect(updateOutOfZoneTimer(0, 450, false)).toBe(450);
    expect(updateOutOfZoneTimer(450, 549, false)).toBe(999);
    expect(updateOutOfZoneTimer(999, 10, false)).toBeGreaterThanOrEqual(OUT_OF_ZONE_GRACE_MS);
    expect(updateOutOfZoneTimer(800, 16, true)).toBe(0);
  });

  it('produces continuous drift that changes over time', () => {
    const earlyForce = computePlankDriftForce(0.5, 3);
    const laterForce = computePlankDriftForce(24.5, 4.5);

    expect(earlyForce).not.toBe(0);
    expect(laterForce).not.toBe(0);
    expect(laterForce).not.toBe(earlyForce);
  });
});
