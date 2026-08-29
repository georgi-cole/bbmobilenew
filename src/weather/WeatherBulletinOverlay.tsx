import { useId, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppSelector } from '../store/hooks'
import { deriveWeatherBulletinMetrics } from './weatherBulletinMetrics'
import { getWeatherRuntime, type WeatherConditionId } from './weatherRuntime'
import { formatSystemWeatherTemperature } from './weatherTemperatureUnit'
import './WeatherBulletinOverlay.css'

const CONDITION_LABELS: Record<WeatherConditionId, string> = {
  sunny: 'Clear',
  mostly_sunny: 'Mostly sunny',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  overcast: 'Overcast',
  misty: 'Misty',
  foggy: 'Foggy',
  drizzle: 'Drizzle',
  light_showers: 'Light showers',
  sun_showers: 'Sun showers',
  rainy: 'Rain',
  heavy_rain: 'Heavy rain',
  stormy: 'Thunderstorms',
  snow_showers: 'Snow showers',
  snowy: 'Snow',
  clearing: 'Clearing',
}

function isWeatherCondition(value: unknown): value is WeatherConditionId {
  return typeof value === 'string' && value in CONDITION_LABELS
}

function WeatherGlyph({
  condition,
  rainbow,
}: {
  condition: WeatherConditionId
  rainbow: boolean
}) {
  const id = useId().replace(/:/g, '')
  const wet = ['drizzle', 'light_showers', 'sun_showers', 'rainy', 'heavy_rain'].includes(condition)
  const snow = condition === 'snow_showers' || condition === 'snowy'
  const storm = condition === 'stormy'
  const fog = condition === 'misty' || condition === 'foggy'
  const sunVisible = ['sunny', 'mostly_sunny', 'partly_cloudy', 'sun_showers', 'clearing'].includes(condition)
  const cloudVisible = condition !== 'sunny'
  const darkCloud = condition === 'overcast' || condition === 'heavy_rain' || condition === 'stormy'

  return (
    <svg className="weather-tv-card__glyph" viewBox="0 0 128 104" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-sun`} cx="35%" cy="28%" r="70%">
          <stop offset="0" stopColor="#fff4ba" />
          <stop offset="0.45" stopColor="#ffd35d" />
          <stop offset="1" stopColor="#f49a27" />
        </radialGradient>
        <linearGradient id={`${id}-cloud`} x1="0" y1="0" x2="0.78" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.58" stopColor="#dfe9f3" />
          <stop offset="1" stopColor="#aab9ca" />
        </linearGradient>
        <linearGradient id={`${id}-cloud-dark`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#c3cfdb" />
          <stop offset="0.56" stopColor="#78899e" />
          <stop offset="1" stopColor="#47576d" />
        </linearGradient>
        <linearGradient id={`${id}-rain`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#84d7ff" />
          <stop offset="1" stopColor="#3d79e8" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-40%" y="-40%" width="180%" height="200%">
          <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#020817" floodOpacity="0.42" />
        </filter>
        <filter id={`${id}-sun-glow`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {rainbow && (
        <g className="weather-tv-card__rainbow" opacity="0.78">
          <path d="M20 69C27 33 91 22 111 63" />
          <path d="M26 70C32 42 86 31 104 65" />
          <path d="M32 71C38 50 81 40 97 67" />
        </g>
      )}

      {sunVisible && (
        <g className="weather-tv-card__sun" filter={`url(#${id}-sun-glow)`}>
          <g className="weather-tv-card__sun-rays">
            <path d="M45 4v10M45 51v10M15 33H5M85 33H75M24 12l7 8M66 46l7 8M24 54l7-8M66 20l7-8" />
          </g>
          <circle cx="45" cy="33" r="18" fill={`url(#${id}-sun)`} />
        </g>
      )}

      {cloudVisible && (
        <g
          className={`weather-tv-card__cloud-shape${darkCloud ? ' weather-tv-card__cloud-shape--dark' : ''}`}
          filter={`url(#${id}-shadow)`}
        >
          <ellipse cx="66" cy="64" rx="35" ry="18" fill={`url(#${id}-${darkCloud ? 'cloud-dark' : 'cloud'})`} />
          <circle cx="48" cy="57" r="17" fill={`url(#${id}-${darkCloud ? 'cloud-dark' : 'cloud'})`} />
          <circle cx="68" cy="49" r="22" fill={`url(#${id}-${darkCloud ? 'cloud-dark' : 'cloud'})`} />
          <circle cx="88" cy="57" r="16" fill={`url(#${id}-${darkCloud ? 'cloud-dark' : 'cloud'})`} />
          <ellipse className="weather-tv-card__cloud-highlight" cx="58" cy="52" rx="16" ry="7" />
        </g>
      )}

      {fog && (
        <g className="weather-tv-card__fog">
          <path d="M27 77h70" />
          <path d="M20 86h60" />
          <path d="M48 95h58" />
        </g>
      )}

      {wet && (
        <g className="weather-tv-card__drops" stroke={`url(#${id}-rain)`}>
          <path d="M46 80l-5 12" />
          <path d="M65 78l-5 14" />
          <path d="M84 80l-5 12" />
          {condition === 'heavy_rain' && <path d="M101 77l-6 15M30 78l-5 12" />}
        </g>
      )}

      {storm && (
        <g className="weather-tv-card__storm">
          <path className="weather-tv-card__bolt" d="M72 72H58l-7 18h12l-3 14 22-25H69l3-7Z" />
          <path className="weather-tv-card__storm-rain" d="M37 79l-5 12M93 78l-5 13" />
        </g>
      )}

      {snow && (
        <g className="weather-tv-card__snow">
          <g transform="translate(46 84)"><path d="M0-7V7M-6-3.5 6 3.5M6-3.5-6 3.5" /></g>
          <g transform="translate(76 88)"><path d="M0-7V7M-6-3.5 6 3.5M6-3.5-6 3.5" /></g>
          {condition === 'snowy' && <g transform="translate(99 81)"><path d="M0-6V6M-5-3 5 3M5-3-5 3" /></g>}
        </g>
      )}
    </svg>
  )
}

