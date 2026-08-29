import { useEffect, useLayoutEffect, useRef } from 'react'
import { advance, consumeBroadcastEvent } from '../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { hasHandledSeasonTutorial } from './seasonTutorialPreference'

const DAY_ONE_START_TEMPLATE_ID = 'week.day-start'

/**
 * Narrow queue bridge for the two cards authored by SeasonStartOnboardingController.
 * It never suppresses or rewrites ordinary managed broadcasts. Its only job is
 * to stop the generic Play handler from advancing on the same press that closes
 * an onboarding card, then remove the redundant Day 1 stop during the handoff.
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
  const directHandoffRef = useRef(false)

  const queuedId = broadcastQueue[0] ?? null
  const queuedEvent = queuedId
    ? (tvFeed.find((event) => event.id === queuedId) ?? null)
    : null
  const polishedOpeningSeen = tvFeed.some(
    (event) =>
      event.meta?.seasonOnboardingWelcome === true || event.meta?.seasonOnboardingFlavor === true
  )

  useEffect(() => {
    if (phase !== 'season_start' || week !== 1) return undefined

    const handlePlay = (event: Event) => {
      if (!queuedEvent) return

      if (queuedEvent.meta?.seasonOnboardingWelcome === true) {
        event.preventDefault()
        return
      }

      if (queuedEvent.meta?.seasonOnboardingFlavor === true) {
        event.preventDefault()
        if (hasHandledSeasonTutorial(activeProfileId, isGuest)) {
          directHandoffRef.current = true
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

    if (broadcastQueue.length > 0 || !directHandoffRef.current) return
    directHandoffRef.current = false
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
