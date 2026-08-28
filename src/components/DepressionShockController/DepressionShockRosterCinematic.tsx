import { useLayoutEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export type DepressionShockCinematicKind = 'thunder' | 'chocolate' | 'sunlight'

type Point = { x: number; y: number }
type Target = Point & { width: number; height: number; index: number }

type Props = {
  kind: DepressionShockCinematicKind
  onImpact?: () => void
  onComplete?: () => void
}

const TIMINGS: Record<DepressionShockCinematicKind, { impact: number; complete: number }> = {
  thunder: { impact: 820, complete: 2350 },
  chocolate: { impact: 900, complete: 3200 },
  sunlight: { impact: 1450, complete: 3600 },
}

function isVisible(element: HTMLElement, rect: DOMRect): boolean {
  const style = window.getComputedStyle(element)
  return rect.width > 8 && rect.height > 8 && style.visibility !== 'hidden' && style.display !== 'none'
}

export default function DepressionShockRosterCinematic({ kind, onImpact, onComplete }: Props) {
  const [source, setSource] = useState<Point>({ x: window.innerWidth / 2, y: 120 })
  const [targets, setTargets] = useState<Target[]>([])
  const timing = TIMINGS[kind]
  const thunderTarget = useMemo(() => {
    if (targets.length === 0) return { x: source.x, y: Math.min(window.innerHeight - 80, source.y + 260) }
    return targets.reduce(
      (center, target) => ({ x: center.x + target.x / targets.length, y: center.y + target.y / targets.length }),
      { x: 0, y: 0 }
    )
  }, [source.x, source.y, targets])
  useLayoutEffect(() => {
    const sourceElement = document.querySelector<HTMLElement>('.tv-zone__viewport')
    const sourceRect = sourceElement?.getBoundingClientRect()
    if (sourceRect && sourceRect.width > 0) {
      setSource({ x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 })
    }

    const elements = [...document.querySelectorAll<HTMLElement>('[data-houseguest-roster="true"] [data-depression-target="true"]')]
    const measured = elements
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => isVisible(element, rect))
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)

    measured.forEach(({ element }, index) => {
      element.style.setProperty('--depression-target-index', String(index))
    })
    setTargets(
      measured.map(({ rect }, index) => ({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        index,
      }))
    )

    document.body.dataset.depressionCinematic = kind
    const impactTimer = window.setTimeout(() => onImpact?.(), timing.impact)
    const completeTimer = window.setTimeout(() => onComplete?.(), timing.complete)
    return () => {
      window.clearTimeout(impactTimer)
      window.clearTimeout(completeTimer)
      delete document.body.dataset.depressionCinematic
      measured.forEach(({ element }) => element.style.removeProperty('--depression-target-index'))
    }
  }, [kind, onComplete, onImpact, timing.complete, timing.impact])

  const particles = useMemo(
    () =>
      targets.map((target) => {
        const dx = target.x - source.x
        const dy = target.y - source.y
        const style = {
          '--start-x': `${source.x}px`,
          '--start-y': `${source.y}px`,
          '--travel-x': `${dx}px`,
          '--travel-y': `${dy}px`,
          '--target-delay': `${target.index * (kind === 'chocolate' ? 62 : 42)}ms`,
          '--target-width': `${target.width}px`,
          '--target-height': `${target.height}px`,
          '--target-x': `${target.x}px`,
          '--target-y': `${target.y}px`,
        } as CSSProperties
        return (
          <span className="depression-cinematic__flight" style={style} key={`${kind}-${target.index}`}>
            {kind === 'chocolate' ? <span className="depression-cinematic__chocolate">🍫</span> : null}
          </span>
        )
      }),
    [kind, source.x, source.y, targets]
  )

  return createPortal(
    <div className={`depression-cinematic depression-cinematic--${kind}`} aria-hidden="true">
      <span
        className="depression-cinematic__origin"
        style={{ left: source.x, top: source.y }}
      />
      {kind === 'sunlight' ? <span className="depression-cinematic__sun-wave" style={{ left: source.x, top: source.y }} /> : null}
      {kind === 'thunder' ? (
        <img
          className="depression-cinematic__thunderbolt"
          src="/bbmobilenew/assets/lightning-thunderbolt-light-illustration.png"
          alt=""
          aria-hidden="true"
          style={{
            left: source.x,
            top: source.y,
            '--thunder-travel-x': `${thunderTarget.x - source.x}px`,
            '--thunder-travel-y': `${thunderTarget.y - source.y}px`,
          } as CSSProperties}
        />
      ) : null}
      {particles}
    </div>,
    document.body
  )
}
