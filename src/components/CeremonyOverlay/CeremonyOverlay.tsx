/**
 * CeremonyOverlay — spotlight cutout overlay for ceremony moments.
 *
 * Renders on top of the LIVE GameScreen with:
 *   • A full-screen dim layer (SVG mask) that punches rounded holes over
 *     the target tile(s), keeping them visible and highlighted.
 *   • Badge emoji(s) that animate from a start position (screen centre or
 *     from another tile) and land onto the target tile(s).
 *   • A caption below/above the cutouts with ceremony text.
 *
 * Defensive fallback: when `tiles` are empty or all rects are null/zero
 * (headless / jsdom), `onDone` fires immediately (no timers) and nothing
 * renders — callers commit state without animation.
 *
 * Usage:
 *   <CeremonyOverlay
 *     tiles={[{ rect, badge: '👑', badgeStart: 'center' }]}
 *     caption="Taylor wins Leader of the House!"
 *     onDone={handleDone}
 *   />
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import './CeremonyOverlay.css'

export interface CeremonyTile {
  /** Bounding rect of the target tile. null = skip this tile. */
  rect: DOMRect | null
  /** Badge emoji to animate onto this tile (e.g. '👑', '🛡️', '❓'). */
  badge?: string
  /** Optional badge image source rendered instead of badge text. */
  badgeImageSrc?: string
  /** A temporary, Cupid-only illustration used while a role badge is flying. */
  badgeVariant?: 'cupid-kiss' | 'cupid-hug'
  /** Optional role/context label shown as a pill above the spotlighted tile. */
  label?: string
  /** Optional glow tone for the spotlight ring. */
  glowTone?: 'gold' | 'danger' | 'warning' | 'success'
  /**
   * Where the badge starts before flying to the tile:
   *   'center' — screen centre (default for winner badges)
   *   DOMRect  — another tile's rect (for badge transfers)
   */
  badgeStart?: 'center' | DOMRect
  /** Optional ARIA label for the badge */
  badgeLabel?: string
  /** Optional badge motion style. Defaults to landing onto the tile. */
  badgeMotion?: 'land' | 'extract'
}

export interface CeremonyOverlayProps {
  /** Tiles to spotlight (1–3 tiles) */
  tiles: CeremonyTile[]
  /** Caption text shown below the spotlighted tiles */
  caption: string
  /** Optional subtitle below caption */
  subtitle?: string
  /** Called when animation completes (or immediately when rects missing) */
  onDone: () => void
  /** Total visible duration in ms before exit begins (default 2800) */
  durationMs?: number
  /** ARIA label for the overlay */
  ariaLabel?: string
  /** When false, skips rendering the dim cutout layer. Defaults to true. */
  showDim?: boolean
  /** When false, skips rendering the caption/subtitle block. Defaults to true. */
  showCaption?: boolean
  /** When false, this visual layer does not create a second live-region announcement. */
  announce?: boolean
  /** Glow tones omitted when this overlay is composed under another ceremony layer. */
  hiddenGlowTones?: CeremonyTile['glowTone'][]
  /**
   * Optional callback to resolve tile rects lazily (after DOM commit).
   * When provided, called once on mount and the returned tiles replace
   * the `tiles` prop.  Useful when tile DOM elements aren't available
   * during the render phase (e.g. first paint).
   */
  resolveTiles?: () => CeremonyTile[]
  /** Changes when the surrounding layout budget changes and tile rects should be refreshed. */
  layoutSignal?: string | number
}

