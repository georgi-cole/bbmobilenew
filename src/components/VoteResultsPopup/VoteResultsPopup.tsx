import { useState, useEffect, useRef } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './VoteResultsPopup.css';

interface VoteTally {
  nominee: Player;
  voteCount: number;
}

interface Props {
  /** The nominees with their vote counts */
  tallies: VoteTally[];
  /** The player being evicted (highest vote count), or null if a tie */
  evictee: Player | null;
  /** Countdown duration (ms) before onDone is called. Default: 4000 */
  countdownMs?: number;
  /** Called when countdown reaches zero or user taps to continue */
  onDone: () => void;
}

/** Minimum width percentage for vote tally bars (prevents invisible bars for 0-vote nominees). */
const MIN_BAR_WIDTH_PCT = 4;

/**
 * VoteResultsPopup — displays the vote tally after the live eviction vote.
 *
 * Shows:
 *  1. Animated vote counts per nominee (revealed with staggered delay)
 *  2. The evictee highlighted
 *  3. A goodbye timer / countdown before onDone is called
 *
 * Tappable to skip the countdown.
 */
export default function VoteResultsPopup({
  tallies,
  evictee,
  countdownMs = 4000,
  onDone,
}: Props) {
  const [revealed, setRevealed] = useState(0);
  const [countdown, setCountdown] = useState(Math.ceil(countdownMs / 1000));
  const firedRef = useRef(false);

  function fire() {
    if (firedRef.current) return;
    firedRef.current = true;
    onDone();
  }

  // Reveal nominees one by one with staggered timing
  useEffect(() => {
    if (revealed >= tallies.length) return;
    const id = setTimeout(() => setRevealed((r) => r + 1), 600);
    return () => clearTimeout(id);
  }, [revealed, tallies.length]);

  // Start countdown once all tallies are revealed; call onDone when it hits 0
  const allRevealed = revealed >= tallies.length;

  useEffect(() => {
    if (!allRevealed) return;
    if (countdown <= 0) {
      fire();
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
    // fire is stable within this render; eslint-disable below is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRevealed, countdown]);

  const totalVotes = tallies.reduce((s, t) => s + t.voteCount, 0);

  return (
    <div
      className="vrp"
      role="dialog"
      aria-modal="true"
      aria-label="Vote results"
      onClick={fire}
    >
      <div className="vrp__card">
        <header className="vrp__header">
          <span className="vrp__header-icon">🗳️</span>
          <h2 className="vrp__title">VOTE RESULTS</h2>
        </header>

        <div className="vrp__tallies">
          {tallies.map((t, i) => {
            const isEvictee = evictee?.id === t.nominee.id;
            const isVisible = i < revealed;
            const pct = totalVotes > 0 ? Math.round((t.voteCount / totalVotes) * 100) : 0;
            return (
              <div
                key={t.nominee.id}
                className={[
                  'vrp__tally',
                  isEvictee ? 'vrp__tally--evictee' : '',
                  isVisible ? 'vrp__tally--visible' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden={!isVisible}
              >
                <PlayerAvatar player={t.nominee} size="sm" />
                <span className="vrp__tally-name">{t.nominee.name}</span>
                <div className="vrp__tally-bar-wrap">
                  <div
                    className="vrp__tally-bar"
                    style={{ width: isVisible ? (t.voteCount > 0 ? `${Math.max(pct, MIN_BAR_WIDTH_PCT)}%` : '0%') : '0%' }}
                  />
                </div>
                <span className="vrp__tally-count">
                  {isVisible ? t.voteCount : '—'}
                </span>
              </div>
            );
          })}
        </div>

        {allRevealed && evictee && (
          <div className="vrp__evictee">
            <span className="vrp__evictee-label">EVICTED</span>
            <span className="vrp__evictee-name">{evictee.name}</span>
          </div>
        )}

        {allRevealed && (
          <footer className="vrp__footer">
            <span className="vrp__countdown" aria-live="polite">
              Continuing in {countdown}s…
            </span>
            <span className="vrp__skip">tap to continue</span>
          </footer>
        )}
      </div>
    </div>
  );
}
