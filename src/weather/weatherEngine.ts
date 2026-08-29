import type { Player } from '../types'
import {
  getWeatherRuntime,
  type WeatherBankDocument,
  type WeatherConditionConfig,
  type WeatherConditionId,
  type WeatherConfigDocument,
  type WeatherPhenomenon,
  type WeatherTemperatureUnit,
} from './weatherRuntime'

export interface WeatherDayState {
  day: number
  condition: WeatherConditionId
  temperatureC: number
  deltaC: number
  streak: number
  phenomenon?: WeatherPhenomenon
  generatedWithRevision: string
  bulletinId?: string
}

export type WeatherPresentationAtmosphere = WeatherConditionId | 'sunset' | 'starry' | 'rainbow'

interface WeatherHistoryDocument {
  schemaVersion: 2
  gameId: string
  days: Record<string, WeatherDayState>
}

const HISTORY_PREFIX = 'bbmobilenew_weather_history_v2:'
const WET_FOR_RAINBOW = new Set<WeatherConditionId>([
  'drizzle',
  'light_showers',
  'sun_showers',
  'rainy',
  'heavy_rain',
  'stormy',
])
const SUN_CAN_BREAK_THROUGH = new Set<WeatherConditionId>([
  'sunny',
  'mostly_sunny',
  'partly_cloudy',
  'light_showers',
  'sun_showers',
  'clearing',
])

/**
 * Safe offline fallback only. The canonical tuning and copy live in
 * public/config/weather-config.json and public/config/weather-bank.json.
 */
const FALLBACK_CONFIG: WeatherConfigDocument = {
  schemaVersion: 2,
  revision: 'bundled-safe-fallback',
  enabled: true,
  temperature: {
    unit: 'auto',
    baseC: 18,
    minC: -8,
    maxC: 36,
    initialJitterC: 7,
    dailyDeltaMinC: -4,
    dailyDeltaMaxC: 4,
  },
  phenomena: { rainbowChanceAfterWet: 0.3 },
  conditions: {
    sunny: {
      family: 'clear',
      initialWeight: 18,
      tempBiasC: 2,
      transitions: { sunny: 34, mostly_sunny: 28, partly_cloudy: 24, cloudy: 8, clearing: 6 },
    },
    mostly_sunny: {
      family: 'clear',
      initialWeight: 15,
      tempBiasC: 1,
      transitions: {
        sunny: 20,
        mostly_sunny: 30,
        partly_cloudy: 28,
        cloudy: 10,
        sun_showers: 6,
        clearing: 6,
      },
    },
    partly_cloudy: {
      family: 'cloud',
      initialWeight: 18,
      transitions: {
        sunny: 10,
        mostly_sunny: 16,
        partly_cloudy: 30,
        cloudy: 22,
        light_showers: 10,
        sun_showers: 6,
        clearing: 6,
      },
    },
    cloudy: {
      family: 'cloud',
      initialWeight: 16,
      transitions: {
        partly_cloudy: 15,
        cloudy: 34,
        overcast: 18,
        drizzle: 8,
        light_showers: 10,
        rainy: 8,
        clearing: 7,
      },
    },
    overcast: {
      family: 'cloud',
      initialWeight: 7,
      tempBiasC: -1,
      transitions: { cloudy: 22, overcast: 30, drizzle: 14, rainy: 16, misty: 8, clearing: 10 },
    },
    misty: {
      family: 'mist',
      initialWeight: 6,
      tempBiasC: -1,
      transitions: { misty: 32, cloudy: 20, overcast: 14, foggy: 12, drizzle: 8, clearing: 14 },
    },
    foggy: {
      family: 'mist',
      initialWeight: 3,
      tempBiasC: -2,
      transitions: { foggy: 30, misty: 30, overcast: 16, cloudy: 10, clearing: 14 },
    },
    drizzle: {
      family: 'wet',
      initialWeight: 4,
      tempBiasC: -1,
      transitions: {
        drizzle: 26,
        overcast: 20,
        cloudy: 14,
        light_showers: 14,
        rainy: 14,
        clearing: 12,
      },
    },
    light_showers: {
      family: 'wet',
      initialWeight: 4,
      tempBiasC: -1,
      transitions: {
        light_showers: 24,
        partly_cloudy: 15,
        cloudy: 12,
        sun_showers: 15,
        rainy: 12,
        clearing: 22,
      },
    },
    sun_showers: {
      family: 'wet',
      initialWeight: 2,
      tempBiasC: 1,
      transitions: {
        sun_showers: 20,
        partly_cloudy: 22,
        mostly_sunny: 15,
        light_showers: 16,
        clearing: 22,
        sunny: 5,
      },
    },
    rainy: {
      family: 'wet',
      initialWeight: 6,
      tempBiasC: -2,
      transitions: {
        rainy: 32,
        overcast: 16,
        drizzle: 10,
        light_showers: 14,
        heavy_rain: 8,
        stormy: 5,
        clearing: 15,
      },
    },
    heavy_rain: {
      family: 'wet',
      initialWeight: 2,
      tempBiasC: -3,
      transitions: {
        heavy_rain: 24,
        rainy: 34,
        stormy: 14,
        overcast: 10,
        light_showers: 8,
        clearing: 10,
      },
    },
    stormy: {
      family: 'storm',
      initialWeight: 1,
      tempBiasC: -3,
      minTempC: 7,
      transitions: {
        stormy: 18,
        heavy_rain: 28,
        rainy: 22,
        overcast: 10,
        light_showers: 8,
        clearing: 14,
      },
    },
    snow_showers: {
      family: 'snow',
      initialWeight: 1,
      tempBiasC: -8,
      maxTempC: 5,
      transitions: { snow_showers: 30, snowy: 28, overcast: 14, cloudy: 8, clearing: 20 },
    },
    snowy: {
      family: 'snow',
      initialWeight: 1,
      tempBiasC: -10,
      maxTempC: 3,
      transitions: { snowy: 30, snow_showers: 30, overcast: 14, misty: 8, clearing: 18 },
    },
    clearing: {
      family: 'transition',
      initialWeight: 4,
      tempBiasC: 1,
      transitions: {
        clearing: 20,
        sunny: 20,
        mostly_sunny: 20,
        partly_cloudy: 20,
        cloudy: 8,
        sun_showers: 7,
        light_showers: 5,
      },
    },
  },
}

