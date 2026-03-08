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
 *     generateLevelConfig,
 *     rankCastleRescueResults,
 *   } from '../minigames/castleRescue';
 */

// ── React component ────────────────────────────────────────────────────────
export { default as CastleRescueGame } from './CastleRescueGame';

// ── Engine ─────────────────────────────────────────────────────────────────
export {
  createInitialRunState,
  startRun,
  finalizeRunState,
  getLiveScore,
} from './castleRescueEngine';

// ── Generator ──────────────────────────────────────────────────────────────
export { generateLevelConfig, validateLevelConfig } from './castleRescueGenerator';
export type { LevelConfig } from './castleRescueGenerator';

// ── Scoring ────────────────────────────────────────────────────────────────
export { computeScore, computeScoreFromState } from './castleRescueScoring';

// ── Ranking ────────────────────────────────────────────────────────────────
export { rankCastleRescueResults } from './castleRescueRanking';

// ── Reducer ────────────────────────────────────────────────────────────────
export { castleRescueReducer } from './castleRescueReducer';
export type { CastleRescueAction } from './castleRescueReducer';

// ── Types (re-exported for external consumers) ────────────────────────────
export type {
  // Platformer game types (current)
  CastleRescuePhase,
  CastleRescueCompetitionConfig,
  CastleSectionType,
  CastleSection,
  Platform,
  Brick,
  EnemySpawn,
  PipeBehavior,
  PipeNode,
  Hazard,
  Collectible,
  Checkpoint,
  PrincessChamber,
  CastleRescueMap,
  PlayerState,
  ScoreState,
  ProgressState,
  RouteState,
  // Legacy grid-based types (deprecated — kept for backward compatibility)
  CastleRescueGridMap,
  CastleRescueResult,
  CastleRescueRankedResult,
  RunState,
  RunStatus,
} from './castleRescueTypes';

// ── Constants (selectively exposed) ──────────────────────────────────────
export {
  MAX_SCORE,
  TIME_LIMIT_MS,
  RESPAWN_PENALTY,
  CORRECT_ROUTE_LENGTH,
  PIPE_SLOT_COUNT,
} from './castleRescueConstants';
