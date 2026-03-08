/**
 * castleRescueEngine.ts
 *
 * Core lifecycle functions for the Castle Rescue RunState.
 * These are pure (no side-effects) and are shared between the platformer
 * component and the competition system's outcome-resolution layer.
 *
 * Anti-exploit protections:
 *  - finalizeRunState is idempotent via outcomeResolved guard.
 *  - Score is hard-clamped to [SCORE_FLOOR, MAX_SCORE] in computeScore.
 */

import type { RunState, CastleRescueGridMap as CastleRescueMap } from './castleRescueTypes';
import { computeScoreFromState } from './castleRescueScoring';

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a fresh RunState with status === 'idle'.
 * Call startRun() to transition to 'active'.
 */
export function createInitialRunState(): RunState {
  return {
    status: 'idle',
    map: null,
    selectedPipeIds: [],
    currentHeadPos: null,
    wrongAttempts: 0,
    startTimeMs: 0,
    endTimeMs: null,
    score: null,
    outcomeResolved: false,
  };
}

// ─── Lifecycle transitions ────────────────────────────────────────────────────

/**
 * Transition the state from 'idle' to 'active'.
 *
 * @param state   - Must be in 'idle' status.
 * @param map     - An optional map reference (may be null for the platformer).
 * @param nowMs   - Current wall-clock milliseconds for elapsed-time tracking.
 */
export function startRun(state: RunState, map: CastleRescueMap | null, nowMs: number): RunState {
  if (state.status !== 'idle') return state;
  return {
    ...state,
    status: 'active',
    map,
    selectedPipeIds: [],
    currentHeadPos: map ? { ...map.source } : null,
    wrongAttempts: 0,
    startTimeMs: nowMs,
    endTimeMs: null,
    score: null,
    outcomeResolved: false,
  };
}

/**
 * Finalise a run that has either completed naturally or timed out.
 *
 * Idempotency: if state.outcomeResolved is already true this function returns
 * the state unchanged (prevents double prize dispatch).
 *
 * For timed-out runs (status === 'active') the run is forced to 'complete'
 * with whatever progress was made.
 *
 * @param state - Current RunState.
 * @param nowMs - Wall-clock milliseconds at finalisation time.
 */
export function finalizeRunState(state: RunState, nowMs: number): RunState {
  // Idempotency guard — do nothing if already resolved.
  if (state.outcomeResolved) return state;

  let finalState = state;

  if (state.status === 'active') {
    // Timeout path: force-complete the run with the current timestamp.
    const timedOut: RunState = {
      ...state,
      status: 'complete',
      endTimeMs: nowMs,
    };
    finalState = {
      ...timedOut,
      score: computeScoreFromState(timedOut),
    };
  }

  return { ...finalState, outcomeResolved: true };
}

/**
 * Compute the running (live) score estimate for an active run.
 * Useful for displaying a live score counter in the UI without finalising.
 *
 * Returns null if the run has not started yet.
 *
 * @param state - Current RunState.
 * @param nowMs - Current wall-clock milliseconds.
 */
export function getLiveScore(state: RunState, nowMs: number): number | null {
  if (state.status === 'idle') return null;
  if (state.status === 'complete') return state.score;
  // Active: estimate score based on elapsed time so far without mutating state.
  const elapsedMs = Math.max(0, nowMs - state.startTimeMs);
  const liveState: RunState = { ...state, endTimeMs: state.startTimeMs + elapsedMs };
  return computeScoreFromState(liveState);
}

// ─── Platformer collision helpers ─────────────────────────────────────────────
//
// These are pure predicates exported for use by the CastleRescueGame physics
// loop and for direct unit testing.  They do NOT mutate any state.

/** Axis-aligned bounding rectangle used by collision helpers. */
export interface CollisionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Returns true when the player is landing on the TOP of a surface.
 *
 * A "land" is detected when:
 *  - The player horizontally overlaps the surface.
 *  - In the previous frame the player's feet were at or above the surface top
 *    (prevPY + h ≤ surface.y + 4 — a 4 px grace band handles fast falls).
 *  - In the current frame the player's feet have crossed the surface top.
 *  - The player is falling (vy ≥ 0).
 */
