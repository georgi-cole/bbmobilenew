import type { BroadcastLevel, Phase, TvEvent } from '../../types'

const AMBIENT_TWIN_SHOCK_KEYS = new Set([
  'twin_shock_clue',
  'twin_shock_confessional',
  'twin_shock_bond',
])

const AMBIENT_TWIN_SHOCK_CLUES = new Set([
  'Lia seemed unusually quiet this morning, then suddenly full of energy by lunch.',
  'Lia laughed at a joke she claimed not to understand yesterday.',
  'Someone mentioned that Lia looked different in the garden, but nobody pushed it further.',
  'Lia forgot a conversation she had only a day ago.',
])

/**
 * Twin Shock foreshadowing is intentionally ambient. Older story code tags
 * these beats with `major` as a semantic identifier, which the broadcast
 * pipeline also interprets as presentation priority. Managed broadcast refresh
 * can additionally normalize an unregistered semantic major to `custom_major`,
 * so recognise the canonical clue copy as well. The events remain queued/forced
 * onto the faux TV, but render as the ordinary minor-TV treatment rather than a
 * BIG EYE BROADCAST card.
 */
export function getTvPresentationBroadcastLevel(
  event: TvEvent | null | undefined
): BroadcastLevel | undefined {
  if (!event) return undefined
  const majorKey = event.meta?.major ?? event.major
  if (
    (typeof majorKey === 'string' && AMBIENT_TWIN_SHOCK_KEYS.has(majorKey)) ||
    AMBIENT_TWIN_SHOCK_CLUES.has(event.text)
  ) {
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
