import { Capacitor } from '@capacitor/core'

export type WeatherConditionId =
  | 'sunny'
  | 'mostly_sunny'
  | 'partly_cloudy'
  | 'cloudy'
  | 'overcast'
  | 'misty'
  | 'foggy'
  | 'drizzle'
  | 'light_showers'
  | 'sun_showers'
  | 'rainy'
  | 'heavy_rain'
  | 'stormy'
  | 'snow_showers'
  | 'snowy'
  | 'clearing'

export type WeatherPhenomenon = 'rainbow'
export type WeatherTemperatureUnit = 'auto' | 'c' | 'f'

export interface WeatherConditionConfig {
  family: 'clear' | 'cloud' | 'wet' | 'mist' | 'storm' | 'snow' | 'transition'
  initialWeight: number
  tempBiasC?: number
  minTempC?: number
  maxTempC?: number
  transitions: Partial<Record<WeatherConditionId, number>>
}

export interface WeatherConfigDocument {
  schemaVersion: number
  revision: string
  enabled: boolean
  bankUrl?: string
  temperature: {
    unit: WeatherTemperatureUnit
    baseC: number
    minC: number
    maxC: number
    initialJitterC: number
    dailyDeltaMinC: number
    dailyDeltaMaxC: number
  }
  phenomena: {
    rainbowChanceAfterWet: number
  }
  conditions: Partial<Record<WeatherConditionId, WeatherConditionConfig>>
}

export interface WeatherBulletinTemplate {
  id: string
  text: string
  weight?: number
  conditions?: WeatherConditionId[]
  phenomenon?: WeatherPhenomenon
  minTempC?: number
  maxTempC?: number
  minDeltaC?: number
  maxDeltaC?: number
  minStreak?: number
}

export interface WeatherBankDocument {
  schemaVersion: number
  revision: string
  dayStartTitles: Partial<Record<WeatherConditionId, string[]>>
  dayEndTitles: Record<string, string[]>
  bulletins: WeatherBulletinTemplate[]
}

export interface WeatherRuntimeData {
  config: WeatherConfigDocument
  bank: WeatherBankDocument
}

const CONDITION_IDS: readonly WeatherConditionId[] = [
  'sunny',
  'mostly_sunny',
  'partly_cloudy',
  'cloudy',
  'overcast',
  'misty',
  'foggy',
  'drizzle',
  'light_showers',
  'sun_showers',
  'rainy',
  'heavy_rain',
  'stormy',
  'snow_showers',
  'snowy',
  'clearing',
]
const CONDITION_SET = new Set<WeatherConditionId>(CONDITION_IDS)
const WEATHER_CACHE_KEY = 'bbmobilenew_weather_runtime_v2'
const CACHE_TTL_MS = 60 * 60 * 1000
const REMOTE_WEATHER_BASE = 'https://georgi-cole.github.io/bbmobilenew/config'

export interface WeatherRuntimeUrls {
  configUrl: string
  defaultBankUrl: string
}

/**
 * Web builds read the weather documents shipped with that exact build. This is
 * important for PR previews: new config files exist in the preview before they
 * can exist on the main GitHub Pages deployment. Native Capacitor builds keep
 * using the GitHub Pages endpoint so weather content remains remotely editable.
 */
export function resolveWeatherRuntimeUrls({
  isDev = import.meta.env.DEV,
  isNative = Capacitor.isNativePlatform(),
  baseUrl = import.meta.env.BASE_URL,
}: {
  isDev?: boolean
  isNative?: boolean
  baseUrl?: string
} = {}): WeatherRuntimeUrls {
  if (isDev) {
    return {
      configUrl: '/config/weather-config.json',
      defaultBankUrl: '/config/weather-bank.json',
    }
  }

  if (isNative) {
    return {
      configUrl: `${REMOTE_WEATHER_BASE}/weather-config.json`,
      defaultBankUrl: `${REMOTE_WEATHER_BASE}/weather-bank.json`,
    }
  }

  const appBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return {
    configUrl: `${appBase}config/weather-config.json`,
    defaultBankUrl: `${appBase}config/weather-bank.json`,
  }
}

