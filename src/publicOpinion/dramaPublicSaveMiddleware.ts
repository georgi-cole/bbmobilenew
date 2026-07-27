import type { Middleware } from '@reduxjs/toolkit'
import { replaceDramaNetwork, updateRelationship } from '../social/socialSlice'
import { normalizeDramaSocialNetwork } from '../social/dramaModeEngine'
import type { DramaBelief, DramaSocialNetwork } from '../social/types'

interface StateWithDramaPublicSave {
  game?: { week?: number }
  social?: { dramaNetwork?: DramaSocialNetwork }
}

function isExpiredPublicSaveThreat(belief: DramaBelief, currentWeek: number): boolean {
  return (
    belief.kind === 'strategic_threat' &&
    belief.sourceId.startsWith('public-save-') &&
    belief.createdWeek < currentWeek
  )
}

export function getPublicSaveThreatRestoreDelta(belief: DramaBelief): number {
  return belief.sentiment > 0 ? -2 : 4
}

export function pruneExpiredPublicSaveThreatBeliefs(
  network: DramaSocialNetwork,
  currentWeek: number
): DramaSocialNetwork {
  const normalized = normalizeDramaSocialNetwork(network)
  const beliefs = normalized.beliefs.filter(
    (belief) => !isExpiredPublicSaveThreat(belief, currentWeek)
  )

  if (beliefs.length === normalized.beliefs.length) return normalized
  return { ...normalized, beliefs }
}

/**
 * Public Save threat perception lasts for the remainder of the current day.
 * The middleware removes the temporary beliefs and reverses their exact
 * relationship bias on the next day, including after save hydration.
 */
export const dramaPublicSaveMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action)
  if (
    typeof action === 'object' &&
    action !== null &&
    'type' in action &&
    action.type === 'social/replaceDramaNetwork'
  ) {
    return result
  }

  const state = api.getState() as StateWithDramaPublicSave
  const network = state.social?.dramaNetwork
  const currentWeek = state.game?.week ?? 1
  if (!network) return result

  const expiredBeliefs = network.beliefs.filter((belief) =>
    isExpiredPublicSaveThreat(belief, currentWeek)
  )
  if (expiredBeliefs.length === 0) return result

  // Remove the ledger first so the relationship-restoration actions cannot
  // recursively rediscover and restore the same temporary effect.
  api.dispatch(replaceDramaNetwork(pruneExpiredPublicSaveThreatBeliefs(network, currentWeek)))
  expiredBeliefs.forEach((belief) => {
    api.dispatch(
      updateRelationship({
        source: belief.holderId,
        target: belief.subjectId,
        delta: getPublicSaveThreatRestoreDelta(belief),
        actionSource: 'system',
      })
    )
  })

  return result
}
