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
const MAX_APPROVAL_DISPLAY_PRECISION = 3;

function formatApprovals(allApprovals: number[]): string[] {
  const precisions = allApprovals.map(() => 0);
  const approvalIndexesByRoundedValue = new Map<string, number[]>();

  allApprovals.forEach((approval, index) => {
    const roundedApproval = approval.toFixed(0);
    approvalIndexesByRoundedValue.set(
      roundedApproval,
      [...(approvalIndexesByRoundedValue.get(roundedApproval) ?? []), index],
    );
  });

  approvalIndexesByRoundedValue.forEach((indexes) => {
    if (indexes.length <= 1) return;

    for (let precision = 1; precision <= MAX_APPROVAL_DISPLAY_PRECISION; precision += 1) {
      const formattedApprovals = indexes.map((index) => allApprovals[index].toFixed(precision));
      if (
        new Set(formattedApprovals).size === indexes.length ||
        precision === MAX_APPROVAL_DISPLAY_PRECISION
      ) {
        indexes.forEach((index) => {
          precisions[index] = precision;
        });
        return;
      }
    }
  });

  return allApprovals.map((approval, index) => `${approval.toFixed(precisions[index])}%`);
}

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

  const nomineeApprovals = nominees.map((player) => approvals[player.id] ?? 50);
  const formattedApprovals = formatApprovals(nomineeApprovals);

  const approvalLabel = (player: Player, formattedApproval: string) =>
    `${player.name} approval: ${valuesRevealed ? formattedApproval : 'pending reveal'}`;

  const approvalText = (formattedApproval: string) => (valuesRevealed ? formattedApproval : '?? %');

  const barWidth = (approval: number) => `${Math.max(0, Math.min(100, approval))}%`;

  return (
    <div
      className={`psr psr--${phase}`}
      role="status"
      aria-live="assertive"
      aria-label={`Public Save: ${nominees.find((n) => n.id === savedId)?.name ?? ''} is saved`}
    >
      <div className="psr__panel">
        <div className="psr__heading">
          <span className="psr__heading-eyebrow">Public Save</span>
          <p className="psr__heading-sub">
            Before safety battle, the player with highest public support is saved.
          </p>
        </div>

        <div className="psr__nominees">
          {nominees.map((player, idx) => {
            const isSaved = player.id === savedId;
            const approval = approvals[player.id] ?? 50;
            const formattedApproval = formattedApprovals[idx];
            return (
              <div
                key={player.id}
                className={[
                  'psr__nominee',
                  isSaved && (phase === 'saved' || phase === 'exiting') ? 'psr__nominee--saved' : '',
                  !isSaved && (phase === 'saved' || phase === 'exiting') ? 'psr__nominee--nominated' : '',
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
                  <PlayerAvatar player={player} size="sm" />
                </div>
                <span className="psr__name">{player.name}</span>
                <div className="psr__bar-track">
                  <div
                    className={[
                      'psr__bar-motion',
                      !valuesRevealed ? 'psr__bar-motion--pending' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div
                      className="psr__bar-fill"
                      style={{
                        width: phase === 'entering' ? '0%' : valuesRevealed ? barWidth(approval) : 'var(--pending-width)',
                      }}
                      aria-label={approvalLabel(player, formattedApproval)}
                    />
                  </div>
                </div>
                <span className="psr__approval-value">
                  {approvalText(formattedApproval)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
