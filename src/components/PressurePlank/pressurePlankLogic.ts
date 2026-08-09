export const PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH = 22
export const PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH = 2
export const PRESSURE_PLANK_SAFE_ZONE_SHRINK_DURATION_SECONDS = 75
export const PRESSURE_PLANK_STABILITY_MAX = 100
/**
 * The balance marker has visible width, while the physics value represents its
 * centre point. This small tolerance keeps a marker that still visibly touches
 * the minimum safe zone from taking damage because of sub-pixel/RAF precision.
 */
export const PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE = 0.75

export function getPressurePlankSafeZoneHalfWidth(elapsedSeconds: number): number {
  const progress = Math.min(
    1,
    Math.max(0, elapsedSeconds) / PRESSURE_PLANK_SAFE_ZONE_SHRINK_DURATION_SECONDS
  )
  return (
    PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH -
    (PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH - PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH) *
      progress
  )
}

export function getPressurePlankStabilityDamagePerSecond(
  balance: number,
  safeZoneHalfWidth: number,
  fallThreshold: number
): number {
  const protectedHalfWidth = safeZoneHalfWidth + PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE
  const outside = Math.abs(balance) - protectedHalfWidth
  if (outside <= 0) return 0
  const availableDangerRange = Math.max(1, fallThreshold - protectedHalfWidth)
  const dangerRatio = Math.min(1, outside / availableDangerRange)
  return 10 + dangerRatio * 38
}

export function getPressurePlankGaugeSafeZoneBounds(
  safeZoneHalfWidth: number,
  maxBalance: number
): { leftPercent: number; widthPercent: number } {
  const safeMaxBalance = Math.max(1, Math.abs(maxBalance))
  const clampedHalfWidth = Math.min(safeMaxBalance, Math.max(0, safeZoneHalfWidth))
  const halfWidthPercent = (clampedHalfWidth / (2 * safeMaxBalance)) * 100
  return {
    leftPercent: 50 - halfWidthPercent,
    widthPercent: halfWidthPercent * 2,
  }
}
