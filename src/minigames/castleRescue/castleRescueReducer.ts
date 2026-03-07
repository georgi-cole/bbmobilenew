/**
 * castleRescueReducer.ts
 *
 * Plain (non-Redux) reducer for Castle Rescue RunState.
 * Designed to be used with React's useReducer:
 *
 *   const [state, dispatch] = useReducer(castleRescueReducer, createInitialRunState());
 *
 * The platformer game component manages its own canvas state directly;
 * this reducer is provided for external competition-system wiring that
 * needs to track the run lifecycle (start time, finalization, reset).
 */

import type { RunState } from './castleRescueTypes';
import { createInitialRunState, startRun, finalizeRunState } from './castleRescueEngine';

// ─── Action types ─────────────────────────────────────────────────────────────

export type CastleRescueAction =
  | { type: 'START'; nowMs: number }
  | { type: 'FINALIZE'; nowMs: number; wrongAttempts?: number }
  | { type: 'RESET' };

// ─── Reducer ──────────────────────────────────────────────────────────────────

/**
 * Pure reducer that transitions RunState in response to CastleRescueActions.
 *
 * RESET always returns a fresh initial state, allowing the UI to restart
 * without re-mounting the component.
 */
export function castleRescueReducer(
  state: RunState,
  action: CastleRescueAction,
): RunState {
  switch (action.type) {
    case 'START':
      return startRun(state, null, action.nowMs);

    case 'FINALIZE': {
      const withWrongs =
        action.wrongAttempts !== undefined
          ? { ...state, wrongAttempts: action.wrongAttempts }
          : state;
      return finalizeRunState(withWrongs, action.nowMs);
    }

    case 'RESET':
      return createInitialRunState();

    default:
      return state;
  }
}
