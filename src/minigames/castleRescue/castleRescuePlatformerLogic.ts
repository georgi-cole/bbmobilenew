/**
 * castleRescuePlatformerLogic.ts
 *
 * Pure functions for the Castle Rescue platformer run:
 *  - computePlatformerFinalScore — final score at run completion.
 *  - applyPipeEntry              — deterministic, idempotent pipe-entry state mutation.
 *
 * Kept in a separate module so the main CastleRescueGame component file only
 * contains a default React-component export (required by react-refresh).
 */

import {
  CORRECT_ROUTE_LENGTH,
  PIPE_FLASH_MS,
  SCORE_RESCUE as RESCUE_BONUS,
  RESPAWN_PENALTY as P_WRONG_PIPE,
  TIME_PENALTY_PER_SECOND as TIME_PEN,
} from './castleRescueConstants';

// ── Minimal structural types ───────────────────────────────────────────────────
// These describe only the fields that the logic functions read/write.
// The full GameState and Pipe interfaces (defined in CastleRescueGame.tsx) are
// structurally compatible, so no casting is needed at call sites.

/** Minimal score-state shape accepted by computePlatformerFinalScore. */
export interface PlatformerScoreState {
  score: number;
  princessRescued: boolean;
}

/** Minimal game-state shape accepted by applyPipeEntry. */
export interface PipeEntryGameState {
  pipesComplete: number;
  wrongPipes: number;
  score: number;
  pipeFlashType: 'correct' | 'setback' | 'dead';
  pipeFlashTimer: number;
  phase: 'idle' | 'playing' | 'pipe_flash' | 'death_pause' | 'complete';
  gateOpen: boolean;
}

/** Minimal pipe shape accepted by applyPipeEntry. */
export interface PipeEntryPipe {
  done: boolean;
  pipeType: 'correct' | 'setback' | 'bonus' | 'ambush' | 'dead';
  routeIndex: number;
}

// ── Compute final platformer score ────────────────────────────────────────────

/**
 * Computes the final score at platformer run completion.
 *
 * Wrong-pipe penalties are applied to `gs.score` in real-time as they occur;
 * they must NOT be subtracted again here to avoid double-counting.
 * Only the rescue bonus and time penalty are applied at finalisation time.
 */
export function computePlatformerFinalScore(gs: PlatformerScoreState, elapsedMs: number): number {
  const rescue      = gs.princessRescued ? RESCUE_BONUS : 0;
  const timePenalty = Math.floor(elapsedMs / 1000) * TIME_PEN;
  return Math.max(0, gs.score + rescue - timePenalty);
}

// ── Pipe entry state mutation ──────────────────────────────────────────────────

/**
 * Return value of applyPipeEntry — tells the caller what to do next.
 *
 *  'handled'      — state already updated; caller should break out of the loop.
 *  'enter_bonus'  — pipe marked done; caller should set gs.room = buildBonusRoom().
 *  'enter_ambush' — pipe marked done; caller should set gs.room = buildAmbushRoom().
 */
export type PipeEntryResult = 'handled' | 'enter_bonus' | 'enter_ambush';

/**
 * Applies the state changes for entering a pipe.
 *
 * Designed to be deterministic and idempotent:
 *  - Already-done pipes show a brief visual flash but never modify progression.
 *  - Correct pipes only advance `pipesComplete` when entered in the right order.
 *  - Setback / bonus / ambush / dead pipes are marked done on first entry.
 */
export function applyPipeEntry(gs: PipeEntryGameState, pipe: PipeEntryPipe): PipeEntryResult {
  // Already-used pipe: brief visual feedback, no progression change.
  if (pipe.done) {
    gs.pipeFlashType = 'dead';
    gs.pipeFlashTimer = PIPE_FLASH_MS;
    gs.phase = 'pipe_flash';
    return 'handled';
  }

  if (pipe.pipeType === 'correct') {
    if (pipe.routeIndex === gs.pipesComplete) {
      // Correct pipe entered in the right order — advance progression.
      pipe.done = true;
      gs.pipesComplete++;
      gs.pipeFlashType = 'correct';
      if (gs.pipesComplete >= CORRECT_ROUTE_LENGTH) gs.gateOpen = true;
    } else {
      // Correct pipe entered out of order — penalise but do not mark done
      // (the player must come back and enter it in the correct order later).
      gs.wrongPipes++;
      gs.score = Math.max(0, gs.score - P_WRONG_PIPE);
      gs.pipeFlashType = 'setback';
    }
    gs.pipeFlashTimer = PIPE_FLASH_MS;
    gs.phase = 'pipe_flash';
    return 'handled';
  }

  if (pipe.pipeType === 'setback') {
    // Penalise and mark done to prevent repeated-entry score drain.
    pipe.done = true;
    gs.wrongPipes++;
    gs.score = Math.max(0, gs.score - P_WRONG_PIPE);
    gs.pipeFlashType = 'setback';
    gs.pipeFlashTimer = PIPE_FLASH_MS;
    gs.phase = 'pipe_flash';
    return 'handled';
  }

  if (pipe.pipeType === 'bonus') {
    pipe.done = true;
    return 'enter_bonus';
  }

  if (pipe.pipeType === 'ambush') {
    pipe.done = true;
    return 'enter_ambush';
  }

  // dead pipe: brief visual animation only.
  pipe.done = true;
  gs.pipeFlashType = 'dead';
  gs.pipeFlashTimer = PIPE_FLASH_MS;
  gs.phase = 'pipe_flash';
  return 'handled';
}
