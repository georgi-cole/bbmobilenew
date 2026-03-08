/**
 * castleRescueTypes.ts
 *
 * All TypeScript interfaces and type aliases for the Castle Rescue minigame.
 * No runtime logic lives here — pure type definitions only.
 *
 * This file exports two groups of types:
 *
 * 1. **Platformer game types** (primary): Used by the platformer level geometry,
 *    physics engine, and competition integration for the current implementation.
 *
 * 2. **Legacy grid types** (deprecated): Used internally by the grid-based
 *    pipe-selection engine, selectors, and test fixtures.  New code should
 *    prefer the platformer types.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 1.  Platformer game types
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Phase / lifecycle ────────────────────────────────────────────────────────

/**
 * Lifecycle phase of a single Castle Rescue play-through.
 *
 *  idle           – Not yet started (waiting for competition signal).
 *  intro          – Pre-game cinematic / introduction sequence.
 *  countdown      – "3 … 2 … 1 … Go!" countdown overlay.
 *  playing        – Active platformer gameplay.
 *  rescuing       – Princess rescued; brief celebration animation.
 *  timeout        – Timer expired before princess was rescued.
 *  results        – Score / results screen shown to the player.
 *  finished       – Competition outcome submitted; component may unmount.
 */
export type CastleRescuePhase =
  | 'idle'
  | 'intro'
  | 'countdown'
  | 'playing'
  | 'rescuing'
  | 'timeout'
  | 'results'
  | 'finished';

// ─── Competition config ───────────────────────────────────────────────────────

/**
 * Parameters supplied by the competition system when starting a run.
 *
 * The seed is the ONLY source of randomness for level generation; no
 * Date.now() or Math.random() may be used inside the generator.
 */
export interface CastleRescueCompetitionConfig {
  /** Stable competition identifier (used for idempotency / dedup). */
  competitionId: string;
  /** Deterministic Mulberry32 seed derived from the competition nonce. */
  seed: number;
  /** Milliseconds before the run auto-finalizes. */
  timeLimitMs: number;
  /** Starting heart count for the player (default 3). */
  startingHearts: number;
  /** Maximum number of bricks that award score in one run. */
  maxScoringBricks: number;
  /** Score awarded for rescuing the princess. */
  rescueBonus: number;
  /** Score awarded per enemy stomped. */
  enemyScore: number;
  /** Score awarded per brick broken by head-hit. */
  brickScore: number;
  /** Score awarded per collectible picked up. */
  collectibleScore: number;
  /** Bonus awarded for discovering a secret room. */
  secretRoomBonus: number;
}

// ─── Level section ────────────────────────────────────────────────────────────

/** Named section types that make up the castle level. */
export type CastleSectionType =
  | 'entrance'
  | 'mid'
  | 'underground'
  | 'upperKeep'
  | 'bonusRoom'
  | 'princessChamber';

/** A rectangular zone within the castle level (used for routing and theming). */
export interface CastleSection {
  id: string;
  type: CastleSectionType;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Level geometry ───────────────────────────────────────────────────────────

/**
 * A platform surface in the platformer level.
 *
 * Platform collider types (controlled by the `oneWay` flag):
 *  - FULL_SOLID (oneWay: false | undefined): blocks player from all sides.
 *  - ONE_WAY_PLATFORM (oneWay: true): allows upward passage; only blocks when
 *    the player falls onto the top surface.
 *
 * Default is FULL_SOLID — only set oneWay: true for jump-through platforms.
 */
export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Omitting this field (or setting it to false) makes the platform FULL_SOLID,
   * meaning it blocks the player from all sides.  Set to true for ONE_WAY_PLATFORM
   * behavior, where the player can jump up through the surface but lands when
   * falling onto the top.
   *
   * Default: undefined (treated as false → FULL_SOLID).
   */
  oneWay?: boolean;
}

/**
 * A breakable brick in the platformer level.
 *
 * Bricks must be placed with a minimum vertical clearance beneath them so the
 * player can stand on the platform below and jump to hit the brick from below.
 * See MIN_CLEARANCE (42 px) in CastleRescueGame.tsx.
 */
export interface Brick {
  id: string;
  x: number;
  y: number;
  /** Logical brick width (defaults to BRICK constant = 32). */
  width?: number;
  /** Logical brick height (defaults to BRICK constant = 32). */
  height?: number;
  /**
   * When true, a head-hit (player moving upward, player head crossing brick
   * underside) breaks the brick and awards score once.
   */
  breakableFromBelow?: boolean;
}

/** A spawnable enemy in the platformer level. */
export interface EnemySpawn {
  id: string;
  /** Patrol behavior archetype. */
  type: 'walker' | 'patroller' | 'ambush';
  x: number;
  y: number;
  /** Left patrol boundary (x coordinate). */
  patrolLeft?: number;
  /** Right patrol boundary (x coordinate). */
  patrolRight?: number;
}

// ─── Pipe types ───────────────────────────────────────────────────────────────

/**
 * What happens when the player enters a pipe.
 *
 *  correct  — advances the correct-route sequence (I → II → III).
 *  setback  — teleports player to last checkpoint with a score penalty.
 *  bonus    — teleports player to the bonus treasure room.
 *  ambush   — teleports player to the ambush trap room.
 *  dead     — brief visual animation; player stays in place, no state change.
 */
export type PipeBehavior = 'correct' | 'setback' | 'bonus' | 'ambush' | 'dead';

/**
 * A physical pipe object in the platformer level.
 *
 * Pipes are FULL_SOLID colliders: the player can stand on the pipe top and
 * walk into the pipe sides.  Pipe entry is only triggered by a deliberate
 * down-press while the player is aligned with the entry zone.
 */
