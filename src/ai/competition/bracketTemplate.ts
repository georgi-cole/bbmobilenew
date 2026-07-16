import type { Phase } from '../../types';

/**
 * Classic campaign competition map.
 *
 * The most specific rule matching the current day, alive-housemate count, and
 * Final 3 phase owns the random-selection pool. Keeping LOH and POS lists separate prevents
 * a short luck game from accidentally becoming the week's main competition.
 */

export interface BracketBand {
  /** Human-readable label used by tests, diagnostics, and design reviews. */
  label: string;
  /** Inclusive alive-housemate bounds. */
  minPlayers: number;
  maxPlayers: number;
  /** Optional inclusive campaign-day bounds. */
  minDay?: number;
  maxDay?: number;
  /** Optional exact phases, used to make the Final 3 trilogy escalate. */
  phases?: Phase[];
  loh: string[];
  pos: string[];
}

export type BracketTemplate = BracketBand[];

export interface ClassicCampaignContext {
  day: number;
  playerCount: number;
  compType: 'LOH' | 'POS';
  phase?: Phase;
}

/**
 * Explicitly approved normal-campaign games. Registry activation alone is not
 * enough: entries only belong here after gameplay QA and campaign approval.
 * Special-purpose games such as Capitalization are intentionally absent.
 */
export const CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS = [
  'quickTap',
  'memoryMatch',
  'holdWall',
  'famousFigures',
  'silentSaboteur',
  'majorityRules',
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
  'blackjackTournament',
  'riskWheel',
  'wildcardWestern',
  'castleRescue',
  'glass_bridge_brutal',
  'crystal_path_shattered',
  'trapAuction',
  'gridOfLuck',
  'bigSpender',
  'chainOfGreed',
  'batteryLow',
] as const;

/** Per-game story prerequisites that apply in addition to the roster map. */
export const CLASSIC_CAMPAIGN_GAME_MIN_DAY: Partial<
  Record<(typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number], number>
> = {
  // Social reads only feel earned after several days with the housemates.
  silentSaboteur: 4,
};

export function getApprovedCompetitionGameKeys(
  template: BracketTemplate = DEFAULT_BRACKET_TEMPLATE,
): string[] {
  return [...new Set(template.flatMap((band) => [...band.loh, ...band.pos]))];
}

/**
 * Design rules represented below:
 *
 * - Day 1 uses immediately readable, parallel-play games at every normal
 *   cast size, so a smaller configured starting cast still gets a strong hook.
 * - With many housemates, LOH uses fixed-round or simultaneous games and POS
 *   stays short. Sequential/turn-heavy formats wait until the cast is smaller.
 * - LOH becomes longer and more technical as the season progresses.
 * - POS increasingly permits shorter, simpler, and chance-driven formats.
 * - Final 4 only uses games that make sense with four players.
 * - Each Final 3 part has a distinct style and an escalating difficulty curve.
 */
