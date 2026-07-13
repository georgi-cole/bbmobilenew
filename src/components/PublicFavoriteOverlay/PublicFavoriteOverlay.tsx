/**
 * PublicFavoriteOverlay — full-screen "Public's Favorite Player" voting overlay.
 *
 * UX flow:
 *  1. intro            — brief live-broadcast sting over the fullscreen board
 *  2. audience_surge   — optional rewarded-ad hook that boosts temporary momentum
 *  3. live_results     — animated ranking board and timed housemate trivia spotlight
 *  4. elimination      — short tension beat when a player drops out
 *  5. final_reveal     — winner reveal card; tap to close
 *
 * Note: The core elimination cadence still comes from `useBattleBackVoting`.
 * This component keeps a single visual clock so the countdown/status copy,
 * elimination highlight, and surge duration stay synchronized with the real
 * voting state instead of spawning separate unsynced timers.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Player } from '../../types';
import { useBattleBackVoting } from '../../hooks/useBattleBackVoting';
import { resolveAvatar } from '../../utils/avatar';
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage';
import {
  buildHouseguestSpotlightItems,
  getActiveSpotlightPlayers,
  getSpotlightRotationDelayMs,
  selectSpotlightItem,
} from './publicFavoriteSpotlight';
import './PublicFavoriteOverlay.css';

interface Props {
  candidates: Player[];
  seed: number;
  awardAmount?: number;
  /** Override the elimination interval (ms). Default: 4800. Useful for QA slow-mode. */
  eliminationIntervalMs?: number;
  onComplete: (winnerId: string) => void;
  onAudienceSurgeRequest?: (playerId: string) => Promise<boolean> | boolean;
}

type Step = 'voting' | 'winner';
type PublicVotePhase =
  | 'intro'
  | 'audience_surge'
  | 'live_results'
  | 'elimination'
  | 'final_reveal';
type VoteTrend = 'up' | 'down' | 'stable';

interface SurgeState {
  playerId: string;
  startedAt: number;
  endsAt: number;
}

interface VoteEntry {
  playerId: string;
  name: string;
  avatarUrl: string;
  percent: number;
  rank: number;
  previousRank: number;
  trend: VoteTrend;
  isLeader: boolean;
  surgeActive: boolean;
}

