import { useEffect, useLayoutEffect } from 'react'
import { isLegacySeasonWelcomeEvent, isServiceConfigurationEvent } from '../services/activityService'
import { advance, consumeBroadcastEvent } from '../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { hasHandledSeasonTutorial } from './seasonTutorialPreference'

const DAY_ONE_START_TEMPLATE_ID = 'week.day-start'

/**
 * Keeps the polished opening authoritative over the older managed queue.
 * Superseded defaults are acknowledged before paint, Beat 1 / Beat 3 cannot
 * accidentally advance the reducer, and the redundant first Day 1 stop is
 * skipped without suppressing genuine custom or critical broadcasts.
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
        event.preventDefault()
        dispatch(consumeBroadcastEvent(queuedEvent.id))
        return
      }

      if (queuedEvent.meta?.seasonOnboardingFlavor === true) {
        event.preventDefault()
        dispatch(consumeBroadcastEvent(queuedEvent.id))
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
