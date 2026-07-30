import type { CupidArrowPair, GameState, Player } from '../../types'
import { mulberry32 } from '../../store/rng'
import type { SeasonArchive } from '../../store/seasonArchive'

export const CUPID_ARROW_BREAK_AFTER_PAIRS = 4
export const CUPID_ARROW_DEFAULT_SEASON = 3
export const CUPID_ARROW_RETRY_CHANCE = 0.1
const CUPID_ARROW_SCHEDULE_SALT = 0x2d1402c9

export const CUPID_PAIR_COLORS = [
  '#ff5d8f',
  '#5bbcff',
  '#ffc857',
  '#7bd389',
  '#b388ff',
  '#ff8a5b',
  '#42d7c7',
  '#f06ed6',
] as const

type CupidGame = Pick<GameState, 'cupidArrow'>

export interface CupidArrowScheduleOptions {
  season: number
  seasonArchives: readonly SeasonArchive[]
  seed: number
  /** Debug-only explicit season selection. */
  seasonOverride?: number | null
  now?: Date
}

/** Cupid's Arrow takes over every season that begins on Valentine's Day. */
export function isCupidArrowValentinesDay(now: Date = new Date()): boolean {
  return now.getMonth() === 1 && now.getDate() === 14
}

/**
 * Production scheduling for the season-format shock. Season 3 is its debut;
 * after an active season, the following season is always clear. From Season 5
 * onward, eligible seasons get a stable 10% seeded draw. The seed is freshly
 * generated at season reset, so the draw is random once and cannot change
 * when a saved season is re-opened.
 */
export function shouldScheduleCupidArrowSeason({
  season,
  seasonArchives,
  seed,
  seasonOverride = null,
  now = new Date(),
}: CupidArrowScheduleOptions): boolean {
  if (isCupidArrowValentinesDay(now)) return true
  if (seasonOverride != null) return seasonOverride === season
  if (season === CUPID_ARROW_DEFAULT_SEASON) return true
  if (season < CUPID_ARROW_DEFAULT_SEASON + 2) return false

  const previousSeason = seasonArchives.find((archive) => archive.seasonIndex === season - 1)
  if (previousSeason?.cupidArrowActivated === true) return false

  const scheduleRng = mulberry32(
    (seed ^ Math.imul(season, 0x9e3779b1) ^ CUPID_ARROW_SCHEDULE_SALT) >>> 0
  )
  return scheduleRng() < CUPID_ARROW_RETRY_CHANCE
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function normalizedSex(player: Player): 'male' | 'female' | 'other' {
  const value = player.sex?.trim().toLowerCase()
  if (value === 'male' || value === 'man') return 'male'
  if (value === 'female' || value === 'woman') return 'female'
  return 'other'
}

/**
 * Prefer male/female pairings, then pair every remaining housemate without
 * gender restrictions. The seeded shuffle keeps save/replay results stable.
 */
export function createCupidArrowPairs(players: readonly Player[], seed: number): CupidArrowPair[] {
  const rng = mulberry32((seed ^ 0xc0a1d5a7) >>> 0)
  const active = players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
  const males = shuffle(
    active.filter((player) => normalizedSex(player) === 'male'),
    rng
  )
  const females = shuffle(
    active.filter((player) => normalizedSex(player) === 'female'),
    rng
  )
  const leftovers = shuffle(
    active.filter((player) => normalizedSex(player) === 'other'),
    rng
  )
  const memberPairs: Array<[Player, Player]> = []

  while (males.length > 0 && females.length > 0) {
    memberPairs.push([males.pop()!, females.pop()!])
  }

  const unrestricted = shuffle([...males, ...females, ...leftovers], rng)
  while (unrestricted.length >= 2) {
    memberPairs.push([unrestricted.pop()!, unrestricted.pop()!])
  }

  // Cupid's Arrow is a pairs format. An odd late-entry roster cannot be fully
  // paired, so the unmatched player remains outside the spell.
  return memberPairs.map(([first, second], index) => ({
    id: `cupid-pair-${index + 1}`,
    memberIds: [first.id, second.id],
    color: CUPID_PAIR_COLORS[index % CUPID_PAIR_COLORS.length],
  }))
}

export function isCupidArrowActive(game: CupidGame): boolean {
  return game.cupidArrow?.status === 'active'
}

/** Prevent other shocks during Cupid's reveal window and active pair game. */
export function isCupidArrowTwistLocked(game: CupidGame): boolean {
  return game.cupidArrow?.status === 'scheduled' || game.cupidArrow?.status === 'active'
}

export function getCupidPair(
  game: CupidGame,
  playerId: string | null | undefined
): CupidArrowPair | null {
  if (!playerId) return null
  return game.cupidArrow?.pairs.find((pair) => pair.memberIds.includes(playerId)) ?? null
}

export function getCupidPartnerId(
  game: CupidGame,
  playerId: string | null | undefined,
  options: { includeBroken?: boolean } = {}
): string | null {
  if (!playerId) return null
  if (!options.includeBroken && !isCupidArrowActive(game)) return null
  const pair = getCupidPair(game, playerId)
  return pair?.memberIds.find((id) => id !== playerId) ?? null
}

export function expandCupidIds(game: CupidGame, ids: readonly string[]): string[] {
  if (!isCupidArrowActive(game)) return [...new Set(ids)]
  const expanded = new Set(ids)
  ids.forEach((id) => {
    const partnerId = getCupidPartnerId(game, id)
    if (partnerId) expanded.add(partnerId)
  })
  return [...expanded]
}

export function areDistinctCupidPairs(game: CupidGame, ids: readonly string[]): boolean {
  if (!isCupidArrowActive(game)) return new Set(ids).size === ids.length
  const pairKeys = ids.map((id) => getCupidPair(game, id)?.id ?? `solo:${id}`)
  return new Set(pairKeys).size === pairKeys.length
}

export function isSameCupidPair(
  game: CupidGame,
  firstId: string | null | undefined,
  secondId: string | null | undefined
): boolean {
  if (!firstId || !secondId || firstId === secondId || !isCupidArrowActive(game)) return false
  const pair = getCupidPair(game, firstId)
  return pair?.memberIds.includes(secondId) === true
}
