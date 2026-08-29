import { describe, expect, it } from 'vitest'
import type { Player } from '../../types'
import { getDailyAtmosphere, getDailyMoodCopy, getDailyTransitionTitle } from '../dailyMoodSystem'
import { clearWeatherHistoryForGame } from '../../weather/weatherEngine'

const players: Player[] = [
  { id: 'user', name: 'You', avatar: '', status: 'active', isUser: true },
  { id: 'lia', name: 'Lia', avatar: '', status: 'active' },
  { id: 'kai', name: 'Kai', avatar: '', status: 'active' },
]

describe('daily mood system', () => {
  it('is deterministic but allows the same weather on consecutive days', () => {
    const sequences = Array.from({ length: 120 }, (_, index) => {
      const gameId = `weather-persistence-${index}`
      clearWeatherHistoryForGame(gameId)
      return [1, 2, 3, 4, 5, 6].map((week) => getDailyAtmosphere(gameId, week, 'week_start'))
    })

    const repeated = sequences.some((sequence) =>
      sequence.some((atmosphere, index) => index > 0 && atmosphere === sequence[index - 1])
    )
    expect(repeated).toBe(true)

    const gameId = 'weather-deterministic'
    clearWeatherHistoryForGame(gameId)
    const first = [1, 2, 3, 4].map((week) => getDailyAtmosphere(gameId, week, 'week_start'))
    const second = [1, 2, 3, 4].map((week) => getDailyAtmosphere(gameId, week, 'week_start'))
    expect(second).toEqual(first)
  })

  it('supports nuanced weather presentations beyond the original six-state rotation', () => {
    const seen = new Set<string>()
    for (let index = 0; index < 180; index += 1) {
      const gameId = `weather-variety-${index}`
      clearWeatherHistoryForGame(gameId)
      seen.add(getDailyAtmosphere(gameId, 1, 'week_start') ?? '')
    }
    expect(
      ['mostly_sunny', 'partly_cloudy', 'overcast', 'drizzle', 'light_showers', 'sun_showers', 'clearing'].some(
        (atmosphere) => seen.has(atmosphere)
      )
    ).toBe(true)
  })

  it('uses compact, varied titles for day-transition atmospheres', () => {
    const startTitles = (['sunny', 'partly_cloudy', 'rainy'] as const).map((atmosphere) =>
      getDailyTransitionTitle({ atmosphere, phase: 'week_start', week: 2 })
    )
    const endTitles = (['sunset', 'cloudy', 'rainy'] as const).map((atmosphere) =>
      getDailyTransitionTitle({ atmosphere, phase: 'week_end', week: 2 })
    )

    expect(new Set(startTitles).size).toBe(3)
    expect(new Set(endTitles).size).toBe(3)
    expect(startTitles.every((title) => title?.includes('Day 2'))).toBe(true)
    expect(endTitles.every((title) => title?.includes('Day 2'))).toBe(true)
  })

  it('keeps Depression Shock authoritative over ordinary weather', () => {
    expect(
      getDailyAtmosphere('game-a', 5, 'week_start', { activeDay: 1, recoveryWeek: null })
    ).toBe('stormy')
    expect(getDailyAtmosphere('game-a', 6, 'week_start', { activeDay: 0, recoveryWeek: 6 })).toBe(
      'rainbow'
    )
  })

  it('uses manager copy and resolves the closest living housemate', () => {
    const copy = getDailyMoodCopy({
      atmosphere: 'rainy',
      phase: 'week_start',
      week: 2,
      players,
      relationships: {
        user: {
          lia: { affinity: 70, tags: [] },
          kai: { affinity: 10, tags: [] },
        },
      },
      overrides: {
        'week.day-start-mood.rainy': { text: 'A warm drink from {friend} is waiting.' },
      },
    })
    expect(copy).toBe('A warm drink from Lia is waiting.')
  })

  it('maps compound weather back to compatible legacy mood sources', () => {
    const copy = getDailyMoodCopy({
      atmosphere: 'sun_showers',
      phase: 'week_start',
      week: 3,
      players,
      overrides: {
        'week.day-start-mood.rainy': { text: 'A shower sent {friend} back inside.' },
      },
    })
    expect(copy).toBe('A shower sent Lia back inside.')
  })

  it('honours a disabled mood source in the Broadcast Manager', () => {
    expect(
      getDailyMoodCopy({
        atmosphere: 'starry',
        phase: 'week_end',
        week: 1,
        players,
        overrides: { 'week.day-end-mood.starry': { disabled: true } },
      })
    ).toBeNull()
  })
})
