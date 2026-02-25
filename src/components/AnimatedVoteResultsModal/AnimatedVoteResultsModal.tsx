/**
 * AnimatedVoteResultsModal — sequentially reveals votes then announces the outcome.
 *
 * Behaviour:
 *   1. Initially shows both nominees in full colour (no "Evicted" outline).
 *   2. Reveals votes one-by-one: each step pulses the receiving nominee row and
 *      increments their displayed count. Votes are interleaved across nominees
 *      (e.g., A then B then A…) for a more dramatic reveal.
 *   3. After the last vote is revealed, waits `postRevealDelayMs` then:
 *      - If tied → calls `onTiebreakerRequired(tiedNomineeIds)` and does NOT evict.
 *      - Otherwise → highlights the losing nominee with a red outline +
 *        "EVICTED" label, then calls `onDone()` after `countdownMs`.
 *
 * Props:
 *   nominees            – nominees with their final vote counts
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

/**
 * Build an interleaved vote-reveal sequence from tallies.
 * Votes are interleaved across nominees so each reveal step toggles between
 * nominees (e.g. A, B, A, B, A for counts 3 vs 2), creating suspense.
 */
function buildVoteSequence(tallies: VoteTally[]): string[] {
  // Create per-nominee pools of vote tokens.
  const pools = tallies.map((t) => Array<string>(t.voteCount).fill(t.nominee.id));
  const seq: string[] = [];
  const maxLen = Math.max(0, ...pools.map((p) => p.length));
  for (let i = 0; i < maxLen; i++) {
    for (const pool of pools) {
      if (i < pool.length) seq.push(pool[i]);
    }
  }
  return seq;
}

export default function AnimatedVoteResultsModal({
  nominees,
  evictee: evicteeProp = null,
  onTiebreakerRequired,
  onDone,
  revealIntervalMs = 700,
  postRevealDelayMs = 1000,
  countdownMs = 4000,
}: AnimatedVoteResultsModalProps) {
  const [revealStep, setRevealStep] = useState(0);
  const [outcomeVisible, setOutcomeVisible] = useState(false);
  const [countdown, setCountdown] = useState(Math.ceil(countdownMs / 1000));
  const firedRef = useRef(false);

  const totalVotes = useMemo(
    () => nominees.reduce((s, t) => s + t.voteCount, 0),
    [nominees],
  );

  // Interleaved reveal sequence: [nomineeId, nomineeId, …] — length = totalVotes.
  const voteSequence = useMemo(() => buildVoteSequence(nominees), [nominees]);

  // Displayed vote counts at the current reveal step.
  const displayedCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const t of nominees) counts[t.nominee.id] = 0;
    for (let i = 0; i < revealStep; i++) {
      const id = voteSequence[i];
      if (id !== undefined) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [nominees, voteSequence, revealStep]);

  // The nominee that just received the most-recently revealed vote (for pulse).
  const lastRevealedId = revealStep > 0 ? voteSequence[revealStep - 1] : null;

  // Detect tie from final tallies when evictee prop is null.
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

  const allRevealed = totalVotes === 0 || revealStep >= voteSequence.length;
  const isTied = tiedIds.length > 1;

  function fire() {
    if (firedRef.current) return;
    firedRef.current = true;
    onDone();
  }

  // Advance reveal step one vote at a time.
  useEffect(() => {
    if (allRevealed) return;
    const id = setTimeout(() => setRevealStep((s) => s + 1), revealIntervalMs);
    return () => clearTimeout(id);
  }, [revealStep, allRevealed, revealIntervalMs]);

  // After all votes revealed: wait, then show outcome.
  useEffect(() => {
    if (!allRevealed) return;
    const id = setTimeout(() => {
      if (isTied) {
        if (onTiebreakerRequired) {
          onTiebreakerRequired(tiedIds);
        }
        // If tied and no tiebreaker callback is provided, do not proceed to outcome/eviction.
        return;
      }
      setOutcomeVisible(true);
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
          {nominees.map((t) => {
            const shown = displayedCounts[t.nominee.id] ?? 0;
            const isEvictee = resolvedEvictee?.id === t.nominee.id;
            const isPulsing = lastRevealedId === t.nominee.id;
            const pct = totalVotes > 0 ? Math.round((shown / totalVotes) * 100) : 0;
            return (
              <div
                key={t.nominee.id}
                className={[
                  'avrm__tally',
                  'avrm__tally--visible',
                  isEvictee && outcomeVisible ? 'avrm__tally--evictee' : '',
                  isPulsing ? 'avrm__tally--pulse' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <PlayerAvatar player={t.nominee} size="sm" />
                <span className="avrm__tally-name">{t.nominee.name}</span>
                <div className="avrm__tally-bar-wrap">
                  <div
                    className="avrm__tally-bar"
                    style={{
                      width: shown > 0 ? `${Math.max(pct, MIN_BAR_PCT)}%` : '0%',
                    }}
                  />
                </div>
                <span className="avrm__tally-count">{shown}</span>
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