const { configUrl: WEATHER_CONFIG_URL, defaultBankUrl: DEFAULT_BANK_URL } =
  resolveWeatherRuntimeUrls()

let runtimeData: WeatherRuntimeData | null = loadCachedRuntime()
let inFlight: Promise<WeatherRuntimeData | null> | null = null

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  if (value.startsWith('/') && import.meta.env.DEV) return value
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : undefined
  } catch {
    return undefined
  }
}

function sanitiseCondition(raw: unknown): WeatherConditionConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const family = source.family
  if (
    family !== 'clear' &&
    family !== 'cloud' &&
    family !== 'wet' &&
    family !== 'mist' &&
    family !== 'storm' &&
    family !== 'snow' &&
    family !== 'transition'
  )
    return null

  const transitions: Partial<Record<WeatherConditionId, number>> = {}
  if (
    source.transitions &&
    typeof source.transitions === 'object' &&
    !Array.isArray(source.transitions)
  ) {
    for (const [id, rawWeight] of Object.entries(source.transitions)) {
      if (!CONDITION_SET.has(id as WeatherConditionId)) continue
      const weight = finiteNumber(rawWeight)
      if (weight != null && weight > 0)
        transitions[id as WeatherConditionId] = clamp(weight, 0, 1000)
    }
  }

  return {
    family,
    initialWeight: clamp(finiteNumber(source.initialWeight) ?? 1, 0, 1000),
    tempBiasC: clamp(finiteNumber(source.tempBiasC) ?? 0, -15, 15),
    minTempC: finiteNumber(source.minTempC),
    maxTempC: finiteNumber(source.maxTempC),
    transitions,
  }
}

export function sanitiseWeatherConfig(raw: unknown): WeatherConfigDocument | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const temperature = source.temperature as Record<string, unknown> | undefined
  const phenomena = source.phenomena as Record<string, unknown> | undefined
  const conditionsRaw = source.conditions
  if (
    !temperature ||
    !phenomena ||
    !conditionsRaw ||
    typeof conditionsRaw !== 'object' ||
    Array.isArray(conditionsRaw)
  ) {
    return null
  }

  const conditions: Partial<Record<WeatherConditionId, WeatherConditionConfig>> = {}
  for (const id of CONDITION_IDS) {
    const condition = sanitiseCondition((conditionsRaw as Record<string, unknown>)[id])
    if (condition) conditions[id] = condition
  }
  if (Object.keys(conditions).length < 4) return null

  const unit = temperature.unit === 'c' || temperature.unit === 'f' ? temperature.unit : 'auto'
  const minC = clamp(finiteNumber(temperature.minC) ?? -5, -40, 50)
  const maxC = clamp(finiteNumber(temperature.maxC) ?? 35, minC + 1, 60)

  return {
    schemaVersion: Math.max(1, Math.round(finiteNumber(source.schemaVersion) ?? 1)),
    revision: typeof source.revision === 'string' ? source.revision.slice(0, 80) : 'remote',
    enabled: source.enabled !== false,
    bankUrl: safeUrl(source.bankUrl),
    temperature: {
      unit,
      baseC: clamp(finiteNumber(temperature.baseC) ?? 18, minC, maxC),
      minC,
      maxC,
      initialJitterC: clamp(finiteNumber(temperature.initialJitterC) ?? 4, 0, 15),
      dailyDeltaMinC: clamp(finiteNumber(temperature.dailyDeltaMinC) ?? -4, -12, 0),
      dailyDeltaMaxC: clamp(finiteNumber(temperature.dailyDeltaMaxC) ?? 4, 0, 12),
    },
    phenomena: {
      rainbowChanceAfterWet: clamp(finiteNumber(phenomena.rainbowChanceAfterWet) ?? 0.28, 0, 1),
    },
    conditions,
  }
}

function sanitiseStrings(raw: unknown, maxItems = 12): string[] {
  return Array.isArray(raw)
    ? raw
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .slice(0, maxItems)
        .map((value) => value.slice(0, 260))
    : []
}

