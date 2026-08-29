import { describe, expect, it } from 'vitest'
import { deriveWeatherBulletinMetrics } from '../weatherBulletinMetrics'

describe('deriveWeatherBulletinMetrics', () => {
  it('is stable for the same game day and condition', () => {
    const input = {
      gameId: 'game-a',
      day: 4,
      condition: 'heavy_rain' as const,
      temperatureC: 12,
    }

    expect(deriveWeatherBulletinMetrics(input)).toEqual(deriveWeatherBulletinMetrics(input))
  })

  it('keeps generated metrics in plausible presentation ranges', () => {
    const metrics = deriveWeatherBulletinMetrics({
      gameId: 'game-b',
      day: 2,
      condition: 'stormy',
      temperatureC: 14,
    })

    expect(metrics.humidityPct).toBeGreaterThanOrEqual(74)
    expect(metrics.humidityPct).toBeLessThanOrEqual(92)
    expect(metrics.windKmh).toBeGreaterThanOrEqual(22)
    expect(metrics.windKmh).toBeLessThanOrEqual(39)
    expect(metrics.sunrise).toMatch(/^0[67]:\d{2}$/)
    expect(metrics.sunset).toMatch(/^19:\d{2}$|^18:\d{2}$/)
    expect(metrics.feelsLikeC).toBeLessThan(14)
  })

  it('varies supporting metrics across game days without rerender randomness', () => {
    const dayOne = deriveWeatherBulletinMetrics({
      gameId: 'game-c',
      day: 1,
      condition: 'sunny',
      temperatureC: 24,
    })
    const dayTwo = deriveWeatherBulletinMetrics({
      gameId: 'game-c',
      day: 2,
      condition: 'sunny',
      temperatureC: 24,
    })

    expect(dayOne).not.toEqual(dayTwo)
  })
})
