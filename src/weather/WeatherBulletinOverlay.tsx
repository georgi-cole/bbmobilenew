import { useLayoutEffect, useMemo, useState } from 'react'
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

function isWeatherCondition(value: unknown): value is WeatherConditionId {
  return typeof value === 'string' && value in CONDITION_LABELS
}

function WeatherGlyph({ condition }: { condition: WeatherConditionId }) {
  const wet = ['drizzle', 'light_showers', 'sun_showers', 'rainy', 'heavy_rain'].includes(condition)
  const snow = condition === 'snow_showers' || condition === 'snowy'
  const storm = condition === 'stormy'
  const fog = condition === 'misty' || condition === 'foggy'
  const sunny = condition === 'sunny' || condition === 'mostly_sunny' || condition === 'clearing'
  const partlySunny = condition === 'partly_cloudy' || condition === 'sun_showers'

  return (
    <svg className="weather-tv-card__glyph" viewBox="0 0 64 64" aria-hidden="true">
      {(sunny || partlySunny) && (
        <g className="weather-tv-card__sun">
          <circle cx="23" cy="22" r="9" />
          <path d="M23 7v5M23 32v5M8 22h5M33 22h5M12.4 11.4l3.5 3.5M30.1 29.1l3.5 3.5M12.4 32.6l3.5-3.5M30.1 14.9l3.5-3.5" />
        </g>
      )}
      {!sunny && !fog && (
        <path
          className="weather-tv-card__cloud"
          d="M18 43h28.5c6 0 10.5-4.1 10.5-9.4 0-5.1-4.1-9-9.5-9.4C45.4 17.8 39.7 14 33 14c-8 0-14.5 5.7-15.5 13.1C11.5 27.8 7 31.8 7 36.9 7 40.4 11.5 43 18 43Z"
        />
      )}
      {fog && <g className="weather-tv-card__fog"><path d="M10 25h39M16 34h38M8 43h42" /></g>}
      {wet && <g className="weather-tv-card__drops"><path d="M22 47l-3 7M34 47l-3 7M46 47l-3 7" /></g>}
      {storm && <path className="weather-tv-card__bolt" d="M35 41h8l-8 15 2-11h-8l7-13Z" />}
      {snow && <g className="weather-tv-card__snow"><path d="M23 48v9M19 50l8 5M27 50l-8 5M43 48v9M39 50l8 5M47 50l-8 5" /></g>}
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
    return {
      temperature: splitTemperature(formatSystemWeatherTemperature(temperatureC, configuredUnit)),
      conditionLabel: CONDITION_LABELS[condition],
      narrative: stripInjectedPrefix(weatherEvent.text),
    }
  }, [condition, temperatureC, weatherEvent])

  if (!weatherEvent || !condition || !presentation || !portalTarget) return null

  return createPortal(
    <section className={`weather-tv-card weather-tv-card--${condition}`} aria-hidden="true">
      <div className="weather-tv-card__main">
        <div className="weather-tv-card__temperature">
          <span className="weather-tv-card__temperature-number">{presentation.temperature.number}</span>
          <span className="weather-tv-card__temperature-unit">{presentation.temperature.unit}</span>
        </div>
        <div className="weather-tv-card__condition">
          <WeatherGlyph condition={condition} />
          <span>{presentation.conditionLabel}</span>
        </div>
      </div>
      <p className="weather-tv-card__narrative">{presentation.narrative}</p>
    </section>,
    portalTarget
  )
}
