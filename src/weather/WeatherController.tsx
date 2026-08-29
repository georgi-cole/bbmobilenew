import { useEffect, useRef } from 'react'
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
    // Some externally authored variants naturally include {temp}; otherwise
    // prepend the reading so the log remains useful even though the faux TV
    // presents the same data as a compact weather card.
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