export interface PipeNode {
  id: string;
  x: number;
  y: number;
  /** Pipe collision width. */
  width: number;
  /** Pipe collision height. */
  height: number;
  /** What happens when this pipe is entered. */
  behavior: PipeBehavior;
  /** ID of the section this pipe leads to (or exits into). */
  destinationSectionId: string;
  /**
   * Horizontal width of the centred entry zone at the pipe top.
   * The player's centre-X must fall within this zone for a down-press to
   * trigger entry.  Defaults to the full pipe width when omitted.
   */
  entryZoneWidth?: number;
}

// ─── Other level entities ─────────────────────────────────────────────────────

/** An environmental hazard (e.g. spikes, lava) that damages the player. */
export interface Hazard {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A collectible item (coin / gem) the player can pick up for score. */
export interface Collectible {
  id: string;
  x: number;
  y: number;
}

/** A respawn checkpoint the player activates by walking over it. */
export interface Checkpoint {
  id: string;
  x: number;
  y: number;
}

/** The rescue target room at the end of the level. */
export interface PrincessChamber {
  sectionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Platformer level map ─────────────────────────────────────────────────────

/**
 * Complete platformer-level description for one Castle Rescue run.
 *
 * Generated deterministically from `seed` by the level builder.
 * Treat as immutable once built.
 */
export interface CastleRescueMap {
  seed: number;
  /** Total level width in pixels. */
  width: number;
  /** Total level height in pixels. */
  height: number;
  sections: CastleSection[];
  platforms: Platform[];
  bricks: Brick[];
  enemies: EnemySpawn[];
  pipes: PipeNode[];
  hazards: Hazard[];
  collectibles: Collectible[];
  checkpoints: Checkpoint[];
  princessChamber: PrincessChamber | null;
  /** Ordered pipe IDs forming the correct route — exactly 3 entries. */
  correctPipeRoute: string[];
}

// ─── Live game state snapshots ────────────────────────────────────────────────

/**
 * Snapshot of the player's physical and health state.
 * Used for competition-system reporting and replay validation.
 */
export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  facing: 'left' | 'right';
  onGround: boolean;

  hearts: number;
  invulnerableUntilMs: number;
  lastCheckpointId: string | null;

  isRespawning: boolean;
  isTeleporting: boolean;
  isRescuing: boolean;
}

/** Snapshot of the scoring breakdown for one run. */
export interface ScoreState {
  total: number;
  enemiesDefeated: number;
  bricksBroken: number;
  collectiblesTaken: number;
  secretRoomsFound: string[];
  rescueBonusAwarded: boolean;

  scoredEnemyIds: string[];
  scoredBrickIds: string[];
  scoredCollectibleIds: string[];
  respawns: number;
}

/** Snapshot of the player's level-progress metrics. */
export interface ProgressState {
  furthestX: number;
  progressPercent: number;
  princessRescued: boolean;
  rescueTimeMs: number | null;
  damageTaken: number;
  falls: number;
}

/** Snapshot of the pipe-routing progress for one run. */
export interface RouteState {
  /** IDs of pipes entered so far (correct route pipes in order). */
  enteredPipeIds: string[];
  /** Number of wrong or out-of-order pipe entries. */
  wrongPipesEntered: number;
  /** How many times each pipe (by id) has been entered. */
  loopCounterByPipeId: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2.  Legacy grid-based types (deprecated)
//
//     These types back the original grid pipe-selection engine, reducer,
//     selectors, test fixtures, and scoring formula.  New code should use
//     the platformer types above.  These will be removed in a future cleanup.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Grid coordinate — used by the legacy grid-based engine only.
 * New code should use the `x`/`y` pixel coordinates on `Platform`, `PipeNode`, etc.
 */
export interface CellPos {
  row: number;
  col: number;
}

/**
 * @deprecated Grid pipe segment — used by the legacy grid-based engine only.
 * New code should use `PipeNode` for platformer pipe geometry.
 */
export interface PipeSegment {
  id: string;
  row: number;
  col: number;
  isRoute: boolean;
}

/**
 * @deprecated Grid-based map — used by the legacy engine, selectors, and test fixtures.
 * New code should use `CastleRescueMap` for the platformer level description.
 */
export interface CastleRescueGridMap {
  gridRows: number;
  gridCols: number;
  source: CellPos;
  sink: CellPos;
  pipes: PipeSegment[];
  correctRoute: string[];
}

/** Lifecycle status of a single legacy grid-based play-through. */
export type RunStatus = 'idle' | 'active' | 'complete';

/**
 * Mutable state for one player's run through the legacy grid-based minigame.
 * Used by the competition-system reducer and scoring layer.
 */
export interface RunState {
  status: RunStatus;
  /** Null before the run is started via startRun(). */
  map: CastleRescueGridMap | null;
  /** IDs of correct-route pipes the player has already selected, in order. */
  selectedPipeIds: string[];
  /**
   * Grid position of the "active head" — the furthest point the player
   * has successfully routed to so far.  Starts at map.source.
   */
  currentHeadPos: CellPos | null;
  wrongAttempts: number;
  startTimeMs: number;
  endTimeMs: number | null;
  score: number | null;
  outcomeResolved: boolean;
}

// ─── Ranking types ────────────────────────────────────────────────────────────

/** Raw result submitted by (or computed for) one player. */
export interface CastleRescueResult {
  playerId: string;
  score: number;
  wrongAttempts: number;
  /** Elapsed time in milliseconds (endTimeMs − startTimeMs). */
  elapsedMs: number;
}

/** Result annotated with placement rank (1-indexed, lower is better). */
export interface CastleRescueRankedResult extends CastleRescueResult {
  placement: number;
}
