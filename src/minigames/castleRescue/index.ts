/**
 * index.ts — Castle Rescue module entry point.
 *
 * Re-exports everything the competition system (and the minigame registry)
 * needs to integrate Castle Rescue.  Import from this file rather than
 * from individual sub-modules to decouple callers from internal paths.
 *
 * Usage:
 *   import {
 *     CastleRescueGame,
 *     createInitialRunState,
 *     generateMapForSeed,
 *     validateGeneratedMap,
 *     rankCastleRescueResults,
 *   } from '../minigames/castleRescue';
 */

// ── React component ────────────────────────────────────────────────────────
export { default as CastleRescueGame } from './CastleRescueGame';

// ── Engine ─────────────────────────────────────────────────────────────────
export {
  createInitialRunState,
  startRun,
  handlePipeClick,
  finalizeRunState,
  getLiveScore,
} from './castleRescueEngine';

// ── Generator ──────────────────────────────────────────────────────────────
export { generateMapForSeed, validateGeneratedMap } from './castleRescueGenerator';

// ── Scoring ────────────────────────────────────────────────────────────────
export { computeScore, computeScoreFromState } from './castleRescueScoring';

// ── Ranking ────────────────────────────────────────────────────────────────
export { rankCastleRescueResults } from './castleRescueRanking';

// ── Reducer ────────────────────────────────────────────────────────────────
export { castleRescueReducer } from './castleRescueReducer';
export type { CastleRescueAction } from './castleRescueReducer';

// ── Types (re-exported for external consumers) ────────────────────────────
export type {
  CastleRescueCompetitionConfig,
  CastleRescueMap,
  CastleRescueResult,
  CastleRescueRankedResult,
  CellPos,
  PipeSegment,
  RunState,
  RunStatus,
} from './castleRescueTypes';

// ── Constants (selectively exposed) ──────────────────────────────────────
export {
  MAX_SCORE,
  TIME_LIMIT_MS,
  RESPAWN_PENALTY,
  CORRECT_ROUTE_LENGTH,
} from './castleRescueConstants';
