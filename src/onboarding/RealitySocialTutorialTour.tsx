import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import type { SocialTutorialVariant } from './tutorialGuidePreference'
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

const NORMAL_TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'normal-intro',
    title: 'Your social game',
    body: 'Use Social to approach hubmates, strengthen relationships or make strategic moves.',
    selector: '[data-reality-tutorial="social-header"]',
    padding: 5,
    shape: 'rounded',
    mode: 'social',
  },
  {
    id: 'normal-target',
    title: 'Choose who to approach',
    body: 'Pick a hubmate to see your relationship and the moves available with that person.',
    selector: '[data-reality-tutorial="hubmates"]',
    padding: 4,
    shape: 'panel',
    mode: 'targetless',
  },
  {
    id: 'normal-relationship',
    title: 'Read the relationship',
    body: 'The ring, label and tags show where this relationship currently stands.',
    selector: '[data-reality-tutorial="relationship-read"]',
    padding: 5,
    shape: 'panel',
    mode: 'target',
  },
  {
    id: 'normal-moves',
    title: 'Choose your move',
    body: 'Available actions change depending on the person, relationship and current point in the game.',
    selector: '[data-reality-tutorial="actions"]',
    padding: 4,
    shape: 'panel',
    mode: 'target',
  },
  {
    id: 'normal-costs',
    title: 'Check the cost',
    body: 'Social moves use Energy ⚡. Choosing a move only prepares it — nothing happens until you press Execute.',
    selector: '[data-reality-tutorial="footer"]',
    padding: 5,
    shape: 'rounded',
    mode: 'target',
  },
]

const REALITY_TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'reality-intro',
    title: 'Relationships have memory',
    body: 'Reality Mode adds deeper relationships, promises, alliances and information that develops throughout the season.',
    selector: '[data-reality-tutorial="social-header"]',
    padding: 5,
    shape: 'rounded',
    mode: 'social',
  },
  {
    id: 'reality-relationship',
    title: 'This is your read',
    body: 'Pick a hubmate to see how you currently read the relationship. They may privately feel differently about you.',
    selector: '[data-reality-tutorial="relationship-read"]',
    padding: 5,
    shape: 'panel',
    mode: 'target',
  },
  {
    id: 'reality-moves',
    title: 'Moves react to the game',
    body: 'Available actions can change with relationships, roles, alliances, promises and the current phase.',
    selector: '[data-reality-tutorial="actions"]',
    padding: 4,
    shape: 'panel',
    mode: 'target',
  },
  {
    id: 'reality-costs',
    title: 'Spend strategically',
    body: 'Energy ⚡ powers social activity. Stronger moves may also use Influence 🤝 or Information 💡. Nothing happens until you press Execute.',
    selector: '[data-reality-tutorial="footer"]',
    padding: 5,
    shape: 'rounded',
    mode: 'target',
  },
  {
    id: 'reality-pulse',
    title: 'My Pulse',
    body: 'Your private strategy feed. Stream shows developments you experienced, witnessed, learned or saw become public — not hidden activity elsewhere in the house.',
    selector: '[data-reality-tutorial="pulse-stream"]',
    padding: 5,
    shape: 'panel',
    mode: 'pulse-stream',
  },
  {
    id: 'reality-my-game',
    title: 'My Game',
    body: 'Go deeper into People, Known and Deals to review relationships, what you know, and promises or debts affecting your game.',
    selector: '[data-reality-tutorial="ledger-tabs"]',
    padding: 5,
    shape: 'rounded',
    mode: 'ledger-relationships',
  },
  {
    id: 'reality-house',
    title: 'The House',
    body: 'Alliances and larger strategic relationships appear here as you discover them. You only see what your player actually knows.',
    selector: '[data-reality-tutorial="ledger-house"]',
    padding: 5,
    shape: 'rounded',
    mode: 'ledger-house',
  },
]

const REALITY_UPGRADE_STEPS: readonly TutorialStep[] = [
  {
    id: 'upgrade-relationship',
    title: 'You no longer know everything',
    body: 'Relationship information now reflects your character’s read. Another player may privately see the relationship differently.',
    selector: '[data-reality-tutorial="relationship-read"]',
    padding: 5,
    shape: 'panel',
    mode: 'target',
  },
  {
    id: 'upgrade-moves',
    title: 'More context, more options',
    body: 'Moves can now react to roles, promises, alliances, relationship history and what your player knows.',
    selector: '[data-reality-tutorial="actions"]',
    padding: 4,
    shape: 'panel',
    mode: 'target',
  },
  {
    id: 'upgrade-costs',
    title: 'Influence & Information',
    body: 'Stronger strategic moves may use Influence 🤝 or Information 💡 alongside Energy ⚡.',
    selector: '[data-reality-tutorial="footer"]',
    padding: 5,
    shape: 'rounded',
    mode: 'target',
  },
  {
    id: 'upgrade-pulse',
    title: 'Meet My Pulse',
    body: 'Follow developments that actually reached your player — not hidden activity happening elsewhere in the house.',
    selector: '[data-reality-tutorial="pulse-stream"]',
    padding: 5,
    shape: 'panel',
    mode: 'pulse-stream',
  },
  {
    id: 'upgrade-my-game',
    title: 'Your private game read',
    body: 'My Game tracks deeper relationships, known information, promises, debts and alliances as your season develops.',
    selector: '[data-reality-tutorial="ledger-tabs"]',
    padding: 5,
    shape: 'rounded',
    mode: 'ledger-relationships',
  },
]

