import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { addTvEvent } from '../store/gameSlice'
import { buildWeatherBulletin, formatWeatherTemperature, resolveWeatherDay } from './weatherEngine'
import { loadWeatherRuntime } from './weatherRuntime'
import './WeatherEnhancements.css'

const WEATHER_REFRESH_MS = 5 * 60 * 1000

/**
 * Loads remotely managed weather data and adds exactly one compact weather
 * bulletin during the existing late-day social_2 beat. It never creates a new
 * game phase, modal or lifecycle stop.
 */
export default function WeatherController() {
  const dispatch = useAppDispatch()
  const gameId = useAppSelector((state) => state.game.gameId)
  const week = useAppSelector((state) => state.game.week)
  const phase = useAppSelector((state) => state.game.phase)
  const players = useAppSelector((state) => state.game.players)
  const tvFeed = useAppSelector((state) => state.game.tvFeed)
  const depressionShock = useAppSelector((state) => state.game.depressionShock)
  const pendingKeyRef = useRef<string | null>(null)

  useEffect(() => {
    void loadWeatherRuntime()
    const refreshId = window.setInterval(() => {
      void loadWeatherRuntime()
    }, WEATHER_REFRESH_MS)
    return () => window.clearInterval(refreshId)
  }, [])

  useEffect(() => {
    if (phase !== 'social_2') return

    // Depression Shock already owns this part of the day's narrative. Avoid
    // stacking a generic weather card on top of its authored melancholy beats.
    if ((depressionShock?.activeDay ?? 0) > 0) return

    const key = `${gameId}:${week}`
    const alreadyExists = tvFeed.some(
      (event) => event.meta?.weatherBulletinDay === week && event.meta?.weatherBulletin === true
    )
    if (alreadyExists || pendingKeyRef.current === key) return
    pendingKeyRef.current = key

    // Refresh externally managed data opportunistically, but never make the
    // gameplay beat wait on the network. The current validated cache (or safe
    // bundled fallback) can always resolve the bulletin synchronously.
    void loadWeatherRuntime()

    const weatherDay = resolveWeatherDay(gameId, week)
    const recoveryRainbow = depressionShock?.recoveryWeek === week
    const comment = buildWeatherBulletin({
      gameId,
      day: weatherDay,
      players,
      ...(recoveryRainbow ? { forcePhenomenon: 'rainbow' as const } : {}),
    })
    const temperature = formatWeatherTemperature(weatherDay.temperatureC)
    // Some externally authored variants naturally include {temp}; otherwise
    // prepend the reading so every once-daily bulletin fulfils the same promise.
    const text =
      comment.includes('°C') || comment.includes('°F') ? comment : `${temperature} · ${comment}`

    dispatch(
      addTvEvent({
        text,
        type: 'social',
        source: 'system',
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
  }, [dispatch, gameId, week, phase, players, tvFeed, depressionShock])

  return null
}
