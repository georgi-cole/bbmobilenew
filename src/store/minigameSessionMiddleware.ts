import type { Middleware } from '@reduxjs/toolkit'
import { resetAllHostedMinigameState } from '../minigames/resetHostedMinigameState'

/**
 * A season reset ends every active minigame session as well as the campaign.
 *
 * Feature reducers live outside the game slice, so they otherwise retain a
 * completed result after "Abandon Season". Clearing them synchronously as part
 * of the same dispatch prevents the first challenge of the next season from
 * reading an old winner before it initializes.
 */
export const minigameSessionMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action)
  if (
    typeof action === 'object' &&
    action !== null &&
    'type' in action &&
    action.type === 'game/resetGame'
  ) {
    resetAllHostedMinigameState(api.dispatch)
  }
  return result
}
