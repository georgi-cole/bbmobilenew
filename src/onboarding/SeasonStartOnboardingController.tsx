import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { addTvEvent, advance, consumeBroadcastEvent } from '../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { isServiceConfigurationEvent } from '../services/activityService'
import SeasonTutorialTour from './SeasonTutorialTour'
import {
  hasHandledSeasonTutorial,
  markSeasonTutorialHandled,
} from './seasonTutorialPreference'
import './SeasonStartOnboardingController.css'

const TV_WAKE_MS = 900
const WELCOME_DELAY_MS = 620
const DAY_ONE_START_TEMPLATE_ID = 'week.day-start'

const OPENING_FLAVOR_LINES = [
  'The hubmates have settled in. Everyone seems eager to play.',
  'The hub is full. First impressions are already taking shape.',
  'Everyone has settled in. For now, spirits are high.',
  'The introductions are over. The social game is already beginning.',
  'The hubmates are settling in. New friendships are already forming.',
  'Everyone has found their place in the hub. The mood is upbeat — for now.',
] as const

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pickOpeningFlavor(gameId: string): string {
  return OPENING_FLAVOR_LINES[hashText(gameId) % OPENING_FLAVOR_LINES.length]
}

export default function SeasonStartOnboardingController() {
  const dispatch = useAppDispatch()
  const gameId = useAppSelector((state) => state.game.gameId)
  const season = useAppSelector((state) => state.game.season)
  const week = useAppSelector((state) => state.game.week)
  const phase = useAppSelector((state) => state.game.phase)
  const mode = useAppSelector((state) => state.game.mode)
  const tvFeed = useAppSelector((state) => state.game.tvFeed)
  const broadcastQueue = useAppSelector((state) => state.game.broadcastQueue ?? [])
  const activeProfileId = useAppSelector((state) => state.profiles.activeProfileId)
  const isGuest = useAppSelector((state) => state.profiles.isGuest)

  const [gameScreenMounted, setGameScreenMounted] = useState(false)
  const [tutorialHandled, setTutorialHandled] = useState(() =>
    hasHandledSeasonTutorial(activeProfileId, isGuest)
  )
  const [promptOpen, setPromptOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [handoffToFirstCompetition, setHandoffToFirstCompetition] = useState(false)
  const welcomeTimerRef = useRef<number | null>(null)

  const eligibleSeasonStart =
    gameScreenMounted && phase === 'season_start' && week === 1 && mode !== 'survival'

  const queuedBroadcastId = broadcastQueue[0] ?? null
  const queuedEvent = useMemo(
    () =>
      queuedBroadcastId
        ? (tvFeed.find((event) => event.id === queuedBroadcastId) ?? null)
        : null,
    [queuedBroadcastId, tvFeed]
  )

  const welcomeExists = useMemo(
    () =>
      tvFeed.some(
        (event) =>
          event.meta?.seasonOnboardingWelcome === true &&
          event.meta?.week === 1 &&
          event.meta?.phase === 'season_start'
      ),
    [tvFeed]
  )

  const flavorExists = useMemo(
    () =>
      tvFeed.some(
        (event) =>
          event.meta?.seasonOnboardingFlavor === true &&
          event.meta?.week === 1 &&
          event.meta?.phase === 'season_start'
      ),
    [tvFeed]
  )

  useEffect(() => {
    const update = () => setGameScreenMounted(Boolean(document.querySelector('.tv-zone__viewport')))
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setTutorialHandled(hasHandledSeasonTutorial(activeProfileId, isGuest))
    setPromptOpen(false)
    setTourOpen(false)
    setHandoffToFirstCompetition(false)
  }, [activeProfileId, gameId, isGuest])

  // Rules/system configuration belongs in the log only. The source templates
  // are already forceOnTv:false; this only clears stale saves/old overrides.
  useEffect(() => {
    if (!queuedEvent || !isServiceConfigurationEvent(queuedEvent)) return
    dispatch(consumeBroadcastEvent(queuedEvent.id))
  }, [dispatch, queuedEvent])

  useEffect(() => {
    if (!eligibleSeasonStart) return undefined
    document.body.classList.add('body--season-tv-wake')
    const timer = window.setTimeout(
      () => document.body.classList.remove('body--season-tv-wake'),
      TV_WAKE_MS
    )
    return () => {
      window.clearTimeout(timer)
      document.body.classList.remove('body--season-tv-wake')
    }
  }, [eligibleSeasonStart, gameId])

  const addOpeningWelcome = useCallback(() => {
    if (welcomeExists || phase !== 'season_start' || week !== 1 || mode === 'survival') return
    dispatch(
      addTvEvent({
        text: `Welcome to The Big Eye. Season ${season} begins now.`,
        type: 'game',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: {
          phase: 'season_start',
          week: 1,
          broadcastTemplateId: 'season.onboarding-welcome',
          broadcastLevel: 'minor',
          forceOnTv: true,
          seasonOnboardingWelcome: true,
        },
      })
    )
  }, [dispatch, mode, phase, season, week, welcomeExists])

  const addOpeningFlavor = useCallback(() => {
    if (flavorExists || phase !== 'season_start' || week !== 1 || mode === 'survival') return
    dispatch(
      addTvEvent({
        text: pickOpeningFlavor(gameId),
        type: 'game',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: {
          phase: 'season_start',
          week: 1,
          broadcastTemplateId: 'season.onboarding-flavor',
          broadcastLevel: 'minor',
          forceOnTv: true,
          seasonOnboardingFlavor: true,
        },
      })
    )
  }, [dispatch, flavorExists, gameId, mode, phase, week])

  // Only the TV wake and first welcome are automatic. Every beat after the
  // welcome is advanced by an explicit Play press.
  useEffect(() => {
    if (!eligibleSeasonStart || broadcastQueue.length > 0 || welcomeExists) return undefined
    welcomeTimerRef.current = window.setTimeout(addOpeningWelcome, WELCOME_DELAY_MS)
    return () => {
      if (welcomeTimerRef.current != null) window.clearTimeout(welcomeTimerRef.current)
      welcomeTimerRef.current = null
    }
  }, [addOpeningWelcome, broadcastQueue.length, eligibleSeasonStart, welcomeExists])

  useEffect(() => {
    if (eligibleSeasonStart) return
    setPromptOpen(false)
    setTourOpen(false)
  }, [eligibleSeasonStart])

  const beginFirstCompetitionHandoff = useCallback(() => {
    setPromptOpen(false)
    setTourOpen(false)
    setHandoffToFirstCompetition(true)
    dispatch(advance())
  }, [dispatch])

  // After the player's final opening action, skip only the redundant Day 1
  // start line. Real/custom/critical week-start broadcasts still get their turn.
  useEffect(() => {
    if (!handoffToFirstCompetition || phase !== 'week_start' || week !== 1) return

    if (queuedEvent?.meta?.broadcastTemplateId === DAY_ONE_START_TEMPLATE_ID) {
      dispatch(consumeBroadcastEvent(queuedEvent.id))
      return
    }

    if (broadcastQueue.length > 0) return
    setHandoffToFirstCompetition(false)
    dispatch(advance())
  }, [
    broadcastQueue.length,
    dispatch,
    handoffToFirstCompetition,
    phase,
    queuedEvent,
    week,
  ])

  useEffect(() => {
    if (!eligibleSeasonStart) return undefined

    const handlePlay = (event: Event) => {
      if (queuedEvent?.meta?.seasonOnboardingWelcome === true) {
        event.preventDefault()
        dispatch(consumeBroadcastEvent(queuedEvent.id))
        addOpeningFlavor()
        return
      }

      if (queuedEvent?.meta?.seasonOnboardingFlavor === true) {
        event.preventDefault()
        dispatch(consumeBroadcastEvent(queuedEvent.id))
        if (!tutorialHandled) {
          if (!tourOpen) setPromptOpen(true)
        } else {
          beginFirstCompetitionHandoff()
        }
        return
      }

      // Any real queued game broadcast keeps normal faux-TV ownership.
      if (broadcastQueue.length > 0) return

      // Recovery paths for an interrupted/stale opening still obey Play.
      if (!welcomeExists) {
        event.preventDefault()
        addOpeningWelcome()
        return
      }
      if (!flavorExists) {
        event.preventDefault()
        addOpeningFlavor()
        return
      }
      if (!tutorialHandled) {
        event.preventDefault()
        if (!tourOpen) setPromptOpen(true)
        return
      }

      event.preventDefault()
      beginFirstCompetitionHandoff()
    }

    window.addEventListener('ui:playPressed', handlePlay, { capture: true })
    return () => window.removeEventListener('ui:playPressed', handlePlay, { capture: true })
  }, [
    addOpeningFlavor,
    addOpeningWelcome,
    beginFirstCompetitionHandoff,
    broadcastQueue.length,
    dispatch,
    eligibleSeasonStart,
    flavorExists,
    queuedEvent,
    tourOpen,
    tutorialHandled,
    welcomeExists,
  ])

  const finishOnboarding = useCallback(() => {
    markSeasonTutorialHandled(activeProfileId, isGuest)
    setTutorialHandled(true)
    beginFirstCompetitionHandoff()
  }, [activeProfileId, beginFirstCompetitionHandoff, isGuest])

  const startTour = useCallback(() => {
    setPromptOpen(false)
    setTourOpen(true)
  }, [])

  if (typeof document === 'undefined') return null

  return (
    <>
      {promptOpen && !tourOpen &&
        createPortal(
          <div className="season-tutorial-prompt" role="presentation">
            <div className="season-tutorial-prompt__backdrop" aria-hidden="true" />
            <section
              className="season-tutorial-prompt__card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="season-tutorial-prompt-title"
              aria-describedby="season-tutorial-prompt-copy"
            >
              <span className="season-tutorial-prompt__eyebrow">WELCOME TO THE HUB</span>
              <h2 id="season-tutorial-prompt-title">New to The Big Eye?</h2>
              <p id="season-tutorial-prompt-copy">Want a quick tour of the game screen?</p>
              <div className="season-tutorial-prompt__actions">
                <button
                  type="button"
                  className="season-tutorial__secondary"
                  onClick={finishOnboarding}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className="season-tutorial__primary"
                  onClick={startTour}
                  autoFocus
                >
                  Quick tour
                </button>
              </div>
            </section>
          </div>,
          document.body
        )}
      {tourOpen && (
        <SeasonTutorialTour onComplete={finishOnboarding} onSkip={finishOnboarding} />
      )}
    </>
  )
}
