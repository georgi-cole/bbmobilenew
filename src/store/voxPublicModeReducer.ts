import type { Reducer, UnknownAction } from '@reduxjs/toolkit'
import type { GameState } from '../types'
import { requestPublicModeChange } from './gameSlice'
import { reconcileStrategicNominationStatuses } from './nominationStatusConsistency'

/**
 * Vox Populi already uses the audience for the official eviction result, so
 * Public Mode is informational there: it only controls whether the player can
 * see the audience-facing surfaces/intel. The core game reducer intentionally
 * ignores mid-cycle Public Mode changes while Vox is active to protect normal
 * nomination/vote mechanics. At the store boundary, make that visibility-only
 * toggle immediate without rewriting any Vox gameplay state.
 *
 * This is also the outer game-reducer boundary in store.ts. Reconcile the
 * strategic AI nomination block here after the inner LOH planner has had its
 * final say, so provisional Player.status values cannot disagree with nomineeIds.
 */
export function withImmediateVoxPublicMode(baseReducer: Reducer<GameState>): Reducer<GameState> {
  return (state: GameState | undefined, action: UnknownAction): GameState => {
    const isActiveVoxRequest =
      state?.voxPopuli?.status === 'active' && requestPublicModeChange.match(action)
    const next = reconcileStrategicNominationStatuses(baseReducer(state, action))

    if (!isActiveVoxRequest) return next

    const requested = action.payload
    if (next.publicModeEnabled === requested && next.pendingPublicModeEnabled == null) return next

    return {
      ...next,
      publicModeEnabled: requested,
      pendingPublicModeEnabled: null,
    }
  }
}
