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
import type { CeremonyTile } from '../CeremonyOverlay/CeremonyOverlay'
import './WinnerTileLiftAnimation.css'

const MAX_CAPTURE_FRAMES = 24
const LIFT_DURATION_MS = 520
const RETURN_DURATION_MS = 560
const MIN_STAGE_TILE_SIZE = 112
const MAX_STAGE_TILE_SIZE = 184
const STAGE_GAP = 18

type LiftPhase = 'captured' | 'lifted' | 'awarded' | 'returning'

interface LiftTarget {
  id: string
  source: HTMLElement
  snapshot: HTMLElement
  sourceRect: DOMRect
  returnRect: DOMRect
  tile: CeremonyTile
}

export interface WinnerTileLiftAnimationProps {
  targetIds: string[]
  tiles: CeremonyTile[]
  caption: string
  subtitle?: string
  ariaLabel?: string
  durationMs?: number
  resolveTarget: (playerId: string) => HTMLElement | null
  onDone: () => void
}

function isMeasurable(element: HTMLElement | null): element is HTMLElement {
  if (!element || !element.isConnected) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function stripDuplicateIds(root: HTMLElement) {
  root.removeAttribute('id')
  root.querySelectorAll<HTMLElement>('[id]').forEach((element) => element.removeAttribute('id'))
}

function freezeVisualStyles(source: HTMLElement, clone: HTMLElement) {
  const computed = window.getComputedStyle(source)
  for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex += 1) {
    const property = computed.item(propertyIndex)
    if (property.startsWith('--')) {
      clone.style.setProperty(property, computed.getPropertyValue(property))
    }
  }

  ;[clone, ...clone.querySelectorAll<HTMLElement>('*')].forEach((cloneElement) => {
    cloneElement.style.animation = 'none'
    cloneElement.style.transition = 'none'
  })

  clone.style.width = '100%'
  clone.style.height = '100%'
  clone.style.transform = 'none'
  clone.style.pointerEvents = 'none'
  stripDuplicateIds(clone)
}

function FrozenTile({ snapshot }: { snapshot: HTMLElement }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.replaceChildren(snapshot)
    return () => snapshot.remove()
  }, [snapshot])

  return <div ref={hostRef} className="winner-tile-lift__snapshot" aria-hidden="true" />
}

function getVisibleViewport() {
  const viewport = window.visualViewport
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  }
}

function calculateStageRects(targets: LiftTarget[]): DOMRect[] {
  const viewport = getVisibleViewport()
  const availableWidth = Math.max(1, viewport.width - 32 - STAGE_GAP * (targets.length - 1))
  const maxPerTile = availableWidth / Math.max(1, targets.length)
  const largestSource = Math.max(...targets.map((target) => target.sourceRect.width))
  const size = Math.min(
    maxPerTile,
    MAX_STAGE_TILE_SIZE,
    Math.max(MIN_STAGE_TILE_SIZE, largestSource * 1.35)
  )
  const totalWidth = size * targets.length + STAGE_GAP * (targets.length - 1)
  const left = viewport.left + (viewport.width - totalWidth) / 2
  const top = viewport.top + Math.max(28, (viewport.height - size) * 0.34)

  return targets.map((_, index) => new DOMRect(left + index * (size + STAGE_GAP), top, size, size))
}