/** Badge animation phases with timing (ms from overlay mount) */
const APPEAR_DELAY = 200
const APPEAR_DURATION = 450
const FLY_DELAY = APPEAR_DELAY + APPEAR_DURATION // 650
const FLY_DURATION = 500
const LAND_DELAY = FLY_DELAY + FLY_DURATION // 1150
const LAND_DURATION = 350
const HOLD_DELAY = LAND_DELAY + LAND_DURATION // 1500
const COMPACT_LABEL_BREAKPOINT = '(max-width: 560px)'
const COMPACT_TILE_LABELS: Record<string, string> = {
  'LOH Nominee': 'NOMINEE',
  'Last in LOH Comp': 'LAST PLACE',
}
// Keep a small viewport margin so pills never clip against the screen edge.
const LABEL_EDGE_MARGIN = 12
// Default vertical anchor for pills positioned just above a spotlight cutout.
const LABEL_BASE_TOP = 30
// Minimum pill widths keep short labels visually balanced.
const MIN_COMPACT_LABEL_WIDTH = 78
const MIN_FULL_LABEL_WIDTH = 96
// Approximate character widths used only for collision estimation.
const COMPACT_LABEL_CHAR_WIDTH = 7
const FULL_LABEL_CHAR_WIDTH = 7.8
const LABEL_WIDTH_PADDING = 26
const LABEL_HEIGHT = 24
// Near the top edge, pills can only stack downward without clipping.
const LABEL_STACKED_THRESHOLD = 18
const LABEL_VERTICAL_OFFSET_STEP = 28
const LABEL_VERTICAL_OFFSET_MAX = 56
// Extraction motion lifts the badge just above the tile without jumping into
// the TV chrome near the top edge on compact mobile layouts.
const BADGE_EXTRACT_Y_OFFSET = 28
const BADGE_EXTRACT_MIN_TOP = 12
// Safe small-screen fallback dimensions for non-browser/SSR rendering paths.
const SSR_VIEWPORT_WIDTH = 390
const SSR_VIEWPORT_HEIGHT = 844

interface LabelLayout {
  key: string
  label: string
  left: number
  top: number
}

function getDisplayTileLabel(label: string, useCompactTileLabels: boolean): string {
  if (!useCompactTileLabels) return label
  return COMPACT_TILE_LABELS[label] ?? label
}

function labelRectsOverlap(
  leftA: number,
  topA: number,
  widthA: number,
  heightA: number,
  leftB: number,
  topB: number,
  widthB: number,
  heightB: number,
  gap = 8
): boolean {
  // leftA/leftB are center x-coordinates because pills are positioned with
  // translateX(-50%) in CSS.
  const aLeft = leftA - widthA / 2
  const aRight = leftA + widthA / 2
  const bLeft = leftB - widthB / 2
  const bRight = leftB + widthB / 2
  const horizontalOverlap = aLeft < bRight + gap && aRight + gap > bLeft
  const verticalOverlap = topA < topB + heightB + gap && topA + heightA + gap > topB
  return horizontalOverlap && verticalOverlap
}

function calculateLabelWidth(label: string, useCompactTileLabels: boolean): number {
  const minWidth = useCompactTileLabels ? MIN_COMPACT_LABEL_WIDTH : MIN_FULL_LABEL_WIDTH
  const charWidth = useCompactTileLabels ? COMPACT_LABEL_CHAR_WIDTH : FULL_LABEL_CHAR_WIDTH
  return Math.max(minWidth, label.length * charWidth + LABEL_WIDTH_PADDING)
}

function isTileBadgeOrigin(badgeStart: CeremonyTile['badgeStart']): badgeStart is DOMRect {
  return badgeStart != null && badgeStart !== 'center'
}

type BadgePhase = 'hidden' | 'appearing' | 'flying' | 'landed' | 'holding'

