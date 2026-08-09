// MODULE: src/minigames/registry.ts
// Unified minigame registry ported from bbmobile/js/minigames/registry.js
// Each entry includes metadata, scoring adapter, and module path for dynamic import.

import { mulberry32 } from '../store/rng'
import { DEFAULT_LANE_RACERS_DURATION_MS } from './laneRacers/constants'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScoringAdapterName =
  | 'raw'
  | 'rankPoints'
  | 'timeToPoints'
  | 'lowerBetter'
  | 'binary'
  | 'authoritative'

export type MetricKind = 'count' | 'time' | 'accuracy' | 'endurance' | 'hybrid' | 'points'

export type GameCategory = 'arcade' | 'endurance' | 'logic' | 'trivia'

export interface GameRegistryEntry {
  key: string
  title: string
  description: string
  /** Bullet-point instructions shown in the Rules modal before the game. */
  instructions: string[]
  /** Whether results for this game should be communicated as scores or placements/ranks. */
  resultMode?: 'score' | 'placement'
  metricKind: MetricKind
  metricLabel: string
  /** Milliseconds before the game auto-ends (0 = unlimited / game controls its own end). */
  timeLimitMs: number
  /**
   * When true the game itself determines the authoritative winner
   * and the scoring adapter defers to game-reported winner.
   */
  authoritative: boolean
  scoringAdapter: ScoringAdapterName
  scoringParams?: Record<string, number>
  /**
   * 'react' for games implemented as React components; 'legacy' (default) for games
   * loaded via LegacyMinigameWrapper from a JS bundle.
   */
  implementation?: 'react' | 'legacy'
  /**
   * When implementation === 'react', identifies which React component to render.
   * MinigameHost uses this key to select the correct component.
   */
  reactComponentKey?: string
  /** Path relative to src/minigames/legacy/, used for dynamic import. Only required when implementation !== 'react'. */
  modulePath?: string
  /** True for all games ported from bbmobile. */
  legacy: boolean
  /**
   * Relative weight for random selection (higher = picked more often).
   * All non-retired games default to 1; increase for popular games.
   */
  weight: number
  category: GameCategory
  /** True if this entry should not be selected for new challenges. */
  retired: boolean
  /** Optional safe participant-count bounds for random scheduling. */
  minPlayers?: number
  maxPlayers?: number
  /** Key of the game that supersedes this one (for retired games). */
  replacedBy?: string
}

export function supportsPlayerCount(game: GameRegistryEntry, playerCount: number): boolean {
  return (
    playerCount >= (game.minPlayers ?? 1) &&
    playerCount <= (game.maxPlayers ?? Number.POSITIVE_INFINITY)
  )
}