const FALLBACK_START_TITLES: Record<WeatherConditionId, string> = {
  sunny: 'Day {day} opens under clear skies. ☀️',
  mostly_sunny: 'Day {day} starts bright, with a few clouds passing through. 🌤️',
  partly_cloudy: 'Day {day} opens with sun and cloud sharing the sky. ⛅',
  cloudy: 'Day {day} eases in beneath soft clouds. ☁️',
  overcast: 'Day {day} begins under a solid grey sky. ☁️',
  misty: 'Day {day} opens behind a thin veil of mist. 🌫️',
  foggy: 'Day {day} wakes inside a bank of fog. 🌫️',
  drizzle: 'A fine drizzle greets Day {day}. 🌧️',
  light_showers: 'Day {day} begins with passing showers. 🌦️',
  sun_showers: 'Sunshine and showers arrive together on Day {day}. 🌦️',
  rainy: 'Day {day} wakes to steady rain at the windows. 🌧️',
  heavy_rain: 'Day {day} opens beneath a curtain of heavy rain. 🌧️',
  stormy: 'Day {day} begins beneath a distant rumble. ⚡',
  snow_showers: 'Day {day} starts with snow showers drifting past the windows. 🌨️',
  snowy: 'Day {day} arrives with quiet snow settling outside. ❄️',
  clearing: 'Day {day} begins as the cloud starts to break. 🌤️',
}

