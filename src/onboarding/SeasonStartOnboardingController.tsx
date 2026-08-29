import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { addTvEvent, advance, consumeBroadcastEvent } from '../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { isServiceConfigurationEvent } from '../services/activityService'
import './SeasonStartOnboardingController.css'

const TV_WAKE_MS = 900
const FLAVOR_DELAY_MS = 700
const PROMPT_DELAY_MS = 1250
const TOOLTIP_GAP_PX = 14
const TOOLTIP_MAX_WIDTH_PX = 320
const TOOLTIP_ESTIMATED_HEIGHT_PX = 188
const TOUR_FINISH_MS = 520
const TUTORIAL_VERSION = 'v1'

const OPENING_FLAVOR_LINES = [
  'The hubmates have settled in. Everyone seems eager to play.',
  'The hub is full. First impressions are already taking shape.',
  'Everyone has settled in. For now, spirits are high.',
  'The introductions are over. The social game is already beginning.',
  'The hubmates are settling in. New friendships are already forming.',
  'Everyone has found their place in the hub. The mood is upbeat — for now.',
] as const

type TutorialSpotlightShape = 'circle' | 'rounded' | 'panel'

type TutorialStep = {
  id: string
  title: string
  body: string
  selector: string
  padding: number
  shape: TutorialSpotlightShape
}

const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'tv',
    title: 'The Big Eye TV',
    body: 'Ceremonies, results and important Big Eye announcements appear here.',
    selector: '.tv-zone__viewport',
    padding: 2,
    shape: 'panel',
  },
  {
    id: 'log',
    title: 'Game Log',
    body: 'The Log keeps a running record of what happened, including rules and service messages.',
    selector: 'button[aria-label^="Open game log"], [aria-label="Game event log"]',
    padding: 5,
    shape: 'rounded',
  },
  {
    id: 'social',
    title: 'Social',
    body: 'Talk to hubmates, build relationships and influence the social game.',
    selector: '.game-control-dock__icon.social, button[aria-label^="Social"]',
    padding: 10,
    shape: 'circle',
  },
  {
    id: 'incoming',
    title: 'Incoming',
    body: 'Hubmates can approach you with conversations, offers and requests.',
    selector: '.game-control-dock__icon.requests, button[aria-label^="Incoming requests"]',
    padding: 10,
    shape: 'circle',
  },
  {
    id: 'public',
    title: 'Public',
    body: 'See how the audience currently feels about you and the other hubmates.',
    selector: '.game-control-dock__icon.stats, button[aria-label^="Public meter"]',
    padding: 10,
    shape: 'circle',
  },
  {
    id: 'confessional',
    title: 'Confessional',
    body: 'Private decisions and messages from The Big Eye happen in the Confessional.',
    selector: '.game-control-dock__icon.confessional, button[aria-label^="Confessional"]',
    padding: 10,
    shape: 'circle',
  },
  {
    id: 'play',
    title: 'Play',
    body: 'Play moves the game forward when you are ready.',
    selector: '.game-control-dock__play, button[aria-label="Advance to next phase"]',
    padding: 8,
    shape: 'circle',
  },
]

type TargetRect = {
  left: number
  top: number
  width: number
  height: number
  right: number
  bottom: number
}

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

function storageKey(profileId: string | null): string {
  return `bbmobilenew_season_tutorial_${TUTORIAL_VERSION}:${profileId ?? 'guest'}`
}

function readTutorialHandled(profileId: string | null, isGuest: boolean): boolean {
  if (typeof window === 'undefined') return false
  try {
    const storage = isGuest ? window.sessionStorage : window.localStorage
    return storage.getItem(storageKey(profileId)) === 'done'
  } catch {
    return false
  }
}

function writeTutorialHandled(profileId: string | null, isGuest: boolean): void {
  if (typeof window === 'undefined') return
  try {
    const storage = isGuest ? window.sessionStorage : window.localStorage
    storage.setItem(storageKey(profileId), 'done')
  } catch {
    // Onboarding persistence is best-effort. A blocked storage API must never
    // stop the player from continuing into the game.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function findTourTarget(step: TutorialStep): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(step.selector))
  return (
    candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return false
      const style = window.getComputedStyle(candidate)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }) ?? null
  )
}