const ELIM_INTERVAL_MS = 4800;
const VOTE_TICK_INTERVAL_MS = 750;
const VOTE_DRIFT_AMOUNT = 3;
const INTRO_MS = 1600;
const CLOCK_INTERVAL_MS = 200;
const SURGE_SELECTION_WINDOW_MS = 6500;
const SURGE_DURATION_MS = 7000;
const ELIMINATION_SPOTLIGHT_MS = 1400;
function formatEyeoleans(amount: number): string {
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(amount)} Eyeoleans`;
}

function getTrend(previousRank: number, rank: number): VoteTrend {
  if (previousRank > rank) return 'up';
  if (previousRank < rank) return 'down';
  return 'stable';
}

function clampCountdown(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

function getStatusLine(args: {
  phase: PublicVotePhase;
  countdown: number;
  eliminationName: string | null;
  surgeActive: SurgeState | null;
  surgePlayerName: string | null;
  surgePending: boolean;
  surgeWindowRemaining: number;
  nowMs: number;
}): string {
  const {
    phase,
    countdown,
    surgeActive,
    surgePlayerName,
    surgePending,
    surgeWindowRemaining,
    nowMs,
  } = args;

  if (phase === 'final_reveal') {
    return 'Public favorite locked in';
  }
  if (phase === 'intro') {
    return 'Standings are loading';
  }
  if (phase === 'elimination') {
    return 'Standings paused for elimination';
  }
  if (surgePending) {
    return 'Connecting Audience Surge';
  }
  if (surgeActive && surgePlayerName) {
    return `${surgePlayerName} has the audience boost · ${clampCountdown(
      surgeActive.endsAt - nowMs,
    )}s left`;
  }
  if (phase === 'audience_surge' && surgeWindowRemaining > 0) {
    return `Boost window closes in ${surgeWindowRemaining}s`;
  }
  return `Board refresh in ${countdown}s`;
}

function AnimatedPercent({ percent }: { percent: number }) {
  return (
    <span className="pf-overlay__percent-wrap" aria-label={`${percent}%`}>
      <span className="pf-overlay__percent-value">{percent}%</span>
    </span>
  );
}

function VoteAccentRail({ percent, tone = 'default' }: { percent: number; tone?: 'default' | 'leader' }) {
  const clampedPercent = Math.max(6, Math.min(100, percent));
  return (
    <div
      className={`pf-overlay__accent-rail${tone === 'leader' ? ' pf-overlay__accent-rail--leader' : ''}`}
      aria-hidden="true"
    >
      <span className="pf-overlay__accent-track" />
      <motion.span
        className="pf-overlay__accent-fill"
        initial={false}
        animate={{ width: `${clampedPercent}%` }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      />
      <motion.span
        className="pf-overlay__accent-pip"
        initial={false}
        animate={{ left: `calc(${clampedPercent}% - 0.45rem)` }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      />
    </div>
  );
}

function VoteTrendChip({ trend, previousRank, rank }: { trend: VoteTrend; previousRank: number; rank: number }) {
  const symbol = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '•';
  const label =
    trend === 'up'
      ? `Up from rank ${previousRank}`
      : trend === 'down'
        ? `Down from rank ${previousRank}`
        : `Holding at rank ${rank}`;

  return (
    <span className={`pf-overlay__trend pf-overlay__trend--${trend}`} aria-label={label} title={label}>
      {symbol}
    </span>
  );
}

function PlayerPortrait({
  candidate,
  className = '',
}: {
  candidate: Player;
  className?: string;
}) {
  return (
    <div className={`pf-overlay__portrait ${className}`.trim()}>
      <img
        src={resolveAvatar(candidate)}
        alt={candidate.name}
        className="pf-overlay__avatar-img"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  );
}

function PublicVoteHeader({
  title,
  subtitle,
  statusLine,
}: {
  title: string;
  subtitle: string;
  statusLine: string;
}) {
  return (
    <header className="pf-overlay__header">
      <div className="pf-overlay__header-topline">
        <span className="pf-overlay__live-badge">
          <span className="pf-overlay__live-dot" />
          LIVE
        </span>
        <p className="pf-overlay__subtitle">{subtitle}</p>
      </div>
      <div className="pf-overlay__header-copy">
        <h2 className="pf-overlay__title">{title}</h2>
        <p className="pf-overlay__status">{statusLine}</p>
      </div>
    </header>
  );
}

function PublicVoteIntro() {
  return (
    <motion.div
      className="pf-overlay__intro"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <span className="pf-overlay__intro-live">LIVE</span>
      <p className="pf-overlay__intro-title">PUBLIC FAVORITE VOTE</p>
      <p className="pf-overlay__intro-subtitle">Audience numbers are coming in. Stand by for the first live board.</p>
    </motion.div>
  );
}

function AudienceSurgePanel({
  activePlayers,
  selectedPlayerId,
  surgeActive,
  surgeUsed,
  surgePending,
  canUseSurge,
  onSelect,
  onActivate,
}: {
  activePlayers: Player[];
  selectedPlayerId: string | null;
  surgeActive: SurgeState | null;
  surgeUsed: boolean;
  surgePending: boolean;
  canUseSurge: boolean;
  onSelect: (playerId: string) => void;
  onActivate: () => void;
}) {
  const activeSurgeName = activePlayers.find((candidate) => candidate.id === surgeActive?.playerId)?.name ?? null;
  const selectedName = activePlayers.find((candidate) => candidate.id === selectedPlayerId)?.name ?? null;

  return (
    <footer className="pf-overlay__footer">
      <section className="pf-overlay__surge-panel" aria-label="Audience Surge">
        <div className="pf-overlay__surge-copy">
          <p className="pf-overlay__surge-kicker">Audience Surge</p>
          <p className="pf-overlay__surge-description">
            {surgeActive && activeSurgeName
              ? `${activeSurgeName} is getting a temporary Viewer Spotlight boost.`
              : 'Choose one eligible player and watch to give them a short burst of audience momentum.'}
          </p>
        </div>

        <div className="pf-overlay__surge-options" role="list" aria-label="Eligible players for Audience Surge">
          {activePlayers.map((candidate) => {
            const isSelected = selectedPlayerId === candidate.id;
            const isActive = surgeActive?.playerId === candidate.id;
            return (
              <div key={candidate.id} role="listitem">
                <button
                  type="button"
                  className={`pf-overlay__surge-option${isSelected ? ' pf-overlay__surge-option--selected' : ''}${isActive ? ' pf-overlay__surge-option--active' : ''}`}
                  onClick={() => onSelect(candidate.id)}
                  disabled={surgePending}
                  aria-pressed={isSelected}
                >
                  <PlayerPortrait candidate={candidate} className="pf-overlay__portrait--chip" />
                  <span className="pf-overlay__surge-option-name">{candidate.name}</span>
                  {isActive && <span className="pf-overlay__surge-option-tag">Active</span>}
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="pf-overlay__surge-cta"
          onClick={onActivate}
          disabled={!selectedPlayerId || !canUseSurge || surgePending}
        >
          {surgePending
            ? 'Connecting…'
            : surgeActive
              ? 'Audience Surge Active'
              : surgeUsed
                ? 'Audience Surge Used'
                : `Watch to Boost${selectedName ? ` ${selectedName}` : ''}`}
        </button>
      </section>
    </footer>
  );
}

function HousemateSpotlightCard({
  spotlight,
  finalTwoNames,
}: {
  spotlight: ReturnType<typeof selectSpotlightItem>;
  finalTwoNames: string | null;
}) {
  if (!spotlight) return null;
  const { item, fact } = spotlight;
  const { player } = item;

  return (
    <motion.section
      className="pf-overlay__spotlight"
      role="region"
      aria-label="Houseguest Spotlight"
      data-testid="housemate-spotlight"
      layout
    >
      <div className="pf-overlay__leader-copy">
        <p className="pf-overlay__leader-kicker">
          {finalTwoNames ? `Final two: ${finalTwoNames}` : 'Housemate Spotlight'}
        </p>
        <h3 className="pf-overlay__leader-name">{player.name}</h3>
        <motion.p
          key={`${player.id}-${fact}`}
          className="pf-overlay__spotlight-fact"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
        >
          {fact}
        </motion.p>
      </div>
      <div className="pf-overlay__leader-portrait-wrap">
        <div className="pf-overlay__leader-glow" aria-hidden="true" />
        <AnimatePresence mode="wait">
          <motion.div
            key={player.id}
            className="pf-overlay__leader-cutout-wrap"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
          >
            <FullSizeCutoutImage
              player={player}
              alt={player.name}
              className="pf-overlay__leader-avatar pf-overlay__leader-avatar--cutout"
              loading="eager"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function VoteRankingCard({
  entry,
  candidate,
  isSelected,
  onSelect,
}: {
  entry: VoteEntry;
  candidate: Player;
  isSelected: boolean;
  onSelect: (playerId: string) => void;
}) {
  return (
    <motion.button
      type="button"
      className={`pf-overlay__rank-card${entry.isLeader ? ' pf-overlay__rank-card--leader' : ''}${entry.surgeActive ? ' pf-overlay__rank-card--surge' : ''}${isSelected ? ' pf-overlay__rank-card--selected' : ''}`}
      onClick={() => onSelect(entry.playerId)}
      aria-label={`${entry.name}, rank ${entry.rank}, ${entry.percent}%`}
      layout
      transition={{ layout: { duration: 0.42, ease: 'easeOut' } }}
    >
      <span className="pf-overlay__rank-number">#{entry.rank}</span>
      <PlayerPortrait candidate={candidate} />
      <div className="pf-overlay__rank-copy">
        <div className="pf-overlay__rank-name-row">
          <span className="pf-overlay__rank-name">{entry.name}</span>
          <VoteTrendChip trend={entry.trend} previousRank={entry.previousRank} rank={entry.rank} />
        </div>
        <VoteAccentRail percent={entry.percent} tone={entry.isLeader ? 'leader' : 'default'} />
      </div>
      <div className="pf-overlay__rank-tail">
        <AnimatedPercent percent={entry.percent} />
        {entry.surgeActive ? (
          <span className="pf-overlay__rank-tag">Surge</span>
        ) : entry.isLeader ? (
          <span className="pf-overlay__rank-tag">Live lead</span>
        ) : null}
      </div>
    </motion.button>
  );
}

function VoteRankingBoard({
  entries,
  candidatesById,
  selectedPlayerId,
  onSelect,
}: {
  entries: VoteEntry[];
  candidatesById: Record<string, Player>;
  selectedPlayerId: string | null;
  onSelect: (playerId: string) => void;
}) {
  return (
    <section className="pf-overlay__board" aria-label="Public vote ranking board">
      <div className="pf-overlay__board-header">
        <p className="pf-overlay__board-title">Results board</p>
      </div>
      <div className="pf-overlay__board-list">
        {entries.map((entry) => {
          const candidate = candidatesById[entry.playerId];
          if (!candidate) return null;
          return (
            <VoteRankingCard
              key={entry.playerId}
              entry={entry}
              candidate={candidate}
              isSelected={selectedPlayerId === entry.playerId}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </section>
  );
}

function EliminationMoment({ player }: { player: Player }) {
  return (
    <motion.div
      className="pf-overlay__elimination"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      role="status"
      aria-live="polite"
    >
      <span className="pf-overlay__elimination-label">Elimination moment</span>
      <strong className="pf-overlay__elimination-name">{player.name}</strong>
      <span className="pf-overlay__elimination-copy">loses the audience and drops out.</span>
    </motion.div>
  );
}

function FinalPublicFavoriteReveal({
  winnerPlayer,
  awardAmount,
  onClose,
}: {
  winnerPlayer: Player | undefined;
  awardAmount: number;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="pf-overlay__winner-stage"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <span className="pf-overlay__winner-badge">FINAL REVEAL</span>
      <p className="pf-overlay__eyebrow">Public&apos;s Favorite Player</p>
      <div className="pf-overlay__winner-avatar-wrap" aria-hidden="true">
        <div className="pf-overlay__winner-glow" />
        {winnerPlayer ? (
          <PlayerPortrait
            candidate={winnerPlayer}
            className="pf-overlay__winner-avatar pf-overlay__winner-avatar--portrait"
          />
        ) : (
          <span className="pf-overlay__winner-fallback">🏆</span>
        )}
      </div>
      <h2 className="pf-overlay__headline">{winnerPlayer?.name ?? 'Unknown'}</h2>
      <p className="pf-overlay__winner-prize">Wins {formatEyeoleans(awardAmount)}!</p>
      <p className="pf-overlay__sub">The audience has spoken.</p>
      <button type="button" className="pf-overlay__winner-cta" onClick={onClose}>
        Continue
      </button>
    </motion.div>
  );
}

export default function PublicFavoriteOverlay({
  candidates,
  seed,
  awardAmount = 25000,
  eliminationIntervalMs = ELIM_INTERVAL_MS,
  onComplete,
  onAudienceSurgeRequest,
}: Props) {
  const [step] = useState<Step>('voting');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [mountedAt] = useState(() => Date.now());
  const [nextShiftAt, setNextShiftAt] = useState(() => Date.now() + eliminationIntervalMs);
  const [selectedSurgeId, setSelectedSurgeId] = useState<string | null>(candidates[0]?.id ?? null);
  const [introSkipBoostMs, setIntroSkipBoostMs] = useState(0);
  const [surgePending, setSurgePending] = useState(false);
  const [surgeUsed, setSurgeUsed] = useState(false);
  const [surgeActive, setSurgeActive] = useState<SurgeState | null>(null);
  const [eliminationMoment, setEliminationMoment] = useState<{ player: Player; startedAt: number } | null>(null);
  const firedRef = useRef(false);
  const surgeRequestLockRef = useRef(false);
  const previousRanksRef = useRef<Record<string, number>>({});
  const previousEliminatedCountRef = useRef(0);
  const eliminatedIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  const candidateIds = useMemo(() => candidates.map((candidate) => candidate.id), [candidates]);
  const candidatesById = useMemo(
    () => Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  );

  const { votes, eliminated, winnerId, isComplete } = useBattleBackVoting({
    candidates: candidateIds,
    seed,
    eliminationIntervalMs,
    tickIntervalMs: VOTE_TICK_INTERVAL_MS,
    driftAmount: VOTE_DRIFT_AMOUNT,
    surgeTargetId: surgeActive?.playerId ?? null,
  });
  const [spotlightRotation, setSpotlightRotation] = useState(() => {
    const firstEligibleIndex = candidates.findIndex((candidate) => !eliminated.includes(candidate.id));
    return Math.max(firstEligibleIndex, 0);
  });
  const displayStep: Step = isComplete && step === 'voting' ? 'winner' : step;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (displayStep === 'winner') return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, CLOCK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [displayStep]);

  useEffect(() => {
    if (isComplete) return;
    setNextShiftAt(Date.now() + eliminationIntervalMs);
  }, [eliminated.length, eliminationIntervalMs, isComplete]);

  useEffect(() => {
    if (eliminated.length <= previousEliminatedCountRef.current) {
      previousEliminatedCountRef.current = eliminated.length;
      return;
    }

    const eliminatedId = eliminated[eliminated.length - 1];
    const player = eliminatedId ? candidatesById[eliminatedId] : null;
    if (player) {
      setEliminationMoment({ player, startedAt: Date.now() });
    }
    previousEliminatedCountRef.current = eliminated.length;
  }, [eliminated, candidatesById]);

  useEffect(() => {
    if (!surgeActive) return;
    if (surgeActive.endsAt <= nowMs || eliminated.includes(surgeActive.playerId)) {
      setSurgeActive(null);
    }
  }, [surgeActive, nowMs, eliminated]);

  const activePlayers = useMemo(
    () => getActiveSpotlightPlayers(candidates, eliminated),
    [candidates, eliminated],
  );
  eliminatedIdsRef.current = new Set(eliminated);
  const rankedPlayers = useMemo(
    () => [...activePlayers].sort((left, right) => (votes[right.id] ?? 0) - (votes[left.id] ?? 0)),
    [activePlayers, votes],
  );
  // Keep the rotation source stable when an elimination arrives. The current
  // housemate holds their full beat, then the next timer skips eliminated IDs.
  const spotlightItems = useMemo(() => buildHouseguestSpotlightItems(candidates), [candidates]);
  const spotlight = useMemo(
    () => selectSpotlightItem(spotlightItems, spotlightRotation),
    [spotlightItems, spotlightRotation],
  );
  const spotlightPlayerId = spotlight?.item.player.id ?? null;
  const spotlightFact = spotlight?.fact ?? null;
  const finalTwoNames =
    activePlayers.length === 2
      ? `${activePlayers[0].name} vs ${activePlayers[1].name}`
      : null;

  useEffect(() => {
    if (displayStep !== 'voting' || !spotlightFact || !spotlightPlayerId) return;
    const timeoutMs = getSpotlightRotationDelayMs(spotlightFact);
    const id = window.setTimeout(() => {
      setSpotlightRotation((rotation) => {
        for (let offset = 1; offset <= spotlightItems.length; offset += 1) {
          const nextRotation = rotation + offset;
          const nextPlayerId = selectSpotlightItem(spotlightItems, nextRotation)?.item.player.id;
          if (nextPlayerId && !eliminatedIdsRef.current.has(nextPlayerId)) {
            return nextRotation;
          }
        }
        return rotation;
      });
    }, timeoutMs);
    return () => window.clearTimeout(id);
  }, [displayStep, spotlightFact, spotlightItems, spotlightPlayerId]);

  useEffect(() => {
    const firstActiveId = activePlayers[0]?.id ?? null;
    if (!firstActiveId) {
      setSelectedSurgeId(null);
      return;
    }
    if (!selectedSurgeId || eliminated.includes(selectedSurgeId)) {
      setSelectedSurgeId(firstActiveId);
    }
  }, [activePlayers, selectedSurgeId, eliminated]);

  const elapsedMs = nowMs - mountedAt + introSkipBoostMs;
  const eliminationActive =
    eliminationMoment && nowMs - eliminationMoment.startedAt < ELIMINATION_SPOTLIGHT_MS
      ? eliminationMoment
      : null;
  const surgeWindowRemaining = clampCountdown(INTRO_MS + SURGE_SELECTION_WINDOW_MS - elapsedMs);
  const canUseSurge =
    displayStep === 'voting' &&
    !isComplete &&
    !surgeUsed &&
    !surgePending &&
    elapsedMs >= INTRO_MS &&
    elapsedMs < INTRO_MS + SURGE_SELECTION_WINDOW_MS;

  const phase: PublicVotePhase =
    displayStep === 'winner'
      ? 'final_reveal'
      : elapsedMs < INTRO_MS
        ? 'intro'
        : eliminationActive
          ? 'elimination'
          : canUseSurge || surgePending || surgeActive
            ? 'audience_surge'
            : 'live_results';

  const countdown = clampCountdown(nextShiftAt - nowMs);
  const voteEntries = useMemo<VoteEntry[]>(
    () =>
      rankedPlayers.map((candidate, index) => {
        const rank = index + 1;
        const previousRank = previousRanksRef.current[candidate.id] ?? rank;
        return {
          playerId: candidate.id,
          name: candidate.name,
          avatarUrl: resolveAvatar(candidate),
          percent: votes[candidate.id] ?? 0,
          rank,
          previousRank,
          trend: getTrend(previousRank, rank),
          isLeader: rank === 1,
          surgeActive: surgeActive?.playerId === candidate.id,
        };
      }),
    [rankedPlayers, votes, surgeActive],
  );

  useEffect(() => {
    previousRanksRef.current = Object.fromEntries(
      rankedPlayers.map((candidate, index) => [candidate.id, index + 1]),
    );
  }, [rankedPlayers]);

  const winnerPlayer = candidates.find((candidate) => candidate.id === winnerId);
  const surgePlayerName = surgeActive ? candidatesById[surgeActive.playerId]?.name ?? null : null;
  const statusLine = getStatusLine({
    phase,
    countdown,
    eliminationName: eliminationActive?.player.name ?? null,
    surgeActive,
    surgePlayerName,
    surgePending,
    surgeWindowRemaining,
    nowMs,
  });

  const handleClose = useCallback(() => {
    if (firedRef.current || !winnerId) return;
    firedRef.current = true;
    onComplete(winnerId);
  }, [winnerId, onComplete]);

  const handleSkipIntro = useCallback(() => {
    if (introSkipBoostMs !== 0) return;
    const remainingIntroMs = Math.max(0, INTRO_MS - elapsedMs);
    if (remainingIntroMs === 0) return;
    setIntroSkipBoostMs(remainingIntroMs);
    setNowMs(Date.now());
  }, [elapsedMs, introSkipBoostMs]);

  const handleActivateSurge = useCallback(async () => {
    if (
      !selectedSurgeId ||
      !canUseSurge ||
      surgePending ||
      surgeUsed ||
      surgeRequestLockRef.current ||
      displayStep !== 'voting'
    ) return;

    surgeRequestLockRef.current = true;
    setSurgePending(true);
    try {
      const granted = await Promise.resolve(
        onAudienceSurgeRequest ? onAudienceSurgeRequest(selectedSurgeId) : true,
      );
      if (!mountedRef.current || !granted) return;
      const startedAt = Date.now();
      setSurgeUsed(true);
      setSurgeActive({
        playerId: selectedSurgeId,
        startedAt,
        endsAt: startedAt + SURGE_DURATION_MS,
      });
    } catch {
      // Ignore rejected ad requests and leave the CTA available.
    } finally {
      surgeRequestLockRef.current = false;
      if (mountedRef.current) {
        setSurgePending(false);
      }
    }
  }, [
    selectedSurgeId,
    canUseSurge,
    surgePending,
    surgeUsed,
    displayStep,
    onAudienceSurgeRequest,
  ]);

  return (
    <div
      className="pf-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Public's Favorite Player overlay"
    >
      <div className="pf-overlay__dim" />
      <div className="pf-overlay__studio" aria-hidden="true" />
      <div className="pf-overlay__scanlines" aria-hidden="true" />
      <div className="pf-overlay__stage">
        {displayStep === 'voting' && phase === 'intro' && (
          <button
            type="button"
            className="pf-overlay__skip"
            onClick={handleSkipIntro}
            aria-label="Skip animation"
          >
            Skip
          </button>
        )}

        {phase !== 'final_reveal' && (
          <div className="pf-overlay__announcement-slot">
            <AnimatePresence mode="wait" initial={false}>
              {eliminationActive ? (
                <EliminationMoment key={`elimination-${eliminationActive.player.id}`} player={eliminationActive.player} />
              ) : (
                <motion.div key="public-vote-header" className="pf-overlay__announcement-panel">
                  <PublicVoteHeader
                    title="PUBLIC FAVORITE PLAYER"
                    subtitle="Live public vote"
                    statusLine={statusLine}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {displayStep === 'voting' && (
          <div className="pf-overlay__broadcast">
            <div className={`pf-overlay__board-shell pf-overlay__board-shell--${phase}`}>
              <HousemateSpotlightCard spotlight={spotlight} finalTwoNames={finalTwoNames} />
              <VoteRankingBoard
                entries={voteEntries}
                candidatesById={candidatesById}
                selectedPlayerId={selectedSurgeId}
                onSelect={setSelectedSurgeId}
              />
            </div>

            <AudienceSurgePanel
              activePlayers={activePlayers}
              selectedPlayerId={selectedSurgeId}
              surgeActive={surgeActive}
              surgeUsed={surgeUsed}
              surgePending={surgePending}
              canUseSurge={canUseSurge}
              onSelect={setSelectedSurgeId}
              onActivate={handleActivateSurge}
            />
            <AnimatePresence>{phase === 'intro' && <PublicVoteIntro />}</AnimatePresence>
          </div>
        )}

        {displayStep === 'winner' && (
          <FinalPublicFavoriteReveal
            winnerPlayer={winnerPlayer}
            awardAmount={awardAmount}
            onClose={handleClose}
          />
        )}
      </div>
    </div>
  );
}
