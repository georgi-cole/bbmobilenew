import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'

const TOOLTIP_GAP_PX = 14
const TOOLTIP_MAX_WIDTH_PX = 320
const TOOLTIP_ESTIMATED_HEIGHT_PX = 188
const TOUR_FINISH_MS = 520

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

export default function SeasonTutorialTour({
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
      frame = window.requestAnimationFrame(findAndMeasure)
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
      ? ({
          left: tooltipLeft,
          top: targetRect.bottom + TOOLTIP_GAP_PX,
          width: tooltipWidth,
        } as CSSProperties)
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
              onClick={() => (isLastStep ? completeWithHandoff() : moveToStep(stepIndex + 1))}
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