const FALLBACK_END_TITLES: Record<string, string> = {
  sunset: 'Day {day} settles into golden hour. Everything else can wait until morning. 🌇',
  starry: 'Day {day} winds down beneath a clear, quiet sky. ✨',
  partly_cloudy: 'Day {day} fades beneath broken cloud and the last light of evening. ⛅',
  cloudy: 'Day {day} closes beneath a calm layer of cloud. ☁️',
  overcast: 'Day {day} ends under a quiet, overcast sky. ☁️',
  rainy: 'Day {day} ends with rain on the glass and the hub tucked inside. 🌧️',
  misty: 'Day {day} fades into a soft silver mist. 🌫️',
  foggy: 'Fog closes around the hub as Day {day} ends. 🌫️',
  snowy: 'Day {day} closes with snow settling softly outside. ❄️',
  stormy: 'Day {day} ends with thunder rolling somewhere beyond the walls. ⚡',
  rainbow: 'The shower moves on and a last rainbow catches the evening light. 🌈',
}

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

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededUnit(seedText: string): number {
  let seed = hashText(seedText) || 0x6d2b79f5
  seed += 0x6d2b79f5
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readHistory(gameId: string): WeatherHistoryDocument {
  if (typeof window === 'undefined') return { schemaVersion: 2, gameId, days: {} }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(`${HISTORY_PREFIX}${gameId}`) ?? 'null'
    ) as WeatherHistoryDocument | null
    if (parsed?.schemaVersion === 2 && parsed.gameId === gameId && parsed.days) return parsed
  } catch {
    // Corrupt or unavailable storage simply regenerates deterministic weather.
  }
  return { schemaVersion: 2, gameId, days: {} }
}

function writeHistory(history: WeatherHistoryDocument): void {
  if (typeof window === 'undefined') return
  try {
    const entries = Object.entries(history.days)
      .sort(([left], [right]) => Number(left) - Number(right))
      .slice(-60)
    window.localStorage.setItem(
      `${HISTORY_PREFIX}${history.gameId}`,
      JSON.stringify({ ...history, days: Object.fromEntries(entries) })
    )
  } catch {
    // Weather persistence is best-effort; deterministic generation remains safe.
  }
}

function weightedCondition(
  weights: Partial<Record<WeatherConditionId, number>>,
  config: WeatherConfigDocument,
  seedText: string
): WeatherConditionId {
  const entries = Object.entries(weights)
    .filter(([id, weight]) => config.conditions[id as WeatherConditionId] && (weight ?? 0) > 0)
    .map(([id, weight]) => [id as WeatherConditionId, weight as number] as const)
  const fallbackEntries = Object.entries(config.conditions)
    .filter((entry): entry is [WeatherConditionId, WeatherConditionConfig] => Boolean(entry[1]))
    .map(([id, condition]) => [id, Math.max(0, condition.initialWeight)] as const)
  const pool = entries.length ? entries : fallbackEntries
  const total = pool.reduce((sum, [, weight]) => sum + weight, 0)
  if (pool.length === 0 || total <= 0) return 'partly_cloudy'
  let target = seededUnit(seedText) * total
  for (const [id, weight] of pool) {
    target -= weight
    if (target <= 0) return id
  }
  return pool[pool.length - 1][0]
}

function initialCondition(config: WeatherConfigDocument, gameId: string): WeatherConditionId {
  const weights: Partial<Record<WeatherConditionId, number>> = {}
  for (const [id, condition] of Object.entries(config.conditions)) {
    if (condition && condition.initialWeight > 0)
      weights[id as WeatherConditionId] = condition.initialWeight
  }
  return weightedCondition(weights, config, `${gameId}:weather:day:1:condition`)
}

function temperatureBounds(
  condition: WeatherConditionConfig | undefined,
  config: WeatherConfigDocument
): { min: number; max: number } {
  return {
    min: Math.max(config.temperature.minC, condition?.minTempC ?? config.temperature.minC),
    max: Math.min(config.temperature.maxC, condition?.maxTempC ?? config.temperature.maxC),
  }
}

