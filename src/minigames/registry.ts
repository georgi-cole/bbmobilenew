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
    'A three-stage Final 3 challenge. Play every stage, collect points, and try to finish with the highest total. The winner moves on to Part 3.',
  instructions: [
    'You will play 3 stages. No one is eliminated during this challenge.',
    'Signal Hunt: tap the number shown as the target. The board changes after every correct tap. Wrong taps cost time and points.',
    'Sequence Builder: slide tiles until your board matches the target. You have 5 minutes total for both puzzles. Only tiles next to the empty space can move.',
    'Risk Run: choose Safe, Standard, or Risky. Harder choices can earn more points.',
    'Warden Escape: you move 1 tile, then the warden can move up to 2. Use the walls to trap him and reach EXIT.',
    'Power Balance: turn on cells to reach the target number. Once a cell is on, you cannot turn it off.',
    'Final Override: answer 5 quick questions and choose how much of your Risk Run score to risk. Win the bet to add points; lose it and points are taken away.',
    'The highest total score wins this Final 3 part and moves to Part 3.',
  ],
  metricKind: 'points',
  metricLabel: 'Total points',
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

const DOWN_MEMORY_LANE_GAME: GameRegistryEntry = {
  key: 'downMemoryLane',
  title: 'Down Memory Lane',
  description:
    'A Final 3 head-to-head memory duel about the season you just played. Buzz first, pick the right hubmate, and protect your 5 lives.',
  instructions: [
    'You and your opponent start with 5 lives each.',
    'Questions come from this season: LOH and POS wins, nominations, eliminations, public saves, shocks, and other big moments.',
    'If you know the answer, tap BUZZ. The first player to buzz gets the question.',
    'Pick the answer from 4 hubmates shown by name and photo.',
    'Correct answer: your opponent loses 1 life.',
    'Wrong answer, or no answer after buzzing: you lose 1 life.',
    'If nobody buzzes in time, the question is skipped and a new one appears.',
    'The first player to reach 0 lives loses. The winner takes Part 3 and the final LOH power.',
  ],
  metricKind: 'points',
  metricLabel: 'Lives',
  timeLimitMs: 0,
  authoritative: true,
  scoringAdapter: 'raw',
  scoringParams: { minRaw: 0, maxRaw: 5 },
  implementation: 'react',
  reactComponentKey: 'DownMemoryLane',
  legacy: false,
  // Finale-only. The Part 3 map owns selection; ordinary competition rotation never sees it.
  weight: 0,
  category: 'trivia',
  retired: false,
  // The campaign resolver still passes the alive Final 3 count while the actual
  // minigame context contains the two Part-3 duelists, so keep the registry
  // compatible with both the 2-player host and the 3-player phase map.
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
  return [
    ...getAllBaseGames().map((game) => applyRegistryOverrides(game)!),
    FINAL_THREE_CIRCUIT_GAME,
    DOWN_MEMORY_LANE_GAME,
  ]
}

export function getGame(key: string): GameRegistryEntry | undefined {
  if (key === FINAL_THREE_CIRCUIT_GAME.key) return FINAL_THREE_CIRCUIT_GAME
  if (key === DOWN_MEMORY_LANE_GAME.key) return DOWN_MEMORY_LANE_GAME
  return applyRegistryOverrides(getBaseGame(key))
}

export function getPoolByFilter(filter: {
  retired?: boolean
  category?: GameCategory
  excludeKeys?: string[]
}): GameRegistryEntry[] {
  // Finale games are deliberately excluded from ordinary random pools.
  // They remain visible to Minigame Lab / Remote Manager through getAllGames(),
  // addressable by key through getGame(), and scheduled only by the Final 3 map.
  return getBasePoolByFilter(filter).map((game) => applyRegistryOverrides(game)!)
}

export function pickRandomGame(
  seed: number,
  opts: { category?: GameCategory; excludeKeys?: string[] } = {}
): GameRegistryEntry {
  return applyRegistryOverrides(pickBaseRandomGame(seed, opts))!
}
