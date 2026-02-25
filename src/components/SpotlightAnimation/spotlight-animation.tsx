/**
 * SpotlightAnimation — celebratory overlay for HOH / POV winner announcements.
 *
 * Extends CrownAnimation with a configurable symbol (👑 HOH, 🛡️ POV) and an
 * optional spotlight beam that originates from the winner's tile on screen.
 *
 * Defensive fallback: if `sourceDomRect` is null or has zero dimensions
 * (headless / jsdom environments) the component is NOT rendered and `onDone`
 * fires synchronously so callers commit store state immediately.
 *
 * Props:
 *   winner        – winning player
 *   label         – competition name, e.g. "Head of Household"
 *   symbol        – emoji shown above the avatar (default '👑')
 *   sourceDomRect – bounding rect of the winner's avatar tile; null = fallback
 *   onDone        – called when the animation completes (or immediately on fallback)
 *   durationMs    – total visible duration before exit begins (default 2800)
 */

import { useState, useEffect } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './spotlight-animation.css';

export interface SpotlightAnimationProps {
  winner: Player;
  label: string;
  /** Emoji symbol: '👑' for HOH, '🛡️' for POV */
  symbol?: string;
  /**
   * Bounding rect of the winning player's avatar tile.
   * When null or zero-sized (headless / jsdom), `onDone` fires immediately
   * and nothing is rendered — callers should commit state without animation.
   */
  sourceDomRect?: DOMRect | null;
  onDone: () => void;
  durationMs?: number;
}

export default function SpotlightAnimation({
  winner,
  label,
  symbol = '👑',
  sourceDomRect,
  onDone,
  durationMs = 2800,
}: SpotlightAnimationProps) {
  const [visible, setVisible] = useState(true);

  // Defensive fallback: zero-size or absent rect means headless / test env.
  const hasValidRect =
    sourceDomRect != null &&
    (sourceDomRect.width > 0 || sourceDomRect.height > 0);

  useEffect(() => {
    if (!hasValidRect) {
      // No visible animation — commit immediately.
      onDone();
      return;
    }
    const exitId = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(onDone, 350);
    }, durationMs);
    return () => window.clearTimeout(exitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidRect, durationMs]);

  // Nothing to render in headless mode.
  if (!hasValidRect) return null;

  const beamX = sourceDomRect!.left + sourceDomRect!.width / 2;
  const beamY = sourceDomRect!.top + sourceDomRect!.height / 2;

  return (
    <div
      className={`spotlight-anim ${visible ? 'spotlight-anim--visible' : 'spotlight-anim--exiting'}`}
      role="status"
      aria-live="assertive"
      aria-label={`${winner.name} wins ${label}`}
    >
      <div className="spotlight-anim__backdrop" />
      {/* Expanding ring that originates from the tile position */}
      <div
        className="spotlight-anim__beam"
        style={
          {
            '--beam-x': `${beamX}px`,
            '--beam-y': `${beamY}px`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      />
      <div className="spotlight-anim__content">
        <span className="spotlight-anim__symbol" aria-hidden="true">
          {symbol}
        </span>
        <div className="spotlight-anim__avatar">
          <PlayerAvatar player={winner} size="lg" />
        </div>
        <p className="spotlight-anim__name">{winner.name}</p>
        <p className="spotlight-anim__label">wins {label}!</p>
        {/* Diagonal shine sweep */}
        <span className="spotlight-anim__shine" aria-hidden="true" />
      </div>
    </div>
  );
}
