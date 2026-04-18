/**
 * bracketTemplate.ts — Default competition scheduling template.
 *
 * Organises minigame keys into player-count brackets, each with a separate
 * LOH pool and POS pool.  Games may only be swapped within the same bracket
 * and the same competition type (LOH or POS).
 *
 * The DEFAULT_BRACKET_TEMPLATE constant is the single source of truth and is
 * deliberately easy to edit: to adjust a bracket, change the keys array for
 * the relevant band/type entry.  To add a new bracket, insert a new band
 * object and keep the array sorted from highest to lowest player-count band
 * (highest `maxPlayers` first) so that `getBracketPoolForContext` resolves
 * the correct band quickly.
 *
 * Bracket definitions:
 *  - 16–13 players
 *  - 12–10 players
 *  - 9–8  players
 *  - 7–5  players
 *  - 4    players
 *  - 3    players (Final Trilogy — LOH only, no POS)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single bracket band.  `minPlayers` and `maxPlayers` are both inclusive.
 * Pools list registry game keys.  An empty `pos` array means no POS games
 * are played in this band (e.g. the Final Trilogy bracket).
 */
export interface BracketBand {
  /** Human-readable label used for debugging and display. */
  label: string;
  /** Inclusive lower bound (fewest players in the bracket). */
  minPlayers: number;
  /** Inclusive upper bound (most players in the bracket). */
  maxPlayers: number;
  /** Registry keys for LOH competitions in this bracket. */
  loh: string[];
  /** Registry keys for POS competitions in this bracket. Empty = no POS. */
  pos: string[];
}

/**
 * The full bracket template: an ordered list of bands (highest to lowest
 * player count).  Mutate or replace this constant to reconfigure the season.
 */
export type BracketTemplate = BracketBand[];

// ── Default template ──────────────────────────────────────────────────────────

/**
 * Default season template derived from engagement-based bracket analysis.
 *
 * LOH / POS games are chosen so that:
 *  - Large-group phases (16–10) favour fast, social, or mass-participation games.
 *  - Mid-game phases (9–5) shift toward individual skill and precision.
 *  - Endgame phases (4 and below) use spotlight-heavy, high-drama games.
 *  - Final Trilogy (3 players) is LOH-only with an escalating three-comp arc.
 *
 * Swaps are only valid within the same bracket AND the same comp type.
 */
export const DEFAULT_BRACKET_TEMPLATE: BracketTemplate = [
  {
    label: '16–13 players',
    minPlayers: 13,
    maxPlayers: 16,
    loh: [
      'majorityRules',      // Majority Rules   — social deduction; best with a full house
      'glass_bridge_brutal', // The Crystal Path — high-stakes sequential choice
      'riskWheel',          // Risk Wheel       — multi-round elimination wheel
      'trapAuction',        // Trap Auction     — secret bidding; best when many bluff
    ],
    pos: [
      'quickTap',   // Quick Tap Race — fast, fair, packed leaderboard
      'laneRacers', // Lane Racers    — race spectacle; alive with many competitors
      'holdWall',   // Hold the Wall  — endurance; every dropout is visible
      'colorMatch', // Color Match    — precision slider; easy to compare across cast
    ],
  },
  {
    label: '12–10 players',
    minPlayers: 10,
    maxPlayers: 12,
    loh: [
      'blackjackTournament', // Blackjack Tournament — duel structure; tighter cast
      'dontGoOver',          // Don't Go Over        — numeric guessing; tournament pressure
      'silentSaboteur',      // Silent Saboteur      — deduction peaks at 10–12 players
    ],
    pos: [
      'castleRescue',  // Find Your Twin  — platformer; spotlight per run at mid-size
      'travelingDots', // Traveling Dots  — route planning; better with fewer players
      'logicLocks',    // Vault Cracker   — logic puzzle; watchable at mid-cast
    ],
  },
  {
    label: '9–8 players',
    minPlayers: 8,
    maxPlayers: 9,
    loh: [
      'famousFigures',  // Famous Figures  — clue-based; each run gets real focus
      'wildcardWestern', // Wildcard Western — showdown format; focused and dramatic
    ],
    pos: [
      'minesweeps',    // Minesweeps    — high-focus puzzle; best with small field
      'tiltLabyrinth', // Tilt Labyrinth — route precision; better with few players
    ],
  },
  {
    label: '7–5 players',
    minPlayers: 5,
    maxPlayers: 7,
    loh: [
      'snake',        // Serpentine (Snake) — arcade mastery; each mistake magnified
      'tetris',       // Fit Me In (Tetris) — serious skill; mid-late game feel
      'chainOfGreed', // Chain of Greed     — higher-lower chain; good for ≤7 players
    ],
    pos: [
      'cardClash',      // House of Cards — memory race; great at 5–7
      'threeDigitsQuiz', // Number Trivia  — elimination trivia; sharper with fewer
    ],
  },
  {
    label: '4 players',
    minPlayers: 4,
    maxPlayers: 4,
    loh: [
      'gridOfLuck', // Grid of Luck  — cinematic box-opening; scales to 4
      'logicLocks', // Vault Cracker — elite endgame puzzle pressure
    ],
    pos: [
      'gridOfLuck', // Grid of Luck  — turn-based; fine at final 4
      'logicLocks', // Vault Cracker — alternate high-stakes option
    ],
  },
  {
    label: '3 players (Final Trilogy)',
    minPlayers: 3,
    maxPlayers: 3,
    loh: [
      'biographyBlitz', // Biography Blitz — trivia; strong opening comp of the trilogy
      'chainOfGreed',   // Chain of Greed  — pressure chain; escalating second comp
      'gridOfLuck',     // Grid of Luck    — cinematic finale; dramatic conclusion
    ],
    // Final Trilogy is LOH-only — no POS comps at final 3.
    pos: [],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return the list of registry keys eligible for the next competition, given
 * the current alive-player count and competition type.
 *
 * Rules:
 *  - The bracket is determined by the first band (highest `maxPlayers` first)
 *    whose range includes `playerCount`.
 *  - If `playerCount` is above every bracket's `maxPlayers` (unusual edge case)
 *    the first band is returned.
 *  - If `playerCount` is below every bracket's `minPlayers` (e.g. 1–2 players
 *    when the narrowest bracket starts at 3), an empty pool is returned so the
 *    caller can fall back to the standard scheduler.
 *
 * @param playerCount - Number of currently alive players (>= 1).
 * @param compType    - `'LOH'` or `'POS'`.
 * @param template    - Template to query; defaults to DEFAULT_BRACKET_TEMPLATE.
 */
export function getBracketPoolForContext(
  playerCount: number,
  compType: 'LOH' | 'POS',
  template: BracketTemplate = DEFAULT_BRACKET_TEMPLATE,
): string[] {
  // Walk bands from widest (first) to narrowest to find the correct bracket.
  // Bands are stored in descending order so this is a simple linear scan.
  let matched: BracketBand | undefined;
  for (const band of template) {
    if (playerCount >= band.minPlayers && playerCount <= band.maxPlayers) {
      matched = band;
      break;
    }
  }

  // Edge case: player count is above every bracket's maxPlayers — use the
  // widest band.  Do NOT fall back for below-range counts (e.g. 1–2 players
  // when the smallest bracket starts at 3): return an empty pool so the
  // caller can fall back to the standard scheduler.
  if (!matched && template.length > 0 && playerCount > template[0].maxPlayers) {
    matched = template[0];
  }

  if (!matched) return [];

  const pool = compType === 'POS' ? matched.pos : matched.loh;
  return pool.length > 0 ? [...pool] : [];
}
