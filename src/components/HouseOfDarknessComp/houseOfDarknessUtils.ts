import { mulberry32 } from '../../store/rng'

export const HOUSE_OF_DARKNESS_STARTING_HEALTH = 100
export const HOUSE_OF_DARKNESS_BASE_PAIRS = 4
export const HOUSE_OF_DARKNESS_MAX_ROUNDS = 12
export const HOUSE_OF_DARKNESS_COLUMNS = 4
export const HOUSE_OF_DARKNESS_HEAL_RATE = 0.2

export const HOUSE_OF_DARKNESS_SYMBOLS = [
  '🕯️',
  '🦇',
  '💀',
  '🕸️',
  '🧿',
  '🪦',
  '🗝️',
  '🩸',
  '👁️',
  '🦴',
  '🐦‍⬛',
  '🌑',
  '🪬',
  '⚰️',
  '🕷️',
] as const

export interface HouseOfDarknessCard {
  index: number
  symbol: string
  isFlipped: boolean
  isMatched: boolean
  isMismatch: boolean
  isPlaceholder: boolean
}

export interface DamageResolution {
  health: number
  damage: number
  lethalMistakeIndex: number | null
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

export function hashHouseOfDarknessId(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function getHouseOfDarknessPairCount(round: number): number {
  return HOUSE_OF_DARKNESS_BASE_PAIRS + Math.max(0, round - 1)
}

export function getHouseOfDarknessPlaceholderCount(
  pairCount: number,
  columns: number = HOUSE_OF_DARKNESS_COLUMNS
): number {
  const playableCards = pairCount * 2
  return (columns - (playableCards % columns)) % columns
}

export function buildHouseOfDarknessBoard(
  seed: number,
  pairCount: number,
  columns: number = HOUSE_OF_DARKNESS_COLUMNS
): HouseOfDarknessCard[] {
  if (pairCount > HOUSE_OF_DARKNESS_SYMBOLS.length) {
    throw new Error(
      `HouseOfDarkness: ${pairCount} pairs requested, but only ${HOUSE_OF_DARKNESS_SYMBOLS.length} spooky symbols exist.`
    )
  }

  const rng = mulberry32((seed ^ Math.imul(pairCount, 0x9e3779b9) ^ 0x6d2b79f5) >>> 0)
  const selected = HOUSE_OF_DARKNESS_SYMBOLS.slice(0, pairCount)
  const symbols = [...selected, ...selected]

  for (let index = symbols.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[symbols[index], symbols[swapIndex]] = [symbols[swapIndex], symbols[index]]
  }

  const playableCards: HouseOfDarknessCard[] = symbols.map((symbol, index) => ({
    index,
    symbol,
    isFlipped: false,
    isMatched: false,
    isMismatch: false,
    isPlaceholder: false,
  }))

  const placeholderCount = getHouseOfDarknessPlaceholderCount(pairCount, columns)
  const placeholders: HouseOfDarknessCard[] = Array.from(
    { length: placeholderCount },
    (_, offset) => ({
      index: playableCards.length + offset,
      symbol: '',
      isFlipped: false,
      isMatched: false,
      isMismatch: false,
      isPlaceholder: true,
    })
  )

  return [...playableCards, ...placeholders]
}

export function getHouseOfDarknessMistakeDamage(
  sessionSeed: number,
  playerId: string,
  round: number,
  mistakeIndex: number
): number {
  const rng = mulberry32(
    (sessionSeed ^
      hashHouseOfDarknessId(playerId) ^
      Math.imul(round, 0x85ebca6b) ^
      Math.imul(mistakeIndex + 1, 0xc2b2ae35)) >>>
      0
  )
  return 3 + Math.floor(rng() * 3)
}

export function applyHouseOfDarknessMistakes(params: {
  health: number
  sessionSeed: number
  playerId: string
  round: number
  mistakeStartIndex: number
  mistakeCount: number
}): DamageResolution {
  const { sessionSeed, playerId, round, mistakeStartIndex, mistakeCount } = params
  let health = params.health
  let damage = 0
  let lethalMistakeIndex: number | null = null

  for (let offset = 0; offset < mistakeCount; offset += 1) {
    const absoluteMistakeIndex = mistakeStartIndex + offset
    const hit = getHouseOfDarknessMistakeDamage(sessionSeed, playerId, round, absoluteMistakeIndex)
    damage += hit
    health = roundToOneDecimal(Math.max(0, health - hit))
    if (health <= 0) {
      lethalMistakeIndex = absoluteMistakeIndex
      break
    }
  }

  return {
    health,
    damage,
    lethalMistakeIndex,
  }
}

export function recoverHouseOfDarknessHealth(
  healthAfterDamage: number,
  damageTakenThisRound: number,
  completedBoard: boolean
): number {
  if (!completedBoard || healthAfterDamage <= 0 || damageTakenThisRound <= 0) {
    return roundToOneDecimal(clamp(healthAfterDamage, 0, HOUSE_OF_DARKNESS_STARTING_HEALTH))
  }

  const recovered = damageTakenThisRound * HOUSE_OF_DARKNESS_HEAL_RATE
  return roundToOneDecimal(
    clamp(healthAfterDamage + recovered, 0, HOUSE_OF_DARKNESS_STARTING_HEALTH)
  )
}

export function formatHouseOfDarknessHealth(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
