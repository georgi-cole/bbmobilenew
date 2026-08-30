export * from './registryBase'

import type { TranslationKey } from '../i18n/messages'
import {
  getAllGames as getAllBaseGames,
  getGame as getBaseGame,
  getPoolByFilter as getBasePoolByFilter,
  pickRandomGame as pickBaseRandomGame,
  type GameCategory,
  type GameRegistryEntry,
} from './registryBase'

interface LocalizedRegistryMetadata {
  descriptionKey?: TranslationKey
  instructionKeys?: TranslationKey[]
}

const FIT_ME_IN_INSTRUCTION_KEYS: TranslationKey[] = [
  'fitMeIn.rules.freshBoard',
  'fitMeIn.rules.fivePlus',
  'fitMeIn.rules.fourPlayers',
  'fitMeIn.rules.threePlayers',
  'fitMeIn.rules.mosaicFinal',
]

const FIT_ME_IN_INSTRUCTIONS = [
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.freshBoard.
  'Each round starts with a fresh board. Clear lines to score before time runs out.',
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.fivePlus.
  '5+ players: last place leaves after Rounds 1 and 2; Round 3 keeps the top 2.',
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.fourPlayers.
  '4 players: last place leaves after Round 1; Round 2 keeps the top 2.',
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.threePlayers.
  '3 players: a 90-second semifinal keeps the top 2.',
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.mosaicFinal.
  'Final: two players get a fresh board. The highest score wins.',
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.scoring.
  'Score comes from line clears and controlled drops. The highest final-round score wins.',
]

function applyRegistryOverrides(
  game: GameRegistryEntry | undefined
): GameRegistryEntry | undefined {
  if (!game || game.key !== 'tetris') return game
  return {
    ...game,
    description:
      // i18n-ignore: Canonical English fallback; the rules modal uses fitMeIn.description.
      'Survive an adaptive multi-round fitting tournament and reach the Houseguest Mosaic Final.',
    instructions: FIT_ME_IN_INSTRUCTIONS,
    resultMode: 'placement',
    descriptionKey: 'fitMeIn.description',
    instructionKeys: FIT_ME_IN_INSTRUCTION_KEYS,
  } as GameRegistryEntry & LocalizedRegistryMetadata
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
