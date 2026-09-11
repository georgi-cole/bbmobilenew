import type { Middleware } from '@reduxjs/toolkit'
import type { SocialActionLogEntry } from './types'
import { processHumanSocialStrategyAction } from './socialStrategyActions'
import { queueSocialStrategyInvitation } from './socialStrategyInvitation'
import { processSocialStrategyDayEnd } from './socialStrategyPressure'
import type { DayEndPlan, StrategyState } from './socialStrategyShared'

export { deriveBehaviorPressure } from './socialStrategyPressure'

/**
 * Additive bridge between the social simulation and the existing strategic AI.
 * Nominations, Safety and votes remain owned by the core game engine; this layer
 * only changes the Reality relationship graph that already feeds those decisions.
 */
export const socialStrategyMiddleware: Middleware = (api) => (next) => (action) => {
  if (typeof action !== 'object' || action === null || !('type' in action)) return next(action)

  const type = String((action as { type: string }).type)
  const before = api.getState() as StrategyState
  let dayEndPlan: DayEndPlan | null = null

  if (type === 'game/advance' && before.game.phase === 'eviction_results') {
    dayEndPlan = processSocialStrategyDayEnd(api, before)
  }

  const result = next(action)
  const after = api.getState() as StrategyState

  if (type === 'game/advance' && before.game.phase === 'eviction_results') {
    queueSocialStrategyInvitation(api, after, dayEndPlan)
  }

  if (type === 'social/recordSocialAction') {
    const entry = (action as unknown as { payload: { entry: SocialActionLogEntry } }).payload.entry
    processHumanSocialStrategyAction(api, after, entry)
  }

  return result
}