function MetricIcon({ kind }: { kind: 'sunrise' | 'sunset' | 'humidity' | 'wind' }) {
  if (kind === 'humidity') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s5 6.1 5 10a5 5 0 1 1-10 0c0-3.9 5-10 5-10Z" /></svg>
  }
  if (kind === 'wind') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h10c2.7 0 2.7-4 0-4-1.1 0-1.9.5-2.3 1.2M3 12h15c3.2 0 3.2-4.8 0-4.8M3 16h9c2.7 0 2.7 4 0 4-1.1 0-1.9-.5-2.3-1.2" /></svg>
  }
  const isSunset = kind === 'sunset'
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 17h16M7 14a5 5 0 0 1 10 0M12 3v4M5.8 7.1l2.1 2.1M18.2 7.1l-2.1 2.1" />
      <path d={isSunset ? 'M12 22v-4m0 4-2-2m2 2 2-2' : 'M12 18v4m0-4-2 2m2-2 2 2'} />
    </svg>
  )
}

function splitTemperature(value: string): { number: string; unit: string } {
  const match = value.match(/^(-?\d+)°([CF])$/)
  return match ? { number: match[1], unit: `°${match[2]}` } : { number: value, unit: '' }
}

function stripInjectedPrefix(text: string): string {
  return text.replace(/^\s*-?\d+°[CF]\s*[·•]\s*/i, '').trim()
}

export default function WeatherBulletinOverlay() {
  const gameId = useAppSelector((state) => state.game.gameId)
  const weatherEvent = useAppSelector((state) => {
    const queuedId = state.game.broadcastQueue?.[0]
    if (!queuedId) return null
    const event = state.game.tvFeed.find((candidate) => candidate.id === queuedId) ?? null
    return event?.meta?.weatherBulletin === true ? event : null
  })
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  const rawCondition = weatherEvent?.meta?.weatherCondition
  const condition = isWeatherCondition(rawCondition) ? rawCondition : null
  const rawTemperature = weatherEvent?.meta?.weatherTemperatureC
  const temperatureC = typeof rawTemperature === 'number' ? rawTemperature : null
  const weatherDay =
    typeof weatherEvent?.meta?.weatherBulletinDay === 'number'
      ? weatherEvent.meta.weatherBulletinDay
      : 1
  const rainbow = weatherEvent?.meta?.weatherPhenomenon === 'rainbow'

  useLayoutEffect(() => {
    if (!weatherEvent) {
      setPortalTarget(null)
      return undefined
    }
    const resolveTarget = () => setPortalTarget(document.querySelector<HTMLElement>('.tv-zone__viewport'))
    resolveTarget()
    const observer = new MutationObserver(resolveTarget)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [weatherEvent?.id])

  const presentation = useMemo(() => {
    if (!weatherEvent || !condition || temperatureC == null) return null
    const configuredUnit = getWeatherRuntime()?.config.temperature.unit ?? 'auto'
    const metrics = deriveWeatherBulletinMetrics({
      gameId,
      day: weatherDay,
      condition,
      temperatureC,
    })
    return {
      temperature: splitTemperature(formatSystemWeatherTemperature(temperatureC, configuredUnit)),
      feelsLike: formatSystemWeatherTemperature(metrics.feelsLikeC, configuredUnit),
      conditionLabel: CONDITION_LABELS[condition],
      narrative: stripInjectedPrefix(weatherEvent.text),
      metrics,
    }
  }, [condition, gameId, temperatureC, weatherDay, weatherEvent])

  if (!weatherEvent || !condition || !presentation || !portalTarget) return null

  return createPortal(
    <section className={`weather-tv-card weather-tv-card--${condition}`} aria-hidden="true">
      <div className="weather-tv-card__content">
        <div className="weather-tv-card__temperature-block">
          <div className="weather-tv-card__temperature">
            <span className="weather-tv-card__temperature-number">{presentation.temperature.number}</span>
            <span className="weather-tv-card__temperature-unit">{presentation.temperature.unit}</span>
          </div>
          <span className="weather-tv-card__feels-like">Feels like {presentation.feelsLike}</span>
        </div>

        <div className="weather-tv-card__hero">
          <WeatherGlyph condition={condition} rainbow={rainbow} />
          <span className="weather-tv-card__condition-label">{presentation.conditionLabel}</span>
        </div>

        <div className="weather-tv-card__metrics">
          <div className="weather-tv-card__metric">
            <MetricIcon kind="sunrise" />
            <span className="weather-tv-card__metric-label">Sunrise</span>
            <strong>{presentation.metrics.sunrise}</strong>
          </div>
          <div className="weather-tv-card__metric">
            <MetricIcon kind="sunset" />
            <span className="weather-tv-card__metric-label">Sunset</span>
            <strong>{presentation.metrics.sunset}</strong>
          </div>
          <div className="weather-tv-card__metric">
            <MetricIcon kind="humidity" />
            <span className="weather-tv-card__metric-label">Humidity</span>
            <strong>{presentation.metrics.humidityPct}%</strong>
          </div>
          <div className="weather-tv-card__metric">
            <MetricIcon kind="wind" />
            <span className="weather-tv-card__metric-label">Wind</span>
            <strong>{presentation.metrics.windKmh} km/h</strong>
          </div>
        </div>
      </div>

      <p className="weather-tv-card__narrative">{presentation.narrative}</p>
    </section>,
    portalTarget
  )
}
