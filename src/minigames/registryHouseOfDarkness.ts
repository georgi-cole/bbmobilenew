import { mulberry32 } from '../store/rng'
import {
  getAllGames as getBaseGames,
  getGame as getBaseGame,
  isPlacementRankingGame as baseIsPlacementRankingGame,
  supportsPlayerCount as baseSupportsPlayerCount,
} from './registryBase'
import type { GameCategory, GameRegistryEntry } from './registryBase'

export type {
  ScoringAdapterName,
  MetricKind,
  GameCategory,
  GameRegistryEntry,
} from './registryBase'

export const HOUSE_OF_DARKNESS_GAME: GameRegistryEntry = {
  key: 'houseOfDarkness',
  title: 'House of Darkness',
  description:
    'Survive an escalating haunted memory ritual where every mistake drains your lifespan.',
  instructions: [
    'Every contestant begins with 100% lifespan and plays the same private haunted board each round.',
    'Round 1 starts with 4 pairs. Every new round adds 1 pair; sealed VOID cards preserve a symmetrical four-column grid.',
    'Every mismatched pair costs a random 3–5% lifespan. Reach 0% and the house consumes you immediately.',
    'Completing a board restores only 20% of the lifespan lost during that round; all remaining damage carries forward.',
    'Rounds continue until one contestant remains, or until round 12 where remaining lifespan decides the winner.',
  ],
  resultMode: 'placement',
  metricKind: 'endurance',
  metricLabel: 'Placement',
  timeLimitMs: 0,
  authoritative: true,
  scoringAdapter: 'authoritative',
  implementation: 'react',
  reactComponentKey: 'HouseOfDarkness',
  legacy: false,
  weight: 1,
  category: 'logic',
  retired: false,
  minPlayers: 2,
}

export function supportsPlayerCount(game: GameRegistryEntry, playerCount: number): boolean {
  return baseSupportsPlayerCount(game, playerCount)
}

export function isPlacementRankingGame(game: Pick<GameRegistryEntry, 'resultMode'>): boolean {
  return baseIsPlacementRankingGame(game)
}

export function getAllGames(): GameRegistryEntry[] {
  return [...getBaseGames(), HOUSE_OF_DARKNESS_GAME]
}

export function getGame(key: string): GameRegistryEntry | undefined {
  return key === HOUSE_OF_DARKNESS_GAME.key ? HOUSE_OF_DARKNESS_GAME : getBaseGame(key)
}

export function getPoolByFilter(filter: {
  retired?: boolean
  category?: GameCategory
  excludeKeys?: string[]
}): GameRegistryEntry[] {
  return getAllGames().filter((game) => {
    if (filter.retired !== undefined && game.retired !== filter.retired) return false
    if (filter.category && game.category !== filter.category) return false
    if (filter.excludeKeys?.includes(game.key)) return false
    return true
  })
}

export function pickRandomGame(
  seed: number,
  opts: { category?: GameCategory; excludeKeys?: string[] } = {}
): GameRegistryEntry {
  const pool = getPoolByFilter({
    retired: false,
    category: opts.category,
    excludeKeys: opts.excludeKeys,
  })

  if (pool.length === 0) {
    const fallback = getAllGames().find((game) => !game.retired)
    if (!fallback) throw new Error('[registry] No games available')
    return fallback
  }

  const weighted: GameRegistryEntry[] = []
  for (const entry of pool) {
    for (let index = 0; index < entry.weight; index += 1) weighted.push(entry)
  }

  const rng = mulberry32(seed >>> 0)
  return weighted[Math.floor(rng() * weighted.length)] ?? weighted[0]
}