export function playerLandsOnSurfaceTop(
  player: CollisionRect,
  prevPY: number,
  vy: number,
  surface: CollisionRect,
): boolean {
  return (
    player.x + player.w > surface.x &&
    player.x < surface.x + surface.w &&
    prevPY + player.h <= surface.y + 4 &&
    player.y + player.h >= surface.y &&
    vy >= 0
  );
}

/**
 * Returns true when the player, moving upward (vy < 0), hits the underside of
 * a full-solid surface (e.g. a non-one-way platform or the underside of the
 * world geometry).
 *
 * Detection window: player's top must cross the surface bottom within 4 px.
 */
export function playerHitsSurfaceFromBelow(
  player: CollisionRect,
  prevPY: number,
  vy: number,
  surface: CollisionRect,
): boolean {
  if (vy >= 0) return false;
  return (
    player.x + player.w > surface.x &&
    player.x < surface.x + surface.w &&
    prevPY >= surface.y + surface.h - 4 &&
    player.y < surface.y + surface.h
  );
}

/**
 * Returns true when the player laterally overlaps a solid pipe body.
 *
 * A small top-band exclusion (4 px) avoids ejecting a player who is
 * standing cleanly on the pipe's top surface.
 */
export function playerOverlapsPipeSide(
  player: CollisionRect,
  pipeX: number,
  pipeY: number,
  pipeW: number,
  pipeH: number,
): boolean {
  return (
    player.x + player.w > pipeX &&
    player.x < pipeX + pipeW &&
    player.y + player.h > pipeY + 4 &&
    player.y < pipeY + pipeH
  );
}

/**
 * Returns true when ALL conditions for entering a pipe are met:
 *
 *  1. `downPressed` — the player deliberately presses the down/enter key.
 *  2. `onGround` — the player is standing on a surface (not mid-air).
 *  3. `|vy| < 0.08` — the player's vertical velocity is effectively zero,
 *     confirming they are truly standing still (not bouncing or sliding).
 *  4. The player's centre-X is within the pipe's entry zone (centred on the
 *     pipe top, `entryZoneWidth` pixels wide).
 *  5. The player's feet (py + ph) are within 6 px of the pipe top (pipeY),
 *     meaning the player is standing ON the pipe, not next to it.
 *
 * @param px             Player left edge.
 * @param py             Player top edge.
 * @param pw             Player width.
 * @param ph             Player height.
 * @param onGround       Player is on a solid surface.
 * @param vy             Player vertical velocity (positive = falling).
 * @param downPressed    Down-input key is held.
 * @param pipeX          Pipe left edge.
 * @param pipeY          Pipe top edge.
 * @param pipeW          Pipe width.
 * @param entryZoneWidth Width of the centred entry opening at the pipe top.
 */
export function tryEnterPipe(
  px: number,
  py: number,
  pw: number,
  ph: number,
  onGround: boolean,
  vy: number,
  downPressed: boolean,
  pipeX: number,
  pipeY: number,
  pipeW: number,
  entryZoneWidth: number,
): boolean {
  if (!downPressed || !onGround || Math.abs(vy) >= 0.08) return false;
  const cx = px + pw / 2;
  const entryLeft = pipeX + (pipeW - entryZoneWidth) / 2;
  const alignedX = cx >= entryLeft && cx <= entryLeft + entryZoneWidth;
  const onPipeTop = Math.abs((py + ph) - pipeY) <= 6;
  return alignedX && onPipeTop;
}

/**
 * Returns true when the player, moving upward (vy < 0), hits the underside of
 * a brick that has `breakableFromBelow` enabled and is not already broken.
 *
 * A 4 px detection band at the brick bottom keeps the hit window
 * consistent with a 60 fps physics loop.
 */
export function playerHitsBrickFromBelow(
  player: CollisionRect,
  prevPY: number,
  vy: number,
  brickX: number,
  brickY: number,
  brickW: number,
  brickH: number,
  breakableFromBelow: boolean,
  broken: boolean,
): boolean {
  if (!breakableFromBelow || broken || vy >= 0) return false;
  return (
    player.x + player.w - 4 > brickX &&
    player.x + 4 < brickX + brickW &&
    player.y <= brickY + brickH &&
    prevPY > brickY + brickH - 4
  );
}
