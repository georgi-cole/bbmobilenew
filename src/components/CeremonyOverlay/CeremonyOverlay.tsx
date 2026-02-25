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
 *     caption="Taylor wins Head of Household!"
 *     onDone={handleDone}
 *   />
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './CeremonyOverlay.css';

export interface CeremonyTile {
  /** Bounding rect of the target tile. null = skip this tile. */
  rect: DOMRect | null;
  /** Badge emoji to animate onto this tile (e.g. '👑', '🛡️', '❓'). */
  badge: string;
  /**
   * Where the badge starts before flying to the tile:
   *   'center' — screen centre (default for winner badges)
   *   DOMRect  — another tile's rect (for badge transfers)
   */
  badgeStart?: 'center' | DOMRect;
  /** Optional ARIA label for the badge */
  badgeLabel?: string;
}

export interface CeremonyOverlayProps {
  /** Tiles to spotlight (1–3 tiles) */
  tiles: CeremonyTile[];
  /** Caption text shown below the spotlighted tiles */
  caption: string;
  /** Optional subtitle below caption */
  subtitle?: string;
  /** Called when animation completes (or immediately when rects missing) */
  onDone: () => void;
  /** Total visible duration in ms before exit begins (default 2800) */
  durationMs?: number;
  /** ARIA label for the overlay */
  ariaLabel?: string;
  /**
   * Optional callback to resolve tile rects lazily (after DOM commit).
   * When provided, called once on mount and the returned tiles replace
   * the `tiles` prop.  Useful when tile DOM elements aren't available
   * during the render phase (e.g. first paint).
   */
  resolveTiles?: () => CeremonyTile[];
}

/** Badge animation phases with timing (ms from overlay mount) */
const APPEAR_DELAY = 200;
const APPEAR_DURATION = 450;
const FLY_DELAY = APPEAR_DELAY + APPEAR_DURATION; // 650
const FLY_DURATION = 500;
const LAND_DELAY = FLY_DELAY + FLY_DURATION; // 1150
const LAND_DURATION = 350;
const HOLD_DELAY = LAND_DELAY + LAND_DURATION; // 1500

type BadgePhase = 'hidden' | 'appearing' | 'flying' | 'landed' | 'holding';

/** Cutout padding (px) around each tile rect */
const CUTOUT_PAD = 6;
const CUTOUT_RADIUS = 10;