function generateDay(
  gameId: string,
  day: number,
  previous: WeatherDayState | null,
  config: WeatherConfigDocument
): WeatherDayState {
  const previousConfig = previous ? config.conditions[previous.condition] : undefined
  const condition = previous
    ? weightedCondition(
        previousConfig?.transitions ?? {},
        config,
        `${gameId}:weather:day:${day}:condition:${previous.condition}`
      )
    : initialCondition(config, gameId)
  const conditionConfig = config.conditions[condition]
  const bounds = temperatureBounds(conditionConfig, config)

  let temperatureC: number
  if (!previous) {
    const jitter =
      (seededUnit(`${gameId}:weather:day:${day}:temperature`) * 2 - 1) *
      config.temperature.initialJitterC
    temperatureC = config.temperature.baseC + jitter + (conditionConfig?.tempBiasC ?? 0)
  } else {
    const spread = config.temperature.dailyDeltaMaxC - config.temperature.dailyDeltaMinC
    const rawDelta =
      config.temperature.dailyDeltaMinC +
      seededUnit(`${gameId}:weather:day:${day}:temperature:${condition}`) * spread
    const previousBias = previousConfig?.tempBiasC ?? 0
    const nextBias = conditionConfig?.tempBiasC ?? 0
    temperatureC = previous.temperatureC + rawDelta + (nextBias - previousBias) * 0.35
  }
  temperatureC = Math.round(clamp(temperatureC, bounds.min, bounds.max))
  const deltaC = previous ? temperatureC - previous.temperatureC : 0
  const streak = previous?.condition === condition ? previous.streak + 1 : 1

  let phenomenon: WeatherPhenomenon | undefined
  const previousWasWet = previous ? WET_FOR_RAINBOW.has(previous.condition) : false
  const currentHasSunAndMoisture = condition === 'sun_showers'
  if ((previousWasWet && SUN_CAN_BREAK_THROUGH.has(condition)) || currentHasSunAndMoisture) {
    const baseChance = config.phenomena.rainbowChanceAfterWet
    const chance = currentHasSunAndMoisture ? Math.min(0.65, baseChance * 1.25) : baseChance
    if (seededUnit(`${gameId}:weather:day:${day}:rainbow`) < chance) phenomenon = 'rainbow'
  }

  return {
    day,
    condition,
    temperatureC,
    deltaC,
    streak,
    ...(phenomenon ? { phenomenon } : {}),
    generatedWithRevision: config.revision,
  }
}

/**
 * Resolve a day once and retain it by gameId. Remote config changes therefore
 * influence future unresolved days without rewriting weather the player has seen.
 */
export function resolveWeatherDay(gameId: string | undefined, day: number): WeatherDayState {
  const resolvedGameId = gameId ?? 'preview-game'
  const safeDay = Math.max(1, Math.round(day || 1))
  const history = readHistory(resolvedGameId)
  const existing = history.days[String(safeDay)]
  if (existing) return existing

  const runtime = getWeatherRuntime()
  const config =
    runtime?.config?.enabled === false ? FALLBACK_CONFIG : (runtime?.config ?? FALLBACK_CONFIG)
  let previous: WeatherDayState | null = null
  for (let cursor = 1; cursor <= safeDay; cursor += 1) {
    const key = String(cursor)
    const stored = history.days[key]
    if (stored) {
      previous = stored
      continue
    }
    const generated = generateDay(resolvedGameId, cursor, previous, config)
    history.days[key] = generated
    previous = generated
  }
  writeHistory(history)
  return history.days[String(safeDay)]
}

export function getDayStartAtmosphere(day: WeatherDayState): WeatherPresentationAtmosphere {
  return day.phenomenon === 'rainbow' ? 'rainbow' : day.condition
}

export function getDayEndAtmosphere(
  gameId: string | undefined,
  day: WeatherDayState
): WeatherPresentationAtmosphere {
  if (day.phenomenon === 'rainbow') return 'rainbow'
  switch (day.condition) {
    case 'stormy':
      return 'stormy'
    case 'snowy':
    case 'snow_showers':
      return 'snowy'
    case 'misty':
      return 'misty'
    case 'foggy':
      return 'foggy'
    case 'drizzle':
    case 'light_showers':
    case 'rainy':
    case 'heavy_rain':
      return 'rainy'
    case 'overcast':
      return 'overcast'
    case 'cloudy':
      return 'cloudy'
    case 'partly_cloudy':
    case 'sun_showers':
      return 'partly_cloudy'
    case 'sunny':
    case 'mostly_sunny':
    case 'clearing':
      return seededUnit(`${gameId ?? 'preview-game'}:weather:day:${day.day}:day-end`) < 0.34
        ? 'starry'
        : 'sunset'
    default:
      return 'sunset'
  }
}

