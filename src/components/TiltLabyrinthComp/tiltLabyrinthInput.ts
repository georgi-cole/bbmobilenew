const ORIENTATION_DEAD_ZONE_DEGREES = 1.5

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalizeTiltDelta(
  deltaDegrees: number,
  deadZoneDegrees = ORIENTATION_DEAD_ZONE_DEGREES
): number {
  if (!Number.isFinite(deltaDegrees)) return 0
  if (Math.abs(deltaDegrees) <= deadZoneDegrees) return 0
  const adjusted = deltaDegrees - Math.sign(deltaDegrees) * deadZoneDegrees
  return clamp(adjusted / 30, -1, 1)
}