export default function CeremonyOverlay({
  tiles: tilesProp,
  caption,
  subtitle,
  onDone,
  durationMs = 2800,
  ariaLabel,
  resolveTiles,
}: CeremonyOverlayProps) {
  const [visible, setVisible] = useState(true);
  const [badgePhase, setBadgePhase] = useState<BadgePhase>('hidden');
  const timersRef = useRef<number[]>([]);

  // Lazily resolve tiles: if resolveTiles is provided, use it on mount
  // (after DOM commit) to get accurate DOMRects. Otherwise use tilesProp.
  const [resolvedTiles, setResolvedTiles] = useState<CeremonyTile[] | null>(
    resolveTiles ? null : tilesProp,
  );

  const tiles = resolvedTiles ?? tilesProp;

  // Validate: at least one tile with a non-zero rect
  const validTiles = tiles.filter(
    (t) => t.rect != null && (t.rect.width > 0 || t.rect.height > 0),
  );
  const hasValidTiles = validTiles.length > 0;
  // Track whether we're still waiting for resolveTiles to run
  const pendingResolve = resolveTiles != null && resolvedTiles === null;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  // Resolve tiles lazily on mount when resolveTiles is provided.
  useEffect(() => {
    if (resolveTiles && resolvedTiles === null) {
      setResolvedTiles(resolveTiles());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Headless fallback: fire onDone immediately
  useEffect(() => {
    // Wait for tiles to be resolved before starting animation.
    if (pendingResolve) return;

    if (!hasValidTiles) {
      onDone();
      return;
    }

    // Badge animation timeline
    addTimer(() => setBadgePhase('appearing'), APPEAR_DELAY);
    addTimer(() => setBadgePhase('flying'), FLY_DELAY);
    addTimer(() => setBadgePhase('landed'), LAND_DELAY);
    addTimer(() => setBadgePhase('holding'), HOLD_DELAY);

    // Exit sequence
    addTimer(() => {
      setVisible(false);
      addTimer(onDone, 350);
    }, durationMs);

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidTiles, durationMs, pendingResolve]);

  if (pendingResolve || !hasValidTiles) return null;

  // Compute cutout rects for the SVG mask
  const cutouts = validTiles.map((t) => {
    const r = t.rect!;
    return {
      x: r.left - CUTOUT_PAD,
      y: r.top - CUTOUT_PAD,
      w: r.width + CUTOUT_PAD * 2,
      h: r.height + CUTOUT_PAD * 2,
    };
  });

  // Caption placement: below the lowest cutout
  const maxBottom = Math.max(...cutouts.map((c) => c.y + c.h));
  const captionTop = Math.min(maxBottom + 16, window.innerHeight - 80);

  // Badge start/target positions
  const badgePositions = validTiles.map((t) => {
    const r = t.rect!;
    // Left-side anchor: align with .badgeStack { top: 4px; left: 4px } in AvatarTile.
    // Badge uses transform translate(-50%, -100%), so targetX = badge center x,
    // targetY = badge bottom y. Permanent badge center ≈ tile.left+14, bottom ≈ tile.top+24.
    const targetX = r.left + 14;
    const targetY = r.top + 24;

    let startX: number;
    let startY: number;
    if (t.badgeStart && t.badgeStart !== 'center' && 'left' in t.badgeStart) {
      // Transfer from another tile
      startX = t.badgeStart.left + t.badgeStart.width / 2;
      startY = t.badgeStart.top;
    } else {
      // Centre of viewport
      startX = window.innerWidth / 2;
      startY = window.innerHeight / 2;
    }
    return { startX, startY, targetX, targetY };
  });

  // Badge current position based on phase
  const getBadgeStyle = (idx: number): React.CSSProperties => {
    const pos = badgePositions[idx];
    switch (badgePhase) {
      case 'hidden':
        return { left: pos.startX, top: pos.startY, opacity: 0 };
      case 'appearing':
        return { left: pos.startX, top: pos.startY };
      case 'flying':
      case 'landed':
      case 'holding':
        return { left: pos.targetX, top: pos.targetY };
      default:
        return { left: pos.startX, top: pos.startY };
    }
  };

  const getBadgeClass = (phase: BadgePhase) => {
    if (phase === 'hidden') return '';
    return `ceremony-overlay__badge--${phase}`;
  };

  return (
    <>
      <div
        className={`ceremony-overlay ${visible ? 'ceremony-overlay--visible' : 'ceremony-overlay--exiting'}`}
        role="status"
        aria-live="assertive"
        aria-label={ariaLabel ?? caption}
      >
        {/* SVG dim layer with mask cutouts */}
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

        {/* Glow rings around cutout tiles */}
        {cutouts.map((c, i) => (
          <div
            key={i}
            className="ceremony-overlay__glow"
            style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
            aria-hidden="true"
          />
        ))}

        {/* Caption text */}
        <div
          className={`ceremony-overlay__caption ${visible ? 'ceremony-overlay__caption--visible' : ''}`}
          style={{ top: captionTop }}
          aria-hidden="true"
        >
          <p className="ceremony-overlay__caption-text">{caption}</p>
          {subtitle && <p className="ceremony-overlay__caption-sub">{subtitle}</p>}
        </div>
      </div>

      {/* Animated badges — placed outside the dim container so they render above the mask */}
      {validTiles.map((t, i) => (
        <div
          key={i}
          className={`ceremony-overlay__badge ${getBadgeClass(badgePhase)}`}
          style={{
            ...getBadgeStyle(i),
            zIndex: 8701,
            position: 'fixed',
            transform: 'translate(-50%, -100%)',
          }}
          aria-label={t.badgeLabel ?? `${t.badge} badge`}
          aria-hidden={badgePhase === 'hidden'}
        >
          {t.badge}
        </div>
      ))}
    </>
  );
}
