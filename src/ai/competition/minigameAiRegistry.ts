import type { CompetitionSkillWeights, MinigameAiModel } from './types';

const VOLATILITY_ENDURANCE = 0.2;
const VOLATILITY_ENDURANCE_BALANCE = 0.25;
const VOLATILITY_PHYSICAL = 0.3;
const VOLATILITY_PUZZLE = 0.35;
const VOLATILITY_PRECISION = 0.4;
const VOLATILITY_TRIVIA = 0.45;
const VOLATILITY_LUCK = 0.7;
const VOLATILITY_HYBRID = 0.4;

const WEIGHTS_PHYSICAL_TAP: CompetitionSkillWeights = {
  physical: 0.5,
  mental: 0,
  precision: 0.3,
  nerve: 0.2,
  luck: 0,
};

const WEIGHTS_PRECISION: CompetitionSkillWeights = {
  physical: 0.3,
  mental: 0.1,
  precision: 0.4,
  nerve: 0.2,
  luck: 0,
};

const WEIGHTS_PRECISION_FOCUS: CompetitionSkillWeights = {
  physical: 0.2,
  mental: 0.1,
  precision: 0.5,
  nerve: 0.2,
  luck: 0,
};

const WEIGHTS_MENTAL: CompetitionSkillWeights = {
  physical: 0,
  mental: 0.6,
  precision: 0.2,
  nerve: 0.2,
  luck: 0,
};

const WEIGHTS_MENTAL_PRECISION: CompetitionSkillWeights = {
  physical: 0,
  mental: 0.5,
  precision: 0.3,
  nerve: 0.2,
  luck: 0,
};

const WEIGHTS_ENDURANCE: CompetitionSkillWeights = {
  physical: 0.4,
  mental: 0.1,
  precision: 0.3,
  nerve: 0.2,
  luck: 0,
};

const WEIGHTS_ENDURANCE_BALANCE: CompetitionSkillWeights = {
  physical: 0.3,
  mental: 0.1,
  precision: 0.4,
  nerve: 0.2,
  luck: 0,
};

const WEIGHTS_LUCK: CompetitionSkillWeights = {
  physical: 0.05,
  mental: 0.35,
  precision: 0.1,
  nerve: 0.2,
  luck: 0.3,
};

const WEIGHTS_HYBRID: CompetitionSkillWeights = {
  physical: 0.35,
  mental: 0.25,
  precision: 0.25,
  nerve: 0.1,
  luck: 0.05,
};

const WEIGHTS_TETRIS: CompetitionSkillWeights = {
  physical: 0.1,
  mental: 0.4,
  precision: 0.4,
  nerve: 0.1,
  luck: 0,
};

const WEIGHTS_MEMORY_SPEED: CompetitionSkillWeights = {
  physical: 0,
  mental: 0.4,
  precision: 0.4,
  nerve: 0.2,
  luck: 0,
};

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
    // Effective-tap score range for a 30-second game.
    // ~39 raw taps/10s is the observed human upper bound; sustained 30s output
    // is lower due to fatigue.  AI range is calibrated so competitors are
    // realistically competitive rather than predetermined to lose.
    // Values represent effective (multiplier-adjusted) taps.
    minScore: 48,
    maxScore: 120,
    notes:
      'Quick Tap Race — 30s game. AI produces effective-tap scores in [48, 120] ' +
      'matching the expected human range after multiplier effects.',
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
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_PRECISION,
  },
  estimationGame: {
    key: 'estimationGame',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PRECISION,
    weights: WEIGHTS_MENTAL_PRECISION,
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
  wildcardWestern: {
    key: 'wildcardWestern',
    category: 'mental',
    scoreDirection: 'higher-is-better',
    volatility: VOLATILITY_PUZZLE,
    weights: WEIGHTS_MENTAL_PRECISION,
  },
};
