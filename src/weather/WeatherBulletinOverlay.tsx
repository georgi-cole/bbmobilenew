import { useId, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppSelector } from '../store/hooks'
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

const FEELS_LIKE_ADJUSTMENT_C: Record<WeatherConditionId, number> = {
  sunny: 1,
  mostly_sunny: 1,
  partly_cloudy: 0,
  cloudy: -1,
  overcast: -1,
  misty: -1,
  foggy: -2,
  drizzle: -1,
  light_showers: -1,
  sun_showers: 0,
  rainy: -2,
  heavy_rain: -2,
  stormy: -3,
  snow_showers: -2,
  snowy: -3,
  clearing: 0,
}

function isWeatherCondition(value: unknown): value is WeatherConditionId {
  return typeof value === 'string' && value in CONDITION_LABELS
}

function GlossySnowflake({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="weather-tv-card__snowflake">
      <path d="M0-9V9M-7.8-4.5 7.8 4.5M7.8-4.5-7.8 4.5" />
      <path d="M0-9l-2.7 3M0-9l2.7 3M0 9l-2.7-3M0 9l2.7-3M-7.8-4.5l4 .3M-7.8-4.5l1.7 3.6M7.8 4.5l-4-.3M7.8 4.5l-1.7-3.6M7.8-4.5l-4 .3M7.8-4.5l-1.7 3.6M-7.8 4.5l4-.3M-7.8 4.5l1.7-3.6" />
    </g>
  )
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
  const denseCloud = condition === 'cloudy' || condition === 'overcast' || fog || wet || storm || snow

  return (
    <svg className="weather-tv-card__glyph" viewBox="0 0 160 120" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-sun`} cx="34%" cy="28%" r="72%">
          <stop offset="0" stopColor="#fff9cf" />
          <stop offset="0.32" stopColor="#ffe76c" />
          <stop offset="0.68" stopColor="#ffc238" />
          <stop offset="1" stopColor="#ef8b1f" />
        </radialGradient>
        <linearGradient id={`${id}-cloud`} x1="0.16" y1="0.08" x2="0.78" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.38" stopColor="#eef5ff" />
          <stop offset="0.72" stopColor="#bed4ee" />
          <stop offset="1" stopColor="#7fa5d5" />
        </linearGradient>
        <linearGradient id={`${id}-cloud-dark`} x1="0.18" y1="0.06" x2="0.78" y2="1">
          <stop offset="0" stopColor="#d9e5f5" />
          <stop offset="0.4" stopColor="#9eb5d4" />
          <stop offset="0.72" stopColor="#637b9e" />
          <stop offset="1" stopColor="#33465f" />
        </linearGradient>
        <linearGradient id={`${id}-rain`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9ecff" />
          <stop offset="0.46" stopColor="#58c4ff" />
          <stop offset="1" stopColor="#296ee7" />
        </linearGradient>
        <linearGradient id={`${id}-ice`} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#bdeeff" />
          <stop offset="0.72" stopColor="#64c9ff" />
          <stop offset="1" stopColor="#2c83df" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-45%" y="-45%" width="190%" height="210%">
          <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#020817" floodOpacity="0.44" />
        </filter>
        <filter id={`${id}-sun-glow`} x="-90%" y="-90%" width="280%" height="280%">
          <feGaussianBlur stdDeviation="4.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`${id}-ice-glow`} x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#7bd7ff" floodOpacity="0.45" />
        </filter>
      </defs>

      {rainbow && (
        <g className="weather-tv-card__rainbow" opacity="0.72">
          <path d="M26 78C34 34 117 23 140 72" />
          <path d="M34 79C42 44 111 33 131 74" />
          <path d="M42 80C49 53 105 43 122 76" />
        </g>
      )}

      {sunVisible && (
        <g className="weather-tv-card__sun" filter={`url(#${id}-sun-glow)`}>
          <g className="weather-tv-card__sun-rays">
            <path d="M55 5v12M55 55v12M18 35H6M104 35H92M28 9l8 9M82 52l8 9M27 62l9-9M82 18l8-9" />
          </g>
          <circle cx="55" cy="35" r="22" fill={`url(#${id}-sun)`} />
          <ellipse className="weather-tv-card__sun-highlight" cx="48" cy="27" rx="9" ry="5" />
        </g>
      )}

      {cloudVisible && (
        <g
          className={`weather-tv-card__cloud-shape${darkCloud ? ' weather-tv-card__cloud-shape--dark' : ''}`}
          filter={`url(#${id}-shadow)`}
        >
          <ellipse cx="87" cy="71" rx={denseCloud ? 43 : 38} ry={denseCloud ? 22 : 19} fill={`url(#${id}-${darkCloud ? 'cloud-dark' : 'cloud'})`} />
          <circle cx="60" cy="64" r={denseCloud ? 21 : 18} fill={`url(#${id}-${darkCloud ? 'cloud-dark' : 'cloud'})`} />
          <circle cx="86" cy="54" r={denseCloud ? 28 : 24} fill={`url(#${id}-${darkCloud ? 'cloud-dark' : 'cloud'})`} />
          <circle cx="112" cy="64" r={denseCloud ? 20 : 17} fill={`url(#${id}-${darkCloud ? 'cloud-dark' : 'cloud'})`} />
          <ellipse className="weather-tv-card__cloud-highlight" cx="75" cy="49" rx="17" ry="7" />
          <ellipse className="weather-tv-card__cloud-highlight weather-tv-card__cloud-highlight--small" cx="105" cy="58" rx="8" ry="4" />
        </g>
      )}

      {fog && (
        <g className="weather-tv-card__fog">
          <path d="M42 86h79" />
          <path d="M28 96h70" />
          <path d="M60 106h65" />
        </g>
      )}

      {wet && (
        <g className="weather-tv-card__drops" fill={`url(#${id}-rain)`}>
          <path d="M54 86c0 0-6 8-6 12a6 6 0 0 0 12 0c0-4-6-12-6-12Z" />
          <path d="M82 84c0 0-7 10-7 14a7 7 0 0 0 14 0c0-4-7-14-7-14Z" />
          <path d="M111 87c0 0-5.5 8-5.5 11.5a5.5 5.5 0 0 0 11 0C116.5 95 111 87 111 87Z" />
          {condition === 'heavy_rain' && <path d="M132 85c0 0-5 7-5 10a5 5 0 0 0 10 0c0-3-5-10-5-10ZM34 87c0 0-4.5 6.5-4.5 9.3a4.5 4.5 0 0 0 9 0C38.5 93.5 34 87 34 87Z" />}
        </g>
      )}

      {storm && (
        <g className="weather-tv-card__storm">
          <path className="weather-tv-card__bolt" d="M88 75H71L61 96h14l-4 20 28-31H83l5-10Z" />
          <path className="weather-tv-card__storm-rain" d="M45 88l-5 13M122 87l-5 14" />
        </g>
      )}

      {snow && (
        <g fill="none" stroke={`url(#${id}-ice)`} filter={`url(#${id}-ice-glow)`}>
          <GlossySnowflake x={61} y={96} scale={0.9} />
          <GlossySnowflake x={95} y={101} scale={1.05} />
          {condition === 'snowy' && <GlossySnowflake x={126} y={92} scale={0.74} />}
        </g>
      )}
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
    const feelsLikeC = Math.round(temperatureC + FEELS_LIKE_ADJUSTMENT_C[condition])
    const showFeelsLike = Math.abs(feelsLikeC - temperatureC) >= 2

    return {
      temperature: splitTemperature(formatSystemWeatherTemperature(temperatureC, configuredUnit)),
      feelsLike: showFeelsLike
        ? formatSystemWeatherTemperature(feelsLikeC, configuredUnit)
        : null,
      conditionLabel: CONDITION_LABELS[condition],
      narrative: stripInjectedPrefix(weatherEvent.text),
    }
  }, [condition, temperatureC, weatherEvent])

  if (!weatherEvent || !condition || !presentation || !portalTarget) return null

  return createPortal(
    <section className={`weather-tv-card weather-tv-card--${condition}`} aria-hidden="true">
      <div className="weather-tv-card__top">
        <div className="weather-tv-card__temperature-block">
          <div className="weather-tv-card__temperature">
            <span className="weather-tv-card__temperature-number">{presentation.temperature.number}</span>
            <span className="weather-tv-card__temperature-unit">{presentation.temperature.unit}</span>
          </div>
          {presentation.feelsLike && (
            <span className="weather-tv-card__feels-like">Feels like {presentation.feelsLike}</span>
          )}
        </div>

        <div className="weather-tv-card__hero">
          <WeatherGlyph condition={condition} rainbow={rainbow} />
        </div>
      </div>

      <div className="weather-tv-card__condition-label">{presentation.conditionLabel}</div>
      <p className="weather-tv-card__narrative">{presentation.narrative}</p>
    </section>,
    portalTarget
  )
}
