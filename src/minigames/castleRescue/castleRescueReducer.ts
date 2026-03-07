/**
 * castleRescueReducer.ts
 *
 * Plain (non-Redux) reducer for Castle Rescue RunState.
 * Designed to be used with React's useReducer:
 *
 *   const [state, dispatch] = useReducer(castleRescueReducer, createInitialRunState());
 *
 * Each action is a discriminated union tagged by `type`.
 * All mutation logic is delegated to pure engine functions in castleRescueEngine.ts.
 */

import type { RunState, CastleRescueMap } from './castleRescueTypes';
import {
  createInitialRunState,
  startRun,
  handlePipeClick,
  finalizeRunState,
} from './castleRescueEngine';

// ─── Action types ─────────────────────────────────────────────────────────────

export type CastleRescueAction =
  | { type: 'START'; map: CastleRescueMap; nowMs: number }
  | { type: 'CLICK_PIPE'; pipeId: string; nowMs: number }
  | { type: 'FINALIZE'; nowMs: number }
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
      return startRun(state, action.map, action.nowMs);

    case 'CLICK_PIPE':
      return handlePipeClick(state, action.pipeId, action.nowMs);

    case 'FINALIZE':
      /**
       * Idempotent: calling FINALIZE multiple times (e.g. from a timer AND
       * from a component unmount) is safe — finalizeRunState checks
       * outcomeResolved and returns the state unchanged after the first call.
       */
      return finalizeRunState(state, action.nowMs);

    case 'RESET':
      return createInitialRunState();

    default:
      return state;
  }
}
