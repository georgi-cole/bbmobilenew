import { useEffect, useLayoutEffect } from 'react'
import { isLegacySeasonWelcomeEvent, isServiceConfigurationEvent } from '../services/activityService'
import { advance, consumeBroadcastEvent } from '../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { hasHandledSeasonTutorial } from './seasonTutorialPreference'

const DAY_ONE_START_TEMPLATE_ID = 'week.day-start'

/**
 * Compatibility guard for the polished season opening.
 *
 * The broadcast manager constructs its Season Start queue before the onboarding
 * controller mounts. Older/default welcome and rules events can therefore
 * remain queued even when the normal TV feed correctly filters them out. This
 * guard acknowledges those superseded queue entries before paint, then makes
 * the two authored onboarding cards true blocking beats so Play cannot skip
 * Beat 3 or the tutorial. It also removes only the redundant first Day 1 stop
 * during the polished opening handoff; genuine custom/critical week-start
 * broadcasts still retain priority.
 */
export default function SeasonOpeningFlowGuard() {
  const dispatch = useAppDispatch()
  const phase = useAppSelector((state) => state.game.phase)
  const week = useAppSelector((state) => state.game.week)
  const mode = useAppSelector((state) => state.game.mode)
  const tvFeed = useAppSelector((state) => state.game.tvFeed)
  const broadcastQueue = useAppSelector((state) => state.game.broadcastQueue ?? [])
  const activeProfileId = useAppSelector((state) => state.profiles.activeProfileId)
  const isGuest = useAppSelector((state) => state.profiles.isGuest)

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

  useEffect(() => {
    if (phase !== 'season_start' || week !== 1) return undefined

    const handlePlay = (event: Event) => {
      if (!queuedEvent) return

      if (queuedEvent.meta?.seasonOnboardingWelcome === true) {
        // Beat 1 should reveal Beat 3, not accidentally advance the reducer to
        // Day 1 merely because it is the last plain broadcast in the queue.
        event.preventDefault()
        dispatch(consumeBroadcastEvent(queuedEvent.id))
        return
      }

      if (queuedEvent.meta?.seasonOnboardingFlavor === true) {
        event.preventDefault()
        dispatch(consumeBroadcastEvent(queuedEvent.id))

        // Returning named profiles should go directly from Beat 3 to LOH.
        // Guest and profiles with tutorial replay enabled remain on
        // season_start long enough for the tutorial prompt to open.
        if (hasHandledSeasonTutorial(activeProfileId, isGuest)) {
          dispatch(advance())
        }
      }
    }

    window.addEventListener('ui:playPressed', handlePlay, { capture: true })
    return () => window.removeEventListener('ui:playPressed', handlePlay, { capture: true })
  }, [activeProfileId, dispatch, isGuest, phase, queuedEvent, week])

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
