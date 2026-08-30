import type { CompetitionSkillWeights, MinigameAiModel } from './types'

const VOLATILITY_ENDURANCE = 0.2
const VOLATILITY_ENDURANCE_BALANCE = 0.25
const VOLATILITY_PHYSICAL = 0.3
const VOLATILITY_PUZZLE = 0.35
const VOLATILITY_PRECISION = 0.4
const VOLATILITY_TRIVIA = 0.45
const VOLATILITY_LUCK = 0.7
const VOLATILITY_HYBRID = 0.4

const WEIGHTS_PHYSICAL_TAP: CompetitionSkillWeights = {
  physical: 0.5,
  mental: 0,
  precision: 0.3,
  nerve: 0.2,
  luck: 0,
}

const WEIGHTS_PRECISION: CompetitionSkillWeights = {
  physical: 0.3,
  mental: 0.1,
  precision: 0.4,
  nerve: 0.2,
  luck: 0,
}

const WEIGHTS_PRECISION_FOCUS: CompetitionSkillWeights = {
  physical: 0.2,
  mental: 0.1,
  precision: 0.5,
  nerve: 0.2,
  luck: 0,
}

const WEIGHTS_MENTAL: CompetitionSkillWeights = {
  physical: 0,
  mental: 0.6,
  precision: 0.2,
  nerve: 0.2,
  luck: 0,
}

const WEIGHTS_MENTAL_PRECISION: CompetitionSkillWeights = {
  physical: 0,
  mental: 0.5,
  precision: 0.3,
  nerve: 0.2,
  luck: 0,
}

const WEIGHTS_ENDURANCE: CompetitionSkillWeights = {
  physical: 0.4,
  mental: 0.1,
  precision: 0.3,
  nerve: 0.2,
  luck: 0,
}

const WEIGHTS_ENDURANCE_BALANCE: CompetitionSkillWeights = {
  physical: 0.3,
  mental: 0.1,
  precision: 0.4,
  nerve: 0.2,
  luck: 0,
}

const WEIGHTS_LUCK: CompetitionSkillWeights = {
  physical: 0.05,
  mental: 0.35,
  precision: 0.1,
  nerve: 0.2,
  luck: 0.3,
}

const WEIGHTS_HYBRID: CompetitionSkillWeights = {
  physical: 0.35,
  mental: 0.25,
  precision: 0.25,
  nerve: 0.1,
  luck: 0.05,
}

const WEIGHTS_TETRIS: CompetitionSkillWeights = {
  physical: 0.1,
  mental: 0.4,
  precision: 0.4,
  nerve: 0.1,
  luck: 0,
}

const WEIGHTS_MEMORY_SPEED: CompetitionSkillWeights = {
  physical: 0,
  mental: 0.4,
  precision: 0.4,
  nerve: 0.2,
  luck: 0,
}