export function isPlacementRankingGame(game: Pick<GameRegistryEntry, 'resultMode'>): boolean {
  return game.resultMode === 'placement'
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
    description: 'Tap quickly, grab useful boosts, and finish with the strongest score.',
    instructions: [
      'Wait for the start signal, then tap the play area as quickly as you can.',
      'Grab on-screen boosters when they appear to build your score faster.',
      'Avoid any setbacks and keep tapping until the round ends.',
      'The highest score wins.',
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

  quickTapSeasons: {
    key: 'quickTapSeasons',
    // i18n-ignore: Minigame registry metadata is localized centrally once the shared rules modal supports translation keys.
    title: 'Quick Tap Race 2: Seasons',
    description:
      // i18n-ignore: Minigame registry metadata is localized centrally once the shared rules modal supports translation keys.
      'Race through a shifting year where every season changes the rhythm and value of your taps.',
    instructions: [
      // i18n-ignore: Minigame registry metadata is localized centrally once the shared rules modal supports translation keys.
      'Wait for the start signal, then tap the play area as quickly as you can.',
      // i18n-ignore: Minigame registry metadata is localized centrally once the shared rules modal supports translation keys.
      'Adapt when the season changes because each one affects your score differently.',
      // i18n-ignore: Minigame registry metadata is localized centrally once the shared rules modal supports translation keys.
      'Open mystery boxes to transform the race conditions.',
      // i18n-ignore: Minigame registry metadata is localized centrally once the shared rules modal supports translation keys.
      'Keep tapping until the 40-second race ends. The highest score wins.',
    ],
    metricKind: 'points',
    metricLabel: 'Points', // i18n-ignore: Minigame registry metadata is localized centrally once the shared rules modal supports translation keys.
    timeLimitMs: 40_000,
    authoritative: false,
    scoringAdapter: 'raw',
    implementation: 'react' as const,
    reactComponentKey: 'QuickTapSeasons',
    legacy: false,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  laneRacers: {
    key: 'laneRacers',
    title: 'Lane Racers',
    description:
      'A premium canvas lane sprint where rapid taps power your racer through boosters and mystery gifts.',
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
    retired: true,
  },

  memoryMatch: {
    key: 'memoryMatch',
    title: 'Memory Colors',
    description: 'Watch the colour sequence, then rebuild it in the same order.',
    instructions: [
      'Watch the colour swatches as they appear.',
      'Select the swatches in the exact same order.',
      'The sequence becomes more challenging as you progress.',
      'Reach the furthest stage to win; close results are decided by accuracy and speed.',
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
    retired: true,
  },

  estimationGame: {
    key: 'estimationGame',
    title: 'Estimation',
    description: 'Estimate the figures you see before the board disappears.',
    instructions: [
      'Study the figures and count what the prompt asks for.',
      'Enter your best estimate before time runs out.',
      'Later boards may be quicker or use mixed figures, so read the prompt carefully.',
      'The most accurate overall performance wins.',
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
      "Trivia competition — answer questions about player biographies. Wrong answer and you're out!",
    instructions: [
      "Each round a question about a player's biography is revealed.",
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
    retired: true,
  },

  famousFigures: {
    key: 'famousFigures',
    title: 'Famous Figures',
    description: 'Identify famous historical figures from a series of clues.',
    instructions: [
      'A historical figure is hidden behind clues.',
      'Make your guess when you are ready, or reveal another clue for help.',
      'Earlier correct guesses earn the stronger result.',
      'Build the best total across the match to win.',
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
      'Each round presents a social question with several answer options.',
      'Everyone locks in an answer at the same time.',
      'You get 3 hints for the whole game, and each hint can only be used once.',
      'Players in the minority are eliminated.',
      'A tied ballot gets one re-vote. If it is still tied, that question is discarded and a new one begins.',
      'The last contestants face a final head-to-head to decide the winner.',
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
      "A balance needle shows how far you've leaned left or right",
      'Tap LEFT or RIGHT to counteract drift and stay centred',
      'Periodic surges will push you off balance — react quickly!',
      'The safe zone gradually narrows to about 4% of the full gauge',
      'Outside the safe zone your stability drains and never regenerates',
      'Touching either extreme edge causes an instant fall',
      'Last as long as possible without falling off the plank',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: false,
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
    description: 'Crack the vault combination with as few attempts as possible.',
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
    description: 'Guide your serpent to collect food, grab bonuses, and avoid danger.',
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
    description: 'A memory tournament that builds to a shared-board final.',
    instructions: [
      'Rounds use 8, 12, 16, 20, then 24 tiles with an elapsed timer and no cutoff',
      'The lowest scorer leaves after rounds 1–3; only the top two survive round 4',
      'The finalists share one board and take turns in round 5',
      'A correct pair scores 1 point and keeps the turn; a miss passes the turn',
      'Final points decide the winner, with rounds 1–4 totals breaking a tie',
    ],
    metricKind: 'points',
    metricLabel: 'Clash Score',
    timeLimitMs: 0,
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
    description: 'A pressure word challenge with cumulative scoring and mystery boxes.',
    instructions: [
      'Guess letters to reveal the hidden strategic terms and phrases.',
      'Wrong guesses increase the pressure and can end the round.',
      'Mystery Boxes can help, hinder, or demand a trade-off.',
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
      'Use arrow keys / WASD, drag, or supported device tilt to move the ball',
      'Find the key, unlock the gate, then reach the goal',
      'There is no time limit - take as long as you need to finish',
      'Each hazard hit adds 3 seconds to your completion time',
      'Lowest adjusted time wins',
    ],
    metricKind: 'time',
    metricLabel: 'Time (s)',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
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
    description: 'Answer number trivia, survive the qualifiers, and win the final duel.',
    instructions: [
      'Five qualifying rounds are played with a scoreboard after each round',
      'Every question begins with 3 seconds of shared reading time before response timing starts',
      'Enter a whole-number answer and use the higher/lower hints to narrow it down',
      'Rounds 1–4 eliminate the lowest player; round 5 keeps the top two and all cutoff ties',
      'Finalists receive 3 lives; the weakest answer loses one life until one player remains',
      'Accuracy comes first in the final, and response time breaks otherwise equal answers',
    ],
    metricKind: 'hybrid',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: false,
    scoringAdapter: 'raw',
    implementation: 'react',
    reactComponentKey: 'NumberTrivia',
    legacy: false,
    weight: 1,
    category: 'trivia',
    retired: false,
  },

  capitalization: {
    key: 'capitalization',
    title: 'Capitalization',
    description: 'A globe-spinning tournament of capital city trivia.',
    instructions: [
      'The globe spins and lands on one of three randomly selected continents.',
      'Answer the capital city for three countries on that continent.',
      'You have unlimited attempts, but faster first-try answers score much higher.',
      'You may skip any country for zero points.',
      'After questions 3 and 6, roughly 30% of the lowest-scoring AI players are eliminated.',
      'Question 9 is the finale, and the highest surviving score is crowned LOH.',
    ],
    metricKind: 'points',
    metricLabel: 'Score',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'Capitalization',
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
    description:
      'Plan the optimal route through all required nodes — collect bonuses and avoid hazards!',
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
    retired: true,
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
    description: 'Make the closest estimate without going over the correct answer.',
    instructions: [
      'Enter your estimate without exceeding the correct answer.',
      'Going over puts you at risk; otherwise the least accurate valid estimate can be eliminated.',
      'When only a few contestants remain, the game becomes a head-to-head final.',
      'Be the last contestant standing to win.',
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
    description: 'Play blackjack duels: get close to 21 without going over.',
    instructions: [
      'Choose whether to take another card or hold your hand.',
      'Get closer to 21 than your opponent without busting to win a duel.',
      'Strong results carry you through the early tournament and into the finals.',
      'Keep winning head-to-head duels to become champion.',
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
    description: 'Spin for points, bank a good result, and avoid the risky wheel outcomes.',
    instructions: [
      'Spin the wheel to build a round score.',
      'Choose when to bank your score and when to risk another spin.',
      'Some wheel spaces help, while others can end your turn or wipe out a score.',
      'Low scorers are eliminated as the competition progresses.',
      'Finish with the strongest result to win.',
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
      "Wrong answer or timeout and you're eliminated",
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
    description:
      // i18n-ignore: Canonical English registry fallback for an English-only minigame rules surface.
      'Twin brothers Benny and Lenny went for a night walk through South Park, but somewhere along the way Lenny disappeared. Benny refuses to leave without him and must find his brother before time runs out.',
    instructions: [
      // i18n-ignore: Canonical English registry fallback for an English-only minigame rules surface.
      'Benny and Lenny are twin brothers who set out together for a quiet night walk.',
      // i18n-ignore: Canonical English registry fallback for an English-only minigame rules surface.
      'Lenny is now lost somewhere in South Park, with the night growing late.',
      // i18n-ignore: Canonical English registry fallback for an English-only minigame rules surface.
      'Help Benny reunite with Lenny before their time runs out.',
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

  castleRescue2: {
    key: 'castleRescue2',
    // i18n-ignore: Official English minigame title and canonical registry fallback.
    title: 'Find Your Twin 2: Lost Again',
    description:
      // i18n-ignore: Canonical English registry fallback for an English-only minigame rules surface.
      'Benny and Lenny travelled to Romania to visit an old castle, but before closing time Lenny vanished somewhere inside its halls. Benny must find his brother before the castle closes for the night.',
    instructions: [
      // i18n-ignore: Canonical English registry fallback for an English-only minigame rules surface.
      'The twins came to Romania for a castle visit they would never forget.',
      // i18n-ignore: Canonical English registry fallback for an English-only minigame rules surface.
      'Lenny is lost inside, and closing time is getting dangerously close.',
      // i18n-ignore: Canonical English registry fallback for an English-only minigame rules surface.
      'Help Benny find Lenny before the castle doors close for the night.',
    ],
    metricKind: 'points',
    // i18n-ignore: Canonical English registry metric label shared by existing minigames.
    metricLabel: 'Score',
    timeLimitMs: 150_000,
    authoritative: false,
    scoringAdapter: 'raw',
    scoringParams: { minRaw: 0, maxRaw: 5000 },
    implementation: 'react',
    reactComponentKey: 'CastleRescue2',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
  },

  glass_bridge_brutal: {
    key: 'glass_bridge_brutal',
    title: 'The Crystal Path',
    description: 'Choose your way across a crystal path and make it further than your rivals.',
    instructions: [
      'At each row, choose the crystal platform you think will hold.',
      'A wrong choice ends your run, so every step matters.',
      'Use any available expert help carefully—it can come with a trade-off.',
      'Cross the path fastest, or make the deepest run, to win.',
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

  crystal_path_shattered: {
    key: 'crystal_path_shattered',
    title: 'Crystal Path: Infinity',
    description:
      'Push deeper into the endless crystal runway, trust your instincts, and outlast every other run.',
    instructions: [
      'Everyone makes one uninterrupted run from start to finish — no turn swapping, just momentum.',
      'Every row is a live call between two crystal tiles, and one bad read can change the whole climb.',
      'Wrong steps chip away at your stability, so survive the pressure and stay moving as long as you can.',
      'Mystery crystals and limited visions can flip the run when you need a comeback or a clutch gamble.',
      'The deepest surviving climb wins, with leftover stability breaking the closest finishes.',
    ],
    resultMode: 'placement',
    metricKind: 'accuracy',
    metricLabel: 'Placement',
    timeLimitMs: 160_000,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'CrystalPathShattered',
    legacy: false,
    weight: 1,
    category: 'endurance',
    retired: false,
  },

  rescueTheKing: {
    key: 'rescueTheKing',
    title: 'Rescue the King',
    description: 'Clear the match board before the rising water reaches the king.',
    instructions: [
      'Swap adjacent tiles to make matches of identical symbols.',
      'Matched tiles are removed — remaining tiles fall downward.',
      'Destroy crates and stone blockers by matching tiles next to them.',
      'Clear the board before time runs out to rescue the king.',
      'Create cascades and larger combos to improve your score.',
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
    description: 'Bid secretly, manage your funds, and avoid the lowest bid.',
    instructions: [
      'Each round, secretly choose how much to bid.',
      'Once bids lock, the important results are revealed while some information stays hidden.',
      'The lowest bidder is eliminated; a tie can put every tied bidder in danger.',
      'Every bid comes out of your available funds, so balance safety against saving resources.',
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
    minPlayers: 8,
  },

  gridOfLuck: {
    key: 'gridOfLuck',
    title: 'Grid of Luck',
    description: 'Open ritual boxes, gain power, and outlast your rivals in the chamber.',
    instructions: [
      'Take turns opening sealed boxes to reveal benefits, setbacks, and special powers.',
      'Powers resolve immediately — if a power needs a target, choose a valid player before the ritual continues.',
      'Protection can block a harmful effect, but only when it is active.',
      'Running out of LP eliminates you from the contest.',
      'Be the last player standing, or finish with the strongest LP total when the grid ends.',
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
    minPlayers: 2,
    maxPlayers: 4,
  },

  bigSpender: {
    key: 'bigSpender',
    title: 'Big Spender: Broke or Boom',
    description: 'Open wallets, spend toward zero, and lock in before a bomb ruins your run.',
    instructions: [
      'Open wallets and try to finish as close to zero as possible without hitting a bomb.',
      'When the option appears, choose whether to lock in your result or keep opening wallets.',
      'Early rounds use private boards; the finalists share the decisive board.',
      'Any available second-chance option gives you one last decision after a bomb.',
    ],
    resultMode: 'placement',
    metricKind: 'points',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'BigSpender',
    legacy: false,
    weight: 1,
    category: 'arcade',
    retired: false,
  },

  chainOfGreed: {
    key: 'chainOfGreed',
    title: 'Chain of Greed',
    description: 'Build a higher-or-lower chain, bank your progress, and survive elimination.',
    instructions: [
      'Guess whether the next value will be higher or lower than the current one.',
      'Keep a correct chain going to build influence, or bank it before you take another risk.',
      'A wrong guess loses the active chain, so decide when enough is enough.',
      'Contestants are eliminated as the game progresses, followed by a final head-to-head.',
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
  batteryLow: {
    key: 'batteryLow',
    title: 'Battery Low',
    description:
      'Choose a reserve battery, open the rack, and decide whether to take the bank offer.',
    instructions: [
      'Choose a reserve battery and keep it sealed while you open the rest of the rack.',
      'After each stage, consider the bank’s offer based on the charges still hidden.',
      'Accept an offer to lock in your charge, or reject it to keep playing.',
      'If you play to the end, your reserve battery decides the final charge.',
      'The strongest final charge wins.',
    ],
    resultMode: 'placement',
    metricKind: 'points',
    metricLabel: 'Charge %',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'BatteryLow',
    legacy: false,
    weight: 2,
    category: 'logic',
    retired: false,
  },

  houseOfDarkness: {
    key: 'houseOfDarkness',
    title: 'House of Darkness',
    description: 'Survive a haunted memory challenge where mistakes drain your lifespan.',
    instructions: [
      'Reveal cards to find matching pairs on your haunted board.',
      'Each mismatch costs lifespan, so remember what you have seen.',
      'Completing a board earns some recovery, but damage can carry into the next round.',
      'Outlast the other contestants, or finish with the most lifespan when the ritual ends.',
    ],
    resultMode: 'placement',
    metricKind: 'endurance',
    metricLabel: 'Placement',
    timeLimitMs: 0,
    authoritative: true,
    scoringAdapter: 'authoritative',
    implementation: 'react',
    reactComponentKey: 'HouseOfDarkness',
    legacy: false,
    weight: 1,
    category: 'logic',
    retired: false,
    minPlayers: 2,
  },
}

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Return all game entries (including retired). */
export function getAllGames(): GameRegistryEntry[] {
  return Object.values(REGISTRY)
}

/** Return the entry for a specific game key, or undefined if not found. */
export function getGame(key: string): GameRegistryEntry | undefined {
  return REGISTRY[key]
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
  opts: { category?: GameCategory; excludeKeys?: string[] } = {}
): GameRegistryEntry {
  const pool = getPoolByFilter({
    retired: false,
    category: opts.category,
    excludeKeys: opts.excludeKeys,
  })

  if (pool.length === 0) {
    // Fallback: any non-retired game
    const fallback = getAllGames().find((g) => !g.retired)
    if (!fallback) throw new Error('[registry] No games available')
    return fallback
  }

  // Build a weighted array of keys
  const weighted: GameRegistryEntry[] = []
  for (const entry of pool) {
    for (let i = 0; i < entry.weight; i++) {
      weighted.push(entry)
    }
  }

  const rng = mulberry32(seed >>> 0)
  const idx = Math.floor(rng() * weighted.length)
  return weighted[idx]
}

/**
 * Return game entries matching the given filter criteria.
 */
export function getPoolByFilter(filter: {
  retired?: boolean
  category?: GameCategory
  excludeKeys?: string[]
}): GameRegistryEntry[] {
  return getAllGames().filter((g) => {
    if (filter.retired !== undefined && g.retired !== filter.retired) return false
    if (filter.category && g.category !== filter.category) return false
    if (filter.excludeKeys?.includes(g.key)) return false
    return true
  })
}
