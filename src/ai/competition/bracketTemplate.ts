import type { Phase } from '../../types'

/**
 * Classic campaign competition map.
 *
 * The most specific rule matching the current day, alive-housemate count, and
 * Final 3 phase owns the random-selection pool. Keeping LOH and POS lists separate prevents
 * a short luck game from accidentally becoming the week's main competition.
 */

export interface BracketBand {
  /** Human-readable label used by tests, diagnostics, and design reviews. */
  label: string
  /** Inclusive alive-housemate bounds. */
  minPlayers: number
  maxPlayers: number
  /** Optional inclusive campaign-day bounds. */
  minDay?: number
  maxDay?: number
  /** Optional exact phases, used to make the Final 3 trilogy escalate. */
  phases?: Phase[]
  loh: string[]
  pos: string[]
}

export type BracketTemplate = BracketBand[]

export interface ClassicCampaignContext {
  day: number
  playerCount: number
  compType: 'LOH' | 'POS'
  phase?: Phase
}

/**
 * Explicitly approved normal-campaign games. Registry activation alone is not
 * enough: entries only belong here after gameplay QA and campaign approval.
 */
export const CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS = [
  'quickTap',
  'memoryMatch',
  'timingBar',
  'estimationGame',
  'holdWall',
  'famousFigures',
  'silentSaboteur',
  'majorityRules',
  'pressurePlank',
  'colorMatch',
  'logicLocks',
  'snake',
  'cardClash',
  'hangman',
  'tiltLabyrinth',
  'threeDigitsQuiz',
  'tetris',
  'minesweeps',
  'dontGoOver',
  'capitalization',
  'castleRescue',
  'glass_bridge_brutal',
  'crystal_path_shattered',
  'wildcardWestern',
  'trapAuction',
  'bigSpender',
  'chainOfGreed',
  'batteryLow',
  'houseOfDarkness',
] as const

/** Per-game story prerequisites that apply in addition to the roster map. */
export const CLASSIC_CAMPAIGN_GAME_MIN_DAY: Partial<
  Record<(typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number], number>
> = {
  // Social reads only feel earned after several days with the housemates.
  silentSaboteur: 4,
}

export function getApprovedCompetitionGameKeys(
  template: BracketTemplate = DEFAULT_BRACKET_TEMPLATE
): string[] {
  return [...new Set(template.flatMap((band) => [...band.loh, ...band.pos]))]
}

/**
 * Design rules represented below:
 *
 * - Each regular season day has its own pool, targeting the expected house
 *   count with a one-player tolerance for twists and double evictions.
 * - Day 1 is a fixed two-game premiere: Majority Rules for LOH and Quick Tap
 *   Race for POS.
 * - With many housemates, LOH uses fixed-round or simultaneous games and POS
 *   stays short. Sequential/turn-heavy formats remain in the large-cast days.
 * - LOH becomes longer and more technical as the season progresses.
 * - POS increasingly permits shorter, simpler, and chance-driven formats.
 * - Final 4 only uses games that make sense with four players.
 * - Elimination ladders, turn-order spectacles, and social-deduction formats
 *   stay in the large-cast portion of the season. They lose their tension when
 *   only a few housemates remain.
 * - Final 3 uses sustained individual challenges: endurance, precision, and
 *   multi-round score formats that do not collapse after one elimination.
 */