export const minigameAiRegistry: Record<string, MinigameAiModel> = {
  countHouse: {
    key: 'countHouse',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL_PRECISION,
  },
  triviaPulse: {
    key: 'triviaPulse',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_TRIVIA,
    weights: WEIGHTS_MENTAL,
  },
  quickTap: {
    key: 'quickTap',
    category: 'physical',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PHYSICAL,
    weights: WEIGHTS_PHYSICAL_TAP,
    // Score generation for quickTap is handled exclusively by simulateQuickTapAiScore()
    // via the simulateMinigameAiScore() dispatcher.  The authoritative tuning lives in
    // minigameAiBalance.ts.  minScore / maxScore are intentionally omitted here to
    // prevent the generic simulateAiPerformance() path from producing stale fallback
    // scores if this entry is ever accidentally called through the generic path.
    notes:
      'Quick Tap Race — band-based simulator (see minigameAiBalance.ts). ' +
      'Routing via simulateMinigameAiScore() ensures both session and challenge flows ' +
      'use the same authoritative scorer.',
  },
  quickTapSeasons: {
    key: 'quickTapSeasons',
    category: 'physical',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_HYBRID,
    weights: WEIGHTS_PHYSICAL_TAP,
    minScore: 120,
    maxScore: 320,
    notes: 'Season effects add strategic volatility to a 40-second tapping race.',
  },
  laneRacers: {
    key: 'laneRacers',
    category: 'physical',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PHYSICAL,
    weights: WEIGHTS_PHYSICAL_TAP,
    notes:
      'Lane Racers shares the Quick Tap band-based simulator so session and ' +
      'challenge AI scores stay aligned with the canvas race pacing.',
  },
  memoryMatch: {
    key: 'memoryMatch',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL,
  },
  timingBar: {
    key: 'timingBar',
    category: 'precision',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PRECISION,
    weights: WEIGHTS_PRECISION_FOCUS,
  },
  wordAnagram: {
    key: 'wordAnagram',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL,
  },
  targetPractice: {
    key: 'targetPractice',
    category: 'precision',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PRECISION,
    weights: WEIGHTS_PRECISION,
    // Bullseye Blitz now runs as a knockout bracket.
    // Strong competitors should remain threatening across multiple rounds instead
    // of trailing far behind a typical human score.
    minScore: 70,
    maxScore: 260,
    notes:
      'Bullseye Blitz — knockout rounds with escalating difficulty. ' +
      'AI scores in [70, 260] so surviving opponents stay competitive with human play.',
  },
  estimationGame: {
    key: 'estimationGame',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PRECISION,
    weights: WEIGHTS_MENTAL_PRECISION,
    minScore: 0,
    maxScore: 100,
    tiebreakerMaxMs: 110_000, // 5 rounds × 22 s max guess time = 110 s total
    scoreBuckets: [
      { minScore: 82, maxScore: 100, weight: 0.2 },
      { minScore: 67, maxScore: 82, weight: 0.4 },
      { minScore: 52, maxScore: 67, weight: 0.3 },
      { minScore: 0, maxScore: 52, weight: 0.1 },
    ],
    notes:
      'Estimation (5-round redesign) — final metric is average accuracy 0–100. ' +
      'Competitive distribution: 20% in 82–100, 40% in 67–82, 30% in 52–67, 10% below 52.',
  },
  holdWall: {
    key: 'holdWall',
    category: 'endurance',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_ENDURANCE,
    weights: WEIGHTS_ENDURANCE,
  },
  biographyBlitz: {
    key: 'biographyBlitz',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_TRIVIA,
    weights: WEIGHTS_MENTAL,
  },
  famousFigures: {
    key: 'famousFigures',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_TRIVIA,
    weights: WEIGHTS_MENTAL,
  },
  silentSaboteur: {
    key: 'silentSaboteur',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL_PRECISION,
  },
  majorityRules: {
    key: 'majorityRules',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL_PRECISION,
  },
  tiltedLedge: {
    key: 'tiltedLedge',
    category: 'endurance',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_ENDURANCE,
    weights: WEIGHTS_ENDURANCE_BALANCE,
  },
  pressurePlank: {
    key: 'pressurePlank',
    category: 'endurance',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_ENDURANCE_BALANCE,
    weights: WEIGHTS_ENDURANCE_BALANCE,
    minScore: 12,
    maxScore: 120,
    scoreBuckets: [
      { minScore: 12, maxScore: 29, weight: 0.14 },
      { minScore: 30, maxScore: 54, weight: 0.26 },
      { minScore: 55, maxScore: 79, weight: 0.32 },
      { minScore: 80, maxScore: 103, weight: 0.22 },
      { minScore: 104, maxScore: 116, weight: 0.05 },
      { minScore: 120, maxScore: 120, weight: 0.01 },
    ],
    notes:
      'Pressure Plank scores are native survival seconds. Skill-weighted bands follow the ' +
      'escalating surge schedule, with varied early falls and rare 120-second completions.',
  },
  rainBarrelBalance: {
    key: 'rainBarrelBalance',
    category: 'endurance',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_ENDURANCE_BALANCE,
    weights: WEIGHTS_ENDURANCE_BALANCE,
  },
  memoryZipline: {
    key: 'memoryZipline',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL,
  },
  swipeMaze: {
    key: 'swipeMaze',
    category: 'precision',
    scoreDirection: 'lower-is-better',
    volatility: VOLATILITY_PRECISION,
    weights: WEIGHTS_PRECISION,
  },
  colorMatch: {
    key: 'colorMatch',
    category: 'precision',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_PRECISION,
    // Keep fallback AI Color Match scores inside the competition's intended
    // performance band so precomputed scores still look like realistic matches.
    minScore: 65,
    maxScore: 99,
    // 5 rounds × 25 s each = 125 000 ms maximum total elapsed time.
    // Used to generate a simulated elapsed-time tiebreaker for AI players.
    tiebreakerMaxMs: 125_000,
    notes:
      'Color Match — elimination-based accuracy duel. Fallback AI stays in a realistic 65–99% band.',
  },
  socialStrings: {
    key: 'socialStrings',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL,
  },
  logicLocks: {
    key: 'logicLocks',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL,
  },
  snake: {
    key: 'snake',
    category: 'precision',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PRECISION,
    weights: WEIGHTS_PRECISION,
  },
  cardClash: {
    key: 'cardClash',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL,
  },
  flashFlood: {
    key: 'flashFlood',
    category: 'precision',
    scoreDirection: 'lower-is-better',
    volatility: VOLATILITY_PRECISION,
    weights: WEIGHTS_PRECISION_FOCUS,
  },
  gridLock: {
    key: 'gridLock',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL_PRECISION,
  },
  keyMaster: {
    key: 'keyMaster',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL_PRECISION,
  },
  hangman: {
    key: 'hangman',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL,
  },
  tiltLabyrinth: {
    key: 'tiltLabyrinth',
    category: 'precision',
    scoreDirection: 'lower-is-better',
    volatility: VOLATILITY_PRECISION,
    weights: WEIGHTS_PRECISION,
  },
  threeDigitsQuiz: {
    key: 'threeDigitsQuiz',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_TRIVIA,
    weights: WEIGHTS_MENTAL,
  },
  capitalization: {
    key: 'capitalization',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_TRIVIA,
    weights: WEIGHTS_MENTAL_PRECISION,
    minScore: 45,
    maxScore: 95,
    notes:
      'Capitalization uses this 45-95 skill band as the AI knowledge baseline; ' +
      'the React component converts it into per-question accuracy, speed, and attempts.',
  },
  tetris: {
    key: 'tetris',
    category: 'precision',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_TETRIS,
  },
  travelingDots: {
    key: 'travelingDots',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL_PRECISION,
    // Redesigned route-planning puzzle. Score = completion(200) + efficiency(0-500)
    // + bonus nodes(0-180) + time bonus(0-150) - hazard penalties(0-160).
    // Skilled play: 700-900. Average: 400-650. Poor play or time-out: 100-350.
    minScore: 150,
    maxScore: 880,
    notes:
      'Traveling Dots v2 — route-planning puzzle. Higher-is-better, range [150, 880]. ' +
      'Score driven by path efficiency, bonus collection, hazard avoidance, and speed.',
  },
  minesweeps: {
    key: 'minesweeps',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL,
    minScore: 520,
    maxScore: 980,
    notes:
      'Minesweeps rewards full clears, but final score is still speed-sensitive. ' +
      'Strong AI should regularly land in the upper 700s to 900s so a human clear is competitive, not automatic.',
  },
  laserPantryDash: {
    key: 'laserPantryDash',
    category: 'physical',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PHYSICAL,
    weights: WEIGHTS_PHYSICAL_TAP,
  },
  confettiCannon: {
    key: 'confettiCannon',
    category: 'precision',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_PRECISION,
  },
  buzzerSprintRelay: {
    key: 'buzzerSprintRelay',
    category: 'precision',
    scoreDirection: 'lower-is-better',
    volatility: VOLATILITY_PRECISION,
    weights: WEIGHTS_MEMORY_SPEED,
  },
  dontGoOver: {
    key: 'dontGoOver',
    category: 'luck',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_LUCK,
    weights: WEIGHTS_LUCK,
  },
  castleRescue: {
    key: 'castleRescue',
    category: 'hybrid',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_HYBRID,
    weights: WEIGHTS_HYBRID,
    // Castle Rescue has a large raw scoring economy (rescue bonus + pickups),
    // but realistic competitive finishes cluster well below the theoretical
    // perfect route. Keep AI competitive while avoiding impossible-looking
    // 2.5k+ finishes from the generic time-scaled fallback.
    minScore: 0,
    maxScore: 2000,
    scoreBuckets: [
      { minScore: 0, maxScore: 500, weight: 25 / 150 },
      { minScore: 501, maxScore: 600, weight: 25 / 150 },
      { minScore: 601, maxScore: 800, weight: 40 / 150 },
      { minScore: 801, maxScore: 1000, weight: 25 / 150 },
      { minScore: 1001, maxScore: 1200, weight: 20 / 150 },
      { minScore: 1201, maxScore: 1500, weight: 10 / 150 },
      { minScore: 1501, maxScore: 2000, weight: 5 / 150 },
    ],
    notes:
      'Castle Rescue — AI score bands normalized from the requested 25/25/40/25/20/10/5 ' +
      'ratio across 0–500, 501–600, 601–800, 801–1000, 1001–1200, 1201–1500, and 1501–2000.',
  },
  castleRescue2: {
    key: 'castleRescue2',
    category: 'hybrid',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_HYBRID,
    weights: WEIGHTS_HYBRID,
    minScore: 0,
    maxScore: 2000,
    scoreBuckets: [
      { minScore: 0, maxScore: 500, weight: 25 / 150 },
      { minScore: 501, maxScore: 600, weight: 25 / 150 },
      { minScore: 601, maxScore: 800, weight: 40 / 150 },
      { minScore: 801, maxScore: 1000, weight: 25 / 150 },
      { minScore: 1001, maxScore: 1200, weight: 20 / 150 },
      { minScore: 1201, maxScore: 1500, weight: 10 / 150 },
      { minScore: 1501, maxScore: 2000, weight: 5 / 150 },
    ],
    notes: 'Find Your Twin 2 uses the calibrated Find Your Twin score distribution.',
  },
  castleRescueRemastered: {
    key: 'castleRescueRemastered',
    category: 'hybrid',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_HYBRID,
    weights: WEIGHTS_HYBRID,
    minScore: 0,
    maxScore: 2000,
    notes: 'VIP remaster preserves the original Find Your Twin scoring model.',
  },
  castleRescue2Remastered: {
    key: 'castleRescue2Remastered',
    category: 'hybrid',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_HYBRID,
    weights: WEIGHTS_HYBRID,
    minScore: 0,
    maxScore: 2000,
    notes: 'VIP remaster preserves the Find Your Twin 2 scoring model.',
  },
  glass_bridge_brutal: {
    key: 'glass_bridge_brutal',
    category: 'endurance',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_ENDURANCE_BALANCE,
    // Nerve (composure under pressure) and mental (remembering broken tiles)
    // are the dominant skills; physical endurance matters less.
    weights: {
      physical: 0.1,
      mental: 0.3,
      precision: 0.2,
      nerve: 0.35,
      luck: 0.05,
    },
  },
  crystal_path_shattered: {
    key: 'crystal_path_shattered',
    category: 'endurance',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_ENDURANCE_BALANCE,
    weights: {
      physical: 0.1,
      mental: 0.3,
      precision: 0.2,
      nerve: 0.35,
      luck: 0.05,
    },
  },
  blackjackTournament: {
    key: 'blackjackTournament',
    category: 'luck',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_LUCK,
    weights: WEIGHTS_LUCK,
  },
  riskWheel: {
    key: 'riskWheel',
    category: 'luck',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_LUCK,
    weights: WEIGHTS_LUCK,
  },
  gridOfLuck: {
    key: 'gridOfLuck',
    category: 'luck',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_LUCK,
    weights: WEIGHTS_LUCK,
    notes:
      'Grid of Luck — cinematic elimination board with heavy variance, ' +
      'but AI still leans on mental/nerve choices for target selection.',
  },
  chainOfGreed: {
    key: 'chainOfGreed',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_HYBRID,
    weights: {
      physical: 0,
      mental: 0.4,
      precision: 0.15,
      nerve: 0.3,
      luck: 0.15,
    },
    notes:
      'Chain of Greed — higher/lower pressure game where AI balances risk, ' +
      'bank timing, and social weakest-link voting.',
  },
  wildcardWestern: {
    key: 'wildcardWestern',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL_PRECISION,
  },
  rescueTheKing: {
    key: 'rescueTheKing',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL_PRECISION,
  },
  trapAuction: {
    key: 'trapAuction',
    category: 'luck',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_LUCK,
    weights: {
      physical: 0,
      mental: 0.35,
      precision: 0.1,
      nerve: 0.3,
      luck: 0.25,
    },
    notes:
      'Trap Auction — secret bidding game; AI balances nerve to avoid the ' +
      'lowest bid while accounting for luck in reading opponent ranges.',
  },
  bigSpender: {
    key: 'bigSpender',
    category: 'luck',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_LUCK,
    weights: {
      physical: 0,
      mental: 0.2,
      precision: 0.05,
      nerve: 0.4,
      luck: 0.35,
    },
    notes: 'Big Spender combines wallet variance with nerve-led risk management.',
  },
  batteryLow: {
    key: 'batteryLow',
    category: 'luck',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_LUCK,
    weights: {
      physical: 0,
      mental: 0.25,
      precision: 0.05,
      nerve: 0.35,
      luck: 0.35,
    },
    notes:
      'Battery Low simulates private Bank Offer charging booths; AI mixes risk ' +
      'tolerance, offer value, and rack luck.',
  },
  houseOfDarkness: {
    key: 'houseOfDarkness',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_HYBRID,
    weights: {
      physical: 0,
      mental: 0.45,
      precision: 0.25,
      nerve: 0.25,
      luck: 0.05,
    },
    notes:
      'House of Darkness rewards memory, precision, and composure while preserving a small amount of board variance.',
  },
}
