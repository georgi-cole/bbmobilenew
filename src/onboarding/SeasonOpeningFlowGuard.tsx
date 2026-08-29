import { useLayoutEffect } from 'react'
import { isLegacySeasonWelcomeEvent, isServiceConfigurationEvent } from '../services/activityService'
import { advance, consumeBroadcastEvent } from '../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'

const DAY_ONE_START_TEMPLATE_ID = 'week.day-start'

/**
 * Compatibility guard for the polished season opening.
 *
 * Older/default season-start broadcasts are still constructed by the managed
 * broadcast system before the onboarding controller mounts. They must be
 * acknowledged before paint so they cannot win the faux-TV queue over the new
 * Beat 1 / Beat 3 opening. The same guard removes the redundant Day 1 stop
 * during the one-time opening handoff while preserving any real critical or
 * custom week-start broadcast.
 */
export default function SeasonOpeningFlowGuard() {
  const dispatch = useAppDispatch()
  const phase = useAppSelector((state) => state.game.phase)
  const week = useAppSelector((state) => state.game.week)
  const mode = useAppSelector((state) => state.game.mode)
  const tvFeed = useAppSelector((state) => state.game.tvFeed)
  const broadcastQueue = useAppSelector((state) => state.game.broadcastQueue ?? [])

  const queuedId = broadcastQueue[0] ?? null
  const queuedEvent = queuedId
    ? (tvFeed.find((event) => event.id === queuedId) ?? null)
    : null
  const polishedOpeningSeen = tvFeed.some(
    (event) =>
      event.meta?.seasonOnboardingWelcome === true || event.meta?.seasonOnboardingFlavor === true
  )

  useLayoutEffect(() => {
    if (phase !== 'season_start' || week !== 1 || !queuedEvent) return
    if (!isLegacySeasonWelcomeEvent(queuedEvent) && !isServiceConfigurationEvent(queuedEvent)) {
      return
    }
    dispatch(consumeBroadcastEvent(queuedEvent.id))
  }, [dispatch, phase, queuedEvent, week])

  useLayoutEffect(() => {
    if (
      phase !== 'week_start' ||
      week !== 1 ||
      mode === 'survival' ||
      !polishedOpeningSeen
    ) {
      return
    }

    if (queuedEvent?.meta?.broadcastTemplateId === DAY_ONE_START_TEMPLATE_ID) {
      dispatch(consumeBroadcastEvent(queuedEvent.id))
      return
    }

    // Preserve any genuine week-start announcement. Once it has been handled,
    // continue directly to the first competition as specified by onboarding.
    if (broadcastQueue.length > 0) return
    dispatch(advance())
  }, [
    broadcastQueue.length,
    dispatch,
    mode,
    phase,
    polishedOpeningSeen,
    queuedEvent,
    week,
  ])

  return null
}
