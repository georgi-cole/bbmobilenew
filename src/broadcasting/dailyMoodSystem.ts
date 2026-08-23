import type { BroadcastOverride, Phase, Player } from '../types'
import type { RelationshipsMap } from '../social/types'
import { getBroadcastTemplate } from './broadcastTemplateCatalog'

export type DayStartAtmosphere = 'sunny' | 'cloudy' | 'rainy' | 'misty' | 'snowy' | 'stormy'
export type DayEndAtmosphere = 'sunset' | 'starry' | 'rainy' | 'misty' | 'snowy' | 'stormy'
export type DailyAtmosphere = DayStartAtmosphere | DayEndAtmosphere

const DAILY_TRANSITION_TITLES = {
  week_start: {
    sunny: 'Day {day} opens bright and gentle, with morning sun in every window. ☀️',
    cloudy:
      'Day {day} eases in beneath soft clouds. The house is taking its sweet time waking up. ☁️',
    rainy: 'Day {day} wakes to rain at the windows, with hot cocoa waiting in the kitchen. ☕',
    misty: 'Day {day} opens under a soft veil of mist. The house feels hushed and close. 🌫️',
    snowy: 'Day {day} arrives with quiet snow drifting past the windows. ❄️',
    stormy: 'Day {day} begins beneath a distant rumble. The house feels electric. ⚡',
  },
  week_end: {
    sunset: 'Day {day} settles into golden hour. Everything else can wait until morning. 🌇',
    starry:
      'Day {day} winds down beneath a clear, quiet sky. Even the game feels far away for a moment. ✨',
    rainy: 'Day {day} ends with rain on the glass and a warm kettle humming somewhere inside. ☕',
    misty: 'Day {day} fades into a silver mist. The house exhales and quiets down. 🌫️',
    snowy: 'Day {day} closes with snow settling softly outside the house. ❄️',
    stormy: 'Day {day} ends with thunder rolling somewhere beyond the walls. ⚡',
  },
} as const

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
  const offset = hashText(gameId) % 6
  const index = (offset + Math.max(0, week - 1)) % 6
  if (phase === 'week_start') {
    return (['sunny', 'cloudy', 'rainy', 'misty', 'snowy', 'stormy'] as const)[index]
  }
  if (phase === 'week_end') {
    return (['sunset', 'starry', 'rainy', 'misty', 'snowy', 'stormy'] as const)[index]
  }
  return null
}

/**
 * Daily cards keep their warm, varied copy in a single wrap-safe treatment.
 * The message may use several lines inside the fixed faux-TV viewport, but it
 * never adds a separate paragraph that can shift the roster on short screens.
 */
export function getDailyTransitionTitle(input: {
  atmosphere: DailyAtmosphere | null
  phase: Phase
  week: number
}): string | null {
  if (!input.atmosphere || (input.phase !== 'week_start' && input.phase !== 'week_end')) {
    return null
  }

  const titles = DAILY_TRANSITION_TITLES[input.phase]
  const title = titles[input.atmosphere as keyof typeof titles]
  return title?.replace('{day}', String(input.week)) ?? null
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
