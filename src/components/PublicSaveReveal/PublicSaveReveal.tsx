/**
 * PublicSaveReveal — pre-veto public save ceremony overlay.
 *
 * Shows the 3 nominees as avatar cards with approval bars, then reveals
 * the nominee with the highest approval as saved by the public.
 *
 * Animation sequence:
 *   1. (entering) Backdrop fades in; nominee cards stagger-enter.
 *   2. (revealing) Approval bars fill smoothly to current values.
 *   3. (saved) Saved nominee scales forward with a glow; others dim.
 *   4. (exiting) Everything fades out; onDone() is called.
 */

import { useState, useEffect } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './PublicSaveReveal.css';

export interface PublicSaveRevealProps {
  nominees: Player[];
  approvals: Record<string, number>;
  savedId: string;
  onDone: () => void;
}

type AnimPhase = 'entering' | 'revealing' | 'saved' | 'exiting';

export default function PublicSaveReveal({
  nominees,
  approvals,
  savedId,
  onDone,
}: PublicSaveRevealProps) {
  const [phase, setPhase] = useState<AnimPhase>('entering');

  useEffect(() => {
    if (document.body.classList.contains('no-animations')) {
      onDone();
      return;
    }

    // entering → revealing (cards have entered)
    const t1 = setTimeout(() => setPhase('revealing'), 700);
    // revealing → saved (bars have filled)
    const t2 = setTimeout(() => setPhase('saved'), 1800);
    // saved → exiting (hold the saved moment)
    const t3 = setTimeout(() => setPhase('exiting'), 3400);
    // exiting → done
    const t4 = setTimeout(() => onDone(), 4000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onDone]);

  const showBars = phase === 'revealing' || phase === 'saved' || phase === 'exiting';

  return (
    <div
      className={`psr psr--${phase}`}
      role="status"
      aria-live="assertive"
      aria-label={`Public Save: ${nominees.find((n) => n.id === savedId)?.name ?? ''} is saved`}
    >
      <div className="psr__backdrop" />
      <div className="psr__panel">
        <div className="psr__heading">
          <span className="psr__heading-eyebrow">Public Save</span>
          <h2 className="psr__heading-title">The Audience Decides</h2>
          <p className="psr__heading-sub">
            Before veto night, the houseguest with the highest public approval steps off the block.
          </p>
        </div>

        <div className="psr__nominees">
          {nominees.map((player, idx) => {
            const isSaved = player.id === savedId;
            const approval = approvals[player.id] ?? 50;
            return (
              <div
                key={player.id}
                className={[
                  'psr__nominee',
                  isSaved && phase === 'saved' ? 'psr__nominee--saved' : '',
                  !isSaved && phase === 'saved' ? 'psr__nominee--dimmed' : '',
                ].filter(Boolean).join(' ')}
                style={{ '--stagger': idx } as React.CSSProperties}
              >
                <div className="psr__avatar-wrap">
                  <PlayerAvatar player={player} size="md" />
                  {isSaved && phase === 'saved' && (
                    <span className="psr__saved-icon" aria-hidden="true">✅</span>
                  )}
                </div>
                <span className="psr__name">{player.name}</span>
                <div className="psr__bar-track">
                  <div
                    className="psr__bar-fill"
                    style={{
                      width: showBars ? `${Math.max(0, Math.min(100, approval))}%` : '0%',
                    }}
                    aria-label={`${player.name} approval: ${approval}%`}
                  />
                </div>
                <span className="psr__approval-value">
                  {showBars ? `${Math.round(approval)}%` : '—'}
                </span>
              </div>
            );
          })}
        </div>

        {phase === 'saved' && (
          <div className="psr__result">
            <span className="psr__result-text">
              🏆 {nominees.find((n) => n.id === savedId)?.name} is safe!
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
