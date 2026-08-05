export * from './registryBase'

import {
  getAllGames as getAllBaseGames,
  getGame as getBaseGame,
  getPoolByFilter as getBasePoolByFilter,
  pickRandomGame as pickBaseRandomGame,
  type GameCategory,
  type GameRegistryEntry,
} from './registryBase'

const FIT_ME_IN_INSTRUCTIONS = [
  'Every round starts on a fresh board and has a fixed time limit.',
  'With 5 or more players, the last-ranked player leaves after rounds 1 and 2; round 3 keeps only the top 2.',
  'With 4 players, last place leaves in round 1 and round 2 keeps the top 2.',
  'With 3 players, a 90-second semifinal keeps the top 2.',
  'The final is a fresh head-to-head board. Its locked squares become mini houseguest avatars.',
  'Score comes from line clears and controlled drops. The highest final-round score wins.',
]

function applyRegistryOverrides(
  game: GameRegistryEntry | undefined
): GameRegistryEntry | undefined {
  if (!game || game.key !== 'tetris') return game
  return {
    ...game,
    description:
      'Survive an adaptive multi-round fitting tournament and reach the Houseguest Mosaic Final.',
    instructions: FIT_ME_IN_INSTRUCTIONS,
    resultMode: 'placement',
  }
}

export function getAllGames(): GameRegistryEntry[] {
  return getAllBaseGames().map((game) => applyRegistryOverrides(game)!)
}

export function getGame(key: string): GameRegistryEntry | undefined {
  return applyRegistryOverrides(getBaseGame(key))
}

export function getPoolByFilter(filter: {
  retired?: boolean
  category?: GameCategory
  excludeKeys?: string[]
}): GameRegistryEntry[] {
  return getBasePoolByFilter(filter).map((game) => applyRegistryOverrides(game)!)
}

export function pickRandomGame(
  seed: number,
  opts: { category?: GameCategory; excludeKeys?: string[] } = {}
): GameRegistryEntry {
  return applyRegistryOverrides(pickBaseRandomGame(seed, opts))!
}
