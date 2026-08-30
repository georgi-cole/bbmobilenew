import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getDailyAtmosphere, type DailyAtmosphere } from '../broadcasting/dailyMoodSystem'
import useSound from '../hooks/useSound'
import { useAppSelector } from '../store/hooks'
import styles from './WeatherRosterReveal.module.css'

type LegacyWeatherVisual =
  | 'sunny'
  | 'cloudy'
  | 'misty'
  | 'rainy'
  | 'stormy'
  | 'snowy'
  | 'rainbow'
  | 'sunset'
  | 'starry'

const WEATHER_REVEAL_SOUNDS: Record<
  DailyAtmosphere,
  { key: string; volume: number; delayMs: number }
> = {
  sunny: { key: 'ui:confirm', volume: 0.2, delayMs: 0 },
  mostly_sunny: { key: 'ui:confirm', volume: 0.18, delayMs: 0 },
  partly_cloudy: { key: 'ui:navigate', volume: 0.15, delayMs: 0 },
  cloudy: { key: 'ui:navigate', volume: 0.16, delayMs: 0 },
  overcast: { key: 'ui:navigate', volume: 0.13, delayMs: 40 },
  misty: { key: 'ui:navigate', volume: 0.12, delayMs: 80 },
  foggy: { key: 'ui:navigate', volume: 0.11, delayMs: 100 },
  drizzle: { key: 'ui:navigate', volume: 0.12, delayMs: 40 },
  light_showers: { key: 'ui:navigate', volume: 0.14, delayMs: 0 },
  sun_showers: { key: 'ui:confirm', volume: 0.15, delayMs: 0 },
  rainy: { key: 'ui:navigate', volume: 0.14, delayMs: 0 },
  heavy_rain: { key: 'ui:navigate', volume: 0.18, delayMs: 0 },
  stormy: { key: 'minigame:cinematic_thunder', volume: 0.28, delayMs: 840 },
  snow_showers: { key: 'ui:confirm', volume: 0.12, delayMs: 80 },
  snowy: { key: 'ui:confirm', volume: 0.14, delayMs: 80 },
  clearing: { key: 'ui:confirm', volume: 0.17, delayMs: 0 },
  rainbow: { key: 'ui:confirm', volume: 0.18, delayMs: 0 },
  sunset: { key: 'ui:confirm', volume: 0.16, delayMs: 0 },
  starry: { key: 'ui:navigate', volume: 0.13, delayMs: 100 },
}

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
 * Restores the roster-wide cinematic weather sweep and sound cue that existed
 * before the Weather v2 presentation work. Both day-start and day-end
 * transitions use the same roster layer as the original implementation.
 */
export default function WeatherRosterReveal() {
  const gameId = useAppSelector((state) => state.game.gameId)
  const week = useAppSelector((state) => state.game.week)
  const phase = useAppSelector((state) => state.game.phase)
  const { play } = useSound()
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [reveal, setReveal] = useState<{ key: string; atmosphere: DailyAtmosphere } | null>(null)
  const lastRevealKeyRef = useRef<string | null>(null)
  const dailyPhase = phase === 'week_start' || phase === 'week_end' ? phase : null

  const atmosphere = useMemo(
    () => (dailyPhase ? getDailyAtmosphere(gameId, week, dailyPhase) : null),
    [dailyPhase, gameId, week]
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
    if (!dailyPhase || !atmosphere || !gameId) return undefined
    const key = `${gameId}:${week}:${dailyPhase}:${atmosphere}`
    if (lastRevealKeyRef.current === key) return undefined
    lastRevealKeyRef.current = key
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReveal({ key, atmosphere })

    const sound = WEATHER_REVEAL_SOUNDS[atmosphere]
    const soundTimer = window.setTimeout(
      () => play(sound.key, { volume: sound.volume }),
      sound.delayMs
    )
    const revealTimer = window.setTimeout(() => setReveal(null), 4300)
    return () => {
      window.clearTimeout(soundTimer)
      window.clearTimeout(revealTimer)
    }
  }, [atmosphere, dailyPhase, gameId, play, week])

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
