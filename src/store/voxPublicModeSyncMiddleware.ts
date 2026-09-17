import type { Middleware } from '@reduxjs/toolkit'
import type { GameState } from '../types'
import { hydrateGame, requestPublicModeChange } from './gameSlice'

type VoxPublicModeSyncState = {
  game: GameState
  settings: {
    sim: {
      publicMode: boolean
    }
  }
}

/**
 * Saved runs can contain the old Vox bug where Settings says Public Mode is on
 * while the game slice still says it is off. Hydration replaces the game slice
 * after store startup, so repair that mismatch at the hydration boundary.
 */
export const voxPublicModeSyncMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action)
  if (!hydrateGame.match(action)) return result

  const state = api.getState() as VoxPublicModeSyncState
  if (state.game.voxPopuli?.status !== 'active') return result

  const requested = state.settings.sim.publicMode === true
  if (state.game.publicModeEnabled !== requested) {
    api.dispatch(requestPublicModeChange(requested))
  }

  return result
}
