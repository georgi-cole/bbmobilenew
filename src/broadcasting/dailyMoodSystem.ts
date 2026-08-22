import type { BroadcastOverride, Phase, Player } from '../types'
import type { RelationshipsMap } from '../social/types'
import { getBroadcastTemplate } from './broadcastTemplateCatalog'

export type DayStartAtmosphere = 'sunny' | 'cloudy' | 'rainy'
export type DayEndAtmosphere = 'sunset' | 'starry' | 'rainy'
export type DailyAtmosphere = DayStartAtmosphere | DayEndAtmosphere

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Consecutive days rotate, while each game starts at a different point. */
export function getDailyAtmosphere(
  gameId: string,
  week: number,
  phase: Phase
): DailyAtmosphere | null {
  const offset = hashText(gameId) % 3
  const index = (offset + Math.max(0, week - 1)) % 3
  if (phase === 'week_start') return (['sunny', 'cloudy', 'rainy'] as const)[index]
  if (phase === 'week_end') return (['sunset', 'starry', 'rainy'] as const)[index]
  return null
}

function closestLivingHousemate(
  players: Player[],
  relationships: RelationshipsMap | undefined,
  week: number
): Player | null {
  const user = players.find((player) => player.isUser)
  const living = players.filter(
    (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
  )
  if (living.length === 0) return null
  if (!user) return living[week % living.length]
  return [...living].sort((left, right) => {
    const affinity = (player: Player) =>
      ((relationships?.[user.id]?.[player.id]?.affinity ?? 0) +
        (relationships?.[player.id]?.[user.id]?.affinity ?? 0)) /
      2
    return affinity(right) - affinity(left) || left.id.localeCompare(right.id)
  })[0]
}

export function getDailyMoodCopy(input: {
  atmosphere: DailyAtmosphere | null
  phase: Phase
  week: number
  players: Player[]
  relationships?: RelationshipsMap
  overrides?: Record<string, BroadcastOverride>
}): string | null {
  if (!input.atmosphere || (input.phase !== 'week_start' && input.phase !== 'week_end')) return null
  const moment = input.phase === 'week_start' ? 'day-start' : 'day-end'
  const templateId = `week.${moment}-mood.${input.atmosphere}`
  const template = getBroadcastTemplate(templateId)
  const override = input.overrides?.[templateId]
  if (!template || override?.disabled) return null
  const friend = closestLivingHousemate(input.players, input.relationships, input.week)
  return (override?.text ?? template.text).replaceAll(
    '{friend}',
    friend?.name ?? 'a thoughtful housemate'
  )
}
