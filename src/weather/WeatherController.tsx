import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { addTvEvent } from '../store/gameSlice'
import { resolveWeatherDay } from './weatherEngine'
import {
  getWeatherRuntime,
  loadWeatherRuntime,
  type WeatherConditionId,
} from './weatherRuntime'
import { formatSystemWeatherTemperature } from './weatherTemperatureUnit'
import './WeatherEnhancements.css'

const WEATHER_REFRESH_MS = 5 * 60 * 1000

const PRE_ELIMINATION_WEATHER_COPY: Record<WeatherConditionId, string> = {
  sunny: 'Clear skies hold outside, but inside the hub the calm feels deceptive as the live elimination draws closer.',
  mostly_sunny: 'Bright spells linger outside. Inside, players keep their cards close as the live elimination draws nearer.',
  partly_cloudy: 'Sun and cloud trade places outside while quiet conversations sharpen ahead of the live elimination.',
  cloudy: 'Cloud hangs low over the hub. Inside, the mood turns watchful as the live elimination approaches.',
  overcast: 'A flat grey sky settles over the hub while the room grows quieter ahead of the live elimination.',
  misty: 'Mist gathers outside, softening the view while strategy inside sharpens before the live elimination.',
  foggy: 'Fog presses against the windows. Inside, uncertainty is just as thick as the live elimination approaches.',
  drizzle: 'A fine drizzle taps at the windows while players weigh their last moves before the live elimination.',
  light_showers: 'Showers pass over the hub as conversations tighten and attention turns to the live elimination.',
  sun_showers: 'Sun breaks through passing rain, but inside the hub the pressure keeps building toward the live elimination.',
  rainy: 'Rain keeps falling outside while inside the hub every conversation feels more important before the live elimination.',
  heavy_rain: "It's pouring outside, and the mood inside is no lighter as the live elimination closes in.",
  stormy: 'Thunder rolls outside while tension gathers inside the hub ahead of the live elimination.',
  snow_showers: 'Snow showers drift past the windows while players keep a careful eye on one another before the live elimination.',
  snowy: 'Snow settles quietly outside, contrasting with the tension building inside before the live elimination.',
  clearing: 'The clouds begin to break outside, but inside the hub the pressure is still rising toward the live elimination.',
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
  const depressionShock = useAppSelector((state) => state.game.depressionShock)
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
    if ((depressionShock?.activeDay ?? 0) > 0) return

    const key = `${gameId}:${week}`
    if (pendingKeyRef.current === key) return
    pendingKeyRef.current = key

    void loadWeatherRuntime()

    const weatherDay = resolveWeatherDay(gameId, week)
    const recoveryRainbow = depressionShock?.recoveryWeek === week
    const configuredUnit = getWeatherRuntime()?.config.temperature.unit ?? 'auto'
    const temperature = formatSystemWeatherTemperature(weatherDay.temperatureC, configuredUnit)
    const narrative = recoveryRainbow
      ? 'A rainbow breaks through outside. Inside the hub, the brief lift in mood cannot quite hide the pressure of the live elimination.'
      : PRE_ELIMINATION_WEATHER_COPY[weatherDay.condition]
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
          broadcastOrder: 9500,
          broadcastLevel: 'minor',
          forceOnTv: true,
          weatherBulletin: true,
          weatherBulletinDay: week,
          weatherCondition: weatherDay.condition,
          weatherTemperatureC: weatherDay.temperatureC,
          ...(recoveryRainbow || weatherDay.phenomenon === 'rainbow'
            ? { weatherPhenomenon: 'rainbow' }
            : {}),
        },
      })
    )
    pendingKeyRef.current = null
  }, [depressionShock, dispatch, gameId, phase, weatherAlreadyExists, week])

  useEffect(() => {
    if (phase !== 'social_2') return
    if ((depressionShock?.activeDay ?? 0) > 0) return
    if (weatherAlreadyExists || pendingKeyRef.current === `${gameId}:${week}`) return
    if (broadcastQueue.length > 0 || currentSocialBeatExists) return
    publishWeatherBulletin()
  }, [
    broadcastQueue.length,
    currentSocialBeatExists,
    depressionShock,
    gameId,
    phase,
    publishWeatherBulletin,
    weatherAlreadyExists,
    week,
  ])

  useEffect(() => {
    if (phase !== 'social_2') return undefined
    if ((depressionShock?.activeDay ?? 0) > 0) return undefined
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
    depressionShock,
    phase,
    publishWeatherBulletin,
    weatherAlreadyExists,
  ])

  return null
}
