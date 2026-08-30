import { describe, expect, it } from 'vitest'
import {
  resolveWeatherRuntimeUrls,
  sanitiseWeatherBank,
  sanitiseWeatherConfig,
} from '../weatherRuntime'

describe('weather remote data validation', () => {
  it('uses build-local weather assets on web and remote assets in native builds', () => {
    expect(
      resolveWeatherRuntimeUrls({ isDev: false, isNative: false, baseUrl: '/bbmobilenew/' })
    ).toEqual({
      configUrl: '/bbmobilenew/config/weather-config.json',
      defaultBankUrl: '/bbmobilenew/config/weather-bank.json',
    })

    expect(resolveWeatherRuntimeUrls({ isDev: false, isNative: true })).toEqual({
      configUrl: 'https://georgi-cole.github.io/bbmobilenew/config/weather-config.json',
      defaultBankUrl: 'https://georgi-cole.github.io/bbmobilenew/config/weather-bank.json',
    })

    expect(
      resolveWeatherRuntimeUrls({ isDev: true, isNative: false, baseUrl: '/bbmobilenew/' })
    ).toEqual({
      configUrl: '/bbmobilenew/config/weather-config.json',
      defaultBankUrl: '/bbmobilenew/config/weather-bank.json',
    })
  })

  it('keeps valid transition rules and clamps unsafe values', () => {
    const config = sanitiseWeatherConfig({
      schemaVersion: 2,
      revision: 'test-weather',
      enabled: true,
      temperature: {
        unit: 'auto',
        baseC: 18,
        minC: -8,
        maxC: 36,
        initialJitterC: 7,
        dailyDeltaMinC: -4,
        dailyDeltaMaxC: 4,
      },
      phenomena: { rainbowChanceAfterWet: 4 },
      conditions: {
        sunny: {
          family: 'clear',
          initialWeight: 12,
          transitions: { sunny: 30, partly_cloudy: 20, made_up_weather: 999 },
        },
        partly_cloudy: {
          family: 'cloud',
          initialWeight: 14,
          transitions: { partly_cloudy: 30, cloudy: 20 },
        },
        cloudy: {
          family: 'cloud',
          initialWeight: 14,
          transitions: { cloudy: 30, rainy: 20 },
        },
        rainy: {
          family: 'wet',
          initialWeight: 8,
          transitions: { rainy: 30, clearing: 20 },
        },
      },
    })

    expect(config).not.toBeNull()
    expect(config?.phenomena.rainbowChanceAfterWet).toBe(1)
    expect(config?.conditions.sunny?.transitions.sunny).toBe(30)
    expect(
      (config?.conditions.sunny?.transitions as Record<string, number | undefined>).made_up_weather
    ).toBeUndefined()
  })

  it('rejects a weather config that cannot provide a useful condition set', () => {
    expect(
      sanitiseWeatherConfig({
        schemaVersion: 2,
        temperature: { unit: 'auto' },
        phenomena: {},
        conditions: {
          sunny: { family: 'clear', initialWeight: 1, transitions: {} },
        },
      })
    ).toBeNull()
  })

  it('sanitises externally authored copy and bulletin eligibility rules', () => {
    const bank = sanitiseWeatherBank({
      schemaVersion: 2,
      revision: 'test-bank',
      dayStartTitles: {
        sunny: ['Day {day} is bright.'],
        cloudy: ['Cloud over Day {day}.'],
        rainy: ['Rain on Day {day}.'],
        clearing: ['The sky is clearing.'],
      },
      dayEndTitles: {
        sunset: ['Day {day} closes in gold.'],
      },
      bulletins: [
        {
          id: 'rain-streak',
          text: '{temp} · Rain again - {streak} days in a row.',
          conditions: ['rainy', 'not_real'],
          minStreak: 3,
          weight: 2,
        },
        { id: 'warm', text: 'A warmer afternoon.', minDeltaC: 2 },
        { id: 'cool', text: 'A cooler afternoon.', maxDeltaC: -2 },
        { id: 'rainbow', text: 'A rainbow appeared.', phenomenon: 'rainbow' },
      ],
    })

    expect(bank).not.toBeNull()
    expect(bank?.bulletins).toHaveLength(4)
    expect(bank?.bulletins[0]?.conditions).toEqual(['rainy'])
    expect(bank?.bulletins[0]?.minStreak).toBe(3)
    expect(bank?.bulletins[3]?.phenomenon).toBe('rainbow')
  })
})
