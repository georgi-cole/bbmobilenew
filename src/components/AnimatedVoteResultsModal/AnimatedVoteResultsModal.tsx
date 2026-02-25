/**
 * AnimatedVoteResultsModal — sequentially reveals votes then announces the outcome.
 *
 * Behaviour:
 *   1. Initially shows all nominees without highlighting.
 *   2. Reveals votes one-by-one at `revealIntervalMs` intervals.
 *   3. After the last vote, waits `postRevealDelayMs` then:
 *      - If tied → calls `onTiebreakerRequired(tiedNomineeIds)` and does NOT evict.
 *      - Otherwise → highlights the loser with a red outline + "EVICTED" label,
 *        then calls `onDone()` after `countdownMs`.
 *
 * Props:
 *   nominees            – all nominees with their final vote counts
 *   evictee             – pre-determined evictee (null if tie; caller may pass null
 *                         to let this component detect the tie)
 *   onTiebreakerRequired – called with tied nominee IDs when totals are equal
 *   onDone              – called when the modal should close (non-tie path)
 *   revealIntervalMs    – ms between each vote reveal (default 700)
 *   postRevealDelayMs   – ms to wait after last vote before announcing outcome (default 1000)
 *   countdownMs         – ms countdown before onDone fires (default 4000)
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './AnimatedVoteResultsModal.css';

export interface VoteTally {
  nominee: Player;
  voteCount: number;
}

export interface AnimatedVoteResultsModalProps {
  nominees: VoteTally[];
  /** Pre-determined evictee; pass null to let the component detect ties. */
  evictee?: Player | null;
  onTiebreakerRequired?: (tiedNomineeIds: string[]) => void;
  onDone: () => void;
  revealIntervalMs?: number;
  postRevealDelayMs?: number;
  countdownMs?: number;
}

const MIN_BAR_PCT = 4;

export default function AnimatedVoteResultsModal({
  nominees,
  evictee: evicteeProp = null,
  onTiebreakerRequired,
  onDone,
  revealIntervalMs = 700,
  postRevealDelayMs = 1000,
  countdownMs = 4000,
}: AnimatedVoteResultsModalProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [outcomeVisible, setOutcomeVisible] = useState(false);
  const [countdown, setCountdown] = useState(Math.ceil(countdownMs / 1000));
  const firedRef = useRef(false);

  const totalVotes = useMemo(
    () => nominees.reduce((s, t) => s + t.voteCount, 0),
    [nominees],
  );

  // Detect tie from tallies when evictee prop is null.
  const { resolvedEvictee, tiedIds } = useMemo(() => {
    if (nominees.length === 0) return { resolvedEvictee: null, tiedIds: [] as string[] };
    if (evicteeProp) return { resolvedEvictee: evicteeProp, tiedIds: [] as string[] };

    const maxVotes = Math.max(...nominees.map((n) => n.voteCount));
    const topNominees = nominees.filter((n) => n.voteCount === maxVotes);
    if (topNominees.length > 1) {
      return { resolvedEvictee: null, tiedIds: topNominees.map((n) => n.nominee.id) };
    }
    return { resolvedEvictee: topNominees[0].nominee, tiedIds: [] as string[] };
  }, [nominees, evicteeProp]);

  const allRevealed = revealedCount >= nominees.length;
  const isTied = tiedIds.length > 1;

  function fire() {
    if (firedRef.current) return;
    firedRef.current = true;
    onDone();
  }

  // Reveal nominees one-by-one.
  useEffect(() => {
    if (revealedCount >= nominees.length) return;
    const id = setTimeout(() => setRevealedCount((c) => c + 1), revealIntervalMs);
    return () => clearTimeout(id);
  }, [revealedCount, nominees.length, revealIntervalMs]);

  // After all votes revealed: wait, then show outcome.
  useEffect(() => {
    if (!allRevealed) return;
    const id = setTimeout(() => {
      if (isTied && onTiebreakerRequired) {
        onTiebreakerRequired(tiedIds);
      } else {
        setOutcomeVisible(true);
      }
    }, postRevealDelayMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRevealed]);

  // Countdown after outcome is visible.
  useEffect(() => {
    if (!outcomeVisible) return;
    if (countdown <= 0) { fire(); return; }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomeVisible, countdown]);

  return (
    <div
      className="avrm"
      role="dialog"
      aria-modal="true"
      aria-label="Vote results"
      onClick={outcomeVisible ? fire : undefined}
    >
      <div className="avrm__card">
        <header className="avrm__header">
          <span className="avrm__header-icon">🗳️</span>
          <h2 className="avrm__title">VOTE RESULTS</h2>
        </header>

        <div className="avrm__tallies">
          {nominees.map((t, i) => {
            const isEvictee = resolvedEvictee?.id === t.nominee.id;
            const isRevealed = i < revealedCount;
            const pct = totalVotes > 0 ? Math.round((t.voteCount / totalVotes) * 100) : 0;
            return (
              <div
                key={t.nominee.id}
                className={[
                  'avrm__tally',
                  isEvictee && outcomeVisible ? 'avrm__tally--evictee' : '',
                  isRevealed ? 'avrm__tally--visible' : '',
                  i === revealedCount - 1 ? 'avrm__tally--pulse' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden={!isRevealed}
              >
                <PlayerAvatar player={t.nominee} size="sm" />
                <span className="avrm__tally-name">{t.nominee.name}</span>
                <div className="avrm__tally-bar-wrap">
                  <div
                    className="avrm__tally-bar"
                    style={{
                      width: isRevealed
                        ? t.voteCount > 0
                          ? `${Math.max(pct, MIN_BAR_PCT)}%`
                          : '0%'
                        : '0%',
                    }}
                  />
                </div>
                <span className="avrm__tally-count">{isRevealed ? t.voteCount : '—'}</span>
              </div>
            );
          })}
        </div>

        {outcomeVisible && resolvedEvictee && (
          <div className="avrm__evictee" role="status">
            <span className="avrm__evictee-label">EVICTED</span>
            <span className="avrm__evictee-name">{resolvedEvictee.name}</span>
          </div>
        )}

        {outcomeVisible && (
          <footer className="avrm__footer">
            <span className="avrm__countdown" aria-live="polite">
              Continuing in {countdown}s&hellip;
            </span>
            <span className="avrm__skip">tap to continue</span>
          </footer>
        )}

        {allRevealed && isTied && !outcomeVisible && (
          <div className="avrm__tie-banner" role="status" aria-live="assertive">
            <span className="avrm__tie-icon">⚖️</span>
            <span className="avrm__tie-text">It&rsquo;s a tie! HOH must break the tie.</span>
          </div>
        )}
      </div>
    </div>
  );
}