export const DEFAULT_BRACKET_TEMPLATE: BracketTemplate = [
  {
    label: 'Day 1 · premiere',
    minPlayers: 5,
    maxPlayers: 16,
    minDay: 1,
    maxDay: 1,
    loh: ['majorityRules'],
    pos: ['quickTap'],
  },
  {
    label: 'Day 2 · 15 housemates (±1)',
    minPlayers: 14,
    maxPlayers: 16,
    minDay: 2,
    maxDay: 2,
    loh: ['holdWall', 'memoryMatch', 'famousFigures', 'majorityRules', 'batteryLow', 'trapAuction'],
    pos: ['quickTap', 'colorMatch', 'cardClash', 'hangman', 'dontGoOver', 'tiltLabyrinth'],
  },
  {
    label: 'Day 3 · 14 housemates (±1)',
    minPlayers: 13,
    maxPlayers: 15,
    minDay: 3,
    maxDay: 3,
    loh: [
      'memoryMatch',
      'famousFigures',
      'majorityRules',
      'silentSaboteur',
      'batteryLow',
      'trapAuction',
    ],
    pos: [
      'quickTap',
      'colorMatch',
      'cardClash',
      'hangman',
      'dontGoOver',
      'tiltLabyrinth',
      'threeDigitsQuiz',
      'logicLocks',
    ],
  },
  {
    label: 'Day 4 · 13 housemates (±1)',
    minPlayers: 12,
    maxPlayers: 14,
    minDay: 4,
    maxDay: 4,
    loh: [
      'memoryMatch',
      'famousFigures',
      'silentSaboteur',
      'majorityRules',
      'batteryLow',
      'trapAuction',
    ],
    pos: [
      'quickTap',
      'colorMatch',
      'cardClash',
      'logicLocks',
      'hangman',
      'tiltLabyrinth',
      'dontGoOver',
      'threeDigitsQuiz',
    ],
  },
  {
    label: 'Day 5 · 12 housemates (±1)',
    minPlayers: 11,
    maxPlayers: 13,
    minDay: 5,
    maxDay: 5,
    loh: [
      'snake',
      'memoryMatch',
      'famousFigures',
      'silentSaboteur',
      'chainOfGreed',
      'batteryLow',
      'trapAuction',
    ],
    pos: [
      'quickTap',
      'colorMatch',
      'cardClash',
      'logicLocks',
      'hangman',
      'threeDigitsQuiz',
      'dontGoOver',
      'tiltLabyrinth',
    ],
  },
  {
    label: 'Day 6 · 11 housemates (±1)',
    minPlayers: 10,
    maxPlayers: 12,
    minDay: 6,
    maxDay: 6,
    loh: [
      'snake',
      'memoryMatch',
      'famousFigures',
      'silentSaboteur',
      'chainOfGreed',
      'batteryLow',
      'trapAuction',
    ],
    pos: [
      'quickTap',
      'colorMatch',
      'cardClash',
      'logicLocks',
      'hangman',
      'threeDigitsQuiz',
      'dontGoOver',
      'tiltLabyrinth',
    ],
  },
  {
    label: 'Day 7 · 9 housemates (±1)',
    minPlayers: 8,
    maxPlayers: 10,
    minDay: 7,
    maxDay: 7,
    loh: [
      'snake',
      'memoryMatch',
      'famousFigures',
      'silentSaboteur',
      'batteryLow',
      'chainOfGreed',
      'trapAuction',
      'glass_bridge_brutal',
      'crystal_path_shattered',
      'wildcardWestern',
    ],
    pos: [
      'logicLocks',
      'hangman',
      'tiltLabyrinth',
      'minesweeps',
      'dontGoOver',
      'bigSpender',
      'threeDigitsQuiz',
      'tetris',
    ],
  },
  {
    label: 'Day 8 · 8 housemates (±1)',
    minPlayers: 7,
    maxPlayers: 9,
    minDay: 8,
    maxDay: 8,
    loh: [
      'castleRescue',
      'memoryMatch',
      'famousFigures',
      'majorityRules',
      'timingBar',
      'estimationGame',
      'holdWall',
      'pressurePlank',
      'capitalization',
      'chainOfGreed',
      'batteryLow',
      'houseOfDarkness',
    ],
    pos: [
      'bigSpender',
      'logicLocks',
      'hangman',
      'minesweeps',
      'tetris',
      'threeDigitsQuiz',
      'dontGoOver',
    ],
  },
  {
    label: 'Day 9 · 7 housemates (±1)',
    minPlayers: 6,
    maxPlayers: 8,
    minDay: 9,
    maxDay: 9,
    loh: [
      'memoryMatch',
      'famousFigures',
      'timingBar',
      'holdWall',
      'pressurePlank',
      'capitalization',
      'chainOfGreed',
      'batteryLow',
      'houseOfDarkness',
    ],
    pos: [
      'bigSpender',
      'logicLocks',
      'hangman',
      'minesweeps',
      'tetris',
      'threeDigitsQuiz',
      'dontGoOver',
      'quickTap',
      'colorMatch',
      'tiltLabyrinth',
    ],
  },
  {
    label: 'Day 10 · 6 housemates (±1)',
    minPlayers: 5,
    maxPlayers: 7,
    minDay: 10,
    maxDay: 10,
    loh: [
      'castleRescue',
      'memoryMatch',
      'timingBar',
      'estimationGame',
      'holdWall',
      'pressurePlank',
      'capitalization',
      'batteryLow',
      'houseOfDarkness',
    ],
    pos: [
      'bigSpender',
      'logicLocks',
      'hangman',
      'minesweeps',
      'tetris',
      'threeDigitsQuiz',
      'dontGoOver',
      'quickTap',
      'colorMatch',
      'tiltLabyrinth',
    ],
  },
  {
    label: 'Day 11 · 5 housemates (±1)',
    minPlayers: 4,
    maxPlayers: 6,
    minDay: 11,
    maxDay: 11,
    loh: [
      'memoryMatch',
      'famousFigures',
      'timingBar',
      'estimationGame',
      'holdWall',
      'pressurePlank',
      'threeDigitsQuiz',
      'capitalization',
      'chainOfGreed',
      'batteryLow',
      'houseOfDarkness',
    ],
    pos: [
      'bigSpender',
      'logicLocks',
      'hangman',
      'minesweeps',
      'tetris',
      'threeDigitsQuiz',
      'dontGoOver',
      'quickTap',
      'colorMatch',
      'tiltLabyrinth',
    ],
  },
  {
    label: 'Day 12 · 4 housemates (±1)',
    minPlayers: 3,
    maxPlayers: 5,
    minDay: 12,
    maxDay: 12,
    loh: [
      'memoryMatch',
      'famousFigures',
      'timingBar',
      'estimationGame',
      'holdWall',
      'pressurePlank',
      'threeDigitsQuiz',
      'capitalization',
      'chainOfGreed',
      'batteryLow',
      'houseOfDarkness',
    ],
    pos: [
      'bigSpender',
      'logicLocks',
      'hangman',
      'minesweeps',
      'tetris',
      'threeDigitsQuiz',
      'dontGoOver',
      'quickTap',
      'colorMatch',
      'tiltLabyrinth',
    ],
  },
  {
    label: 'Final 3 - Part 1 endurance',
    minPlayers: 3,
    maxPlayers: 3,
    phases: ['final3_comp1', 'final3_comp1_minigame'],
    loh: ['holdWall', 'pressurePlank', 'houseOfDarkness'],
    pos: [],
  },
  {
    label: 'Final 3 - Part 2 precision and memory',
    minPlayers: 3,
    maxPlayers: 3,
    phases: ['final3_comp2', 'final3_comp2_minigame'],
    loh: ['memoryMatch', 'famousFigures', 'timingBar', 'estimationGame'],
    pos: [],
  },
  {
    label: 'Final 3 - Part 3 championship',
    minPlayers: 3,
    maxPlayers: 3,
    phases: ['final3_comp3', 'final3_comp3_minigame'],
    loh: ['threeDigitsQuiz', 'capitalization', 'chainOfGreed', 'batteryLow'],
    pos: [],
  },
  {
    // Phase-less compatibility pool for tools that only know the player count.
    label: '3 players (Final Trilogy)',
    minPlayers: 3,
    maxPlayers: 3,
    loh: [
      'holdWall',
      'pressurePlank',
      'houseOfDarkness',
      'memoryMatch',
      'famousFigures',
      'timingBar',
      'estimationGame',
      'threeDigitsQuiz',
      'capitalization',
      'batteryLow',
      'chainOfGreed',
    ],
    pos: [],
  },
]

