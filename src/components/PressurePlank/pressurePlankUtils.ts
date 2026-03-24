/**
 * pressurePlankUtils — pure helpers shared by PressurePlank and its tests.
 *
 * Kept in a separate module so PressurePlank.tsx satisfies the
 * react-refresh/only-export-components lint rule.
 */

/** Safe zone half-width at the start of the game. */
export const SAFE_ZONE_INITIAL = 28;

/** Safe zone minimum half-width (5% total width on the gauge). */
export const SAFE_ZONE_MIN = 2.5;

/** Seconds after which safe zone stops shrinking. */
export const SAFE_ZONE_SHRINK_DURATION = 90;

/** Players can survive this long outside the safe zone before falling. */
export const OUT_OF_ZONE_GRACE_MS = 1000;

/** Compute the current safe-zone half-width from elapsed survival time. */
export function computeSafeZoneHalfWidth(elapsedSeconds: number): number {
  const shrinkProgress = Math.min(1, Math.max(0, elapsedSeconds / SAFE_ZONE_SHRINK_DURATION));
  return SAFE_ZONE_INITIAL - (SAFE_ZONE_INITIAL - SAFE_ZONE_MIN) * shrinkProgress;
}

/** Convert safe-zone half-width to total displayed width percentage. */
export function computeSafeZoneWidthPercent(safeZoneHalfWidth: number): number {
  return safeZoneHalfWidth * 2;
}

/** Convert balance units (-100..100) to gauge percentage (0..100). */
export function computeNeedlePercent(balance: number): number {
  return ((balance + 100) / 200) * 100;
}

/** Whether the current balance is still inside the safe zone band. */
export function isWithinSafeZone(balance: number, safeZoneHalfWidth: number): boolean {
  const needlePct = computeNeedlePercent(balance);
  return needlePct >= 50 - safeZoneHalfWidth && needlePct <= 50 + safeZoneHalfWidth;
}

/** Update out-of-zone grace time; instantly resets once the player recovers. */
export function updateOutOfZoneTimer(
  previousMs: number,
  dtMs: number,
  insideSafeZone: boolean,
): number {
  if (insideSafeZone) return 0;
  return Math.max(0, previousMs + dtMs);
}

/** Deterministic continuous sway so the plank never settles into a static state. */
export function computePlankDriftForce(elapsedSeconds: number, driftAccel: number): number {
  const frequencyRamp = 1 + elapsedSeconds / 80;
  const primaryWave = Math.sin(elapsedSeconds * 1.7 * frequencyRamp) * driftAccel * 0.9;
  const secondaryWave = Math.cos(elapsedSeconds * 3.1 * frequencyRamp + 0.6) * driftAccel * 0.4;
  return primaryWave + secondaryWave;
}