function cleanCardTemplate(template: string, day: number): string {
  return (
    template
      .replaceAll('{day}', String(day))
      // Temperature belongs to the later daily bulletin, not the opening card.
      .replace(/\s*\n?\s*\{temp\}/g, '')
      .trim()
  )
}

export function getWeatherTransitionTitle(input: {
  atmosphere: WeatherPresentationAtmosphere
  phase: 'week_start' | 'week_end'
  day: number
  seedKey: string
}): string {
  if (input.atmosphere === 'rainbow' && input.phase === 'week_start') {
    return 'The rain breaks and a rainbow appears over the hub. 🌈'
  }

  const bank = getWeatherRuntime()?.bank
  const templates =
    input.phase === 'week_start'
      ? bank?.dayStartTitles[input.atmosphere as WeatherConditionId]
      : bank?.dayEndTitles[input.atmosphere]
  if (templates?.length) {
    const index = Math.floor(
      seededUnit(`${input.seedKey}:${bank?.revision}:title`) * templates.length
    )
    return cleanCardTemplate(templates[index], input.day)
  }

  const fallback =
    input.phase === 'week_start'
      ? FALLBACK_START_TITLES[input.atmosphere as WeatherConditionId]
      : FALLBACK_END_TITLES[input.atmosphere]
  return cleanCardTemplate(
    fallback ?? `Day {day} ${input.phase === 'week_start' ? 'begins' : 'comes to a close'}.`,
    input.day
  )
}

function prefersFahrenheit(): boolean {
  if (typeof navigator === 'undefined') return false
  try {
    const locale = new Intl.Locale(navigator.language)
    const region = locale.region?.toUpperCase()
    return region != null && ['US', 'BS', 'BZ', 'KY', 'FM', 'MH', 'PW', 'LR'].includes(region)
  } catch {
    return /^en-US\b/i.test(navigator.language)
  }
}

function resolvedUnit(unit: WeatherTemperatureUnit): 'c' | 'f' {
  if (unit === 'c' || unit === 'f') return unit
  return prefersFahrenheit() ? 'f' : 'c'
}

export function formatWeatherTemperature(tempC: number): string {
  const unit = resolvedUnit(getWeatherRuntime()?.config.temperature.unit ?? 'auto')
  if (unit === 'f') return `${Math.round((tempC * 9) / 5 + 32)}°F`
  return `${Math.round(tempC)}°C`
}

export function formatWeatherDelta(deltaC: number): string {
  const unit = resolvedUnit(getWeatherRuntime()?.config.temperature.unit ?? 'auto')
  const absolute = Math.abs(deltaC)
  if (unit === 'f') return `${Math.max(1, Math.round((absolute * 9) / 5))}°F`
  return `${Math.max(1, Math.round(absolute))}°C`
}

