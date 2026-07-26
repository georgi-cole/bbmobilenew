export interface HouseOfDarknessAiAbilityParams {
  baseAbility: number
  round: number
  health: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

/**
 * Adapts the original House of Cards AI profile for an accumulating survival run.
 * Even elite profiles begin inside a human performance band, then memory decays
 * steadily with round fatigue and slips further as lifespan pressure accumulates.
 */
export function getHouseOfDarknessAiAbility({
  baseAbility,
  round,
  health,
}: HouseOfDarknessAiAbilityParams): number {
  const compressedAbility = 43 + (baseAbility - 55) * 0.3
  const fatiguePenalty = Math.min(34, Math.max(0, round - 1) * 2.6)
  const pressurePenalty = health < 75 ? Math.min(8, (75 - health) * 0.14) : 0

  return Math.round(clamp(compressedAbility - fatiguePenalty - pressurePenalty, 18, 56))
}
