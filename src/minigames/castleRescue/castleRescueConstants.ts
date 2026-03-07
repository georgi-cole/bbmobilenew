/**
 * castleRescueConstants.ts
 *
 * Shared numeric/string constants for the Castle Rescue minigame.
 * Import these values instead of inlining magic numbers so that
 * balance tuning only requires changes in one place.
 */

/** Height (number of rows) of the pipe-routing grid. */
export const GRID_ROWS = 5;

/** Width (number of columns) of the pipe-routing grid. */
export const GRID_COLS = 5;

/**
 * Minimum number of clickable pipe segments placed on the map
 * (route pipes + decoy pipes combined, NOT counting source/sink).
 */
export const MIN_TOTAL_PIPES = 6;

/**
 * Maximum number of clickable pipe segments placed on the map
 * (route pipes + decoy pipes combined, NOT counting source/sink).
 */
export const MAX_TOTAL_PIPES = 8;

/**
 * Number of pipe segments the player must select in order
 * to complete the rescue route.
 */
export const CORRECT_ROUTE_LENGTH = 3;

/** Highest possible score a player can earn. */
export const MAX_SCORE = 1000;

/** Points deducted from the score per elapsed second. */
export const TIME_PENALTY_PER_SECOND = 10;

/**
 * Points deducted from the score each time the player clicks
 * a wrong (decoy) pipe and triggers a respawn / route reset.
 */
export const RESPAWN_PENALTY = 100;

/**
 * Lowest score that can be recorded — prevents negative scores.
 * The score is clamped to this floor before being finalised.
 */
export const SCORE_FLOOR = 0;

/**
 * Maximum number of times the map generator will retry with a
 * derived seed before throwing.  Derived seeds are computed as
 * (original_seed + attempt_index) to keep generation deterministic.
 */
export const MAX_GENERATOR_ATTEMPTS = 5;

/** Default game duration in milliseconds (60 seconds). */
export const TIME_LIMIT_MS = 60_000;
