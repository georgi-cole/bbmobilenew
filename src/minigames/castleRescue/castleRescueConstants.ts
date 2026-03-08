/**
 * castleRescueConstants.ts
 *
 * Shared numeric/string constants for the Castle Rescue minigame.
 * Import these values instead of inlining magic numbers so that
 * balance tuning only requires changes in one place.
 */

// ── Legacy grid constants (kept for scoring/ranking tests) ────────────────────

/** @deprecated Grid dimension — kept so scoring/test fixtures remain valid. */
export const GRID_ROWS = 5;
/** @deprecated Grid dimension — kept so scoring/test fixtures remain valid. */
export const GRID_COLS = 5;
/** @deprecated Pipe-count bounds — kept so fixture types compile. */
export const MIN_TOTAL_PIPES = 6;
/** @deprecated Pipe-count bounds — kept so fixture types compile. */
export const MAX_TOTAL_PIPES = 8;
/** Number of correct pipes the player must enter in order. */
export const CORRECT_ROUTE_LENGTH = 3;
/** @deprecated Retry limit for old grid generator. */
export const MAX_GENERATOR_ATTEMPTS = 5;

// ── Scoring ───────────────────────────────────────────────────────────────────

/** Maximum achievable base score (before platformer bonuses). */
export const MAX_SCORE = 1000;

/** Points deducted per elapsed second. */
export const TIME_PENALTY_PER_SECOND = 10;

/**
 * Points deducted (and wrongAttempts incremented) each time the player
 * enters a wrong or out-of-order pipe.
 */
export const RESPAWN_PENALTY = 100;

/** Lowest score that can be recorded — prevents negative scores. */
export const SCORE_FLOOR = 0;

// ── Platformer scoring bonuses / penalties ───────────────────────────────────

/** Points awarded for stomping an enemy. */
export const SCORE_ENEMY = 20;

/** Points awarded for breaking a brick. */
export const SCORE_BRICK = 5;

/** Points awarded for collecting a coin. */
export const SCORE_COIN = 25;

/** Points awarded for activating a checkpoint (explore bonus). */
export const SCORE_CHECKPOINT = 50;

/** Bonus awarded upon rescuing the princess. */
export const SCORE_RESCUE = 1000;

/** Points deducted each time the player dies (enemy hit or falls into a pit). */
export const PENALTY_DEATH = 50;

/** Total number of pipe slots placed in the level. */
export const PIPE_SLOT_COUNT = 6;

/** Default game duration in milliseconds (2 minutes 30 seconds). */
export const TIME_LIMIT_MS = 150_000;

/** Duration of the pipe-entry flash animation in milliseconds. */
export const PIPE_FLASH_MS = 700;
