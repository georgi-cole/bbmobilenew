export const PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH = 22
export const PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH = 2
export const PRESSURE_PLANK_SAFE_ZONE_SHRINK_DURATION_SECONDS = 75
export const PRESSURE_PLANK_STABILITY_MAX = 100

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
  const outside = Math.abs(balance) - safeZoneHalfWidth
  if (outside <= 0) return 0
  const availableDangerRange = Math.max(1, fallThreshold - safeZoneHalfWidth)
  const dangerRatio = Math.min(1, outside / availableDangerRange)
  return 10 + dangerRatio * 38
}
