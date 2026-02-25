/**
 * CrownAnimation — celebratory overlay for HOH / POV winner announcements.
 *
 * Shows a centred crown emoji that scales in, subtly rotates, and shines,
 * then calls onDone() after `durationMs`.
 *
 * Usage:
 *   <CrownAnimation winner={hohPlayer} label="Head of Household" onDone={advance} />
 *
 * Props:
 *   winner     – the winning player
 *   label      – competition name (e.g. "Head of Household", "Power of Veto")
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
    const id = setTimeout(() => {
      setVisible(false);
      // Allow exit animation to play before calling onDone.
      setTimeout(onDone, 400);
    }, durationMs);
    return () => clearTimeout(id);
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
