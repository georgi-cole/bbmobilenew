import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { addTvEvent } from '../store/gameSlice'
import { getDepressionShockLifecycleForGame } from '../features/twists/depressionShockLifecycle'
import { resolveWeatherDay } from './weatherEngine'
import { getDepressionShockWeatherCondition } from './depressionShockWeather'
import { getWeatherRuntime, loadWeatherRuntime, type WeatherConditionId } from './weatherRuntime'
import { formatSystemWeatherTemperature } from './weatherTemperatureUnit'
import './WeatherEnhancements.css'

const WEATHER_REFRESH_MS = 5 * 60 * 1000

const PRE_ELIMINATION_WEATHER_COPY: Record<WeatherConditionId, string> = {
  sunny:
    'Clear skies outside. Inside, players keep their cards close as the live elimination draws nearer.',
  mostly_sunny:
    'Bright spells linger outside. Inside, players keep their cards close as the live elimination draws nearer.',
  partly_cloudy:
    'Sun and cloud trade places outside while tension quietly builds ahead of the live elimination.',
  cloudy:
    'Cloud hangs over the hub as conversations grow more careful ahead of the live elimination.',
  overcast:
    'A grey sky settles in, and the mood inside feels just as heavy ahead of the live elimination.',
  misty: 'Mist gathers outside while uncertainty builds inside ahead of the live elimination.',
  foggy: 'Fog presses against the windows as the hub grows quieter ahead of the live elimination.',
  drizzle:
    'A fine drizzle taps the windows while nerves begin to rise ahead of the live elimination.',
  light_showers: 'Showers pass over the hub as attention turns toward the live elimination.',
  sun_showers: 'Sun breaks through passing rain while the hub waits for the live elimination.',
  rainy: 'Rain keeps falling outside while nerves rise inside ahead of the live elimination.',
  heavy_rain:
    "It's pouring outside, and the mood inside is no lighter as the live elimination closes in.",
  stormy: 'Thunder rolls outside while tension builds inside ahead of the live elimination.',
  snow_showers:
    'Snow showers drift past the windows as the hub settles into an uneasy calm before the live elimination.',
  snowy: 'Snow settles quietly outside while tension builds inside ahead of the live elimination.',
  clearing:
    'The clouds begin to break outside, but inside the game remains unsettled ahead of the live elimination.',
}

/**
 * Loads remotely managed weather data and adds exactly one compact weather
 * bulletin during the existing late-day social_2 beat. Weather never steals
 * the viewport from the social message that introduces the beat: when one is
 * present, the player's next Play press deliberately reveals weather first.
 */
export default function WeatherController() {
  const dispatch = useAppDispatch()
  const gameId = useAppSelector((state) => state.game.gameId)
  const week = useAppSelector((state) => state.game.week)
  const phase = useAppSelector((state) => state.game.phase)
  const tvFeed = useAppSelector((state) => state.game.tvFeed)
  const broadcastQueue = useAppSelector((state) => state.game.broadcastQueue ?? [])
  const pendingKeyRef = useRef<string | null>(null)

  useEffect(() => {
    void loadWeatherRuntime()
    const refreshId = window.setInterval(() => {
      void loadWeatherRuntime()
    }, WEATHER_REFRESH_MS)
    return () => window.clearInterval(refreshId)
  }, [])

  const weatherAlreadyExists = useMemo(
    () =>
      tvFeed.some(
        (event) => event.meta?.weatherBulletinDay === week && event.meta?.weatherBulletin === true
      ),
    [tvFeed, week]
  )

  const currentSocialBeatExists = useMemo(
    () =>
      tvFeed.some(
        (event) =>
          event.type === 'social' &&
          event.meta?.phase === 'social_2' &&
          event.meta?.week === week &&
          event.meta?.weatherBulletin !== true &&
          event.meta?.broadcastConsumed !== true
      ),
    [tvFeed, week]
  )

  const publishWeatherBulletin = useCallback(() => {
    if (phase !== 'social_2' || weatherAlreadyExists) return

    const key = `${gameId}:${week}`
    if (pendingKeyRef.current === key) return
    pendingKeyRef.current = key

    void loadWeatherRuntime()

    const weatherDay = resolveWeatherDay(gameId, week)
    const lifecycle = getDepressionShockLifecycleForGame(gameId, week)
    const shockCondition = getDepressionShockWeatherCondition(gameId, week)
    const displayedCondition = shockCondition ?? weatherDay.condition
    const recoveryRainbow = lifecycle === 'recovery'
    const configuredUnit = getWeatherRuntime()?.config.temperature.unit ?? 'auto'
    const temperature = formatSystemWeatherTemperature(weatherDay.temperatureC, configuredUnit)
    const narrative = recoveryRainbow
      ? 'A rainbow breaks through outside while the hub turns its attention toward the live elimination.'
      : PRE_ELIMINATION_WEATHER_COPY[displayedCondition]
    const text = `${temperature} · ${narrative}`

    dispatch(
      addTvEvent({
        text,
        type: 'social',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: {
          phase: 'social_2',
          week,
          broadcastTemplateId: 'weather.daily-bulletin',
          // Queue this behind the final-pitches beat before that beat is
          // consumed. This makes the handoff atomic: Play moves directly
          // from pitches to weather with no empty/fallback TV render.
          broadcastOrder: 20000,
          broadcastLevel: 'minor',
          forceOnTv: true,
          weatherBulletin: true,
          weatherBulletinDay: week,
          weatherCondition: displayedCondition,
          weatherTemperatureC: weatherDay.temperatureC,
          ...(recoveryRainbow || (!shockCondition && weatherDay.phenomenon === 'rainbow')
            ? { weatherPhenomenon: 'rainbow' }
            : {}),
        },
      })
    )
    pendingKeyRef.current = null
  }, [dispatch, gameId, phase, weatherAlreadyExists, week])

  useEffect(() => {
    if (phase !== 'social_2') return
    if (weatherAlreadyExists || pendingKeyRef.current === `${gameId}:${week}`) return
    if (currentSocialBeatExists || broadcastQueue.length === 0) {
      publishWeatherBulletin()
    }
  }, [
    broadcastQueue.length,
    currentSocialBeatExists,
    gameId,
    phase,
    publishWeatherBulletin,
    weatherAlreadyExists,
    week,
  ])

  useEffect(() => {
    if (phase !== 'social_2') return undefined
    if (weatherAlreadyExists || !currentSocialBeatExists) return undefined

    const handlePlay = (event: Event) => {
      if (broadcastQueue.length > 0 || event.defaultPrevented) return
      event.preventDefault()
      publishWeatherBulletin()
    }

    window.addEventListener('ui:playPressed', handlePlay, { capture: true })
    return () => window.removeEventListener('ui:playPressed', handlePlay, { capture: true })
  }, [
    broadcastQueue.length,
    currentSocialBeatExists,
    phase,
    publishWeatherBulletin,
    weatherAlreadyExists,
  ])

  return null
}