function matchesCampaignContext(band: BracketBand, context: ClassicCampaignContext): boolean {
  if (context.playerCount < band.minPlayers || context.playerCount > band.maxPlayers) return false
  if (band.minDay !== undefined && context.day < band.minDay) return false
  if (band.maxDay !== undefined && context.day > band.maxDay) return false
  if (band.phases && (!context.phase || !band.phases.includes(context.phase))) return false
  return true
}

function applyGameStoryPrerequisites(pool: string[], day: number): string[] {
  return pool.filter((key) => {
    const minDay =
      CLASSIC_CAMPAIGN_GAME_MIN_DAY[key as (typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number]]
    return minDay === undefined || day >= minDay
  })
}

function getRosterFallbackBand(
  playerCount: number,
  template: BracketTemplate
): BracketBand | undefined {
  const dayGuideBands = template.filter(
    (band) =>
      !band.phases && band.minDay !== undefined && band.maxDay !== undefined && band.minDay !== 1
  )

  return dayGuideBands.sort((left, right) => {
    const distance = (band: BracketBand) =>
      playerCount < band.minPlayers
        ? band.minPlayers - playerCount
        : playerCount > band.maxPlayers
          ? playerCount - band.maxPlayers
          : 0
    const midpointDistance = (band: BracketBand) =>
      Math.abs((band.minPlayers + band.maxPlayers) / 2 - playerCount)

    return (
      distance(left) - distance(right) ||
      midpointDistance(left) - midpointDistance(right) ||
      (left.minDay ?? 0) - (right.minDay ?? 0)
    )
  })[0]
}