function livingAiPlayers(players: Player[]): Player[] {
  return players.filter(
    (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
  )
}

function displayNames(
  players: Player[],
  gameId: string,
  day: number
): { player: string; players: string } {
  const pool = livingAiPlayers(players)
  if (pool.length === 0) return { player: 'someone', players: 'a couple of players' }
  const firstIndex = Math.floor(seededUnit(`${gameId}:weather:day:${day}:person:1`) * pool.length)
  const first = pool[firstIndex]
  const remaining = pool.filter((player) => player.id !== first.id)
  const second = remaining.length
    ? remaining[Math.floor(seededUnit(`${gameId}:weather:day:${day}:person:2`) * remaining.length)]
    : null
  return {
    player: first.name,
    players: second ? `${first.name} and ${second.name}` : first.name,
  }
}

function eligibleBulletins(bank: WeatherBankDocument, day: WeatherDayState) {
  const phenomenonSpecific = day.phenomenon
    ? bank.bulletins.filter((template) => template.phenomenon === day.phenomenon)
    : []
  const source = phenomenonSpecific.length
    ? phenomenonSpecific
    : bank.bulletins.filter((template) => !template.phenomenon)
  return source.filter((template) => {
    if (template.conditions?.length && !template.conditions.includes(day.condition)) return false
    if (template.minTempC != null && day.temperatureC < template.minTempC) return false
    if (template.maxTempC != null && day.temperatureC > template.maxTempC) return false
    if (template.minStreak != null && day.streak < template.minStreak) return false
    if (day.day === 1 && (template.minDeltaC != null || template.maxDeltaC != null)) return false
    if (template.minDeltaC != null && day.deltaC < template.minDeltaC) return false
    if (template.maxDeltaC != null && day.deltaC > template.maxDeltaC) return false
    return true
  })
}

function chooseBulletinId(
  gameId: string,
  day: WeatherDayState,
  bank: WeatherBankDocument,
  recentIds: Set<string>
): string | null {
  const eligible = eligibleBulletins(bank, day)
  if (eligible.length === 0) return null
  const fresh = eligible.filter((template) => !recentIds.has(template.id))
  const pool = fresh.length ? fresh : eligible
  const total = pool.reduce((sum, template) => sum + (template.weight ?? 1), 0)
  let target = seededUnit(`${gameId}:weather:day:${day.day}:bulletin:${bank.revision}`) * total
  for (const template of pool) {
    target -= template.weight ?? 1
    if (target <= 0) return template.id
  }
  return pool[pool.length - 1]?.id ?? null
}

/** Build and remember one mid/late-day bulletin; never repeats a recent template if avoidable. */
export function buildWeatherBulletin(input: {
  gameId: string | undefined
  day: WeatherDayState
  players: Player[]
  forcePhenomenon?: WeatherPhenomenon
}): string {
  const gameId = input.gameId ?? 'preview-game'
  const effectiveDay: WeatherDayState = input.forcePhenomenon
    ? { ...input.day, phenomenon: input.forcePhenomenon }
    : input.day
  const bank = getWeatherRuntime()?.bank
  const names = displayNames(input.players, gameId, effectiveDay.day)

  if (!bank) {
    return `${formatWeatherTemperature(effectiveDay.temperatureC)} outside. ${
      CONDITION_LABELS[effectiveDay.condition]
    } conditions are holding around the hub.`
  }

  const history = readHistory(gameId)
  const current = history.days[String(effectiveDay.day)] ?? effectiveDay
  const recentIds = new Set(
    [effectiveDay.day - 1, effectiveDay.day - 2, effectiveDay.day - 3]
      .map((day) => history.days[String(day)]?.bulletinId)
      .filter((id): id is string => Boolean(id))
  )
  const bulletinId = current.bulletinId ?? chooseBulletinId(gameId, effectiveDay, bank, recentIds)
  const template = bank.bulletins.find((entry) => entry.id === bulletinId)
  if (!template) {
    return `${formatWeatherTemperature(effectiveDay.temperatureC)} outside. ${
      CONDITION_LABELS[effectiveDay.condition]
    } conditions are holding around the hub.`
  }

  if (!current.bulletinId) {
    history.days[String(effectiveDay.day)] = { ...current, bulletinId: template.id }
    writeHistory(history)
  }

  return template.text
    .replaceAll('{temp}', formatWeatherTemperature(effectiveDay.temperatureC))
    .replaceAll('{delta}', formatWeatherDelta(effectiveDay.deltaC))
    .replaceAll('{streak}', String(effectiveDay.streak))
    .replaceAll('{player}', names.player)
    .replaceAll('{players}', names.players)
    .replaceAll('{condition}', CONDITION_LABELS[effectiveDay.condition])
}

export function clearWeatherHistoryForGame(gameId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(`${HISTORY_PREFIX}${gameId}`)
  } catch {
    // Best-effort debug/test helper.
  }
}
