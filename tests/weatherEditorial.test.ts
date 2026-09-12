import { describe, expect, it } from 'vitest'
import { classifyWeatherEditorial } from '../src/weather/weatherEditorial'

describe('weather editorial presentation', () => {
  it('keeps ordinary daily weather ambient and nonblocking', () => {
    expect(
      classifyWeatherEditorial({
        condition: 'sunny',
        temperatureC: 22,
        recoveryRainbow: false,
        shockCondition: null,
      })
    ).toEqual({
      noteworthy: false,
      presentationMode: 'ambient',
      forceOnTv: false,
      reason: 'ambient',
    })
  })

  it.each(['stormy', 'heavy_rain', 'snowy', 'snow_showers'] as const)(
    'keeps %s eligible for foreground weather programming',
    (condition) => {
      const result = classifyWeatherEditorial({
        condition,
        temperatureC: 5,
        recoveryRainbow: false,
        shockCondition: null,
      })
      expect(result.noteworthy).toBe(true)
      expect(result.presentationMode).toBe('foreground')
      expect(result.forceOnTv).toBe(true)
      expect(result.reason).toBe('severe_condition')
    }
  )

  it('treats unusual temperature events as noteworthy', () => {
    expect(
      classifyWeatherEditorial({
        condition: 'sunny',
        temperatureC: 36,
        recoveryRainbow: false,
        shockCondition: null,
      }).reason
    ).toBe('temperature_extreme')
  })

  it('preserves Depression Shock weather as foreground campaign programming', () => {
    expect(
      classifyWeatherEditorial({
        condition: 'rainy',
        temperatureC: 14,
        recoveryRainbow: false,
        shockCondition: 'rainy',
      })
    ).toMatchObject({
      noteworthy: true,
      presentationMode: 'foreground',
      forceOnTv: true,
      reason: 'campaign_weather',
    })
  })

  it('preserves the recovery rainbow as a foreground environmental moment', () => {
    expect(
      classifyWeatherEditorial({
        condition: 'clearing',
        temperatureC: 18,
        recoveryRainbow: true,
        shockCondition: null,
        phenomenon: 'rainbow',
      })
    ).toMatchObject({
      noteworthy: true,
      presentationMode: 'foreground',
      forceOnTv: true,
      reason: 'rainbow',
    })
  })
})
