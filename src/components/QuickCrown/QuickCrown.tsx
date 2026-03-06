/**
 * QuickCrown — lightweight winner-reveal toast for dontGoOver / guarded ceremony paths.
 *
 * Used instead of the heavy SpotlightAnimation when:
 *   1. The minigame is "dontGoOver" (CWGO), where SpotlightAnimation can flash
 *      over the wrong player due to race/measurement issues.
 *   2. The winner is already applied in the game state (double-dispatch guard).
 *
 * Shows a centred overlay with the competition badge (👑 / 🛡️) and label for
 * `durationMs`, then calls onDone() so the caller can advance game state.
 */

import { useState, useEffect } from 'react';
import './QuickCrown.css';

export interface QuickCrownProps {
  /** Badge emoji — 👑 for HOH, 🛡️ for POV. */
  badge: string;
  /** Human-readable competition label, e.g. "Head of Household". */
  label: string;
  /** Called after the overlay has finished (including exit animation). */
  onDone: () => void;
  /** Total visible duration in ms before onDone fires (default 1800). */
  durationMs?: number;
}

export default function QuickCrown({
  badge,
  label,
  onDone,
  durationMs = 1800,
}: QuickCrownProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Fast-path: skip animation entirely when the global no-animations class is set.
    if (document.body.classList.contains('no-animations')) {
      onDone();
      return;
    }

    let exitTimeoutId: ReturnType<typeof setTimeout> | undefined;
    const id = window.setTimeout(() => {
      setExiting(true);
      exitTimeoutId = window.setTimeout(onDone, 300);
    }, durationMs);

    return () => {
      clearTimeout(id);
      if (exitTimeoutId !== undefined) clearTimeout(exitTimeoutId);
    };
    // onDone is intentionally omitted: the effect runs once on mount, and onDone
    // is only called once at completion — matching the same pattern used in CrownAnimation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  return (
    <div
      className={`quick-crown${exiting ? ' quick-crown--exiting' : ''}`}
      role="status"
      aria-live="assertive"
      aria-label={`${badge} ${label}`}
    >
      <span className="quick-crown__badge" aria-hidden="true">{badge}</span>
      <span className="quick-crown__label">{label}</span>
    </div>
  );
}