function rectStyle(rect: DOMRect): CSSProperties {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

export default function WinnerTileLiftAnimation({
  targetIds,
  tiles,
  caption,
  subtitle,
  ariaLabel,
  durationMs = 2800,
  resolveTarget,
  onDone,
}: WinnerTileLiftAnimationProps) {
  const [targets, setTargets] = useState<LiftTarget[]>([])
  const [phase, setPhase] = useState<LiftPhase>('captured')
  const targetsRef = useRef<LiftTarget[]>([])
  const originalVisibilityRef = useRef(new Map<HTMLElement, string>())
  const finishedRef = useRef(false)

  const restoreOriginals = useCallback(() => {
    originalVisibilityRef.current.forEach((visibility, element) => {
      element.style.visibility = visibility
      element.removeAttribute('data-ceremony-tile-lifted')
    })
    originalVisibilityRef.current.clear()
  }, [])

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    restoreOriginals()
    onDone()
  }, [onDone, restoreOriginals])

  useLayoutEffect(() => {
    let frame = 0
    let raf = 0
    let cancelled = false

    const capture = () => {
      if (cancelled) return
      const elements = targetIds.map((targetId) => resolveTarget(targetId))
      if (elements.every(isMeasurable)) {
        const currentRects = elements.map((element) => element.getBoundingClientRect())
        const captured = elements.map((source, index) => {
          const sourceRect = currentRects[index]
          const snapshot = source.cloneNode(true) as HTMLElement
          freezeVisualStyles(source, snapshot)
          originalVisibilityRef.current.set(source, source.style.visibility)
          source.style.visibility = 'hidden'
          source.setAttribute('data-ceremony-tile-lifted', 'true')
          return {
            id: targetIds[index],
            source,
            snapshot,
            sourceRect,
            returnRect: sourceRect,
            tile: tiles[index] ?? tiles[0] ?? { rect: sourceRect },
          }
        })
        targetsRef.current = captured
        setTargets(captured)
        return
      }

      frame += 1
      if (frame >= MAX_CAPTURE_FRAMES) {
        finish()
        return
      }
      raf = requestAnimationFrame(capture)
    }

    raf = requestAnimationFrame(capture)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      restoreOriginals()
    }
  }, [finish, resolveTarget, restoreOriginals, targetIds, tiles])

  useEffect(() => {
    if (targets.length === 0) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setPhase('lifted'))
    })
    const awardTimer = window.setTimeout(() => setPhase('awarded'), LIFT_DURATION_MS)
    const returnAt = Math.max(LIFT_DURATION_MS + 650, durationMs - RETURN_DURATION_MS)
    const returnTimer = window.setTimeout(() => {
      const refreshed = targetsRef.current.map((target) => {
        const rect = target.source.getBoundingClientRect()
        return {
          ...target,
          returnRect: rect.width > 0 && rect.height > 0 ? rect : target.sourceRect,
        }
      })
      targetsRef.current = refreshed
      setTargets(refreshed)
      setPhase('returning')
    }, returnAt)
    const doneTimer = window.setTimeout(finish, returnAt + RETURN_DURATION_MS)

    return () => {
      document.body.style.overflow = previousOverflow
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
      window.clearTimeout(awardTimer)
      window.clearTimeout(returnTimer)
      window.clearTimeout(doneTimer)
    }
  }, [durationMs, finish, targets.length])

  const stageRects = useMemo(() => calculateStageRects(targets), [targets])

  if (targets.length === 0 || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`winner-tile-lift winner-tile-lift--${phase}`}
      role="status"
      aria-live="assertive"
      aria-label={ariaLabel ?? caption}
      data-winner-tile-lift-phase={phase}
    >
      <div className="winner-tile-lift__backdrop" aria-hidden="true" />
      {targets.map((target, index) => {
        const destination =
          phase === 'captured'
            ? target.sourceRect
            : phase === 'returning'
              ? target.returnRect
              : stageRects[index]
        const badgeActive = phase === 'awarded' || phase === 'returning'
        return (
          <div
            key={target.id}
            className="winner-tile-lift__tile"
            style={rectStyle(destination)}
            data-winner-tile-id={target.id}
          >
            <FrozenTile snapshot={target.snapshot} />
            <div className="winner-tile-lift__glow" aria-hidden="true" />
            {(target.tile.badgeImageSrc || target.tile.badge) && (
              <div
                className={`winner-tile-lift__badge ${
                  badgeActive ? 'winner-tile-lift__badge--active' : ''
                }`}
                aria-label={target.tile.badgeLabel ?? `${target.tile.badge ?? 'Role'} badge`}
              >
                {target.tile.badgeImageSrc ? (
                  <img
                    className="ceremony-overlay__badge-image"
                    src={target.tile.badgeImageSrc}
                    alt=""
                    aria-hidden="true"
                  />
                ) : (
                  target.tile.badge
                )}
              </div>
            )}
          </div>
        )
      })}
      <div className="winner-tile-lift__caption" aria-hidden="true">
        <p>{caption}</p>
        {subtitle && <span>{subtitle}</span>}
      </div>
    </div>,
    document.body
  )
}
