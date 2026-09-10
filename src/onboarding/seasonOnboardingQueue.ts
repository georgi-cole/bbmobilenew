import { isCurrentPhaseBroadcastEvent } from '../components/ui/tvZoneBroadcastGuards'
import type { Phase, TvEvent } from '../types'

/**
 * Match Faux TV's queue selection exactly. A persisted off-phase broadcast can
 * remain at the queue head during a route remount; it must not hide the
 * current season-opening handoff from the tutorial controller.
 */
export function selectCurrentQueuedBroadcast(
  broadcastQueue: readonly string[],
  tvFeed: readonly TvEvent[],
  phase: Phase,
  week: number
): TvEvent | null {
  for (const broadcastId of broadcastQueue) {
    const event = tvFeed.find((candidate) => candidate.id === broadcastId) ?? null
    if (isCurrentPhaseBroadcastEvent(event, phase, week)) return event
  }
  return null
}
