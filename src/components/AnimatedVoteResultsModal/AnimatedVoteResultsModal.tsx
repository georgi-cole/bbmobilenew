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
 *      - Otherwise → highlights the losing nominee with a red outline and, in
 *        the modal variant, shows the "EVICTED" label before calling `onDone()`
 *        after `countdownMs`.
 *   4. The TV variant is presentation-only: it hides the ballot icon, disables
 *      click-to-skip, and omits the inline "EVICTED"/countdown footer UI used
 *      by the modal presentation.
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

import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './AnimatedVoteResultsModal.css';

export interface VoteTally {
  nominee: Player;
  voteCount: number;
}

export interface PublicEvictionTiebreakDisplay {
  tiedNominees: Array<{
    nominee: Player;
    approval: number;
  }>;
  evicteeIds: string[];
  countdownMs?: number;
}

export interface AnimatedVoteResultsModalProps {
  nominees: VoteTally[];
  /** Pre-determined evictee; pass null to let the component detect ties. */
  evictee?: Player | null;
  onTiebreakerRequired?: (tiedNomineeIds: string[]) => void;
  publicTiebreak?: PublicEvictionTiebreakDisplay | null;
  onPublicTiebreakResolved?: (evicteeIds: string[]) => void;
  onDone: () => void;
  revealIntervalMs?: number;
  postRevealDelayMs?: number;
  countdownMs?: number;
  variant?: 'modal' | 'tv';
}

const MIN_BAR_PCT = 4;
const TV_RING_RADIUS = 42;
const TV_RING_CIRCUMFERENCE = 2 * Math.PI * TV_RING_RADIUS;

interface VoteRingAvatarProps {
  player: Player;
  progress: number;
  tone: 'leading' | 'trailing';
}

