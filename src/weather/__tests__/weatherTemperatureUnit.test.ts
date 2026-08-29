import { describe, expect, it } from 'vitest'
import {
  formatTemperatureForUnit,
  inferSystemTemperatureUnit,
  normaliseWeatherBulletinUnits,
} from '../weatherTemperatureUnit'

describe('weather temperature unit detection', () => {
  it('uses Fahrenheit only when locale and system timezone consistently point there', () => {
    expect(
      inferSystemTemperatureUnit({ languages: ['en-US'], timeZone: 'America/New_York' })
    ).toBe('f')
  })

  it('uses Celsius when an en-US language setting conflicts with a European system timezone', () => {
    expect(inferSystemTemperatureUnit({ languages: ['en-US'], timeZone: 'Europe/Sofia' })).toBe(
      'c'
    )
  })

  it('uses Celsius for an explicit European region and for ambiguous locale data', () => {
    expect(inferSystemTemperatureUnit({ languages: ['bg-BG'], timeZone: 'Europe/Sofia' })).toBe('c')
    expect(inferSystemTemperatureUnit({ languages: ['en'], timeZone: null })).toBe('c')
  })

  it('falls back to Celsius when mixed locale regions make Fahrenheit uncertain', () => {
    expect(
      inferSystemTemperatureUnit({
        languages: ['en-US', 'bg-BG'],
        timeZone: 'America/New_York',
      })
    ).toBe('c')
  })

  it('normalises already-expanded weather-bank copy to the selected unit', () => {
    expect(
      normaliseWeatherBulletinUnits('68°F · It is 9°F warmer than yesterday.', {
        temperatureC: 20,
        deltaC: 5,
        configuredUnit: 'c',
      })
    ).toBe('20°C · It is 5°C warmer than yesterday.')
    expect(formatTemperatureForUnit(20, 'f')).toBe('68°F')
  })
})