function tutorialStepsFor(variant: SocialTutorialVariant): readonly TutorialStep[] {
  if (variant === 'normal') return NORMAL_TUTORIAL_STEPS
  if (variant === 'reality-upgrade') return REALITY_UPGRADE_STEPS
  return REALITY_TUTORIAL_STEPS
}

const PROMPT_COPY: Record<
  SocialTutorialVariant,
  { eyebrow: string; title: string; body: string }
> = {
  normal: {
    eyebrow: 'SOCIAL',
    title: 'Welcome to Social',
    body: 'Want a quick tour of relationships and social moves?',
  },
  reality: {
    eyebrow: 'REALITY MODE',
    title: 'Welcome to Reality Social',
    body: 'Want a quick tour of the deeper social game?',
  },
  'reality-upgrade': {
    eyebrow: 'REALITY MODE',
    title: 'Social just got deeper',
    body: 'You already know the basics. Want a quick look at what Reality Mode adds?',
  },
}

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

export function RealitySocialTutorialPrompt({
  variant,
  onStart,
  onSkip,
}: {
  variant: SocialTutorialVariant
  onStart: () => void
  onSkip: () => void
}) {
  if (typeof document === 'undefined') return null

  const copy = PROMPT_COPY[variant]

  return createPortal(
    <div
      className="season-tutorial-prompt"
      role="presentation"
      data-testid="reality-social-tutorial-prompt"
      data-variant={variant}
    >
      <div className="season-tutorial-prompt__backdrop" aria-hidden="true" />
      <section
        className="season-tutorial-prompt__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reality-social-tutorial-prompt-title"
        aria-describedby="reality-social-tutorial-prompt-copy"
      >
        <span className="season-tutorial-prompt__eyebrow">{copy.eyebrow}</span>
        <h2 id="reality-social-tutorial-prompt-title">{copy.title}</h2>
        <p id="reality-social-tutorial-prompt-copy">{copy.body}</p>
        <div className="season-tutorial-prompt__actions">
          <button type="button" className="season-tutorial__secondary" onClick={onSkip}>
            Skip
          </button>
          <button type="button" className="season-tutorial__primary" onClick={onStart} autoFocus>
            Quick tour
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}

export default function RealitySocialTutorialTour({
  variant,
  onClearTarget,
  onEnsureTarget,
  onComplete,
}: {
  variant: SocialTutorialVariant
  onClearTarget: () => void
  onEnsureTarget: () => void
  onComplete: () => void
}) {
  const tutorialSteps = tutorialStepsFor(variant)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const tooltipRef = useRef<HTMLElement | null>(null)
  const currentStep = tutorialSteps[stepIndex]

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
      const clamped = clamp(nextIndex, 0, tutorialSteps.length - 1)
      applyStepMode(tutorialSteps[clamped].mode)
      setTargetRect(null)
      setStepIndex(clamped)
    },
    [applyStepMode, tutorialSteps]
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
          if (stepIndex < tutorialSteps.length - 1) moveToStep(stepIndex + 1)
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
  }, [currentStep, finish, moveToStep, stepIndex, tutorialSteps])

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
        if (stepIndex === tutorialSteps.length - 1) finish()
        else moveToStep(stepIndex + 1)
      } else if (event.key === 'ArrowLeft' && stepIndex > 0) {
        event.preventDefault()
        moveToStep(stepIndex - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [finish, moveToStep, stepIndex, tutorialSteps.length])

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

  const isLastStep = stepIndex === tutorialSteps.length - 1

  return createPortal(
    <div
      className="season-tutorial"
      role="presentation"
      data-testid="reality-social-tutorial"
      data-variant={variant}
    >
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
          aria-label={`Step ${stepIndex + 1} of ${tutorialSteps.length}`}
        >
          <span>{stepIndex + 1}</span>
          <i />
          <span>{tutorialSteps.length}</span>
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
