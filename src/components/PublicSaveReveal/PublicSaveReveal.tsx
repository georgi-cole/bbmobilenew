/**
 * PublicSaveReveal — pre-veto public save ceremony overlay.
 *
 * Shows the 3 nominees as avatar cards with approval bars, then reveals
 * the nominee with the highest approval as saved by the public.
 *
 * Animation sequence:
 *   1. (entering) Backdrop fades in; nominee cards stagger-enter.
 *   2. (revealing) Bars sweep back and forth while approval values stay hidden.
 *   3. (saved) The true percentages appear; the top nominee is marked saved.
 *   4. (exiting) Everything fades out; onDone() is called.
 */

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
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

const ENTER_TO_REVEAL_MS = 900;
const REVEAL_VALUES_MS = 5000;
const SHOW_SAVED_MS = 7600;
const EXIT_MS = 9300;
const DONE_MS = 10000;

export default function PublicSaveReveal({
  nominees,
  approvals,
  savedId,
  onDone,
}: PublicSaveRevealProps) {
  const [phase, setPhase] = useState<AnimPhase>('entering');
  const [valuesRevealed, setValuesRevealed] = useState(false);
  const timersRef = useRef<number[]>([]);
  const doneRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const fireDone = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimers();
    onDone();
  }, [clearTimers, onDone]);

  useEffect(() => {
    doneRef.current = false;

    if (document.body.classList.contains('no-animations')) {
      fireDone();
      return;
    }

    timersRef.current = [
      window.setTimeout(() => setPhase('revealing'), ENTER_TO_REVEAL_MS),
      window.setTimeout(() => setValuesRevealed(true), REVEAL_VALUES_MS),
      window.setTimeout(() => setPhase('saved'), SHOW_SAVED_MS),
      window.setTimeout(() => setPhase('exiting'), EXIT_MS),
      window.setTimeout(() => fireDone(), DONE_MS),
    ];

    return clearTimers;
  }, [clearTimers, fireDone]);

  const phaseCopy =
    phase === 'entering'
      ? 'Reading the live audience…'
      : phase === 'revealing' && !valuesRevealed
        ? 'Every point matters tonight.'
        : phase === 'revealing'
          ? 'The percentages are in.'
          : phase === 'saved'
            ? 'The public has spoken.'
            : 'Locking in the result…';

  const handleSkip = useCallback(() => {
    fireDone();
  }, [fireDone]);

  const approvalLabel = (player: Player, approval: number) =>
    `${player.name} approval: ${valuesRevealed ? `${Math.round(approval)}%` : 'pending reveal'}`;

  const approvalText = (approval: number) => (valuesRevealed ? `${Math.round(approval)}%` : '?? %');

  const barWidth = (approval: number) => `${Math.max(0, Math.min(100, approval))}%`;

  return (
    <div
      className={`psr psr--${phase}`}
      role="status"
      aria-live="assertive"
      aria-label={`Public Save: ${nominees.find((n) => n.id === savedId)?.name ?? ''} is saved`}
    >
      <div className="psr__backdrop" />
      <div className="psr__spotlight" aria-hidden="true" />
      <div className="psr__panel">
        <div className="psr__heading">
          <span className="psr__heading-eyebrow">Public Save</span>
          <h2 className="psr__heading-title">The Audience Decides</h2>
          <p className="psr__heading-sub">
            Before veto night, the houseguest with the highest public approval steps off the block.
          </p>
          <p className="psr__phase-copy">{phaseCopy}</p>
        </div>

        <div className="psr__nominees">
          {nominees.map((player, idx) => {
            const isSaved = player.id === savedId;
            const approval = approvals[player.id] ?? 50;
            const showOutcomeBadge = phase === 'saved' || phase === 'exiting';
            return (
              <div
                key={player.id}
                className={[
                  'psr__nominee',
                  isSaved && showOutcomeBadge ? 'psr__nominee--saved' : '',
                  !isSaved && showOutcomeBadge ? 'psr__nominee--nominated' : '',
                ].filter(Boolean).join(' ')}
                style={
                  {
                    '--stagger': idx,
                    '--pending-width': `${32 + idx * 6}%`,
                    '--pending-delay': `${idx * 140}ms`,
                  } as CSSProperties
                }
              >
                <div className="psr__avatar-wrap">
                  <PlayerAvatar player={player} size="md" />
                  {showOutcomeBadge && (
                    <span
                      className={[
                        'psr__status-pill',
                        isSaved ? 'psr__status-pill--saved' : 'psr__status-pill--nominated',
                      ].join(' ')}
                    >
                      {isSaved ? 'Saved' : '?'}
                    </span>
                  )}
                </div>
                <span className="psr__name">{player.name}</span>
                <div className="psr__bar-track">
                  <div
                    className={[
                      'psr__bar-fill',
                      !valuesRevealed ? 'psr__bar-fill--pending' : '',
                    ].filter(Boolean).join(' ')}
                    style={{
                      width: phase === 'entering' ? '0%' : valuesRevealed ? barWidth(approval) : 'var(--pending-width)',
                    }}
                    aria-label={approvalLabel(player, approval)}
                  />
                </div>
                <span className="psr__approval-value">
                  {approvalText(approval)}
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

        <button type="button" className="psr__skip" onClick={handleSkip}>
          Tap to skip
        </button>
      </div>
    </div>
  );
}
