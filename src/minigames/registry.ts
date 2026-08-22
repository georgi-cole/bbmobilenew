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

const RULES_DRAFTS_STORAGE_KEY = 'bbmobile.rules-manager.drafts.v1'

function applyRuntimeRules(game: GameRegistryEntry): GameRegistryEntry {
  if (typeof window === 'undefined') return game
  try {
    const drafts = JSON.parse(window.localStorage.getItem(RULES_DRAFTS_STORAGE_KEY) ?? '{}') as Record<string, { description?: string; instructions?: string[] }>
    const draft = drafts[game.key]
    if (!draft) return game
    return {
      ...game,
      ...(typeof draft.description === 'string' ? { description: draft.description } : {}),
      ...(Array.isArray(draft.instructions) ? { instructions: draft.instructions } : {}),
    }
  } catch {
    return game
  }
}

const FIT_ME_IN_INSTRUCTION_KEYS: TranslationKey[] = [
  'fitMeIn.rules.freshBoard',
  'fitMeIn.rules.fivePlus',
  'fitMeIn.rules.fourPlayers',
  'fitMeIn.rules.threePlayers',
  'fitMeIn.rules.mosaicFinal',
  'fitMeIn.rules.scoring',
]

const FIT_ME_IN_INSTRUCTIONS = [
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.freshBoard.
  'Every round starts on a fresh board and has a fixed time limit.',
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.fivePlus.
  'With 5 or more players, the last-ranked player leaves after rounds 1 and 2; round 3 keeps only the top 2.',
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.fourPlayers.
  'With 4 players, last place leaves in round 1 and round 2 keeps the top 2.',
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.threePlayers.
  'With 3 players, a 90-second semifinal keeps the top 2.',
  // i18n-ignore: Canonical English fallback; the shared rules modal uses fitMeIn.rules.mosaicFinal.
  'The final is a fresh head-to-head board. Its locked squares become mini houseguest avatars.',
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
  return getAllBaseGames().map((game) => applyRuntimeRules(applyRegistryOverrides(game)!))
}

export function getGame(key: string): GameRegistryEntry | undefined {
  const game = applyRegistryOverrides(getBaseGame(key))
  return game ? applyRuntimeRules(game) : undefined
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
