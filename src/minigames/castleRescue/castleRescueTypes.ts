/**
 * castleRescueTypes.ts
 *
 * All TypeScript interfaces and type aliases for the Castle Rescue minigame.
 * No runtime logic lives here — pure type definitions only.
 */

// ─── Grid primitives ─────────────────────────────────────────────────────────

/** A zero-indexed (row, col) grid coordinate. */
export interface CellPos {
  row: number;
  col: number;
}

// ─── Map types ────────────────────────────────────────────────────────────────

/** A single pipe segment rendered on the grid. */
export interface PipeSegment {
  /**
   * Unique, stable string identifier for this pipe within the generated map.
   * Format: "route-0", "route-1", … for correct-route pipes;
   *         "decoy-0", "decoy-1", … for decoys.
   */
  id: string;
  row: number;
  col: number;
  /**
   * True when this pipe belongs to the correct rescue route.
   * The UI may use this for post-game reveal; it must NOT be exposed
   * to the player during active play (anti-exploit).
   */
  isRoute: boolean;
}

/**
 * A fully generated, solvability-validated Castle Rescue map.
 * Treat as immutable once returned by generateMapForSeed.
 */
export interface CastleRescueMap {
  gridRows: number;
  gridCols: number;
  /** Source cell (inlet) — visually distinct, NOT clickable by the player. */
  source: CellPos;
  /** Destination cell (sink/outlet) — visually distinct, NOT clickable. */
  sink: CellPos;
  /**
   * All user-clickable pipe segments (route + decoys), in no particular order.
   * Length is between MIN_TOTAL_PIPES and MAX_TOTAL_PIPES.
   */
  pipes: PipeSegment[];
  /**
   * Ordered list of pipe IDs forming the correct path from source to sink.
   * Length === CORRECT_ROUTE_LENGTH (3).
   * Must remain hidden from the player until post-game reveal.
   */
  correctRoute: string[];
}

// ─── Run-state types ──────────────────────────────────────────────────────────

/** Lifecycle status of a single play-through. */
export type RunStatus = 'idle' | 'active' | 'complete';

/**
 * Mutable state for one player's run through the minigame.
 * Designed to work as the state type for React's useReducer.
 */
export interface RunState {
  status: RunStatus;
  /** Null before the run is started via startRun(). */
  map: CastleRescueMap | null;
  /** IDs of correct-route pipes the player has already selected, in order. */
  selectedPipeIds: string[];
  /**
   * Grid position of the "active head" — the furthest point the player
   * has successfully routed to so far.  Starts at map.source.
   * Only pipes adjacent to this position may be selected next.
   */
  currentHeadPos: CellPos | null;
  /** Total number of wrong pipe clicks since the run started. */
  wrongAttempts: number;
  /** Wall-clock ms timestamp when the run started (performance.now() or Date.now()). */
  startTimeMs: number;
  /** Wall-clock ms timestamp when the run completed; null while active. */
  endTimeMs: number | null;
  /** Computed final score, null while the run is still active. */
  score: number | null;
  /**
   * Idempotency guard.  Set to true once the competition system has dispatched
   * the prize outcome.  finalizeRunState() is a no-op when this is true,
   * preventing double-dispatch in concurrent React renders.
   */
  outcomeResolved: boolean;
}

// ─── Competition config ───────────────────────────────────────────────────────

/**
 * Parameters supplied by the competition system when starting a run.
 * The seed is the ONLY source of randomness for map generation; no
 * Date.now() or Math.random() may be used inside the generator.
 */
export interface CastleRescueCompetitionConfig {
  /** Deterministic Mulberry32 seed derived from the competition nonce. */
  seed: number;
  /** Milliseconds before the run auto-finalises (default: TIME_LIMIT_MS). */
  timeLimitMs?: number;
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