/**
 * Resolve the exact classic-campaign pool for a day/housemate/phase context.
 * Counts above the supported cast size use the widest large-house band. Counts
 * below Final 3 intentionally return no pool.
 */
export function getClassicCampaignPoolForContext(
  context: ClassicCampaignContext,
  template: BracketTemplate = DEFAULT_BRACKET_TEMPLATE
): string[] {
  if (context.playerCount < 3) return []

  const matched = template
    .filter((band) => matchesCampaignContext(band, context))
    .sort((left, right) => {
      const specificity = (band: BracketBand) =>
        (band.phases ? 100 : 0) + (band.minDay !== undefined || band.maxDay !== undefined ? 10 : 0)
      return specificity(right) - specificity(left)
    })[0]
  if (matched) {
    const pool = context.compType === 'POS' ? matched.pos : matched.loh
    return applyGameStoryPrerequisites(pool, context.day)
  }

  // A twist can put the roster outside a day's +/- 1 guide. Use the closest
  // safe day row rather than abandoning the curated campaign map altogether.
  const fallback = getRosterFallbackBand(context.playerCount, template)
  if (fallback) {
    const pool = context.compType === 'POS' ? fallback.pos : fallback.loh
    return applyGameStoryPrerequisites(pool, context.day)
  }

  return []
}

/**
 * Backwards-compatible count-only resolver used by admin tools and existing
 * callers. It finds the closest roster-safe day-guide row when a caller does
 * not know the current season day.
 */
export function getBracketPoolForContext(
  playerCount: number,
  compType: 'LOH' | 'POS',
  template: BracketTemplate = DEFAULT_BRACKET_TEMPLATE
): string[] {
  if (playerCount < 3) return []

  const final3Compatibility = template.find(
    (band) =>
      playerCount === 3 &&
      band.minPlayers === 3 &&
      band.maxPlayers === 3 &&
      !band.minDay &&
      !band.maxDay &&
      !band.phases
  )
  if (final3Compatibility) {
    const pool = compType === 'POS' ? final3Compatibility.pos : final3Compatibility.loh
    return applyGameStoryPrerequisites(pool, Number.MAX_SAFE_INTEGER)
  }

  const fallback = getRosterFallbackBand(playerCount, template)
  if (!fallback) {
    const genericTemplate = template.filter((band) => !band.minDay && !band.maxDay && !band.phases)
    return getClassicCampaignPoolForContext(
      { day: Number.MAX_SAFE_INTEGER, playerCount, compType },
      genericTemplate
    )
  }
  const pool = compType === 'POS' ? fallback.pos : fallback.loh
  return applyGameStoryPrerequisites(pool, Number.MAX_SAFE_INTEGER)
}
