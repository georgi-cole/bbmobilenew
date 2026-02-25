/**
 * NominationAnimator — dramatic CSS-animated nomination ceremony overlay.
 *
 * Flow:
 *   1. Background dims.
 *   2. Nominated player avatar(s) scale up to centre with a pulsing ❓ badge.
 *   3. After `holdMs`, the avatars shrink back and onDone() is called so the
 *      caller can apply the 'nominated' status indicator to the grid tiles.
 *
 * Props:
 *   nominees  – array of players being nominated (1 or 2)
 *   onDone    – called when the animation completes
 *   holdMs    – how long (ms) to hold the centred state (default 2000)
 */

import { useState, useEffect } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './NominationAnimator.css';

export interface NominationAnimatorProps {
  nominees: Player[];
  onDone: () => void;
  holdMs?: number;
}

type AnimState = 'entering' | 'holding' | 'exiting';

export default function NominationAnimator({
  nominees,
  onDone,
  holdMs = 2000,
}: NominationAnimatorProps) {
  const [animState, setAnimState] = useState<AnimState>('entering');

  useEffect(() => {
    // After the CSS enter transition completes (~600 ms), hold.
    const enterTimer = setTimeout(() => setAnimState('holding'), 600);
    return () => clearTimeout(enterTimer);
  }, []);

  useEffect(() => {
    if (animState !== 'holding') return;
    const holdTimer = setTimeout(() => setAnimState('exiting'), holdMs);
    return () => clearTimeout(holdTimer);
  }, [animState, holdMs]);

  useEffect(() => {
    if (animState !== 'exiting') return;
    // Wait for exit transition before calling onDone.
    const exitTimer = setTimeout(() => onDone(), 500);
    return () => clearTimeout(exitTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animState]);

  return (
    <div
      className={`nom-anim nom-anim--${animState}`}
      role="status"
      aria-live="assertive"
      aria-label={`Nomination ceremony: ${nominees.map((n) => n.name).join(' and ')}`}
    >
      <div className="nom-anim__backdrop" />
      <div className="nom-anim__stage">
        {nominees.map((player) => (
          <div key={player.id} className="nom-anim__nominee">
            <div className="nom-anim__avatar-wrap">
              <PlayerAvatar player={player} size="lg" />
              <span className="nom-anim__badge" aria-hidden="true">❓</span>
            </div>
            <span className="nom-anim__name">{player.name}</span>
          </div>
        ))}
        <p className="nom-anim__label">
          {nominees.length === 1
            ? `${nominees[0].name} has been nominated`
            : `${nominees.map((n) => n.name).join(' & ')} have been nominated`}
        </p>
      </div>
    </div>
  );
}
