/**
 * QuickCrown — lightweight winner-reveal overlay for dontGoOver completions.
 *
 * Avoids the heavy SpotlightAnimation/CeremonyOverlay used by other minigames.
 * Instead it:
 *   1. Waits up to `maxWaitFrames` RAF ticks for the winner tile to appear.
 *   2. Positions a badge emoji and an expanding/fading pulse ring over the tile.
 *   3. Shows a semi-transparent backdrop and a caption near the bottom.
 *   4. Calls `onDone` after `durationMs` (default 1200 ms).
 *
 * Defensive fallback: if the tile rect is never found, `onDone` fires after
 * `durationMs` and nothing visual renders (same headless-safe pattern as
 * CeremonyOverlay).
 */

import { useEffect, useState } from 'react';
import { waitForTileRect } from './waitForTileRect';
import './QuickCrown.css';

// ─── Component ────────────────────────────────────────────────────────────────

export interface QuickCrownProps {
  /** Player ID of the winner — used to locate the tile via getTileRect. */
  winnerId: string;
  /** Badge emoji to display over the tile (e.g. '👑', '🛡️'). */
  badge: string;
  /** Caption shown near the bottom of the overlay. */
  caption: string;
  /** Total duration before onDone fires (default 1200 ms). */
  durationMs?: number;
  /** Called when the overlay is done. */
  onDone: () => void;
  /**
   * Callback to measure a tile's DOMRect by player ID.
   * Typically GameScreen's `getTileRect` which queries `[data-player-id="…"]`.
   */
  getTileRect: (id: string) => DOMRect | null;
}

export default function QuickCrown({
  winnerId,
  badge,
  caption,
  durationMs = 1200,
  onDone,
  getTileRect,
}: QuickCrownProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Measure the winner tile asynchronously (waits for DOM to settle).
    waitForTileRect(getTileRect, winnerId).then((r) => {
      if (!cancelled) setRect(r);
    });

    // Fire onDone after durationMs regardless of measurement result.
    const timer = setTimeout(() => {
      if (!cancelled) onDone();
    }, durationMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // onDone and getTileRect are expected to be stable refs (useCallback in parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerId, durationMs]);

  // When no rect is available (headless / unmeasured), render nothing but still
  // let the timer run so onDone fires.
  if (!rect) return null;

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return (
    <div className="quick-crown" role="status" aria-label={caption}>
      <div className="quick-crown__backdrop" />

      {/* Expanding pulse ring behind the tile */}
      <div
        className="quick-crown__pulse"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }}
      />

      {/* HOH badge centred over the tile */}
      <div
        className="quick-crown__badge"
        style={{
          left: centerX,
          top: centerY,
        }}
      >
        {badge}
      </div>

      {/* Caption near the bottom */}
      <div className="quick-crown__caption">{caption}</div>
    </div>
  );
}
