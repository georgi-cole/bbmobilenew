import type { WeatherConditionId } from './weatherRuntime'

export interface WeatherBulletinMetrics {
  feelsLikeC: number
  humidityPct: number
  windKmh: number
  sunrise: string
  sunset: string
}

type Range = readonly [number, number]

const HUMIDITY_RANGES: Record<WeatherConditionId, Range> = {
  sunny: [34, 52],
  mostly_sunny: [38, 57],
  partly_cloudy: [44, 64],
  cloudy: [55, 73],
  overcast: [62, 80],
  misty: [76, 90],
  foggy: [86, 97],
  drizzle: [76, 91],
  light_showers: [70, 88],
  sun_showers: [62, 82],
  rainy: [78, 94],
  heavy_rain: [86, 97],
  stormy: [74, 92],
  snow_showers: [70, 87],
  snowy: [76, 91],
  clearing: [50, 70],
}

const WIND_RANGES: Record<WeatherConditionId, Range> = {
  sunny: [4, 11],
  mostly_sunny: [5, 13],
  partly_cloudy: [7, 16],
  cloudy: [7, 17],
  overcast: [8, 20],
  misty: [3, 10],
  foggy: [2, 8],
  drizzle: [6, 15],
  light_showers: [9, 21],
  sun_showers: [9, 20],
  rainy: [11, 24],
  heavy_rain: [16, 31],
  stormy: [22, 39],
  snow_showers: [10, 22],
  snowy: [8, 18],
  clearing: [7, 17],
}

const CONDITION_FEELS_ADJUSTMENT: Record<WeatherConditionId, number> = {
  sunny: 1,
  mostly_sunny: 1,
  partly_cloudy: 0,
  cloudy: -1,
  overcast: -1,
  misty: -1,
  foggy: -1,
  drizzle: -1,
  light_showers: -1,
  sun_showers: 0,
  rainy: -2,
  heavy_rain: -2,
  stormy: -3,
  snow_showers: -2,
  snowy: -2,
  clearing: 0,
}

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededUnit(seed: string): number {
  let value = hashText(seed) || 0x6d2b79f5
  value += 0x6d2b79f5
  let t = value
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function seededInt(seed: string, [min, max]: Range): number {
  return Math.round(min + seededUnit(seed) * (max - min))
}

function formatClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Presentation-only game-world weather metrics. They are deterministic for a
 * game/day and condition, so the bulletin remains stable without pretending to
 * be a live external weather service.
 */
export function deriveWeatherBulletinMetrics({
  gameId,
  day,
  condition,
  temperatureC,
}: {
  gameId: string
  day: number
  condition: WeatherConditionId
  temperatureC: number
}): WeatherBulletinMetrics {
  const prefix = `${gameId}:weather-bulletin:${day}:${condition}`
  const humidityPct = seededInt(`${prefix}:humidity`, HUMIDITY_RANGES[condition])
  const windKmh = seededInt(`${prefix}:wind`, WIND_RANGES[condition])

  let feelsLikeC = temperatureC + CONDITION_FEELS_ADJUSTMENT[condition]
  if (temperatureC >= 25 && humidityPct >= 70) feelsLikeC += 1
  if (temperatureC <= 5 && windKmh >= 18) feelsLikeC -= 1
  feelsLikeC = Math.round(feelsLikeC)

  // The game does not run on a real-world calendar. Keep daylight times within
  // a believable stable range and vary them subtly by game/day.
  const sunriseMinutes = seededInt(`${prefix}:sunrise`, [6 * 60 + 42, 7 * 60 + 18])
  const sunsetMinutes = seededInt(`${prefix}:sunset`, [18 * 60 + 52, 19 * 60 + 34])

  return {
    feelsLikeC,
    humidityPct,
    windKmh,
    sunrise: formatClock(sunriseMinutes),
    sunset: formatClock(sunsetMinutes),
  }
}