export function sanitiseWeatherBank(raw: unknown): WeatherBankDocument | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const startRaw = source.dayStartTitles
  const endRaw = source.dayEndTitles
  if (!startRaw || typeof startRaw !== 'object' || !endRaw || typeof endRaw !== 'object')
    return null

  const dayStartTitles: Partial<Record<WeatherConditionId, string[]>> = {}
  for (const id of CONDITION_IDS) {
    const values = sanitiseStrings((startRaw as Record<string, unknown>)[id])
    if (values.length) dayStartTitles[id] = values
  }

  const dayEndTitles: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(endRaw as Record<string, unknown>).slice(0, 30)) {
    const values = sanitiseStrings(value)
    if (values.length) dayEndTitles[key.slice(0, 60)] = values
  }

  const bulletins: WeatherBulletinTemplate[] = []
  if (Array.isArray(source.bulletins)) {
    for (const rawEntry of source.bulletins.slice(0, 120)) {
      if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue
      const entry = rawEntry as Record<string, unknown>
      if (typeof entry.id !== 'string' || typeof entry.text !== 'string') continue
      const conditions = Array.isArray(entry.conditions)
        ? entry.conditions.filter((id): id is WeatherConditionId =>
            CONDITION_SET.has(id as WeatherConditionId)
          )
        : undefined
      const phenomenon = entry.phenomenon === 'rainbow' ? 'rainbow' : undefined
      bulletins.push({
        id: entry.id.slice(0, 100),
        text: entry.text.slice(0, 320),
        weight: clamp(finiteNumber(entry.weight) ?? 1, 0.01, 1000),
        conditions: conditions?.length ? conditions : undefined,
        phenomenon,
        minTempC: finiteNumber(entry.minTempC),
        maxTempC: finiteNumber(entry.maxTempC),
        minDeltaC: finiteNumber(entry.minDeltaC),
        maxDeltaC: finiteNumber(entry.maxDeltaC),
        minStreak: finiteNumber(entry.minStreak),
      })
    }
  }

  if (Object.keys(dayStartTitles).length < 4 || bulletins.length < 4) return null
  return {
    schemaVersion: Math.max(1, Math.round(finiteNumber(source.schemaVersion) ?? 1)),
    revision: typeof source.revision === 'string' ? source.revision.slice(0, 80) : 'remote',
    dayStartTitles,
    dayEndTitles,
    bulletins,
  }
}

function readStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function loadCachedRuntime(): WeatherRuntimeData | null {
  const storage = readStorage()
  if (!storage) return null
  try {
    const parsed = JSON.parse(storage.getItem(WEATHER_CACHE_KEY) ?? 'null') as {
      savedAt?: number
      config?: unknown
      bank?: unknown
    } | null
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null
    const config = sanitiseWeatherConfig(parsed.config)
    const bank = sanitiseWeatherBank(parsed.bank)
    return config && bank ? { config, bank } : null
  } catch {
    return null
  }
}

function cacheRuntime(next: WeatherRuntimeData): void {
  const storage = readStorage()
  if (!storage) return
  try {
    storage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), ...next }))
  } catch {
    // Storage is best-effort only. The in-memory validated runtime remains active.
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error(`Weather config fetch failed (${response.status})`)
    return await response.json()
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function loadWeatherRuntime(): Promise<WeatherRuntimeData | null> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const config = sanitiseWeatherConfig(await fetchJson(WEATHER_CONFIG_URL))
      if (!config || !config.enabled) return runtimeData
      const bankUrl = config.bankUrl ?? DEFAULT_BANK_URL
      const bank = sanitiseWeatherBank(await fetchJson(bankUrl))
      if (!bank) return runtimeData
      runtimeData = { config, bank }
      cacheRuntime(runtimeData)
      return runtimeData
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[weather] remote weather data unavailable', error)
      return runtimeData
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function getWeatherRuntime(): WeatherRuntimeData | null {
  return runtimeData
}

export function clearWeatherRuntimeForTests(): void {
  runtimeData = null
  inFlight = null
}
