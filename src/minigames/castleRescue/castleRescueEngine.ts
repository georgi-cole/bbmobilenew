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

import type { RunState, CastleRescueMap } from './castleRescueTypes';
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
