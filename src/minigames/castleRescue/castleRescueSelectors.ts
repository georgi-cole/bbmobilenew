/**
 * castleRescueSelectors.ts
 *
 * Read-only derived data from a RunState.
 * All selectors are pure functions: same input → same output, no side-effects.
 * These are intended for UI consumption (React rendering) and do NOT mutate
 * the state.
 */

import type { RunState, CellPos, PipeSegment } from './castleRescueTypes';
import { areAdjacent } from './castleRescueUtils';

/**
 * Returns the set of pipe IDs that the player may legally click at this moment.
 * A pipe is eligible when:
 *  - The run is active.
 *  - The pipe has not already been successfully selected.
 *  - The pipe is orthogonally adjacent to the current routing head.
 *
 * This set is used by the UI to enable/disable pipe cells and prevent the
 * player from clicking non-reachable pipes (UX anti-exploit).
 */
export function selectClickablePipeIds(state: RunState): ReadonlySet<string> {
  if (state.status !== 'active' || state.map === null || state.currentHeadPos === null) {
    return new Set();
  }
  const head = state.currentHeadPos;
  return new Set(
    state.map.pipes
      .filter(
        (p) =>
          !state.selectedPipeIds.includes(p.id) &&
          areAdjacent(head, { row: p.row, col: p.col }),
      )
      .map((p) => p.id),
  );
}

/**
 * Returns the pipe segments grouped by their grid cell for fast O(1) lookup
 * during rendering (keyed by "row,col").
 */
export function selectPipeByCell(state: RunState): ReadonlyMap<string, PipeSegment> {
  const m = new Map<string, PipeSegment>();
  if (!state.map) return m;
  for (const pipe of state.map.pipes) {
    m.set(`${pipe.row},${pipe.col}`, pipe);
  }
  return m;
}

/**
 * True if the given grid cell is the current routing head position.
 * Used by the UI to highlight which cell the player is "at".
 */
export function selectIsHead(state: RunState, pos: CellPos): boolean {
  if (!state.currentHeadPos) return false;
  return state.currentHeadPos.row === pos.row && state.currentHeadPos.col === pos.col;
}

/**
 * Returns a display-friendly summary string for the current run status.
 * Example: "3 wrong attempts", "Complete — score: 850", "Route: 2/3"
 */
export function selectStatusSummary(state: RunState): string {
  switch (state.status) {
    case 'idle':
      return 'Waiting to start…';
    case 'active':
      return `Route: ${state.selectedPipeIds.length}/${state.map?.correctRoute.length ?? 3} — Mistakes: ${state.wrongAttempts}`;
    case 'complete':
      return `Complete — score: ${state.score ?? 0}`;
  }
}
