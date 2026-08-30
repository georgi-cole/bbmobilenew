import { beforeEach, describe, expect, it } from 'vitest'
import { getDailyAtmosphere } from '../../../broadcasting/dailyMoodSystem'
import {
  clearDepressionShockRuntimeForTests,
  createInitialDepressionShockState,
  decorateDepressionShockFauxTvText,
  saveDepressionShockState,
} from '../depressionShock'
import {
  buildLegacyDepressionShockMirror,
  getDepressionShockLifecyclePhase,
  isDepressionShockRecoveryPresentationPending,
} from '../depressionShockLifecycle'
import {
  DEPRESSION_SHOCK_WEATHER_CONDITIONS,
  getDepressionShockWeatherCondition,
} from '../../../weather/depressionShockWeather'

const gameId = 'depression-shock-lifecycle-hardening'

function activeShock(activatedDay = 7) {
  return saveDepressionShockState({
    ...createInitialDepressionShockState(gameId),
    status: 'active',
    rollPassed: true,
    activatedDay,
    introSeen: true,
  })
}

describe('Depression Shock lifecycle hardening', () => {
  beforeEach(() => clearDepressionShockRuntimeForTests(gameId))

  it('derives Day 1, Day 2 and recovery from one persisted lifecycle', () => {
    const state = activeShock(7)

    expect(getDepressionShockLifecyclePhase(state, 7)).toBe('day1')
    expect(getDepressionShockLifecyclePhase(state, 8)).toBe('day2')
    expect(getDepressionShockLifecyclePhase(state, 9)).toBe('recovery')
    expect(getDepressionShockLifecyclePhase(state, 10)).toBe('inactive')
  })

  it('keeps the legacy social mirror active for both shock days only', () => {
    const state = activeShock(7)

    expect(buildLegacyDepressionShockMirror(state, 7).activeDay).toBe(1)
    expect(buildLegacyDepressionShockMirror(state, 8).activeDay).toBe(2)
    expect(buildLegacyDepressionShockMirror(state, 9).activeDay).toBe(0)
  })

  it('forces every active-day weather surface into the depressive weather set', () => {
    activeShock(7)

    const dayOne = getDepressionShockWeatherCondition(gameId, 7)
    const dayTwo = getDepressionShockWeatherCondition(gameId, 8)

    expect(DEPRESSION_SHOCK_WEATHER_CONDITIONS).toContain(dayOne)
    expect(DEPRESSION_SHOCK_WEATHER_CONDITIONS).toContain(dayTwo)
    expect(DEPRESSION_SHOCK_WEATHER_CONDITIONS).not.toContain('sunny')
    expect(DEPRESSION_SHOCK_WEATHER_CONDITIONS).not.toContain('mostly_sunny')
    expect(DEPRESSION_SHOCK_WEATHER_CONDITIONS).not.toContain('sun_showers')
    expect(getDepressionShockWeatherCondition(gameId, 9)).toBeNull()
  })

  it('keeps day-start/day-end cards stormy on both active days and allows recovery after', () => {
    activeShock(7)

    expect(getDailyAtmosphere(gameId, 7, 'week_start')).toBe('stormy')
    expect(getDailyAtmosphere(gameId, 7, 'week_end')).toBe('stormy')
    expect(getDailyAtmosphere(gameId, 8, 'week_start')).toBe('stormy')
    expect(getDailyAtmosphere(gameId, 8, 'week_end')).toBe('stormy')
    expect(getDailyAtmosphere(gameId, 9, 'week_start')).toBe('rainbow')
  })

  it('gives the recovery cinematic fullscreen priority only while it is unresolved', () => {
    const state = activeShock(7)
    expect(isDepressionShockRecoveryPresentationPending(state, 9)).toBe(true)

    const completed = saveDepressionShockState({
      ...state,
      status: 'completed',
      endingSeen: true,
      completedDay: 9,
    })
    expect(isDepressionShockRecoveryPresentationPending(completed, 9)).toBe(false)
  })

  it('does not mechanically repeat melancholic Faux TV endings', () => {
    const base = 'A normal house update.'
    const outputs = Array.from({ length: 40 }, (_, index) =>
      decorateDepressionShockFauxTvText(base, 'day1', `${gameId}|7|message-${index}`)
    )
    const suffixes = outputs
      .map((output) => output.split('\n\n')[1] ?? null)
      .filter((suffix): suffix is string => Boolean(suffix))

    expect(outputs.some((output) => output === base)).toBe(true)
    expect(suffixes.length).toBeGreaterThan(0)
    suffixes.forEach((suffix, index) => {
      expect(suffixes.slice(Math.max(0, index - 3), index)).not.toContain(suffix)
    })
  })
})