function measureTarget(element: HTMLElement, padding: number): TargetRect {
  const rect = element.getBoundingClientRect()
  const offsetLeft = window.visualViewport?.offsetLeft ?? 0
  const offsetTop = window.visualViewport?.offsetTop ?? 0
  const left = rect.left + offsetLeft - padding
  const top = rect.top + offsetTop - padding
  const width = rect.width + padding * 2
  const height = rect.height + padding * 2
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }
}

function targetRectsEqual(left: TargetRect | null, right: TargetRect): boolean {
  return (
    left?.left === right.left &&
    left?.top === right.top &&
    left?.width === right.width &&
    left?.height === right.height &&
    left?.right === right.right &&
    left?.bottom === right.bottom
  )
}

function TutorialTour({
  onComplete,
  onSkip,
}: {
  onComplete: () => void
  onSkip: () => void
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [measuredStepId, setMeasuredStepId] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const currentStep = TUTORIAL_STEPS[stepIndex]
  const tooltipRef = useRef<HTMLElement | null>(null)
  const finishTimerRef = useRef<number | null>(null)

  const moveToStep = useCallback((nextIndex: number) => {
    setMeasuredStepId(null)
    setStepIndex(clamp(nextIndex, 0, TUTORIAL_STEPS.length - 1))
  }, [])

  const completeWithHandoff = useCallback(() => {
    if (finishing) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    if (reducedMotion) {
      onComplete()
      return
    }
    setFinishing(true)
    finishTimerRef.current = window.setTimeout(() => {
      finishTimerRef.current = null
      onComplete()
    }, TOUR_FINISH_MS)
  }, [finishing, onComplete])

  useEffect(
    () => () => {
      if (finishTimerRef.current != null) window.clearTimeout(finishTimerRef.current)
    },
    []
  )

  useLayoutEffect(() => {
    let frame = 0
    let missingTargetTimer: number | null = null
    let observedElement: HTMLElement | null = null
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            window.cancelAnimationFrame(frame)
            frame = window.requestAnimationFrame(findAndMeasure)
          })
        : null

    function findAndMeasure() {
      const element = findTourTarget(currentStep)
      if (!element) {
        setMeasuredStepId(null)
        return false
      }

      if (element !== observedElement) {
        if (observedElement) resizeObserver?.unobserve(observedElement)
        observedElement = element
        resizeObserver?.observe(element)
      }

      const rawRect = element.getBoundingClientRect()
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      if (rawRect.bottom < 10 || rawRect.top > viewportHeight - 10) {
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
      }
      const nextRect = measureTarget(element, currentStep.padding)
      setTargetRect((current) => (targetRectsEqual(current, nextRect) ? current : nextRect))
      setMeasuredStepId(currentStep.id)
      return true
    }

    if (!findAndMeasure()) {
      // Layout variants may omit one launcher. Give responsive UI a moment to
      // settle, then skip only that unavailable target rather than breaking the tour.
      missingTargetTimer = window.setTimeout(() => {
        if (findTourTarget(currentStep)) {
          findAndMeasure()
        } else if (stepIndex < TUTORIAL_STEPS.length - 1) {
          moveToStep(stepIndex + 1)
        } else {
          completeWithHandoff()
        }
      }, 650)
    }

    const update = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        findAndMeasure()
      })
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      if (missingTargetTimer != null) window.clearTimeout(missingTargetTimer)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      observer.disconnect()
      resizeObserver?.disconnect()
    }
  }, [completeWithHandoff, currentStep, moveToStep, stepIndex])

  useEffect(() => {
    tooltipRef.current?.focus()
  }, [stepIndex, targetRect])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (finishing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onSkip()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (stepIndex === TUTORIAL_STEPS.length - 1) completeWithHandoff()
        else moveToStep(stepIndex + 1)
      } else if (event.key === 'ArrowLeft' && stepIndex > 0) {
        event.preventDefault()
        moveToStep(stepIndex - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [completeWithHandoff, finishing, moveToStep, onSkip, stepIndex])

  if (typeof document === 'undefined') return null

  const viewportWidth = window.visualViewport?.width ?? window.innerWidth
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight
  const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH_PX, viewportWidth - 24)
  const targetCenterX = targetRect ? targetRect.left + targetRect.width / 2 : viewportWidth / 2
  const tooltipLeft = clamp(targetCenterX - tooltipWidth / 2, 12, viewportWidth - tooltipWidth - 12)
  const spaceBelow = targetRect ? viewportHeight - targetRect.bottom : 0
  const placeBelow = targetRect ? spaceBelow >= TOOLTIP_ESTIMATED_HEIGHT_PX + TOOLTIP_GAP_PX : false

  const spotlightStyle = targetRect
    ? ({
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
      } as CSSProperties)
    : undefined

  const tooltipStyle = targetRect
    ? placeBelow
      ? ({ left: tooltipLeft, top: targetRect.bottom + TOOLTIP_GAP_PX, width: tooltipWidth } as CSSProperties)
      : ({
          left: tooltipLeft,
          bottom: viewportHeight - targetRect.top + TOOLTIP_GAP_PX,
          width: tooltipWidth,
        } as CSSProperties)
    : ({
        left: Math.max(12, (viewportWidth - tooltipWidth) / 2),
        top: '50%',
        width: tooltipWidth,
        transform: 'translateY(-50%)',
      } as CSSProperties)

  const isLastStep = stepIndex === TUTORIAL_STEPS.length - 1
  const focusSettled = measuredStepId === currentStep.id

  return createPortal(
    <div
      className={`season-tutorial${finishing ? ' season-tutorial--finishing' : ''}`}
      role="presentation"
    >
      <div className="season-tutorial__input-shield" aria-hidden="true" />
      {targetRect && (
        <div
          className="season-tutorial__spotlight"
          style={spotlightStyle}
          data-shape={currentStep.shape}
          aria-hidden="true"
        />
      )}
      {targetRect && focusSettled && !finishing && (
        <div
          key={`focus-${currentStep.id}`}
          className="season-tutorial__focus-pulse"
          style={spotlightStyle}
          data-shape={currentStep.shape}
          aria-hidden="true"
        />
      )}
      {targetRect && finishing && (
        <div
          className="season-tutorial__completion-flare"
          style={spotlightStyle}
          data-shape={currentStep.shape}
          aria-hidden="true"
        />
      )}
      <section
        key={currentStep.id}
        ref={tooltipRef}
        className="season-tutorial__tooltip"
        style={tooltipStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="season-tutorial-title"
        aria-describedby="season-tutorial-copy"
        tabIndex={-1}
      >
        <div
          className="season-tutorial__progress"
          aria-label={`Step ${stepIndex + 1} of ${TUTORIAL_STEPS.length}`}
        >
          <span>{stepIndex + 1}</span>
          <i />
          <span>{TUTORIAL_STEPS.length}</span>
        </div>
        <h2 id="season-tutorial-title">{currentStep.title}</h2>
        <p id="season-tutorial-copy">{currentStep.body}</p>
        <div className="season-tutorial__actions">
          <button
            type="button"
            className="season-tutorial__skip"
            onClick={onSkip}
            disabled={finishing}
          >
            Skip tour
          </button>
          <div className="season-tutorial__nav-actions">
            {stepIndex > 0 && (
              <button
                type="button"
                className="season-tutorial__secondary"
                onClick={() => moveToStep(stepIndex - 1)}
                disabled={finishing}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="season-tutorial__primary"
              onClick={() =>
                isLastStep ? completeWithHandoff() : moveToStep(stepIndex + 1)
              }
              disabled={finishing}
            >
              {isLastStep ? 'Start playing' : 'Next'}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  )
}

export default function SeasonStartOnboardingController() {
  const dispatch = useAppDispatch()
  const gameId = useAppSelector((state) => state.game.gameId)
  const week = useAppSelector((state) => state.game.week)
  const phase = useAppSelector((state) => state.game.phase)
  const mode = useAppSelector((state) => state.game.mode)
  const tvFeed = useAppSelector((state) => state.game.tvFeed)
  const broadcastQueue = useAppSelector((state) => state.game.broadcastQueue ?? [])
  const activeProfileId = useAppSelector((state) => state.profiles.activeProfileId)
  const isGuest = useAppSelector((state) => state.profiles.isGuest)
  const [gameScreenMounted, setGameScreenMounted] = useState(false)
  const [tutorialHandled, setTutorialHandled] = useState(() =>
    readTutorialHandled(activeProfileId, isGuest)
  )
  const [promptOpen, setPromptOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const flavorTimerRef = useRef<number | null>(null)
  const promptTimerRef = useRef<number | null>(null)

  const eligibleSeasonStart =
    gameScreenMounted && phase === 'season_start' && week === 1 && mode !== 'survival'
  const flavorExists = useMemo(
    () =>
      tvFeed.some(
        (event) =>
          event.meta?.seasonOnboardingFlavor === true &&
          event.meta?.week === week &&
          event.meta?.phase === 'season_start'
      ),
    [tvFeed, week]
  )

  useEffect(() => {
    const update = () => setGameScreenMounted(Boolean(document.querySelector('.tv-zone__viewport')))
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setTutorialHandled(readTutorialHandled(activeProfileId, isGuest))
    setPromptOpen(false)
    setTourOpen(false)
  }, [activeProfileId, isGuest])

  // Defensive companion to the log-only TV routing: a service message that was
  // authored as a managed broadcast must not require an invisible Play press.
  const queuedBroadcastId = broadcastQueue[0] ?? null
  useEffect(() => {
    if (!queuedBroadcastId) return
    const queuedEvent = tvFeed.find((event) => event.id === queuedBroadcastId)
    if (!queuedEvent || !isServiceConfigurationEvent(queuedEvent)) return
    dispatch(consumeBroadcastEvent(queuedEvent.id))
  }, [broadcastQueue, dispatch, queuedBroadcastId, tvFeed])

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

  const addOpeningFlavor = useCallback(() => {
    if (flavorExists || phase !== 'season_start' || week !== 1 || mode === 'survival') return
    dispatch(
      addTvEvent({
        text: pickOpeningFlavor(gameId),
        type: 'game',
        source: 'system',
        meta: {
          phase: 'season_start',
          week,
          broadcastLevel: 'minor',
          forceOnTv: true,
          seasonOnboardingFlavor: true,
        },
      })
    )
  }, [dispatch, flavorExists, gameId, mode, phase, week])

  useEffect(() => {
    if (!eligibleSeasonStart || broadcastQueue.length > 0 || flavorExists) return undefined
    flavorTimerRef.current = window.setTimeout(addOpeningFlavor, FLAVOR_DELAY_MS)
    return () => {
      if (flavorTimerRef.current != null) window.clearTimeout(flavorTimerRef.current)
      flavorTimerRef.current = null
    }
  }, [addOpeningFlavor, broadcastQueue.length, eligibleSeasonStart, flavorExists])

  useEffect(() => {
    if (
      !eligibleSeasonStart ||
      tutorialHandled ||
      !flavorExists ||
      broadcastQueue.length > 0 ||
      promptOpen ||
      tourOpen
    ) {
      return undefined
    }
    promptTimerRef.current = window.setTimeout(() => setPromptOpen(true), PROMPT_DELAY_MS)
    return () => {
      if (promptTimerRef.current != null) window.clearTimeout(promptTimerRef.current)
      promptTimerRef.current = null
    }
  }, [
    broadcastQueue.length,
    eligibleSeasonStart,
    flavorExists,
    promptOpen,
    tourOpen,
    tutorialHandled,
  ])

  useEffect(() => {
    if (eligibleSeasonStart) return
    setPromptOpen(false)
    setTourOpen(false)
  }, [eligibleSeasonStart])

  // First-time users cannot accidentally skip the tutorial choice by pressing
  // the central Play button while the short opening flavour line is settling.
  useEffect(() => {
    if (!eligibleSeasonStart || tutorialHandled) return undefined
    const handlePlay = (event: Event) => {
      if (broadcastQueue.length > 0) return
      event.preventDefault()
      if (!flavorExists) addOpeningFlavor()
      if (!tourOpen) setPromptOpen(true)
    }
    window.addEventListener('ui:playPressed', handlePlay, { capture: true })
    return () => window.removeEventListener('ui:playPressed', handlePlay, { capture: true })
  }, [
    addOpeningFlavor,
    broadcastQueue.length,
    eligibleSeasonStart,
    flavorExists,
    tourOpen,
    tutorialHandled,
  ])

  const finishOnboarding = useCallback(() => {
    writeTutorialHandled(activeProfileId, isGuest)
    setTutorialHandled(true)
    setPromptOpen(false)
    setTourOpen(false)
    dispatch(advance())
  }, [activeProfileId, dispatch, isGuest])

  const startTour = useCallback(() => {
    setPromptOpen(false)
    setTourOpen(true)
  }, [])

  if (typeof document === 'undefined') return null

  return (
    <>
      {promptOpen &&
        !tourOpen &&
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
      {tourOpen && <TutorialTour onComplete={finishOnboarding} onSkip={finishOnboarding} />}
    </>
  )
}