function VoteRingAvatar({ player, progress, tone }: VoteRingAvatarProps) {
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const dashOffset = TV_RING_CIRCUMFERENCE * (1 - clampedProgress);

  return (
    <div className={`avrm__tv-vote-ring-shell avrm__tv-vote-ring-shell--${tone}`}>
      <svg
        className="avrm__tv-vote-ring"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <circle
          className="avrm__tv-vote-ring-track"
          cx="50"
          cy="50"
          r={TV_RING_RADIUS}
        />
        <circle
          className={`avrm__tv-vote-ring-fill avrm__tv-vote-ring-fill--${tone}`}
          cx="50"
          cy="50"
          r={TV_RING_RADIUS}
          strokeDasharray={TV_RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="avrm__tv-avatar-wrap">
        <PlayerAvatar player={player} size="lg" showEvictedStyle={false} />
      </div>
    </div>
  );
}

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
  publicTiebreak = null,
  onPublicTiebreakResolved,
  onDone,
  revealIntervalMs = 700,
  postRevealDelayMs = 1000,
  countdownMs = 4000,
  variant = 'modal',
}: AnimatedVoteResultsModalProps) {
  const [revealStep, setRevealStep] = useState(0);
  const [outcomeVisible, setOutcomeVisible] = useState(false);
  const [publicTiebreakVisible, setPublicTiebreakVisible] = useState(false);
  const [countdown, setCountdown] = useState(Math.ceil(countdownMs / 1000));
  const firedRef = useRef(false);
  const publicResolvedRef = useRef(false);

  const totalVotes = useMemo(
    () => nominees.reduce((s, t) => s + t.voteCount, 0),
    [nominees],
  );
  const votesNeededForEviction = useMemo(
    () => Math.max(0, ...nominees.map((t) => t.voteCount)),
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
  const maxShownVotes = useMemo(
    () => Math.max(0, ...nominees.map((t) => displayedCounts[t.nominee.id] ?? 0)),
    [displayedCounts, nominees],
  );
  const leadingShownIds = useMemo(() => {
    if (maxShownVotes <= 0) return new Set<string>();
    const ids = nominees
      .filter((t) => (displayedCounts[t.nominee.id] ?? 0) === maxShownVotes)
      .map((t) => t.nominee.id);
    // Keep ties neutral so only a single clear leader gets the coral highlight.
    return new Set(ids.length === 1 ? ids : []);
  }, [displayedCounts, maxShownVotes, nominees]);
  const tvCommentary = useMemo(() => {
    if (publicTiebreakVisible && publicTiebreak) {
      return 'Public approval breaks the tie.';
    }
    if (allRevealed && isTied) {
      return 'It’s a tie. LOH must break the tie.';
    }
    if (outcomeVisible && resolvedEvictee) {
      return `${resolvedEvictee.name} has been eliminated.`;
    }
    if (allRevealed && resolvedEvictee) {
      return `${resolvedEvictee.name} received the most eviction votes.`;
    }
    return totalVotes > 0 ? 'Vote reveal is live.' : 'No votes were cast.';
  }, [allRevealed, isTied, outcomeVisible, publicTiebreak, publicTiebreakVisible, resolvedEvictee, totalVotes]);

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
      if (publicTiebreak) {
        setPublicTiebreakVisible(true);
        return;
      }
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

  useEffect(() => {
    if (!publicTiebreakVisible || !publicTiebreak) return;
    const id = setTimeout(() => {
      if (!publicResolvedRef.current) {
        publicResolvedRef.current = true;
        onPublicTiebreakResolved?.(publicTiebreak.evicteeIds);
      }
      fire();
    }, publicTiebreak.countdownMs ?? 2200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicTiebreakVisible, publicTiebreak, onPublicTiebreakResolved]);

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
      className={`avrm${variant === 'tv' ? ' avrm--tv' : ''}`}
      role={variant === 'tv' ? 'status' : 'dialog'}
      aria-modal={variant === 'tv' ? undefined : 'true'}
      aria-label="Vote results"
      onClick={variant === 'tv' ? undefined : (outcomeVisible ? fire : undefined)}
    >
      <div className={`avrm__card${variant === 'tv' ? ' avrm__card--tv' : ''}`}>
        <header className="avrm__header">
          {variant !== 'tv' && <span className="avrm__header-icon">🗳️</span>}
          <h2 className="avrm__title">VOTE RESULTS</h2>
          {variant === 'tv' && <span className="avrm__live-badge">LIVE FEED</span>}
        </header>

        <div className={`avrm__tallies${variant === 'tv' ? ' avrm__tallies--tv' : ''}`}>
          {nominees.map((t, index) => {
            const shown = displayedCounts[t.nominee.id] ?? 0;
            const isEvictee = resolvedEvictee?.id === t.nominee.id;
            const isPulsing = lastRevealedId === t.nominee.id;
            const pct = totalVotes > 0 ? Math.round((shown / totalVotes) * 100) : 0;
            const isLeading = outcomeVisible
              ? isEvictee
              : leadingShownIds.has(t.nominee.id);
            return (
              <Fragment key={t.nominee.id}>
                {variant === 'tv' && nominees.length === 2 && index === 1 && (
                  <div className="avrm__tv-duel-divider" aria-hidden="true">
                    <span>VS</span>
                  </div>
                )}
                <div
                  className={[
                    'avrm__tally',
                    'avrm__tally--visible',
                    variant === 'tv' ? 'avrm__tally--tv' : '',
                    nominees.length > 2 ? 'avrm__tally--tv-triple' : '',
                    isEvictee && outcomeVisible ? 'avrm__tally--evictee' : '',
                    isLeading ? 'avrm__tally--leading' : '',
                    isPulsing ? 'avrm__tally--pulse' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {variant === 'tv' ? (
                    <>
                      <VoteRingAvatar
                        player={t.nominee}
                        progress={totalVotes > 0 ? shown / totalVotes : 0}
                        tone={isLeading ? 'leading' : 'trailing'}
                      />
                      <span className="avrm__tally-name">{t.nominee.name}</span>
                      <span
                        className="avrm__tally-count"
                        aria-label={`${shown} vote${shown === 1 ? '' : 's'}`}
                      >
                        {shown}
                      </span>
                      <span className="avrm__tv-vote-share">{pct}% of votes</span>
                    </>
                  ) : (
                    <>
                      <PlayerAvatar player={t.nominee} size="sm" showEvictedStyle={false} />
                      <span className="avrm__tally-name">{t.nominee.name}</span>
                      <div className="avrm__tally-bar-wrap">
                        <div
                          className="avrm__tally-bar"
                          style={{
                            width: shown > 0
                              ? `${Math.max(
                                votesNeededForEviction > 0
                                  ? Math.round((shown / votesNeededForEviction) * 100)
                                  : 0,
                                MIN_BAR_PCT,
                              )}%`
                              : '0%',
                          }}
                        />
                      </div>
                      <span className="avrm__tally-count">{shown}</span>
                    </>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>

        {variant === 'tv' && (
          <div className="avrm__commentary avrm__commentary--tv" role="status" aria-live="polite">
            {tvCommentary}
          </div>
        )}

        {outcomeVisible && resolvedEvictee && variant !== 'tv' && (
          <div className="avrm__evictee" role="status">
            <span className="avrm__evictee-label">ELIMINATED</span>
            <span className="avrm__evictee-name">{resolvedEvictee.name}</span>
          </div>
        )}

        {outcomeVisible && variant !== 'tv' && (
          <footer className="avrm__footer">
            <span className="avrm__countdown" aria-live="polite">
              Continuing in {countdown}s&hellip;
            </span>
            <span className="avrm__skip">tap to continue</span>
          </footer>
        )}

        {allRevealed && isTied && !outcomeVisible && !publicTiebreak && (
          <div className="avrm__tie-banner" role="status" aria-live="assertive">
            <span className="avrm__tie-icon">⚖️</span>
            <span className="avrm__tie-text">It&rsquo;s a tie! LOH must break the tie.</span>
          </div>
        )}

        {publicTiebreakVisible && publicTiebreak && (
          <div className="avrm__public-tiebreak" role="status" aria-live="assertive">
            <div className="avrm__public-tiebreak-header">
              <span className="avrm__tie-icon">📉</span>
              <span className="avrm__tie-text">Public approval breaks the tie.</span>
            </div>
            <div className="avrm__public-tiebreak-options">
              {publicTiebreak.tiedNominees.map(({ nominee, approval }) => {
                const isEvictee = publicTiebreak.evicteeIds.includes(nominee.id);
                return (
                  <div
                    key={nominee.id}
                    className={[
                      'avrm__public-tiebreak-option',
                      isEvictee ? 'avrm__public-tiebreak-option--evictee' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <PlayerAvatar player={nominee} size="sm" showEvictedStyle={false} />
                    <span className="avrm__public-tiebreak-name">{nominee.name}</span>
                    <span className="avrm__public-tiebreak-approval">{approval}% approval</span>
                  </div>
                );
              })}
            </div>
            <p className="avrm__public-tiebreak-caption">
              {publicTiebreak.evicteeIds.length > 1
                ? 'The nominees with lower public approval will be eliminated.'
                : 'The nominee with lower public approval will be eliminated.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