function CupidCeremonyBadge({ variant }: { variant: NonNullable<CeremonyTile['badgeVariant']> }) {
  if (variant === 'cupid-kiss') {
    return (
      <svg className="ceremony-overlay__cupid-badge-art" viewBox="0 0 46 46" aria-hidden="true">
        <defs>
          <linearGradient id="ceremony-cupid-kiss" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe6c8" />
            <stop offset=".48" stopColor="#ef92ae" />
            <stop offset="1" stopColor="#b74378" />
          </linearGradient>
        </defs>
        <circle className="ceremony-overlay__cupid-badge-disc" cx="23" cy="23" r="20" />
        <path
          className="ceremony-overlay__cupid-kiss"
          fill="url(#ceremony-cupid-kiss)"
          d="M7.5 23c4-6.8 8.8-9.9 15.5-5.4C29.7 13.1 34.5 16.2 38.5 23c-4.2 7-9.4 10.4-15.5 10.4S11.7 30 7.5 23Z"
        />
        <path
          className="ceremony-overlay__cupid-kiss-line"
          d="M10.5 22.8c5.6.7 9-1.2 12.5-3.8 3.5 2.6 6.9 4.5 12.5 3.8M14.1 27.3c5.8-1.6 11.9-1.6 17.8 0"
        />
        <path
          className="ceremony-overlay__cupid-spark"
          d="m10 11 1.6 3.2 3.2 1.6-3.2 1.6L10 20.6l-1.6-3.2-3.2-1.6 3.2-1.6L10 11Z"
        />
      </svg>
    )
  }

  return (
    <svg className="ceremony-overlay__cupid-badge-art" viewBox="0 0 46 46" aria-hidden="true">
      <circle className="ceremony-overlay__cupid-badge-disc" cx="23" cy="23" r="20" />
      <path
        className="ceremony-overlay__cupid-hug-heart"
        d="M23 32c-4.2-3.4-9.5-7.1-9.5-12.4 0-3.5 2.3-5.8 5.4-5.8 1.9 0 3.4.9 4.1 2.5.8-1.6 2.2-2.5 4.1-2.5 3.1 0 5.4 2.3 5.4 5.8C32.5 24.9 27.2 28.6 23 32Z"
      />
      <path
        className="ceremony-overlay__cupid-hug-arm"
        d="M6.5 15.1c3.4 1.4 5.8 5.6 5.9 10.6.2 6.5 4.4 10.6 10.6 12.8M39.5 15.1c-3.4 1.4-5.8 5.6-5.9 10.6-.2 6.5-4.4 10.6-10.6 12.8M11.8 28.2l5-1.8M34.2 28.2l-5-1.8"
      />
      <path
        className="ceremony-overlay__cupid-spark"
        d="m36.5 8 1.3 2.7 2.7 1.3-2.7 1.3-1.3 2.7-1.3-2.7-2.7-1.3 2.7-1.3L36.5 8Z"
      />
    </svg>
  )
}

/** Cutout padding (px) around each tile rect */
const CUTOUT_PAD = 6
const CUTOUT_RADIUS = 10

