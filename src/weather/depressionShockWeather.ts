import { depressionShockUnitRoll } from '../features/twists/depressionShock'
import { getDepressionShockLifecycleForGame } from '../features/twists/depressionShockLifecycle'
import type { WeatherConditionId } from './weatherRuntime'

export const DEPRESSION_SHOCK_WEATHER_CONDITIONS = [
  'overcast',
  'drizzle',
  'light_showers',
  'rainy',
  'heavy_rain',
  'stormy',
] as const satisfies readonly WeatherConditionId[]

/**
 * The two active shock days may only present wet, dark or stormy weather.
 * Selection stays deterministic per game/day so reloads cannot reroll it.
 */
export function getDepressionShockWeatherCondition(
  gameId: string,
  week: number
): WeatherConditionId | null {
  const lifecycle = getDepressionShockLifecycleForGame(gameId, week)
  if (lifecycle !== 'day1' && lifecycle !== 'day2') return null

  const index = Math.floor(
    depressionShockUnitRoll(`${gameId}|${week}|depression-shock-weather`) *
      DEPRESSION_SHOCK_WEATHER_CONDITIONS.length
  )
  return DEPRESSION_SHOCK_WEATHER_CONDITIONS[index] ?? 'rainy'
}