export const DEFAULT_BRACKET_TEMPLATE: BracketTemplate = [
  {
    label: 'Day 1 hook',
    minPlayers: 5,
    maxPlayers: 16,
    minDay: 1,
    maxDay: 1,
    loh: ['holdWall', 'majorityRules', 'memoryMatch'],
    pos: ['quickTap', 'colorMatch', 'dontGoOver'],
  },
  {
    label: '16-13 players',
    minPlayers: 13,
    maxPlayers: 16,
    loh: [
      'holdWall',
      'memoryMatch',
      'famousFigures',
      'majorityRules',
      'batteryLow',
    ],
    pos: ['quickTap', 'colorMatch', 'cardClash', 'hangman', 'dontGoOver', 'tiltLabyrinth'],
  },
  {
    label: '12-10 players',
    minPlayers: 10,
    maxPlayers: 12,
    loh: ['memoryMatch', 'famousFigures', 'majorityRules', 'silentSaboteur', 'batteryLow'],
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
    label: '9-8 players',
    minPlayers: 8,
    maxPlayers: 9,
    loh: ['snake', 'memoryMatch', 'famousFigures', 'silentSaboteur', 'batteryLow', 'chainOfGreed'],
    pos: ['logicLocks', 'hangman', 'tiltLabyrinth', 'minesweeps', 'dontGoOver', 'bigSpender', 'threeDigitsQuiz', 'tetris'],
  },
  {
    label: '7-5 players',
    minPlayers: 5,
    maxPlayers: 7,
    loh: [
      'castleRescue',
      'glass_bridge_brutal',
      'chainOfGreed',
      'trapAuction',
      'silentSaboteur',
      'batteryLow',
    ],
    pos: ['riskWheel', 'blackjackTournament', 'bigSpender', 'logicLocks', 'hangman', 'minesweeps', 'tetris'],
  },
  {
    label: '4 players',
    minPlayers: 4,
    maxPlayers: 4,
    loh: ['crystal_path_shattered', 'chainOfGreed', 'batteryLow', 'trapAuction', 'holdWall'],
    pos: ['gridOfLuck', 'riskWheel', 'blackjackTournament', 'bigSpender', 'tetris'],
  },
  {
    label: 'Final 3 - Part 1 endurance',
    minPlayers: 3,
    maxPlayers: 3,
    phases: ['final3_comp1', 'final3_comp1_minigame'],
    loh: ['holdWall', 'glass_bridge_brutal'],
    pos: [],
  },
  {
    label: 'Final 3 - Part 2 precision and memory',
    minPlayers: 3,
    maxPlayers: 3,
    phases: ['final3_comp2', 'final3_comp2_minigame'],
    loh: ['memoryMatch', 'famousFigures', 'castleRescue', 'batteryLow'],
    pos: [],
  },
  {
    label: 'Final 3 - Part 3 championship',
    minPlayers: 3,
    maxPlayers: 3,
    phases: ['final3_comp3', 'final3_comp3_minigame'],
    loh: ['crystal_path_shattered', 'chainOfGreed', 'wildcardWestern', 'trapAuction'],
    pos: [],
  },
  {
    // Phase-less compatibility pool for tools that only know the player count.
    label: '3 players (Final Trilogy)',
    minPlayers: 3,
    maxPlayers: 3,
    loh: [
      'holdWall',
      'glass_bridge_brutal',
      'memoryMatch',
      'famousFigures',
      'castleRescue',
      'batteryLow',
      'crystal_path_shattered',
      'chainOfGreed',
      'wildcardWestern',
      'trapAuction',
    ],
    pos: [],
  },
];

function matchesCampaignContext(band: BracketBand, context: ClassicCampaignContext): boolean {
  if (context.playerCount < band.minPlayers || context.playerCount > band.maxPlayers) return false;
  if (band.minDay !== undefined && context.day < band.minDay) return false;
  if (band.maxDay !== undefined && context.day > band.maxDay) return false;
  if (band.phases && (!context.phase || !band.phases.includes(context.phase))) return false;
  return true;
}

function applyGameStoryPrerequisites(pool: string[], day: number): string[] {
  return pool.filter((key) => {
    const minDay = CLASSIC_CAMPAIGN_GAME_MIN_DAY[
      key as (typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number]
    ];
    return minDay === undefined || day >= minDay;
  });
}

/**
 * Resolve the exact classic-campaign pool for a day/housemate/phase context.
 * Counts above the supported cast size use the widest large-house band. Counts
 * below Final 3 intentionally return no pool.
 */
export function getClassicCampaignPoolForContext(
  context: ClassicCampaignContext,
  template: BracketTemplate = DEFAULT_BRACKET_TEMPLATE,
): string[] {
  const matched = template
    .filter((band) => matchesCampaignContext(band, context))
    .sort((left, right) => {
      const specificity = (band: BracketBand) =>
        (band.phases ? 100 : 0) +
        (band.minDay !== undefined || band.maxDay !== undefined ? 10 : 0);
      return specificity(right) - specificity(left);
    })[0];
  if (matched) {
    const pool = context.compType === 'POS' ? matched.pos : matched.loh;
    return applyGameStoryPrerequisites(pool, context.day);
  }

  if (context.playerCount > 16) {
    const widest = template.find(
      (band) => band.minPlayers === 13 && band.maxPlayers === 16 && !band.minDay && !band.phases,
    );
    if (widest) {
      const pool = context.compType === 'POS' ? widest.pos : widest.loh;
      return applyGameStoryPrerequisites(pool, context.day);
    }
  }

  return [];
}

/**
 * Backwards-compatible count-only resolver used by admin tools and existing
 * callers. Day-specific and Final 3 phase-specific rows are skipped because
 * those callers do not have enough context to select them safely.
 */
export function getBracketPoolForContext(
  playerCount: number,
  compType: 'LOH' | 'POS',
  template: BracketTemplate = DEFAULT_BRACKET_TEMPLATE,
): string[] {
  const genericTemplate = template.filter((band) => !band.minDay && !band.maxDay && !band.phases);
  return getClassicCampaignPoolForContext(
    { day: Number.MAX_SAFE_INTEGER, playerCount, compType },
    genericTemplate,
  );
}
