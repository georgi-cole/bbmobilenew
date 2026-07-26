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
 * The top end is compressed so elite profiles remain fallible, then memory ability
 * decays each round and slips slightly faster when the contestant is badly wounded.
 */
export function getHouseOfDarknessAiAbility({
  baseAbility,
  round,
  health,
}: HouseOfDarknessAiAbilityParams): number {
  const compressedAbility = 50 + (baseAbility - 55) * 0.55
  const fatiguePenalty = Math.min(22, Math.max(0, round - 1) * 1.8)
  const pressurePenalty = health < 55 ? Math.min(5, (55 - health) * 0.1) : 0

  return Math.round(clamp(compressedAbility - fatiguePenalty - pressurePenalty, 24, 68))
}
