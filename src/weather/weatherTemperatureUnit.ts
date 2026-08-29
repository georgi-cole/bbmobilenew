import type { WeatherTemperatureUnit } from './weatherRuntime'

const FAHRENHEIT_REGIONS = new Set(['US', 'BS', 'BZ', 'KY', 'FM', 'MH', 'PW', 'LR'])
const CLEARLY_CELSIUS_TIMEZONE_PREFIXES = [
  'Europe/',
  'Asia/',
  'Africa/',
  'Australia/',
  'Indian/',
  'Antarctica/',
]

function regionFromLanguageTag(languageTag: string): string | null {
  try {
    return new Intl.Locale(languageTag).region?.toUpperCase() ?? null
  } catch {
    const match = languageTag.match(/[-_]([A-Za-z]{2}|\d{3})(?:$|[-_])/)
    return match?.[1]?.toUpperCase() ?? null
  }
}

/**
 * Resolve "auto" conservatively from device/browser system settings.
 *
 * Browsers do not expose a trustworthy physical country without location
 * permission. A language such as en-US can therefore be configured while the
 * device is actually being used in Europe. To avoid surprising most of the
 * world with Fahrenheit, auto mode only selects °F when every explicit locale
 * region points to a Fahrenheit-using region and the system timezone does not
 * clearly contradict it. Unknown or ambiguous configurations fall back to °C.
 */
export function inferSystemTemperatureUnit(
  options: {
    languages?: readonly string[]
    timeZone?: string | null
  } = {}
): 'c' | 'f' {
  const languages = options.languages ?? []
  const regions = languages
    .map(regionFromLanguageTag)
    .filter((region): region is string => region !== null)

  if (regions.length === 0) return 'c'
  if (regions.some((region) => !FAHRENHEIT_REGIONS.has(region))) return 'c'

  const timeZone = options.timeZone?.trim() ?? ''
  if (timeZone && CLEARLY_CELSIUS_TIMEZONE_PREFIXES.some((prefix) => timeZone.startsWith(prefix))) {
    return 'c'
  }

  return 'f'
}

export function getSystemTemperatureUnit(): 'c' | 'f' {
  if (typeof navigator === 'undefined') return 'c'

  const languages =
    navigator.languages?.length > 0
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : []
  let timeZone: string | null = null
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    // A missing timezone simply leaves the locale decision in place.
  }

  return inferSystemTemperatureUnit({ languages, timeZone })
}

export function resolveWeatherTemperatureUnit(
  configuredUnit: WeatherTemperatureUnit = 'auto'
): 'c' | 'f' {
  return configuredUnit === 'auto' ? getSystemTemperatureUnit() : configuredUnit
}

export function formatTemperatureForUnit(tempC: number, unit: 'c' | 'f'): string {
  if (unit === 'f') return `${Math.round((tempC * 9) / 5 + 32)}°F`
  return `${Math.round(tempC)}°C`
}

export function formatTemperatureDeltaForUnit(deltaC: number, unit: 'c' | 'f'): string {
  const absolute = Math.abs(deltaC)
  if (unit === 'f') return `${Math.max(1, Math.round((absolute * 9) / 5))}°F`
  return `${Math.max(1, Math.round(absolute))}°C`
}

export function formatSystemWeatherTemperature(
  tempC: number,
  configuredUnit: WeatherTemperatureUnit = 'auto'
): string {
  return formatTemperatureForUnit(tempC, resolveWeatherTemperatureUnit(configuredUnit))
}

/**
 * Weather-bank templates are currently expanded by weatherEngine before the UI
 * receives them. Normalise any generated temperature/delta token to the same
 * conservative device unit used by the card and prefix.
 */
export function normaliseWeatherBulletinUnits(
  text: string,
  input: {
    temperatureC: number
    deltaC: number
    configuredUnit?: WeatherTemperatureUnit
  }
): string {
  const unit = resolveWeatherTemperatureUnit(input.configuredUnit ?? 'auto')
  const desiredTemp = formatTemperatureForUnit(input.temperatureC, unit)
  const desiredDelta = formatTemperatureDeltaForUnit(input.deltaC, unit)
  const cTemp = formatTemperatureForUnit(input.temperatureC, 'c')
  const fTemp = formatTemperatureForUnit(input.temperatureC, 'f')
  const cDelta = formatTemperatureDeltaForUnit(input.deltaC, 'c')
  const fDelta = formatTemperatureDeltaForUnit(input.deltaC, 'f')

  let normalised = text.replaceAll(cTemp, desiredTemp).replaceAll(fTemp, desiredTemp)
  if (input.deltaC !== 0) {
    normalised = normalised.replaceAll(cDelta, desiredDelta).replaceAll(fDelta, desiredDelta)
  }
  return normalised
}
