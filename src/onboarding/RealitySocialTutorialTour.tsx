import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import './SeasonStartOnboardingController.css'

const TOOLTIP_GAP_PX = 14
const TOOLTIP_MAX_WIDTH_PX = 330
const TOOLTIP_ESTIMATED_HEIGHT_PX = 220

type SpotlightShape = 'circle' | 'rounded' | 'panel'
type TutorialMode =
  | 'social'
  | 'targetless'
  | 'target'
  | 'pulse-stream'
  | 'ledger-relationships'
  | 'ledger-house'

type TutorialStep = {
  id: string
  title: string
  body: string
  selector: string
  padding: number
  shape: SpotlightShape
  mode: TutorialMode
}

const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'resources',
    title: 'Welcome to Reality Social',
    body: 'Reality Mode tracks more than one friendship bar. Your choices can shape trust, warmth, loyalty, respect and tension, while another player’s private opinion of you stays hidden.',
    selector: '[data-reality-tutorial="resources"]',
    padding: 5,
    shape: 'rounded',
    mode: 'social',
  },
  {
    id: 'targetless',
    title: 'Start with the room — or choose a person',
    body: 'With no hubmate selected, this grid shows only house-wide moves. Pick someone and the catalogue updates to the moves that make sense for that person and the current phase.',
    selector: '[data-reality-tutorial="actions"]',
    padding: 4,
    shape: 'panel',
    mode: 'targetless',
  },
  {
    id: 'relationship',
    title: 'This is your read, not perfect knowledge',
    body: 'The ring, label and tags show how your character currently reads the relationship. Alliance, Rivalry, Romance and other states matter, but the other player can still privately feel differently.',
    selector: '[data-reality-tutorial="relationship-read"]',
    padding: 5,
    shape: 'panel',
    mode: 'target',
  },
  {
    id: 'moves',
    title: 'Moves react to context',
    body: 'Available actions change with the target, phase, roles, relationship and Reality rules. Selecting a move only prepares it; nothing happens until you press Execute.',
    selector: '[data-reality-tutorial="actions"]',
    padding: 4,
    shape: 'panel',
    mode: 'target',
  },
  {
    id: 'costs',
    title: 'Check the exact price before you commit',
    body: 'Energy ⚡ powers social activity. Some strategic moves also use Influence 🤝 or Information 💡. The footer shows the exact cost and whether the current selection can actually execute.',
    selector: '[data-reality-tutorial="footer"]',
    padding: 5,
    shape: 'rounded',
    mode: 'target',
  },
  {
    id: 'pulse',
    title: 'My Pulse is your private strategy read',
    body: 'My Pulse is deliberately not omniscient. It only surfaces developments, relationships, facts and claims your player has actually experienced, witnessed, learned or seen become public.',
    selector: '[data-reality-tutorial="pulse-summary"]',
    padding: 5,
    shape: 'panel',
    mode: 'social',
  },
  {
    id: 'stream',
    title: 'Stream: what changed around you',
    body: 'Stream is the short live recap of moments you took part in, witnessed, or that became public. Hidden AI activity stays hidden until your player has a legitimate way to know it.',
    selector: '[data-reality-tutorial="pulse-stream"]',
    padding: 5,
    shape: 'panel',
    mode: 'pulse-stream',
  },
  {
    id: 'my-game',
    title: 'My Game: the deeper relationship model',
    body: 'People breaks your read into Trust, Warmth, Loyalty, Respect and Tension. Known separates facts from claims. Deals tracks promises and debts. House tracks alliances and ongoing stories.',
    selector: '[data-reality-tutorial="ledger-tabs"]',
    padding: 5,
    shape: 'rounded',
    mode: 'ledger-relationships',
  },
  {
    id: 'alliances',
    title: 'Alliances are living structures',
    body: 'House shows only alliances you actually know about. Your own alliances expose members, hierarchy, cohesion and secrecy; they can be renamed, consulted in the right windows, strengthened, fractured or left.',
    selector: '[data-reality-tutorial="ledger-house"]',
    padding: 5,
    shape: 'rounded',
    mode: 'ledger-house',
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

function findTarget(step: TutorialStep): HTMLElement | null {
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

function rectsEqual(left: TargetRect | null, right: TargetRect): boolean {
  return (
    left?.left === right.left &&
    left?.top === right.top &&
    left?.width === right.width &&
    left?.height === right.height
  )
}

function dispatchTutorialEvent(name: string, detail?: string) {
  window.dispatchEvent(detail ? new CustomEvent(name, { detail }) : new Event(name))
}

export default function RealitySocialTutorialTour({
  onClearTarget,
  onEnsureTarget,
  onComplete,
}: {
  onClearTarget: () => void
  onEnsureTarget: () => void
  onComplete: () => void
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const tooltipRef = useRef<HTMLElement | null>(null)
  const currentStep = TUTORIAL_STEPS[stepIndex]

  const applyStepMode = useCallback(
    (mode: TutorialMode) => {
      if (mode === 'social') {
        dispatchTutorialEvent('reality-social-tutorial:close-pulse')
        return
      }
      if (mode === 'targetless') {
        dispatchTutorialEvent('reality-social-tutorial:close-pulse')
        onClearTarget()
        return
      }
      if (mode === 'target') {
        dispatchTutorialEvent('reality-social-tutorial:close-pulse')
        onEnsureTarget()
        return
      }
      if (mode === 'pulse-stream') {
        dispatchTutorialEvent('reality-social-tutorial:open-pulse')
        dispatchTutorialEvent('reality-social-tutorial:set-pulse-tab', 'stream')
        return
      }
      dispatchTutorialEvent('reality-social-tutorial:open-pulse')
      dispatchTutorialEvent('reality-social-tutorial:set-pulse-tab', 'ledger')
      // RealityLedger mounts only after HousePulse switches to My Game. Give
      // React one turn to mount it before asking its internal tab to change.
      window.setTimeout(() => {
        dispatchTutorialEvent(
          'reality-social-tutorial:set-ledger-tab',
          mode === 'ledger-house' ? 'house' : 'relationships'
        )
      }, 0)
    },
    [onClearTarget, onEnsureTarget]
  )

  const moveToStep = useCallback(
    (nextIndex: number) => {
      const clamped = clamp(nextIndex, 0, TUTORIAL_STEPS.length - 1)
      applyStepMode(TUTORIAL_STEPS[clamped].mode)
      setTargetRect(null)
      setStepIndex(clamped)
    },
    [applyStepMode]
  )

  const finish = useCallback(() => {
    dispatchTutorialEvent('reality-social-tutorial:close-pulse')
    onComplete()
  }, [onComplete])

  useEffect(
    () => () => {
      dispatchTutorialEvent('reality-social-tutorial:close-pulse')
    },
    []
  )

  useLayoutEffect(() => {
    let frame = 0
    let missingTimer: number | null = null
    let observedElement: HTMLElement | null = null
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            window.cancelAnimationFrame(frame)
            frame = window.requestAnimationFrame(findAndMeasure)
          })
        : null

    function findAndMeasure() {
      const element = findTarget(currentStep)
      if (!element) return false

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
      setTargetRect((current) => (rectsEqual(current, nextRect) ? current : nextRect))
      return true
    }

    if (!findAndMeasure()) {
      missingTimer = window.setTimeout(() => {
        if (!findAndMeasure()) {
          if (stepIndex < TUTORIAL_STEPS.length - 1) moveToStep(stepIndex + 1)
          else finish()
        }
      }, 700)
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
      if (missingTimer != null) window.clearTimeout(missingTimer)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      observer.disconnect()
      resizeObserver?.disconnect()
    }
  }, [currentStep, finish, moveToStep, stepIndex])

  useEffect(() => {
    tooltipRef.current?.focus()
  }, [stepIndex, targetRect])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (stepIndex === TUTORIAL_STEPS.length - 1) finish()
        else moveToStep(stepIndex + 1)
      } else if (event.key === 'ArrowLeft' && stepIndex > 0) {
        event.preventDefault()
        moveToStep(stepIndex - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [finish, moveToStep, stepIndex])

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

  return createPortal(
    <div className="season-tutorial" role="presentation" data-testid="reality-social-tutorial">
      <div className="season-tutorial__input-shield" aria-hidden="true" />
      {targetRect && (
        <>
          <div
            className="season-tutorial__spotlight"
            style={spotlightStyle}
            data-shape={currentStep.shape}
            aria-hidden="true"
          />
          <div
            className="season-tutorial__focus-pulse"
            style={spotlightStyle}
            data-shape={currentStep.shape}
            aria-hidden="true"
          />
        </>
      )}
      <section
        key={currentStep.id}
        ref={tooltipRef}
        className="season-tutorial__tooltip"
        style={tooltipStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reality-social-tutorial-title"
        aria-describedby="reality-social-tutorial-copy"
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
        <h2 id="reality-social-tutorial-title">{currentStep.title}</h2>
        <p id="reality-social-tutorial-copy">{currentStep.body}</p>
        <div className="season-tutorial__actions">
          <button type="button" className="season-tutorial__skip" onClick={finish}>
            Skip tour
          </button>
          <div className="season-tutorial__nav-actions">
            {stepIndex > 0 && (
              <button
                type="button"
                className="season-tutorial__secondary"
                onClick={() => moveToStep(stepIndex - 1)}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="season-tutorial__primary"
              onClick={() => (isLastStep ? finish() : moveToStep(stepIndex + 1))}
            >
              {isLastStep ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  )
}
