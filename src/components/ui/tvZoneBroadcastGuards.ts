import type { BroadcastLevel, Phase, TvEvent } from '../../types'

const AMBIENT_TWIN_SHOCK_KEYS = new Set([
  'twin_shock_clue',
  'twin_shock_confessional',
  'twin_shock_bond',
])

/**
 * Twin Shock foreshadowing is intentionally ambient. Older story code tags
 * these beats with `major` as a semantic identifier, which the broadcast
 * pipeline also interprets as presentation priority. Keep the identifiers for
 * backwards compatibility while presenting only these ambient beats as minor.
 */
export function getTvPresentationBroadcastLevel(
  event: TvEvent | null | undefined
): BroadcastLevel | undefined {
  if (!event) return undefined
  const majorKey = event.meta?.major ?? event.major
  if (typeof majorKey === 'string' && AMBIENT_TWIN_SHOCK_KEYS.has(majorKey)) {
    return 'minor'
  }
  return event.meta?.broadcastLevel as BroadcastLevel | undefined
}

/**
 * A queued broadcast is renderable only in the exact day/phase that produced
 * it. This prevents a saved or route-remount queue head from flashing an old
 * eviction/result message before the phase synchronizer rebuilds the queue.
 */
export function isCurrentPhaseBroadcastEvent(
  event: TvEvent | null | undefined,
  phase: Phase,
  week: number
): event is TvEvent {
  return Boolean(event && event.meta?.phase === phase && event.meta?.week === week)
}
