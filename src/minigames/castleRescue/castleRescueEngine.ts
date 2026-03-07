/**
 * castleRescueEngine.ts
 *
 * Core game-logic functions for Castle Rescue.  All functions are pure
 * (they return new state objects rather than mutating their inputs) and
 * work without React, Redux, or any browser API — suitable for unit tests.
 *
 * Anti-exploit protections implemented:
 *  - Clicking an already-selected pipe is a no-op (no double-penalty).
 *  - Clicking the source or sink cells is a no-op.
 *  - Clicking a pipe that is not adjacent to the current head is a no-op.
 *  - finalizeRunState is idempotent via outcomeResolved guard.
 *  - Score is hard-clamped to [SCORE_FLOOR, MAX_SCORE] in computeScore.
 */

import type { RunState, CastleRescueMap, CellPos } from './castleRescueTypes';
import { computeScoreFromState } from './castleRescueScoring';
import { areAdjacent, posEqual } from './castleRescueUtils';
import { CORRECT_ROUTE_LENGTH } from './castleRescueConstants';

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
 * Transition the state from 'idle' to 'active' using the provided map.
 *
 * @param state   - Must be in 'idle' status.
 * @param map     - A validated map returned by generateMapForSeed.
 * @param nowMs   - Current wall-clock milliseconds (Date.now() or performance.now()).
 *                  Only used for elapsed-time measurement, NOT for map generation.
 */
export function startRun(state: RunState, map: CastleRescueMap, nowMs: number): RunState {
  if (state.status !== 'idle') return state; // guard against double-start
  return {
    ...state,
    status: 'active',
    map,
    selectedPipeIds: [],
    currentHeadPos: { ...map.source },
    wrongAttempts: 0,
    startTimeMs: nowMs,
    endTimeMs: null,
    score: null,
    outcomeResolved: false,
  };
}

/**
 * Handle the player clicking on a pipe segment identified by pipeId.
 *
 * Resolution logic:
 *  1. If the run is not active, or the map is null → no-op.
 *  2. If pipeId is already in selectedPipeIds → no-op (anti-exploit).
 *  3. Find the pipe in map.pipes; if not found → no-op.
 *  4. If the pipe's cell is not adjacent to currentHeadPos → no-op.
 *     (Prevents "teleporting" through the maze.)
 *  5. If the pipe is the next expected route pipe:
 *       a. Add it to selectedPipeIds.
 *       b. Advance currentHeadPos to that pipe's cell.
 *       c. If all CORRECT_ROUTE_LENGTH route pipes are now selected,
 *          check adjacency to the sink and complete the run.
 *  6. Otherwise it is a wrong/decoy click:
 *       a. Increment wrongAttempts (respawn penalty).
 *       b. Reset selectedPipeIds to [] and currentHeadPos back to source.
 *
 * @param state  - Current RunState.
 * @param pipeId - ID of the pipe the player clicked.
 * @param nowMs  - Current wall-clock milliseconds (used only on completion).
 */
export function handlePipeClick(state: RunState, pipeId: string, nowMs: number): RunState {
  if (state.status !== 'active' || state.map === null || state.currentHeadPos === null) {
    return state;
  }

  const { map, selectedPipeIds, currentHeadPos } = state;

  // Anti-exploit: ignore re-clicks on already-selected pipes.
  if (selectedPipeIds.includes(pipeId)) return state;

  // Find the pipe segment in the map.
  const pipe = map.pipes.find((p) => p.id === pipeId);
  if (!pipe) return state;

  const pipePos: CellPos = { row: pipe.row, col: pipe.col };

  // Guard: pipe must be adjacent to the current routing head.
  if (!areAdjacent(currentHeadPos, pipePos)) return state;

  const nextExpectedId = map.correctRoute[selectedPipeIds.length];

  if (pipe.id === nextExpectedId) {
    // ── Correct pipe ──────────────────────────────────────────────────────
    const newSelected = [...selectedPipeIds, pipe.id];
    const newHeadPos: CellPos = pipePos;

    if (newSelected.length === CORRECT_ROUTE_LENGTH) {
      // All route pipes selected — verify the last pipe is adjacent to the sink.
      // (validateGeneratedMap already guarantees this, but we re-check at
      //  runtime as a defensive anti-exploit guard.)
      if (!areAdjacent(newHeadPos, map.sink)) {
        // Template invariant violated; treat as wrong to prevent runaway state.
        return {
          ...state,
          wrongAttempts: state.wrongAttempts + 1,
          selectedPipeIds: [],
          currentHeadPos: { ...map.source },
        };
      }
      // Run complete — compute and lock the score.
      const completedState: RunState = {
        ...state,
        status: 'complete',
        selectedPipeIds: newSelected,
        currentHeadPos: newHeadPos,
        endTimeMs: nowMs,
      };
      return {
        ...completedState,
        score: computeScoreFromState({ ...completedState, endTimeMs: nowMs }),
      };
    }

    // Route not yet complete — advance head.
    return {
      ...state,
      selectedPipeIds: newSelected,
      currentHeadPos: newHeadPos,
    };
  } else {
    // ── Wrong / decoy pipe ────────────────────────────────────────────────
    // Respawn: reset selection back to source and charge the penalty.
    return {
      ...state,
      wrongAttempts: state.wrongAttempts + 1,
      selectedPipeIds: [],
      currentHeadPos: { ...map.source },
    };
  }
}

/**
 * Finalise a run that has either completed naturally or timed out.
 *
 * Idempotency: if state.outcomeResolved is already true this function returns
 * the state unchanged (prevents double prize dispatch).
 *
 * For timed-out runs (status === 'active') the run is forced to 'complete'
 * with whatever progress was made; the score is then computed normally
 * (time penalty will be maximal, driving the score toward SCORE_FLOOR).
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
  // Active: estimate based on elapsed time so far.
  const elapsedMs = Math.max(0, nowMs - state.startTimeMs);
  const tempState: RunState = { ...state, endTimeMs: nowMs + elapsedMs };
  return computeScoreFromState({ ...tempState, endTimeMs: state.startTimeMs + elapsedMs });
}

/**
 * Return whether the player has clicked the correct next route pipe and
 * whether the sink is now reachable (all route pipes selected and adjacent
 * to the sink).  Exposed for selector/UI use.
 */
export function isRouteComplete(state: RunState): boolean {
  if (!state.map) return false;
  if (state.selectedPipeIds.length !== CORRECT_ROUTE_LENGTH) return false;
  if (!state.map.correctRoute.every((id, i) => state.selectedPipeIds[i] === id)) return false;

  const lastRouteId = state.map.correctRoute[CORRECT_ROUTE_LENGTH - 1];
  const lastPipe = state.map.pipes.find((p) => p.id === lastRouteId);
  if (!lastPipe) return false;

  return posEqual(
    state.currentHeadPos ?? { row: -1, col: -1 },
    { row: lastPipe.row, col: lastPipe.col },
  );
}
