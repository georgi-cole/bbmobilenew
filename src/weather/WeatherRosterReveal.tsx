import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getDailyAtmosphere, type DailyAtmosphere } from '../broadcasting/dailyMoodSystem'
import { useAppSelector } from '../store/hooks'
import styles from './WeatherRosterReveal.module.css'

type LegacyWeatherVisual = 'sunny' | 'cloudy' | 'misty' | 'rainy' | 'stormy' | 'snowy' | 'rainbow' | 'sunset' | 'starry'

function visualFamily(atmosphere: DailyAtmosphere): LegacyWeatherVisual {
  switch (atmosphere) {
    case 'sunny':
    case 'mostly_sunny':
      return 'sunny'
    case 'partly_cloudy':
    case 'cloudy':
    case 'overcast':
    case 'clearing':
      return 'cloudy'
    case 'misty':
    case 'foggy':
      return 'misty'
    case 'drizzle':
    case 'light_showers':
    case 'sun_showers':
    case 'rainy':
    case 'heavy_rain':
      return 'rainy'
    case 'stormy':
      return 'stormy'
    case 'snow_showers':
    case 'snowy':
      return 'snowy'
    case 'rainbow':
      return 'rainbow'
    case 'sunset':
      return 'sunset'
    case 'starry':
      return 'starry'
    default:
      return 'cloudy'
  }
}

/**
 * Restores the roster-wide cinematic weather sweep that existed before the
 * Weather v2 presentation work. It portals into the live roster so the effect
 * uses the same positioning/clip area as the original HouseguestGrid version.
 */
export default function WeatherRosterReveal() {
  const gameId = useAppSelector((state) => state.game.gameId)
  const week = useAppSelector((state) => state.game.week)
  const phase = useAppSelector((state) => state.game.phase)
  const depressionShock = useAppSelector((state) => state.game.depressionShock)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [reveal, setReveal] = useState<{ key: string; atmosphere: DailyAtmosphere } | null>(null)
  const lastRevealKeyRef = useRef<string | null>(null)

  const atmosphere = useMemo(
    () =>
      phase === 'week_start'
        ? getDailyAtmosphere(gameId, week, 'week_start', depressionShock)
        : null,
    [depressionShock, gameId, phase, week]
  )

  useLayoutEffect(() => {
    const resolveTarget = () => {
      setPortalTarget(document.querySelector<HTMLElement>('[data-houseguest-roster="true"]'))
    }
    resolveTarget()
    const observer = new MutationObserver(resolveTarget)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (phase !== 'week_start' || !atmosphere || !gameId) return undefined
    const key = `${gameId}:${week}:day-start:${atmosphere}`
    if (lastRevealKeyRef.current === key) return undefined
    lastRevealKeyRef.current = key
    setReveal({ key, atmosphere })
    const timer = window.setTimeout(() => setReveal(null), 4300)
    return () => window.clearTimeout(timer)
  }, [atmosphere, gameId, phase, week])

  if (!portalTarget || !reveal) return null

  return createPortal(
    <div
      key={reveal.key}
      className={styles.weatherReveal}
      data-weather={visualFamily(reveal.atmosphere)}
      data-weather-detail={reveal.atmosphere}
      aria-hidden="true"
    />,
    portalTarget
  )
}
