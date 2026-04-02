/**
 * CrownAnimation — celebratory overlay for LOH / POS winner announcements.
 *
 * Shows a centred crown emoji that scales in, subtly rotates, and shines,
 * then calls onDone() after `durationMs`.
 *
 * Usage:
 *   <CrownAnimation winner={lohPlayer} label="Leader of the House" onDone={advance} />
 *
 * Props:
 *   winner     – the winning player
 *   label      – competition name (e.g. "Leader of the House", "Power of Safety")
 *   onDone     – called when the animation completes
 *   durationMs – total duration before onDone fires (default 3000)
 */

import { useState, useEffect } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './CrownAnimation.css';

export interface CrownAnimationProps {
  winner: Player;
  label: string;
  onDone: () => void;
  durationMs?: number;
}

export default function CrownAnimation({
  winner,
  label,
  onDone,
  durationMs = 3000,
}: CrownAnimationProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Fast-path: skip animation entirely when the global no-animations class is set.
    if (document.body.classList.contains('no-animations')) {
      onDone();
      return;
    }

    let exitTimeoutId: number | undefined;
    const id = setTimeout(() => {
      setVisible(false);
      // Allow exit animation to play before calling onDone.
      exitTimeoutId = window.setTimeout(onDone, 400);
    }, durationMs);
    return () => {
      clearTimeout(id);
      if (exitTimeoutId !== undefined) {
        clearTimeout(exitTimeoutId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  return (
    <div
      className={`crown-anim ${visible ? 'crown-anim--visible' : 'crown-anim--exiting'}`}
      role="status"
      aria-live="assertive"
      aria-label={`${winner.name} wins ${label}`}
    >
      <div className="crown-anim__backdrop" />
      <div className="crown-anim__content">
        <span className="crown-anim__crown" aria-hidden="true">👑</span>
        <div className="crown-anim__avatar">
          <PlayerAvatar player={winner} size="lg" />
        </div>
        <p className="crown-anim__winner-name">{winner.name}</p>
        <p className="crown-anim__label">wins {label}!</p>
        {/* Shine sweep overlay */}
        <span className="crown-anim__shine" aria-hidden="true" />
      </div>
    </div>
  );
}