export default function CeremonyOverlay({
  tiles: tilesProp,
  caption,
  subtitle,
  onDone,
  durationMs = 2800,
  ariaLabel,
  showDim = true,
  showCaption = true,
  announce = true,
  hiddenGlowTones = [],
  resolveTiles,
  layoutSignal,
}: CeremonyOverlayProps) {
  const [visible, setVisible] = useState(true)
  const [badgePhase, setBadgePhase] = useState<BadgePhase>('hidden')
  const timersRef = useRef<number[]>([])

  // Lazily resolve tiles: if resolveTiles is provided, use it on mount
  // (after DOM commit) to get accurate DOMRects. Otherwise use tilesProp.
  const [resolvedTiles, setResolvedTiles] = useState<CeremonyTile[] | null>(
    resolveTiles ? null : tilesProp
  )
  const [useCompactTileLabels, setUseCompactTileLabels] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(COMPACT_LABEL_BREAKPOINT).matches
  })

  const tiles = resolvedTiles ?? tilesProp

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined

    const mediaQuery = window.matchMedia(COMPACT_LABEL_BREAKPOINT)
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setUseCompactTileLabels(event.matches)
    }

    handleChange(mediaQuery)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleChange)
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleChange)
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(handleChange)
      }
    }
  }, [])

  // Validate: at least one tile with a non-zero rect
  const validTiles = tiles.filter((t) => t.rect != null && (t.rect.width > 0 || t.rect.height > 0))
  const hasValidTiles = validTiles.length > 0
  // Track whether we're still waiting for resolveTiles to run
  const pendingResolve = resolveTiles != null && resolvedTiles === null

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timersRef.current.push(id)
    return id
  }, [])

  // Resolve tiles lazily and refresh them when the measured layout changes.
  useEffect(() => {
    if (resolveTiles) {
      setResolvedTiles(resolveTiles())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutSignal])

  // Headless fallback: fire onDone immediately
  useEffect(() => {
    // Wait for tiles to be resolved before starting animation.
    if (pendingResolve) return

    if (!hasValidTiles) {
      onDone()
      return
    }

    // Badge animation timeline
    addTimer(() => setBadgePhase('appearing'), APPEAR_DELAY)
    addTimer(() => setBadgePhase('flying'), FLY_DELAY)
    addTimer(() => setBadgePhase('landed'), LAND_DELAY)
    addTimer(() => setBadgePhase('holding'), HOLD_DELAY)

    // Exit sequence
    addTimer(() => {
      setVisible(false)
      addTimer(onDone, 350)
    }, durationMs)

    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidTiles, durationMs, pendingResolve])

  // Compute cutout rects for the SVG mask
  const cutouts = validTiles.map((t) => {
    const r = t.rect!
    return {
      x: r.left - CUTOUT_PAD,
      y: r.top - CUTOUT_PAD,
      w: r.width + CUTOUT_PAD * 2,
      h: r.height + CUTOUT_PAD * 2,
    }
  })

  const viewportWidth = typeof window === 'undefined' ? SSR_VIEWPORT_WIDTH : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? SSR_VIEWPORT_HEIGHT : window.innerHeight

  // Caption placement: below the lowest cutout
  const maxBottom = cutouts.length > 0 ? Math.max(...cutouts.map((c) => c.y + c.h)) : 0
  const captionTop = Math.min(maxBottom + 16, viewportHeight - 80)

  // Badge start/target positions
  const badgePositions = validTiles.map((t) => {
    const r = t.rect!
    // Left-side anchor: align with .badgeStack { top: 4px; left: 4px } in AvatarTile.
    // Badge uses transform translate(-50%, -100%), so targetX = badge center x,
    // targetY = badge bottom y. Permanent badge center ≈ tile.left+14, bottom ≈ tile.top+24.
    const targetX = r.left + 14
    const targetY = r.top + 24

    let startX: number
    let startY: number
    let endY = targetY

    if (t.badgeMotion === 'extract') {
      startX = targetX
      startY = targetY
      endY = Math.max(BADGE_EXTRACT_MIN_TOP, targetY - BADGE_EXTRACT_Y_OFFSET)
    } else if (t.badgeStart && t.badgeStart !== 'center' && 'left' in t.badgeStart) {
      // Transfer from another tile
      startX = t.badgeStart.left + t.badgeStart.width / 2
      startY = t.badgeStart.top
    } else {
      // Centre of viewport
      startX = viewportWidth / 2
      startY = viewportHeight / 2
    }
    return { startX, startY, targetX, targetY, endY }
  })

  // Badge current position based on phase
  const getBadgeStyle = (idx: number): React.CSSProperties => {
    const pos = badgePositions[idx]
    const badgeMotion = validTiles[idx]?.badgeMotion ?? 'land'
    switch (badgePhase) {
      case 'hidden':
        return { left: pos.startX, top: pos.startY, opacity: 0 }
      case 'appearing':
        return { left: pos.startX, top: pos.startY }
      case 'flying':
        if (badgeMotion === 'extract') {
          return { left: pos.targetX, top: pos.endY }
        }
        return { left: pos.targetX, top: pos.targetY }
      case 'landed':
      case 'holding':
        if (badgeMotion === 'extract') {
          return { left: pos.targetX, top: pos.endY }
        }
        return { left: pos.targetX, top: pos.targetY }
      default:
        return { left: pos.startX, top: pos.startY }
    }
  }

  const getBadgeClass = (phase: BadgePhase) => {
    if (phase === 'hidden') return ''
    return `ceremony-overlay__badge--${phase}`
  }

  const labelLayouts = useMemo(() => {
    return validTiles.reduce<LabelLayout[]>((layouts, tile, i) => {
      if (!tile.label) return layouts

      const cutout = cutouts[i]
      const displayLabel = getDisplayTileLabel(tile.label, useCompactTileLabels)
      const estimatedWidth = calculateLabelWidth(displayLabel, useCompactTileLabels)
      const clampedLeft = Math.min(
        Math.max(cutout.x + cutout.w / 2, estimatedWidth / 2 + LABEL_EDGE_MARGIN),
        viewportWidth - estimatedWidth / 2 - LABEL_EDGE_MARGIN
      )
      const baseTop = Math.max(cutout.y - LABEL_BASE_TOP, LABEL_EDGE_MARGIN)
      // If the base position is already near the top viewport edge, only move
      // downward to avoid clipping the pill off-screen. Otherwise allow both
      // upward and downward staggering to resolve collisions.
      const offsets =
        baseTop <= LABEL_STACKED_THRESHOLD
          ? [0, LABEL_VERTICAL_OFFSET_STEP, LABEL_VERTICAL_OFFSET_MAX]
          : [
              0,
              -LABEL_VERTICAL_OFFSET_STEP,
              LABEL_VERTICAL_OFFSET_STEP,
              -LABEL_VERTICAL_OFFSET_MAX,
              LABEL_VERTICAL_OFFSET_MAX,
            ]

      let placedTop = baseTop
      for (const offset of offsets) {
        const candidateTop = Math.max(LABEL_EDGE_MARGIN, baseTop + offset)
        const collides = layouts.some((layout) =>
          labelRectsOverlap(
            clampedLeft,
            candidateTop,
            estimatedWidth,
            LABEL_HEIGHT,
            layout.left,
            layout.top,
            calculateLabelWidth(layout.label, useCompactTileLabels),
            LABEL_HEIGHT
          )
        )
        if (!collides) {
          placedTop = candidateTop
          break
        }
      }

      layouts.push({
        key: `label-${i}`,
        label: displayLabel,
        left: clampedLeft,
        top: placedTop,
      })
      return layouts
    }, [])
  }, [cutouts, useCompactTileLabels, validTiles, viewportWidth])

  if (pendingResolve || !hasValidTiles) return null

  return (
    <>
      <div
        className={`ceremony-overlay ${visible ? 'ceremony-overlay--visible' : 'ceremony-overlay--exiting'}`}
        role={announce ? 'status' : undefined}
        aria-live={announce ? 'assertive' : undefined}
        aria-label={announce ? (ariaLabel ?? caption) : undefined}
        aria-hidden={announce ? undefined : true}
      >
        {/* SVG dim layer with mask cutouts */}
        {showDim && (
          <div className="ceremony-overlay__dim">
            <svg xmlns="http://www.w3.org/2000/svg">
              <defs>
                <mask id="ceremony-cutout-mask">
                  {/* White fill = fully dimmed */}
                  <rect width="100%" height="100%" fill="white" />
                  {/* Black rects = cutout holes (transparent in the dim) */}
                  {cutouts.map((c, i) => (
                    <rect
                      key={i}
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                      rx={CUTOUT_RADIUS}
                      ry={CUTOUT_RADIUS}
                      fill="black"
                    />
                  ))}
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="rgba(0,0,0,0.78)"
                mask="url(#ceremony-cutout-mask)"
              />
            </svg>
          </div>
        )}

        {/* Glow rings around cutout tiles */}
        {cutouts.map((c, i) => {
          const glowTone = validTiles[i]?.glowTone ?? 'gold'
          if (hiddenGlowTones.includes(glowTone)) return null
          return (
            <div
              key={i}
              className={`ceremony-overlay__glow ceremony-overlay__glow--${glowTone}`}
              style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
              data-ceremony-tone={glowTone}
              aria-hidden="true"
            />
          )
        })}

        {/* Optional role/context pills above spotlighted tiles */}
        {labelLayouts.map((layout) => (
          <div
            key={layout.key}
            className="ceremony-overlay__tile-label"
            style={{ left: layout.left, top: layout.top }}
            aria-hidden="true"
          >
            {layout.label}
          </div>
        ))}

        {/* Caption text */}
        {showCaption && (
          <div
            className={`ceremony-overlay__caption ${visible ? 'ceremony-overlay__caption--visible' : ''}`}
            style={{ top: captionTop }}
            aria-hidden="true"
          >
            <p className="ceremony-overlay__caption-text">{caption}</p>
            {subtitle && <p className="ceremony-overlay__caption-sub">{subtitle}</p>}
          </div>
        )}
      </div>

      {/* Animated badges — placed outside the dim container so they render above the mask */}
      {validTiles.map((t, i) => {
        if (!t.badge && !t.badgeVariant) return null
        return (
          <div
            key={i}
            className={`ceremony-overlay__badge ${getBadgeClass(badgePhase)}`}
            style={{
              ...getBadgeStyle(i),
              zIndex: 8701,
              position: 'fixed',
            }}
            data-badge-origin={isTileBadgeOrigin(t.badgeStart) ? 'tile' : 'center'}
            data-badge-motion={t.badgeMotion ?? 'land'}
            data-badge-variant={t.badgeVariant}
            aria-label={t.badgeLabel ?? `${t.badge ?? 'Role'} badge`}
            aria-hidden={badgePhase === 'hidden'}
          >
            {t.badgeVariant ? (
              <CupidCeremonyBadge variant={t.badgeVariant} />
            ) : t.badgeImageSrc ? (
              <img
                className="ceremony-overlay__badge-image"
                src={t.badgeImageSrc}
                alt=""
                aria-hidden="true"
              />
            ) : (
              t.badge
            )}
          </div>
        )
      })}
    </>
  )
}
