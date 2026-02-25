/**
 * TiebreakerModal — shown when the live eviction vote is tied.
 *
 * Two modes:
 *   1. `isHoh = true`  → lets the current user (HOH) pick between the tied nominees.
 *   2. `isHoh = false` → shows a "HOH is thinking…" message with a 3-2-1 countdown,
 *      then fires `onSelect` with the AI-chosen nominee after the countdown.
 *
 * Props:
 *   tiedNominees – the players currently tied in the vote
 *   isHoh        – whether the current user is the HOH (decision-maker)
 *   onSelect     – called with the evicted nominee's ID once decided
 *   countdownSec – countdown length for AI HOH path (default 3)
 */

import { useState, useEffect, useRef } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './TiebreakerModal.css';

export interface TiebreakerModalProps {
  tiedNominees: Player[];
  isHoh: boolean;
  onSelect: (evicteeId: string) => void;
  /** Seed for deterministic AI HOH pick (optional; defaults to a time-based pick). */
  aiSeed?: number;
  /** Countdown seconds for the AI HOH path (default 3). */
  countdownSec?: number;
}

export default function TiebreakerModal({
  tiedNominees,
  isHoh,
  onSelect,
  aiSeed,
  countdownSec = 3,
}: TiebreakerModalProps) {
  const [countdown, setCountdown] = useState(countdownSec);
  const firedRef = useRef(false);

  function pickAI(): string {
    if (tiedNominees.length === 0) return '';
    // Deterministic pick from aiSeed when provided, otherwise use time.
    const seed = aiSeed ?? Date.now();
    const idx = seed % tiedNominees.length;
    return tiedNominees[idx].id;
  }

  // AI HOH countdown path.
  useEffect(() => {
    if (isHoh) return;
    if (countdown <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onSelect(pickAI());
      }
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHoh, countdown]);

  function handleHohSelect(nomineeId: string) {
    if (firedRef.current) return;
    firedRef.current = true;
    onSelect(nomineeId);
  }

  return (
    <div
      className="tbm"
      role="dialog"
      aria-modal="true"
      aria-label={isHoh ? 'Tiebreaker — HOH decision' : 'Tiebreaker — HOH is deciding'}
    >
      <div className="tbm__card">
        <header className="tbm__header">
          <span className="tbm__header-icon">⚖️</span>
          <h2 className="tbm__title">IT&rsquo;S A TIE!</h2>
        </header>

        <p className="tbm__subtitle">
          {isHoh
            ? 'As Head of Household, you must break the tie. Choose who to evict.'
            : 'HOH is thinking…'}
        </p>

        {isHoh ? (
          <div className="tbm__options">
            {tiedNominees.map((player) => (
              <button
                key={player.id}
                className="tbm__option"
                onClick={() => handleHohSelect(player.id)}
              >
                <PlayerAvatar player={player} size="sm" />
                <span className="tbm__option-name">{player.name}</span>
                <span className="tbm__option-cta">Evict</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="tbm__ai-waiting" aria-live="polite">
            <div className="tbm__countdown-ring">
              <span className="tbm__countdown-number">{countdown}</span>
            </div>
            <p className="tbm__ai-hint">Waiting for HOH to decide…</p>
          </div>
        )}
      </div>
    </div>
  );
}
