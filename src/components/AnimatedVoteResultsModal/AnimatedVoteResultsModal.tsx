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

import { useState, useEffect, useRef, useMemo, useLayoutEffect, type CSSProperties } from 'react';
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
const TV_SCENE_WIDTH = {
  regular: 620,
  compact: 540,
} as const;
const TV_SCENE_HEIGHT = {
  regular: 360,
  compact: 320,
  tieBannerRegular: 400,
  tieBannerCompact: 352,
  publicTiebreakRegular: 438,
  publicTiebreakCompact: 392,
} as const;

interface VoteRingAvatarProps {
  player: Player;
  progress: number;
  isEvictee: boolean;
  compact: boolean;
}

function VoteRingAvatar({ player, progress, isEvictee, compact }: VoteRingAvatarProps) {
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const dashOffset = TV_RING_CIRCUMFERENCE * (1 - clampedProgress);

  return (
    <div
      className={[
        'avrm__vote-ring-avatar',
        compact ? 'avrm__vote-ring-avatar--compact' : '',
        isEvictee ? 'avrm__vote-ring-avatar--evictee' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <svg
        className="avrm__vote-ring-svg"
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className="avrm__vote-ring-track"
          cx="50"
          cy="50"
          r={TV_RING_RADIUS}
        />
        <circle
          className="avrm__vote-ring-progress"
          cx="50"
          cy="50"
          r={TV_RING_RADIUS}
          style={{
            strokeDasharray: `${TV_RING_CIRCUMFERENCE} ${TV_RING_CIRCUMFERENCE}`,
            strokeDashoffset: dashOffset,
          }}
        />
      </svg>
      <div className="avrm__vote-ring-inner">
        <PlayerAvatar
          player={player}
          size="sm"
          showEvictedStyle={false}
          showRelationshipOutline={false}
        />
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
  const [tvSceneScale, setTvSceneScale] = useState(1);
  const [tvCompactMode, setTvCompactMode] = useState(false);
  const firedRef = useRef(false);
  const publicResolvedRef = useRef(false);
  const tvBoundaryRef = useRef<HTMLDivElement | null>(null);

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
  const tvTieBannerVisible = allRevealed && isTied && !outcomeVisible && !publicTiebreak;

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

  useLayoutEffect(() => {
    if (variant !== 'tv') return undefined;
    if (typeof window === 'undefined') return undefined;

    const boundary = tvBoundaryRef.current;
    if (!boundary) return undefined;

    const measure = () => {
      const rect = boundary.getBoundingClientRect();
      const availableWidth = rect.width;
      const availableHeight = rect.height;

      if (availableWidth <= 0 || availableHeight <= 0) {
        setTvSceneScale(1);
        setTvCompactMode(false);
        return;
      }

      const compact = availableWidth < 360 || availableHeight < 250;
      const sceneWidth = compact ? TV_SCENE_WIDTH.compact : TV_SCENE_WIDTH.regular;
      const sceneHeight = publicTiebreakVisible
        ? (compact ? TV_SCENE_HEIGHT.publicTiebreakCompact : TV_SCENE_HEIGHT.publicTiebreakRegular)
        : tvTieBannerVisible
          ? (compact ? TV_SCENE_HEIGHT.tieBannerCompact : TV_SCENE_HEIGHT.tieBannerRegular)
          : (compact ? TV_SCENE_HEIGHT.compact : TV_SCENE_HEIGHT.regular);

      const nextScale = Math.min(availableWidth / sceneWidth, availableHeight / sceneHeight, 1);

      updateTvLayout(compact, nextScale);
    };

    measure();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
          measure();
        })
        : null;

    resizeObserver?.observe(boundary);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [variant, publicTiebreakVisible, tvTieBannerVisible]);

  const tvSceneHeight = publicTiebreakVisible
    ? (tvCompactMode ? TV_SCENE_HEIGHT.publicTiebreakCompact : TV_SCENE_HEIGHT.publicTiebreakRegular)
    : tvTieBannerVisible
      ? (tvCompactMode ? TV_SCENE_HEIGHT.tieBannerCompact : TV_SCENE_HEIGHT.tieBannerRegular)
      : (tvCompactMode ? TV_SCENE_HEIGHT.compact : TV_SCENE_HEIGHT.regular);
  const tvSceneWidth = tvCompactMode ? TV_SCENE_WIDTH.compact : TV_SCENE_WIDTH.regular;
  const updateTvLayout = (compact: boolean, scale: number) => {
    setTvCompactMode((current) => (current === compact ? current : compact));
    setTvSceneScale((current) => (Math.abs(current - scale) < 0.001 ? current : scale));
  };
  const tvSceneStyle = variant === 'tv'
    ? {
      '--avrm-scene-width': `${tvSceneWidth}px`,
      '--avrm-scene-height': `${tvSceneHeight}px`,
      '--avrm-scene-scale': String(tvSceneScale),
    } as CSSProperties
    : undefined;

  const card = (
    <div className={`avrm__card${variant === 'tv' ? ' avrm__card--tv' : ''}`}>
      <header className="avrm__header">
        {variant !== 'tv' && <span className="avrm__header-icon">🗳️</span>}
        <h2 className="avrm__title">VOTE RESULTS</h2>
        {variant === 'tv' && <span className="avrm__live-badge">LIVE FEED</span>}
      </header>

      <div className="avrm__tallies">
        {nominees.map((t) => {
          const shown = displayedCounts[t.nominee.id] ?? 0;
          const isEvictee = resolvedEvictee?.id === t.nominee.id;
          const isPulsing = lastRevealedId === t.nominee.id;
          const pct = totalVotes > 0 ? Math.round((shown / totalVotes) * 100) : 0;
          const evictionProgress = votesNeededForEviction > 0 ? shown / votesNeededForEviction : 0;
          const visibleEvictionProgress = shown > 0
            ? Math.max(evictionProgress, MIN_BAR_PCT / 100)
            : 0;

          return (
            <div
              key={t.nominee.id}
              className={[
                'avrm__tally',
                'avrm__tally--visible',
                variant === 'tv' ? 'avrm__tally--tv' : '',
                isEvictee && outcomeVisible ? 'avrm__tally--evictee' : '',
                isPulsing ? 'avrm__tally--pulse' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {variant === 'tv' ? (
                <>
                  <VoteRingAvatar
                    player={t.nominee}
                    progress={visibleEvictionProgress}
                    isEvictee={isEvictee && outcomeVisible}
                    compact={tvCompactMode}
                  />
                  <span className="avrm__tally-name">{t.nominee.name}</span>
                  <div className="avrm__tv-vote-stats">
                    <span className="avrm__tally-count">{shown}</span>
                    <span className="avrm__tv-vote-caption">
                      {shown === 1 ? 'vote' : 'votes'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <PlayerAvatar player={t.nominee} size="sm" showEvictedStyle={false} />
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
                </>
              )}
            </div>
          );
        })}
      </div>

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

      {tvTieBannerVisible && (
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
  );

  return (
    <div
      className={`avrm${variant === 'tv' ? ' avrm--tv' : ''}`}
      role={variant === 'tv' ? 'status' : 'dialog'}
      aria-modal={variant === 'tv' ? undefined : 'true'}
      aria-label="Vote results"
      onClick={variant === 'tv' ? undefined : (outcomeVisible ? fire : undefined)}
    >
      {variant === 'tv' ? (
        <div ref={tvBoundaryRef} className="avrm__tv-boundary">
          <div className="avrm__tv-scale-stage">
            <div
              className={`avrm__tv-scene${tvCompactMode ? ' avrm__tv-scene--compact' : ''}`}
              style={tvSceneStyle}
            >
              {card}
            </div>
          </div>
        </div>
      ) : card}
    </div>
  );
}
