export const PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH = 22
export const PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH = 2
export const PRESSURE_PLANK_SAFE_ZONE_SHRINK_DURATION_SECONDS = 75
export const PRESSURE_PLANK_STABILITY_MAX = 100
export const PRESSURE_PLANK_ROUND_SECONDS = 120
/**
 * The balance marker has visible width, while the physics value represents its
 * centre point. This small tolerance keeps a marker that still visibly touches
 * the minimum safe zone from taking damage because of sub-pixel/RAF precision.
 */
export const PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE = 0.75

export interface PressurePlankRankedResult {
  playerId: string
  survivalSeconds: number
  rank: number
}

export function normalizePressurePlankSurvivalSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0
  return Math.round(Math.max(0, Math.min(PRESSURE_PLANK_ROUND_SECONDS, seconds)) * 1000) / 1000
}

export function hasPressurePlankRoundExpired(elapsedSeconds: number): boolean {
  return elapsedSeconds >= PRESSURE_PLANK_ROUND_SECONDS
}

function pressurePlankTieKey(seed: number, playerId: string): number {
  let hash = (0x811c9dc5 ^ (seed >>> 0)) >>> 0
  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export function rankPressurePlankResults(
  participantIds: readonly string[],
  survivalSecondsByPlayerId: Readonly<Record<string, number>>,
  seed: number
): PressurePlankRankedResult[] {
  return participantIds
    .map((playerId) => ({
      playerId,
      survivalSeconds: normalizePressurePlankSurvivalSeconds(
        survivalSecondsByPlayerId[playerId] ?? 0
      ),
    }))
    .sort((a, b) => {
      const timeDifference = b.survivalSeconds - a.survivalSeconds
      if (timeDifference !== 0) return timeDifference
      const tieDifference = pressurePlankTieKey(seed, a.playerId) - pressurePlankTieKey(seed, b.playerId)
      return tieDifference !== 0 ? tieDifference : a.playerId.localeCompare(b.playerId)
    })
    .map((result, index) => ({ ...result, rank: index + 1 }))
}

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
