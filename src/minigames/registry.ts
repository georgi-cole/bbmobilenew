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

const FINAL_THREE_CIRCUIT_GAME: GameRegistryEntry = {
  key: 'finalThreeCircuit',
  title: 'Final Three Circuit',
  description:
    'A finale-only multi-stage qualifier used for Final HOH Parts 1 and 2. Every competitor completes Signal Hunt, Sequence Builder and Risk Run; the highest 300-point total advances.',
  instructions: [
    'Every competitor completes all three stages. Nobody is removed during the Circuit.',
    'Signal Hunt: find changing target nodes against a reshuffling board before the clock expires. Wrong taps cost time and points.',
    'Sequence Builder: solve two sliding puzzles using one shared five-minute clock. Only tiles touching the empty slot can move.',
    'Risk Run: choose Safe, Standard, or Risky difficulty for Warden Escape and Power Balance, then choose a stake for the five-call Final Override.',
    'Warden Escape uses a two-step guard: after each move you make, the guard moves up to two tiles toward you, prioritising horizontal pursuit. Use walls to trap him and reach the exit.',
    'Scores carry across all three stages. The highest total out of 300 wins the active Final HOH qualifier.',
  ],
  metricKind: 'points',
  metricLabel: 'Circuit points',
  timeLimitMs: 0,
  authoritative: true,
  scoringAdapter: 'raw',
  scoringParams: { minRaw: 150, maxRaw: 285 },
  implementation: 'react',
  reactComponentKey: 'FinalThreeCircuit',
  legacy: false,
  // Finale-only: visible to Lab / Game Manager and selected explicitly by the
  // Final 3 Part 1/2 map, but never added to ordinary weighted random pools.
  weight: 0,
  category: 'logic',
  retired: false,
  minPlayers: 2,
  maxPlayers: 3,
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
  return [...getAllBaseGames().map((game) => applyRegistryOverrides(game)!), FINAL_THREE_CIRCUIT_GAME]
}

export function getGame(key: string): GameRegistryEntry | undefined {
  if (key === FINAL_THREE_CIRCUIT_GAME.key) return FINAL_THREE_CIRCUIT_GAME
  return applyRegistryOverrides(getBaseGame(key))
}

export function getPoolByFilter(filter: {
  retired?: boolean
  category?: GameCategory
  excludeKeys?: string[]
}): GameRegistryEntry[] {
  // Final Three Circuit is deliberately excluded from ordinary random pools.
  // It remains visible to Minigame Lab / Remote Manager through getAllGames(),
  // addressable by key through getGame(), and scheduled only by the Final 3 map.
  return getBasePoolByFilter(filter).map((game) => applyRegistryOverrides(game)!)
}

export function pickRandomGame(
  seed: number,
  opts: { category?: GameCategory; excludeKeys?: string[] } = {}
): GameRegistryEntry {
  return applyRegistryOverrides(pickBaseRandomGame(seed, opts))!
}
