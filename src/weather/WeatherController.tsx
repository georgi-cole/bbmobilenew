import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { addTvEvent } from '../store/gameSlice'
import { buildWeatherBulletin, resolveWeatherDay } from './weatherEngine'
import { getWeatherRuntime, loadWeatherRuntime } from './weatherRuntime'
import {
  formatSystemWeatherTemperature,
  normaliseWeatherBulletinUnits,
} from './weatherTemperatureUnit'
import './WeatherEnhancements.css'

const WEATHER_REFRESH_MS = 5 * 60 * 1000

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
  const players = useAppSelector((state) => state.game.players)
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

  // A normal social_2 line (for example the finalists' pitches) owns the TV
  // before weather. Managed events that have already been consumed do not
  // count; neither does the weather bulletin itself.
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

    // Refresh externally managed data opportunistically, but never make the
    // gameplay beat wait on the network. The validated cache (or bundled
    // fallback) resolves the bulletin synchronously.
    void loadWeatherRuntime()

    const weatherDay = resolveWeatherDay(gameId, week)
    const recoveryRainbow = depressionShock?.recoveryWeek === week
    const configuredUnit = getWeatherRuntime()?.config.temperature.unit ?? 'auto'
    const rawComment = buildWeatherBulletin({
      gameId,
      day: weatherDay,
      players,
      ...(recoveryRainbow ? { forcePhenomenon: 'rainbow' as const } : {}),
    })
    const comment = normaliseWeatherBulletinUnits(rawComment, {
      temperatureC: weatherDay.temperatureC,
      deltaC: weatherDay.deltaC,
      configuredUnit,
    })
    const temperature = formatSystemWeatherTemperature(weatherDay.temperatureC, configuredUnit)
    const text =
      comment.includes('°C') || comment.includes('°F') ? comment : `${temperature} · ${comment}`

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
  }, [
    depressionShock,
    dispatch,
    gameId,
    phase,
    players,
    weatherAlreadyExists,
    week,
  ])

  // If social_2 has no authored social beat, retain the old behavior and show
  // weather immediately. Otherwise the social copy gets the viewport first.
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

  // When a normal social line is already on screen, its Play press becomes the
  // explicit handoff to weather. Preventing the generic advance here keeps the
  // game in social_2 for exactly one more TV beat. The next Play is handled by
  // TvZone: it consumes the weather queue item and advances normally.
  useEffect(() => {
    if (phase !== 'social_2') return undefined
    if ((depressionShock?.activeDay ?? 0) > 0) return undefined
    if (weatherAlreadyExists || !currentSocialBeatExists) return undefined

    const handlePlay = (event: Event) => {
      // A real managed broadcast has priority over weather and must receive its
      // own Play press first.
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
