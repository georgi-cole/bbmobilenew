// MODULE: src/minigames/registry.ts
// Unified minigame registry ported from bbmobile/js/minigames/registry.js
// Each entry includes metadata, scoring adapter, and module path for dynamic import.

import { mulberry32 } from '../store/rng';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScoringAdapterName =
  | 'raw'
  | 'rankPoints'
  | 'timeToPoints'
  | 'lowerBetter'
  | 'binary'
  | 'authoritative';

export type MetricKind = 'count' | 'time' | 'accuracy' | 'endurance' | 'hybrid' | 'points';

export type GameCategory = 'arcade' | 'endurance' | 'logic' | 'trivia';

export interface GameRegistryEntry {
  key: string;
  title: string;
  description: string;
  /** Bullet-point instructions shown in the Rules modal before the game. */
  instructions: string[];
  metricKind: MetricKind;
  metricLabel: string;
  /** Milliseconds before the game auto-ends (0 = unlimited / game controls its own end). */
  timeLimitMs: number;
  /**
   * When true the game itself determines the authoritative winner
   * and the scoring adapter defers to game-reported winner.
   */
  authoritative: boolean;
  scoringAdapter: ScoringAdapterName;
  scoringParams?: Record<string, number>;
  /** Path relative to src/minigames/legacy/, used for dynamic import. */
  modulePath: string;
  /** True for all games ported from bbmobile. */
  legacy: boolean;
  /**
   * Relative weight for random selection (higher = picked more often).
   * All non-retired games default to 1; increase for popular games.
   */
  weight: number;
  category: GameCategory;
  /** True if this entry should not be selected for new challenges. */
  retired: boolean;
  /** Key of the game that supersedes this one (for retired games). */
  replacedBy?: string;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const REGISTRY: Record<string, GameRegistryEntry> = {
  countHouse: {
    key: 'countHouse',
    title: 'Count House',
    description: 'Count objects appearing on screen quickly and accurately',
    instructions: [
      'Objects appear briefly on screen',
      'Count how many you see',
      'Enter your count using the number pad',
      'Submit before time expires',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Accuracy %',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'count-house.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  triviaPulse: {
    key: 'triviaPulse',
    title: 'Trivia Pulse',
    description: 'Time-pressured Big Brother trivia questions',
    instructions: [
      'Questions appear about Big Brother history and gameplay',
      'Select from multiple choice answers',
      'Faster correct answers score more points',
      'Answer as many as possible before time runs out',
    ],
    metricKind: 'hybrid',
    metricLabel: 'Score',
    timeLimitMs: 45_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'trivia-pulse.js',
    legacy: true,
    weight: 2,
    category: 'trivia',
    retired: false,
  },

  quickTap: {
    key: 'quickTap',
    title: 'Quick Tap Race',
    description: 'Tap as many times as possible within time limit',
    instructions: [
      'Timer starts when you begin tapping',
      'Tap anywhere on the screen rapidly',
      'Each tap counts toward your total',
      'Keep tapping until time expires',
    ],
    metricKind: 'count',
    metricLabel: 'Taps',
    timeLimitMs: 30_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'quick-tap.js',
    legacy: true,
    weight: 2,
    category: 'arcade',
    retired: false,
  },

  memoryMatch: {
    key: 'memoryMatch',
    title: 'Memory Colors',
    description: 'Watch and repeat color sequence',
    instructions: [
      'Colored buttons light up in sequence',
      'Watch and memorize the pattern',
      'Repeat the sequence by tapping the buttons',
      'Sequences get longer with each round',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Rounds',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'memory-match.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  timingBar: {
    key: 'timingBar',
    title: 'Timing Bar',
    description: 'Stop the bar near center for high score',
    instructions: [
      'A bar moves back and forth across the screen',
      'A target zone is marked in the center',
      'Tap to stop the bar',
      'Get as close to the center as you can',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Accuracy %',
    timeLimitMs: 30_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'timing-bar.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  wordAnagram: {
    key: 'wordAnagram',
    title: 'Word Anagram',
    description: 'Unscramble Big Brother words',
    instructions: [
      'Scrambled letters appear on screen',
      'Drag or tap letters to rearrange them',
      'Form the correct Big Brother word',
      'Submit your answer',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Words',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'word-anagram.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  targetPractice: {
    key: 'targetPractice',
    title: 'Target Practice',
    description: 'Tap moving targets quickly',
    instructions: [
      'Targets appear and move on screen',
      'Tap each target before it disappears',
      'Targets may move at different speeds',
      'Hit as many targets as possible',
    ],
    metricKind: 'count',
    metricLabel: 'Hits',
    timeLimitMs: 45_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'target-practice.js',
    legacy: true,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  estimationGame: {
    key: 'estimationGame',
    title: 'Estimation',
    description: 'Count dots and guess the total',
    instructions: [
      'Dots appear briefly on screen',
      'Estimate the total count',
      'Enter your estimate using the number pad',
      'Submit before time runs out',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Accuracy %',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'estimation-game.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  holdWall: {
    key: 'holdWall',
    title: 'Hold Wall',
    description: 'Endurance wall hold — last as long as possible',
    instructions: [
      'Press and hold the screen to grip the wall',
      'Stay still — moving too much causes you to lose your grip',
      'AI opponents will randomly drop over time',
      'The challenge ends only when one player remains',
    ],
    metricKind: 'endurance',
    metricLabel: 'Time (s)',
    timeLimitMs: 0,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'hold-wall.js',
    legacy: true,
    weight: 1,
    category: 'endurance',
    retired: false,
  },

  tiltedLedge: {
    key: 'tiltedLedge',
    title: 'The Tilted Ledge',
    description: 'Keep balance on a tilting ledge with telegraphed jerks',
    instructions: [
      'Hold your balance on a narrow ledge',
      'The ledge tilts and jerks unexpectedly',
      'Tap left or right to compensate',
      'Last as long as possible',
    ],
    metricKind: 'endurance',
    metricLabel: 'Time (s)',
    timeLimitMs: 0,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'tilted-ledge.js',
    legacy: true,
    weight: 1,
    category: 'endurance',
    retired: false,
  },

  pressurePlank: {
    key: 'pressurePlank',
    title: 'Pressure Plank',
    description: 'Alternate hold/release to stay within a moving safe window',
    instructions: [
      'A safe zone moves across the screen',
      'Hold to press down, release to ease up',
      'Keep the indicator inside the safe zone',
      'Last as long as possible without leaving the zone',
    ],
    metricKind: 'endurance',
    metricLabel: 'Time (s)',
    timeLimitMs: 0,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'pressure-plank.js',
    legacy: true,
    weight: 1,
    category: 'endurance',
    retired: false,
  },

  rainBarrelBalance: {
    key: 'rainBarrelBalance',
    title: 'Rain Barrel Balance',
    description: 'Align center-of-mass with target zone while water sloshes',
    instructions: [
      'Water sloshes inside a barrel',
      'Tilt your device to move the center of mass',
      'Keep the center aligned with the target zone',
      'Last as long as possible',
    ],
    metricKind: 'endurance',
    metricLabel: 'Time (s)',
    timeLimitMs: 0,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'rain-barrel-balance.js',
    legacy: true,
    weight: 1,
    category: 'endurance',
    retired: false,
  },

  memoryZipline: {
    key: 'memoryZipline',
    title: 'Memory Zipline',
    description: 'Remember and repeat zipline path sequence',
    instructions: [
      'Watch a zipline path sequence',
      'Memorize the route taken',
      'Replay the sequence by tapping platforms',
      'Sequences get longer each round',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Rounds',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'memory-zipline.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  swipeMaze: {
    key: 'swipeMaze',
    title: 'Swipe Maze',
    description: 'Navigate through a maze using swipe gestures',
    instructions: [
      'A maze is displayed on screen',
      'Swipe in a direction to move',
      'Avoid hitting walls',
      'Reach the exit as fast as possible',
    ],
    metricKind: 'time',
    metricLabel: 'Time (s)',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'lowerBetter',
    scoringParams: { targetMs: 5000, maxMs: 60000 },
    modulePath: 'swipe-maze.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  colorMatch: {
    key: 'colorMatch',
    title: 'Color Match',
    description: 'Match colors quickly and accurately',
    instructions: [
      'A color appears on screen',
      'Select the matching color from options',
      'Tap the correct color quickly',
      'Complete as many matches as possible',
    ],
    metricKind: 'count',
    metricLabel: 'Matches',
    timeLimitMs: 30_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'color-match.js',
    legacy: true,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  socialStrings: {
    key: 'socialStrings',
    title: 'Social Strings',
    description: 'Identify houseguests in alliances together',
    instructions: [
      'View a network of houseguest connections',
      'Identify alliance groups',
      'Tap or connect houseguests in the same alliance',
      'Complete the social network map',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Score',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'social-strings.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  logicLocks: {
    key: 'logicLocks',
    title: 'Logic Locks',
    description: 'Solve logic puzzles to unlock the vault',
    instructions: [
      'Clues are provided about the lock combination',
      'Use logical deduction to find the solution',
      'Input your answer',
      'Complete multiple locks',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Locks',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'logic-locks.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  snake: {
    key: 'snake',
    title: 'Snake',
    description: 'Classic snake game — eat food and grow',
    instructions: [
      'Snake moves continuously forward',
      'Change direction using controls',
      'Eat food to grow longer',
      'Avoid hitting walls or your own tail',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    modulePath: 'snake.js',
    legacy: true,
    weight: 2,
    category: 'arcade',
    retired: false,
  },

  cardClash: {
    key: 'cardClash',
    title: 'Card Clash',
    description: 'Memory card matching game',
    instructions: [
      'Cards are placed face-down in a grid',
      'Tap two cards to flip them',
      'If they match, they stay face-up',
      'Find all pairs in as few moves as possible',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Score',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'card-clash.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  flashFlood: {
    key: 'flashFlood',
    title: 'Flash Flood',
    description: 'React to flash patterns quickly',
    instructions: [
      'Patterns flash briefly on screen',
      'Memorize the highlighted areas',
      'Tap the areas that were highlighted',
      'Complete multiple patterns',
    ],
    metricKind: 'time',
    metricLabel: 'Reaction (ms)',
    timeLimitMs: 45_000,
    authoritative: false,
    scoringAdapter: 'lowerBetter',
    scoringParams: { targetMs: 200, maxMs: 2000 },
    modulePath: 'flash-flood.js',
    legacy: true,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  gridLock: {
    key: 'gridLock',
    title: 'Grid Lock',
    description: 'Unlock grid patterns puzzle',
    instructions: [
      'A locked grid is presented',
      'Clues indicate which cells to toggle',
      'Tap cells to lock/unlock them',
      'Match the solution pattern',
    ],
    metricKind: 'hybrid',
    metricLabel: 'Score',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'grid-lock.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  keyMaster: {
    key: 'keyMaster',
    title: 'Key Master',
    description: 'Unlock sequences puzzle',
    instructions: [
      'A sequence lock is presented',
      'Determine the correct unlock pattern',
      'Input the pattern using buttons or keys',
      'Unlock the sequence',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Score',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'key-master.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  hangman: {
    key: 'hangman',
    title: 'Hangman',
    description: 'Classic hangman with on-screen keyboard',
    instructions: [
      'A word is hidden with blank spaces for each letter',
      'Tap letters on the keyboard to guess',
      'Correct letters appear in the word',
      'Wrong letters reduce your remaining attempts',
    ],
    metricKind: 'hybrid',
    metricLabel: 'Score',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'hangman.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  tiltLabyrinth: {
    key: 'tiltLabyrinth',
    title: 'Tilt Labyrinth',
    description: 'Tilt phone to move ball through maze',
    instructions: [
      'Tilt your device to move the ball',
      'Navigate through walls and obstacles',
      'Reach the green goal area',
      'Avoid falling into holes (if present)',
    ],
    metricKind: 'time',
    metricLabel: 'Time (s)',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'lowerBetter',
    scoringParams: { targetMs: 5000, maxMs: 60000 },
    modulePath: 'tilt-labyrinth.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  threeDigitsQuiz: {
    key: 'threeDigitsQuiz',
    title: 'Number Trivia',
    description: 'Answer numeric trivia questions with higher/lower hints',
    instructions: [
      'Three questions are presented in sequence',
      'Each question asks for a specific number',
      'Hints are provided with graded accuracy',
      'Submit your answer for each question',
    ],
    metricKind: 'hybrid',
    metricLabel: 'Score',
    timeLimitMs: 45_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'number-trivia-quiz.js',
    legacy: true,
    weight: 1,
    category: 'trivia',
    retired: false,
  },

  tetris: {
    key: 'tetris',
    title: 'Tetris',
    description: 'Classic falling blocks puzzle',
    instructions: [
      'Blocks fall from the top of the screen',
      'Move blocks left or right',
      'Rotate blocks to fit spaces',
      'Complete horizontal lines to clear them',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    modulePath: 'tetris.js',
    legacy: true,
    weight: 2,
    category: 'logic',
    retired: false,
  },

  travelingDots: {
    key: 'travelingDots',
    title: 'Traveling Dots',
    description: 'Draw optimal path between points',
    instructions: [
      'Multiple dots appear on the screen',
      'Tap dots in sequence to connect them',
      'Create a path visiting all dots',
      'Avoid crossing your existing path',
    ],
    metricKind: 'hybrid',
    metricLabel: 'Score',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'traveling-dots.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  minesweeps: {
    key: 'minesweeps',
    title: 'Minesweeps',
    description: 'Classic minesweeper puzzle',
    instructions: [
      'Tap cells to reveal them',
      'Numbers show how many mines are adjacent',
      'Use logic to determine mine locations',
      'Flag suspected mines (long press)',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    modulePath: 'minesweeper.js',
    legacy: true,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  laserPantryDash: {
    key: 'laserPantryDash',
    title: 'Laser Pantry Dash',
    description: 'Dodge lasers and collect recipe ingredients',
    instructions: [
      'Lasers sweep across the pantry floor',
      'Swipe to dodge and move your character',
      'Collect ingredient items scattered around',
      'Avoid getting hit — collect as many as possible',
    ],
    metricKind: 'points',
    metricLabel: 'Items',
    timeLimitMs: 45_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'laser-pantry-dash.js',
    legacy: true,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  confettiCannon: {
    key: 'confettiCannon',
    title: 'Confetti Cannon',
    description: 'Tap targets quickly while avoiding decoys',
    instructions: [
      'Confetti bursts and targets appear on screen',
      'Tap real targets — avoid decoys',
      'Correct taps earn points, wrong taps lose them',
      'Score as many points as possible',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 30_000,
    authoritative: false,
    scoringAdapter: 'raw',
    modulePath: 'confetti-cannon.js',
    legacy: true,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  buzzerSprintRelay: {
    key: 'buzzerSprintRelay',
    title: 'Buzzer Sprint Relay',
    description: 'Memorize and repeat buzzer sequences quickly',
    instructions: [
      'A buzzer sequence is played',
      'Memorize the order of buzzers',
      'Repeat the sequence as fast as possible',
      'Multiple rounds with increasing complexity',
    ],
    metricKind: 'time',
    metricLabel: 'Time (s)',
    timeLimitMs: 60_000,
    authoritative: false,
    scoringAdapter: 'lowerBetter',
    scoringParams: { targetMs: 3000, maxMs: 60000 },
    modulePath: 'buzzer-sprint-relay.js',
    legacy: true,
    weight: 1,
    category: 'arcade',
    retired: false,
  },
};

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Return all game entries (including retired). */
export function getAllGames(): GameRegistryEntry[] {
  return Object.values(REGISTRY);
}

/** Return the entry for a specific game key, or undefined if not found. */
export function getGame(key: string): GameRegistryEntry | undefined {
  return REGISTRY[key];
}

/**
 * Pick a random non-retired game deterministically using the provided seed.
 * Games are selected weighted by their `weight` field.
 *
 * @param seed     - Mulberry32 seed for deterministic selection.
 * @param opts.category - Optional category filter.
 * @param opts.excludeKeys - Keys to exclude from the pool.
 */
export function pickRandomGame(
  seed: number,
  opts: { category?: GameCategory; excludeKeys?: string[] } = {},
): GameRegistryEntry {
  const pool = getPoolByFilter({
    retired: false,
    category: opts.category,
    excludeKeys: opts.excludeKeys,
  });

  if (pool.length === 0) {
    // Fallback: any non-retired game
    const fallback = getAllGames().find((g) => !g.retired);
    if (!fallback) throw new Error('[registry] No games available');
    return fallback;
  }

  // Build a weighted array of keys
  const weighted: GameRegistryEntry[] = [];
  for (const entry of pool) {
    for (let i = 0; i < entry.weight; i++) {
      weighted.push(entry);
    }
  }

  const rng = mulberry32(seed >>> 0);
  const idx = Math.floor(rng() * weighted.length);
  return weighted[idx];
}

/**
 * Return game entries matching the given filter criteria.
 */
export function getPoolByFilter(filter: {
  retired?: boolean;
  category?: GameCategory;
  excludeKeys?: string[];
}): GameRegistryEntry[] {
  return getAllGames().filter((g) => {
    if (filter.retired !== undefined && g.retired !== filter.retired) return false;
    if (filter.category && g.category !== filter.category) return false;
    if (filter.excludeKeys?.includes(g.key)) return false;
    return true;
  });
}
