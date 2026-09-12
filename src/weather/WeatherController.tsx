import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { addTvEvent } from '../store/gameSlice'
import { getDepressionShockLifecycleForGame } from '../features/twists/depressionShockLifecycle'
import { resolveWeatherDay } from './weatherEngine'
import { getDepressionShockWeatherCondition } from './depressionShockWeather'
import { getWeatherRuntime, loadWeatherRuntime, type WeatherConditionId } from './weatherRuntime'
import { formatSystemWeatherTemperature } from './weatherTemperatureUnit'
import { classifyWeatherEditorial } from './weatherEditorial'
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
 * Loads remotely managed weather data and adds exactly one compact bulletin
 * during social_2. Ordinary weather waits for the existing foreground beat to
 * clear, then becomes ambient viewport copy without stealing another Play.
 * Exceptional/campaign weather keeps the existing managed foreground handoff.
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

  const weatherSnapshot = useMemo(() => {
    const weatherDay = resolveWeatherDay(gameId, week)
    const lifecycle = getDepressionShockLifecycleForGame(gameId, week)
    const shockCondition = getDepressionShockWeatherCondition(gameId, week)
    const displayedCondition = shockCondition ?? weatherDay.condition
    const recoveryRainbow = lifecycle === 'recovery'
    const editorial = classifyWeatherEditorial({
      condition: displayedCondition,
      temperatureC: weatherDay.temperatureC,
      recoveryRainbow,
      shockCondition,
      phenomenon: weatherDay.phenomenon,
    })
    return { weatherDay, shockCondition, displayedCondition, recoveryRainbow, editorial }
  }, [gameId, phase, week])

  const publishWeatherBulletin = useCallback(() => {
    if (phase !== 'social_2' || weatherAlreadyExists) return

    const key = `${gameId}:${week}`
    if (pendingKeyRef.current === key) return
    pendingKeyRef.current = key

    void loadWeatherRuntime()

    const { weatherDay, shockCondition, displayedCondition, recoveryRainbow, editorial } =
      weatherSnapshot
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
          broadcastOrder: 20000,
          broadcastLevel: 'minor',
          ...(editorial.forceOnTv ? { forceOnTv: true } : {}),
          editorial: {
            importance: 'optional',
            presentationMode: editorial.presentationMode,
            category: 'hub_conditions',
            sensitivity: 'public',
            storyKey: `weather:${gameId}:${week}`,
            cooldownKey: `weather:day:${week}`,
          },
          weatherBulletin: true,
          weatherBulletinDay: week,
          weatherCondition: displayedCondition,
          weatherTemperatureC: weatherDay.temperatureC,
          weatherEditorialReason: editorial.reason,
          ...(recoveryRainbow || (!shockCondition && weatherDay.phenomenon === 'rainbow')
            ? { weatherPhenomenon: 'rainbow' }
            : {}),
        },
      })
    )
    pendingKeyRef.current = null
  }, [dispatch, gameId, phase, weatherAlreadyExists, weatherSnapshot, week])

  useEffect(() => {
    if (phase !== 'social_2') return
    if (weatherAlreadyExists || pendingKeyRef.current === `${gameId}:${week}`) return

    if (weatherSnapshot.editorial.noteworthy) {
      if (currentSocialBeatExists || broadcastQueue.length === 0) publishWeatherBulletin()
      return
    }

    // Normal weather is deliberately nonblocking. Wait until the current
    // foreground beat and queue are clear, then let the bulletin become the
    // ambient TV fallback without intercepting the player's Play action.
    if (!currentSocialBeatExists && broadcastQueue.length === 0) {
      publishWeatherBulletin()
    }
  }, [
    broadcastQueue.length,
    currentSocialBeatExists,
    gameId,
    phase,
    publishWeatherBulletin,
    weatherAlreadyExists,
    weatherSnapshot.editorial.noteworthy,
    week,
  ])

  return null
}
