// MODULE: src/minigames/registry.ts
// Unified minigame registry ported from bbmobile/js/minigames/registry.js
// Each entry includes metadata, scoring adapter, and module path for dynamic import.

import { mulberry32 } from '../store/rng';
import { DEFAULT_LANE_RACERS_DURATION_MS } from './laneRacers/constants';

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
  /** Whether results for this game should be communicated as scores or placements/ranks. */
  resultMode?: 'score' | 'placement';
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
  /**
   * 'react' for games implemented as React components; 'legacy' (default) for games
   * loaded via LegacyMinigameWrapper from a JS bundle.
   */
  implementation?: 'react' | 'legacy';
  /**
   * When implementation === 'react', identifies which React component to render.
   * MinigameHost uses this key to select the correct component.
   */
  reactComponentKey?: string;
  /** Path relative to src/minigames/legacy/, used for dynamic import. Only required when implementation !== 'react'. */
  modulePath?: string;
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

export function isPlacementRankingGame(
  game: Pick<GameRegistryEntry, 'resultMode'>,
): boolean {
  return game.resultMode === 'placement';
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
    retired: true,
  },

  triviaPulse: {
    key: 'triviaPulse',
    title: 'Trivia Pulse',
    description: 'Time-pressured strategy trivia questions',
    instructions: [
      'Questions appear about game history and gameplay',
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
    retired: true,
  },

  quickTap: {
    key: 'quickTap',
    title: 'Quick Tap Race',
    description: 'Tap as fast as you can for 30 seconds! Special power-ups and debuffs appear mid-game.',
    instructions: [
      'A 3-second countdown starts immediately — watch for "GO!" on-screen',
      'Tap the on-canvas button as fast as possible for 30 seconds',
      'Watch for the 🎁 MYSTERY BOOSTER prompt on the canvas — tap it to activate!',
      'Power-ups (⚡ 2× Frenzy, 🔥 3× Turbo) double or triple each tap value',
      'Beware debuffs like 🥴 Fumble or ⌛ -3 SECONDS that hurt your score',
      'Your score is based on effective taps (raw taps × any active multiplier)',
    ],
    metricKind: 'count',
    metricLabel: 'Taps',
    timeLimitMs: 30_000,
    authoritative: false,
    scoringAdapter: 'raw',
    implementation: 'react' as const,
    reactComponentKey: 'QuickTapRace',
    legacy: false,
    weight: 2,
    category: 'arcade',
    retired: false,
  },

  laneRacers: {
    key: 'laneRacers',
    title: 'Lane Racers',
    description: 'A premium canvas lane sprint where rapid taps power your racer through boosters and mystery gifts.',
    instructions: [
      'A broadcast-style countdown starts before the race goes live',
      'Tap rapidly in the lower zone or use the TAP button to build speed and momentum',
      'Use DODGE to skip the next pickup so boosters and gifts are not pure luck',
      'Booster pickups and mystery gifts can trigger short surges, shields, or risky lane effects',
      'AI racers have their own rhythm swings, so leads can change quickly',
      'Highest score at the finish wins the sprint',
    ],
    metricKind: 'count',
    metricLabel: 'Points',
    timeLimitMs: DEFAULT_LANE_RACERS_DURATION_MS,
    authoritative: false,
    scoringAdapter: 'raw',
    implementation: 'react' as const,
    reactComponentKey: 'LaneRacers',
    legacy: false,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  memoryMatch: {
    key: 'memoryMatch',
    title: 'Memory Colors',
    description: 'Watch and rebuild a growing sequence of named color swatches',
    instructions: [
      'A sequence of named color swatches flashes one by one',
      'Round 1 starts with 5 colors, and each new round adds 1 more',
      'Rebuild the exact same color order from the full 20-color pool',
      'Your run ends on the 3rd total mistake',
      'Furthest round wins; ties break by fewer mistakes, then faster time',
    ],
    resultMode: 'placement',
    metricKind: 'accuracy',
    metricLabel: 'Rounds',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'MemoryColors',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  timingBar: {
    key: 'timingBar',
    title: 'Timing Bar',
    description: 'Stop the bar at the centre and lock in your best shot',
    instructions: [
      'A bar bounces back and forth across the screen',
      'Stop the bar as close to the centre as possible',
      'You can stop the bar multiple times to test your timing',
      'Only one stop can be locked in as your final answer per round',
      'Each extra soft stop costs -6% accuracy',
      'Lock in before the timer runs out or you score 0%',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Accuracy %',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'TimingBar',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  wordAnagram: {
    key: 'wordAnagram',
    title: 'Word Anagram',
    description: 'Unscramble game words',
    instructions: [
      'Scrambled letters appear on screen',
      'Drag or tap letters to rearrange them',
      'Form the correct game word',
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
    retired: true,
  },

  targetPractice: {
    key: 'targetPractice',
    title: 'Bullseye Blitz',
    description: 'Pop targets, dodge the bombs!',
    instructions: [
      'Bullseye Blitz is now a knockout bracket — survive each round to stay alive',
      'Targets appear on the arena — tap them before they shrink away',
      '🎯 Standard targets are worth +10 pts',
      '⭐ Bonus targets are worth +25 pts but disappear faster',
      '💣 Hazard targets penalise you −15 pts if tapped — avoid them!',
      'Each new round gets faster and more dangerous, and results are revealed before the next round begins',
    ],
    metricKind: 'points',
    metricLabel: 'Points',
    timeLimitMs: 20_000,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'BullseyeBlitz',
    legacy: false,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  estimationGame: {
    key: 'estimationGame',
    title: 'Estimation',
    description: 'Five rounds of rapid estimation — count figures before they vanish, with mixed shapes in the final rounds',
    instructions: [
      'Figures flash on screen briefly — count what the round asks you to count!',
      'When the board hides, enter your estimate before the timer runs out',
      'Five rounds of increasing difficulty — exposure time drops each round',
      'Rounds 4 and 5 show mixed figure types: read the task carefully!',
      'Final score = average accuracy across all 5 rounds — highest average wins',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Avg Accuracy %',
    timeLimitMs: 0,
    authoritative: false,
    scoringAdapter: 'raw',
    implementation: 'react',
    reactComponentKey: 'EstimationGame',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  holdWall: {
    key: 'holdWall',
    title: 'Hold the Wall',
    description: 'Endurance competition — press and hold the wall, last player standing wins.',
    instructions: [
      'Press and HOLD the wall panel to stay in the competition.',
      'Releasing the wall means you drop out immediately.',
      'AI players will drop off at random times — outlast them all.',
      'Last player standing wins the prize.',
    ],
    resultMode: 'placement',
    metricKind: 'endurance',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'HoldTheWall',
    legacy: false,
    weight: 1,
    category: 'endurance',
    retired: false,
  },

  biographyBlitz: {
    key: 'biographyBlitz',
    title: 'Biography Blitz',
    description:
      'Trivia competition — answer questions about player biographies. Wrong answer and you\'re out!',
    instructions: [
      'Each round a question about a player\'s biography is revealed.',
      'Tap the correct answer before the timer runs out.',
      'Answer incorrectly and you are eliminated.',
      'Last player standing wins the prize.',
    ],
    resultMode: 'placement',
    metricKind: 'accuracy',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'BiographyBlitz',
    legacy: false,
    weight: 1,
    category: 'trivia',
    retired: false,
  },

  famousFigures: {
    key: 'famousFigures',
    title: 'Famous Figures',
    description: 'Identify famous historical figures from progressive clues. Fewer hints = higher score!',
    instructions: [
      'A historical figure is hidden — guess who it is from clues.',
      'You start with one clue and can request up to 5 hints.',
      'Fewer hints used = more points: 10 down to 1.',
      'Three rounds per match — highest total score wins!',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'FamousFigures',
    legacy: false,
    weight: 1,
    category: 'trivia',
    retired: false,
  },

  silentSaboteur: {
    key: 'silentSaboteur',
    title: 'Silent Saboteur',
    description:
      'A hidden saboteur plants a bomb on a victim. Identify the saboteur — or the bomb goes off!',
    instructions: [
      'Each round a secret saboteur is chosen.',
      'The saboteur secretly targets a victim.',
      'All players vote for who they think is the saboteur.',
      'If the group does not guess correctly, the victim is eliminated.',
      'In case of a tie, the victim decides.',
      'Final 2: eliminated players must guess the last saboteur.',
      'If they guess correctly the victim is the winner, if not the saboteur wins.',
    ],
    resultMode: 'placement',
    metricKind: 'points',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'SilentSaboteur',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  majorityRules: {
    key: 'majorityRules',
    title: 'Majority Rules',
    description:
      'Pick the answer you think the crowd will choose. Fall into the minority and you are out.',
    instructions: [
      'Every round a social question appears with 3 answer options.',
      'Everyone locks in an answer at the same time.',
      'Players in the minority are eliminated.',
      'If everyone picks the same answer, nobody leaves and the next round starts fresh.',
      "If all 3 answers are split evenly, everyone re-votes until there's a clear majority and minority.",
      'If multiple minority answers tie beneath the majority, every tied minority player is eliminated.',
      'At the Final 2, the game becomes a dice duel.',
    ],
    resultMode: 'placement',
    metricKind: 'points',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'MajorityRules',
    legacy: false,
    weight: 1,
    category: 'logic',
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
    implementation: 'react',
    reactComponentKey: 'TiltedLedge',
    legacy: false,
    weight: 1,
    category: 'endurance',
    retired: true,
  },

  pressurePlank: {
    key: 'pressurePlank',
    title: 'Pressure Plank',
    description: 'Keep your balance needle inside the safe zone as long as possible',
    instructions: [
      'A balance needle shows how far you\'ve leaned left or right',
      'Tap LEFT or RIGHT to counteract drift and stay centred',
      'Periodic surges will push you off balance — react quickly!',
      'The safe zone narrows over time — stay focused',
      'Last as long as possible without falling off the plank',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'raw',
    implementation: 'react',
    reactComponentKey: 'PressurePlank',
    legacy: false,
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
    retired: true,
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
    retired: true,
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
    retired: true,
  },

  colorMatch: {
    key: 'colorMatch',
    title: 'Color Match',
    description: 'Match the exact shown color by mixing RGB values with precision',
    instructions: [
      'A named color swatch appears — study it carefully',
      'Adjust the Red, Green, and Blue sliders to recreate the exact color',
      'Your live accuracy % updates as you tune the sliders',
      'You can buy up to 2 hints total; in solo, each hint takes 5% off your final average score; in competition, each hint takes 5% off that round’s score',
      'Submit before the timer runs out — time-outs score 0 for that round',
      'After each of the first 4 rounds, every player tied for the lowest score is eliminated',
      'In the finale, only the exact top tie group advances to any needed rematch',
      'Standings add decimal places when needed so tied percentages are easier to read',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Accuracy %',
    timeLimitMs: 25_000,
    authoritative: false,
    scoringAdapter: 'raw',
    implementation: 'react' as const,
    reactComponentKey: 'ColorMatch',
    legacy: false,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  socialStrings: {
    key: 'socialStrings',
    title: 'Social Strings',
    description: 'Identify players in alliances together',
    instructions: [
      'View a network of player connections',
      'Identify alliance groups',
      'Tap or connect players in the same alliance',
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
    retired: true,
  },

  logicLocks: {
    key: 'logicLocks',
    title: 'Vault Cracker',
    description: 'Crack the 4-digit vault combination with unlimited attempts',
    instructions: [
      'Drag each tumbler vertically or tap its upper/lower half to set your 4-digit guess',
      'Tap the on-canvas "Test Combination" control to submit',
      '🟢 Green pip = right digit, right position',
      '🟡 Gold pip = right digit, wrong position',
      'Higher scores come from solving in fewer attempts and less elapsed time',
    ],
    metricKind: 'accuracy',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'CodeBreaker',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  snake: {
    key: 'snake',
    title: 'Serpentine',
    description: 'Race to 1000 points — navigate food, grab bonuses, dodge penalties!',
    instructions: [
      'Reach 1000 points to complete the run — fastest time wins',
      'Monochrome food silhouettes: fruit +25 pts · heart +75 pts · bug −20 pts',
      'Bonus and penalty food expire after 6 seconds — grab them or let them vanish',
      'Your serpent moves continuously — change direction using controls',
      'Avoid hitting walls or your own tail',
      'Runs resolve asynchronously — start independently, then wait for the full ranking reveal',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'SnakeGame',
    legacy: false,
    weight: 2,
    category: 'arcade',
    retired: false,
  },

  cardClash: {
    key: 'cardClash',
    title: 'House of Cards',
    description: 'Memory-match race — find all pairs before time runs out!',
    instructions: [
      'Cards are placed face-down in a grid',
      'Tap two cards to flip them — match the symbols!',
      'Build streaks for bonus points; avoid mismatches',
      'Watch for ⚡ Boost and 👁 Peek power tiles',
      'Highest Clash Score wins — speed and accuracy matter',
    ],
    metricKind: 'points',
    metricLabel: 'Clash Score',
    timeLimitMs: 60_000,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react' as const,
    reactComponentKey: 'HouseOfCards',
    legacy: false,
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
    retired: true,
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
    retired: true,
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
    retired: true,
  },

  hangman: {
    key: 'hangman',
    title: 'Verdict Board',
    description: 'Five-round pressure challenge with cumulative scoring and mystery boxes',
    instructions: [
      'Survive 5 rounds of a dark word-guessing pressure board.',
      'Guess letters to reveal strategic terms and phrases while the timer climbs upward.',
      'Wrong letters raise the pressure meter and fracture the board.',
      'Mystery Boxes can help, hinder, or demand trade-offs before the scoreboard locks in.',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'HangmanChallenge',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  tiltLabyrinth: {
    key: 'tiltLabyrinth',
    title: 'Tilt Labyrinth',
    description: 'Guide a ball through a maze as fast as possible',
    instructions: [
      'Use arrow keys / WASD or tilt your device to move the ball',
      'Navigate through the maze to reach the 🏁 goal',
      'Fastest time wins — lower is better',
      'There is no countdown — your finish time is recorded when you reach the goal',
    ],
    metricKind: 'time',
    metricLabel: 'Time (s)',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'lowerBetter',
    scoringParams: { targetMs: 5000, maxMs: 60000 },
    implementation: 'react',
    reactComponentKey: 'TiltLabyrinth',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  threeDigitsQuiz: {
    key: 'threeDigitsQuiz',
    title: 'Number Trivia',
    description: 'Survive five rounds of number trivia with eliminations between scoreboards',
    instructions: [
      'Five trivia rounds are played with a scoreboard after each round',
      'Enter a whole-number answer and use the higher/lower hints to narrow it down',
      'Correct answers rank above misses; speed and attempts break ties',
      'Lowest players are eliminated between rounds until the final scoreboard',
    ],
    metricKind: 'hybrid',
    metricLabel: 'Score',
    timeLimitMs: 45_000,
    authoritative: false,
    scoringAdapter: 'raw',
    implementation: 'react',
    reactComponentKey: 'NumberTrivia',
    legacy: false,
    weight: 1,
    category: 'trivia',
    retired: false,
  },

  tetris: {
    key: 'tetris',
    title: 'Fit Me In',
    description: 'Drop and fit the falling pieces together to clear lines and score big!',
    instructions: [
      'Pieces fall from the top of the screen',
      'Move pieces left or right',
      'Rotate pieces to fit spaces',
      'Complete horizontal lines to clear them',
      'Hard-drop for bonus points (Space / ⬇ button)',
      'Hold a piece for later (C / HOLD button)',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'Tetris',
    legacy: false,
    weight: 2,
    category: 'logic',
    retired: false,
  },

  travelingDots: {
    key: 'travelingDots',
    title: 'Traveling Dots',
    description: 'Plan the optimal route through all required nodes — collect bonuses and avoid hazards!',
    instructions: [
      'Tap nodes one by one to build your route',
      'Visit ALL blue required nodes before tapping the purple Finish',
      'Gold ⭐ bonus nodes add points — plan whether the detour is worth it',
      'Red ⚠ hazard nodes deduct points — avoid them if you can',
      'A faster, more efficient path earns bonus points',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 90_000,
    authoritative: false,
    scoringAdapter: 'raw',
    implementation: 'react' as const,
    reactComponentKey: 'TravelingDots',
    legacy: false,
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
    implementation: 'react' as const,
    reactComponentKey: 'Minesweeps',
    legacy: false,
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
    retired: true,
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
    retired: true,
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
    retired: true,
  },

  dontGoOver: {
    key: 'dontGoOver',
    title: "Don't go over",
    description: 'Tournament-style numeric-guessing competition. Closest without going over wins; elimination duel rounds follow.',
    instructions: [
      'Each round has a numeric answer. Submit one numeric guess.',
      'Closest to the answer without going over wins the round.',
      'Mass round eliminates one player, then leaders pick duels until one champion remains.',
    ],
    resultMode: 'placement',
    metricKind: 'accuracy',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'ClosestWithoutGoingOver',
    legacy: false,
    weight: 1,
    category: 'trivia',
    retired: false,
  },

  blackjackTournament: {
    key: 'blackjackTournament',
    title: 'Blackjack Tournament',
    description:
      'Blackjack duel tournament. Closest to 21 without busting wins.',
    instructions: [
      'By a random draw selection, the first players chooses the pair to duel',
      'Both players receive 2 cards. Choose to Hit (draw a card) or Stand.',
      'Closest to 21 without going over wins. Bust (over 21) = elimination.',
      'The duel winner stays in control and picks the next pair to duel.',
      'Last player standing wins the competition!',
    ],
    resultMode: 'placement',
    metricKind: 'accuracy',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'BlackjackTournament',
    legacy: false,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  riskWheel: {
    key: 'riskWheel',
    title: 'Risk Wheel',
    description:
      'A Wheel-of-Fortune–style multi-round elimination contest. Spin for points, risk it all, or go bankrupt — and watch out for 666!',
    instructions: [
      'Players compete over 3 rounds. All scores reset each round.',
      'Each player gets up to 3 spins per round.',
      'After spin 1 or 2 you may Stop & Bank your score, or Spin Again.',
      'After spin 3 your score is automatically banked.',
      'BANKRUPT resets your score to 0 and ends your turn.',
      'SKIP ends your turn immediately — you keep whatever you have.',
      '666 randomly adds or subtracts 666 points (50/50) then continues.',
      'After each round the lowest-scoring players are eliminated.',
      'After Round 3 the highest scorer wins!',
    ],
    resultMode: 'placement',
    metricKind: 'points',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'RiskWheel',
    legacy: false,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  wildcardWestern: {
    key: 'wildcardWestern',
    title: 'Wildcard Western',
    description: 'Draw cards, face off in a high-noon duel — last sheriff standing wins!',
    instructions: [
      'Each player draws a secret numbered wildcard',
      'Lowest and highest cards face off in a showdown',
      'Be first to buzz and answer correctly to survive',
      'Wrong answer or timeout and you\'re eliminated',
      'Choose who faces the next showdown — last player standing wins!',
    ],
    resultMode: 'placement',
    metricKind: 'points',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'WildcardWestern',
    legacy: false,
    weight: 1,
    category: 'trivia',
    retired: false,
  },

  castleRescue: {
    key: 'castleRescue',
    title: 'Find Your Twin',
    description: 'Run and jump through the castle, enter the correct pipes in order, and find your twin before time runs out!',
    instructions: [
      'Use Arrow Keys or WASD to run left/right, Up/Space to jump.',
      'Find the 3 correct pipes and enter them in order by pressing ↓.',
      'Wrong pipes send you back — watch out!',
      'Stomp enemies (land on them) for bonus points.',
      'Break bricks by jumping into them from below.',
      'Collect Eyeoleans for extra score. Reach your twin to win!',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 150_000,
    authoritative: false,
    scoringAdapter: 'raw',
    scoringParams: { minRaw: 0, maxRaw: 5000 },
    implementation: 'react',
    reactComponentKey: 'CastleRescue',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  glass_bridge_brutal: {
    key: 'glass_bridge_brutal',
    title: 'The Crystal Path',
    description:
      'Step across a path of paired crystal platforms one row at a time. One wrong step and you are eliminated.',
    instructions: [
      'Players cross a glowing crystal path platform by platform.',
      'Each row has two platforms: LEFT and RIGHT. Only one is solid.',
      'Choose the wrong platform and it shatters — you are eliminated.',
      'Everyone starts from the beginning; crossing order is decided by a number draw.',
      'The player who crosses fastest — or reaches the furthest platform — wins.',
      'You may use The Expert up to 3 times per run. Each hint adds a 30-second penalty to your final time.',
    ],
    resultMode: 'placement',
    metricKind: 'accuracy',
    metricLabel: 'Placement',
    timeLimitMs: 160_000,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'GlassBridge',
    legacy: false,
    weight: 1,
    category: 'endurance',
    retired: false,
  },

  rescueTheKing: {
    key: 'rescueTheKing',
    title: 'Rescue the King',
    description: 'Clear the match-3 board before rising water drowns the king',
    instructions: [
      'Swap adjacent tiles to create matches of 3 or more identical symbols.',
      'Matched tiles are removed — remaining tiles fall downward.',
      'Destroy crates and stone blockers by matching tiles next to them.',
      'Clear all tiles from the board before the 3-minute timer runs out.',
      'Big combos earn bonus points — chain cascades for maximum score!',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 180_000,
    authoritative: false,
    scoringAdapter: 'raw',
    scoringParams: { minRaw: 0, maxRaw: 8000 },
    implementation: 'react',
    reactComponentKey: 'RescueTheKing',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  trapAuction: {
    key: 'trapAuction',
    title: 'Trap Auction',
    description: 'Secretly bid Eyeolens every round — the lowest bidder is eliminated.',
    instructions: [
      'Every player starts with 100 Eyeolens.',
      'Each round, secretly choose how much to bid.',
      'After all bids lock, first the highest bid is revealed, then the lowest bid(s); other bids stay hidden.',
      'The player who bid the LOWEST is eliminated. Ties eliminate all tied players.',
      'The player who bid the HIGHEST is exposed — their bid is public.',
      'All players pay their bid from their bank.',
      'Last player standing wins!',
    ],
    metricKind: 'points',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'TrapAuction',
    legacy: false,
    weight: 2,
    category: 'logic',
    retired: false,
  },

  gridOfLuck: {
    key: 'gridOfLuck',
    title: 'Grid of Luck',
    description: 'Open ritual boxes to gain LP, trigger chaos, and eliminate rivals in a cinematic chamber.',
    instructions: [
      'Every player begins with 500 LP and takes turns opening one sealed box.',
      'Powers resolve immediately — if a power needs a target, choose a valid player before the ritual continues.',
      'Shield blocks the next LP damage or elimination effect once.',
      'If your LP reaches 0, you are eliminated immediately but remain visible in the chamber.',
      'When only one player remains alive they win instantly; otherwise the highest LP wins when the grid ends.',
    ],
    resultMode: 'placement',
    metricKind: 'points',
    metricLabel: 'LP',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'GridOfLuck',
    legacy: false,
    weight: 2,
    category: 'logic',
    retired: false,
  },

  chainOfGreed: {
    key: 'chainOfGreed',
    title: 'Chain of Greed',
    description: 'Build a shared higher-or-lower chain, bank the pressure points, and survive weakest-link eliminations.',
    instructions: [
      'Guess Higher or Lower to grow the shared chain from 50 up to 1300 influence.',
      'Bank secures only the current chain pot, keeps the same reference number, and resets the chain.',
      'A wrong guess destroys the active pot. Equal numbers count as a miss.',
      'Standard rounds end with a weakest-link vote. Final 3 and Final 2 switch to individual scoring.',
      'Only the final winner receives the entire secured influence total. Everyone else gets 0.',
    ],
    resultMode: 'placement',
    metricKind: 'points',
    metricLabel: 'Influence',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'ChainOfGreed',
    legacy: false,
    weight: 2,
    category: 'logic',
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
