import type { BroadcastOverride, Phase, Player } from '../types'
import type { RelationshipsMap } from '../social/types'
import { getBroadcastTemplate } from './broadcastTemplateCatalog'
import {
  getDayEndAtmosphere,
  getDayStartAtmosphere,
  getWeatherTransitionTitle,
  resolveWeatherDay,
  type WeatherPresentationAtmosphere,
} from '../weather/weatherEngine'

export type DayStartAtmosphere = WeatherPresentationAtmosphere
export type DayEndAtmosphere = WeatherPresentationAtmosphere
export type DailyAtmosphere = WeatherPresentationAtmosphere

let latestTitleSeed = 'weather'

/**
 * Resolve one stable weather state for the game day. Consecutive days may keep
 * exactly the same condition; the transition matrix deliberately favours
 * persistence and nearby weather families rather than forced rotation.
 */
export function getDailyAtmosphere(
  gameId: string | undefined,
  week: number,
  phase: Phase,
  depression?: { activeDay?: number; recoveryWeek?: number | null }
): DailyAtmosphere | null {
  if (phase !== 'week_start' && phase !== 'week_end') return null
  latestTitleSeed = `${gameId ?? 'preview-game'}:${week}:${phase}`

  // Depression Shock remains an authored narrative override above ordinary weather.
  if (depression?.activeDay && depression.activeDay > 0) return 'stormy'
  if (depression?.recoveryWeek === week) return 'rainbow'

  const weatherDay = resolveWeatherDay(gameId, week)
  return phase === 'week_start'
    ? getDayStartAtmosphere(weatherDay)
    : getDayEndAtmosphere(gameId, weatherDay)
}

/**
 * Daily cards remain deliberately compact. Temperature and the more playful
 * contextual observation are reserved for the one mid/late-day weather bulletin.
 */
export function getDailyTransitionTitle(input: {
  atmosphere: DailyAtmosphere | null
  phase: Phase
  week: number
}): string | null {
  if (!input.atmosphere || (input.phase !== 'week_start' && input.phase !== 'week_end')) {
    return null
  }
  return getWeatherTransitionTitle({
    atmosphere: input.atmosphere,
    phase: input.phase,
    day: input.week,
    seedKey: `${latestTitleSeed}:${input.atmosphere}`,
  })
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

/**
 * The legacy mood-copy hook is kept for Broadcast Manager compatibility. New
 * compound weather presentations map to the closest existing mood source.
 */
function moodTemplateAtmosphere(
  atmosphere: DailyAtmosphere,
  phase: 'week_start' | 'week_end'
): string {
  if (atmosphere === 'rainbow') return 'rainbow'
  if (phase === 'week_end') {
    if (atmosphere === 'starry' || atmosphere === 'sunset') return atmosphere
    if (atmosphere === 'stormy') return 'stormy'
    if (atmosphere === 'snowy' || atmosphere === 'snow_showers') return 'snowy'
    if (atmosphere === 'misty' || atmosphere === 'foggy') return 'misty'
    if (
      atmosphere === 'rainy' ||
      atmosphere === 'heavy_rain' ||
      atmosphere === 'drizzle' ||
      atmosphere === 'light_showers' ||
      atmosphere === 'sun_showers'
    )
      return 'rainy'
    return 'sunset'
  }

  if (atmosphere === 'sunny' || atmosphere === 'mostly_sunny') return 'sunny'
  if (
    atmosphere === 'rainy' ||
    atmosphere === 'heavy_rain' ||
    atmosphere === 'drizzle' ||
    atmosphere === 'light_showers' ||
    atmosphere === 'sun_showers'
  )
    return 'rainy'
  if (atmosphere === 'misty' || atmosphere === 'foggy') return 'misty'
  if (atmosphere === 'snowy' || atmosphere === 'snow_showers') return 'snowy'
  if (atmosphere === 'stormy') return 'stormy'
  return 'cloudy'
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
  const sourceAtmosphere = moodTemplateAtmosphere(input.atmosphere, input.phase)
  const templateId = `week.${moment}-mood.${sourceAtmosphere}`
  const template = getBroadcastTemplate(templateId)
  const override = input.overrides?.[templateId]
  if (!template || override?.disabled) return null
  const friend = closestLivingHousemate(input.players, input.relationships, input.week)
  return (override?.text ?? template.text).replaceAll(
    '{friend}',
    friend?.name ?? 'a thoughtful housemate'
  )
}
