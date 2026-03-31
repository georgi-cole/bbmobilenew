/**
 * TimingBar — native React minigame component (migrated from legacy timing-bar.js).
 *
 * Round-based elimination game where players stop a moving bar as close to
 * the centre as possible and lock in their best attempt once per round.
 *
 * Supports two rendering modes:
 *  1. HOH/LOH path: receives `session` + `players`; dispatches `completeMinigame`.
 *  2. MinigameHost (challenge) path: receives `onFinish`; runs the same knockout
 *     bracket flow and calls `onFinish(totalScore)` after the final results screen.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { completeMinigame } from '../../store/gameSlice';
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types';
import {
  getRoundDurationSeconds,
  getRoundBarSpeed,
  computeRawAccuracy,
  applyAttemptPenalty,
  formatAccuracy,
  getEliminationCount,
  buildTimingRoundResult,
  buildParticipants,
  simulateRemainingRounds,
  deriveRoundSeed,
  NON_LOCKING_PENALTY_PP,
  type TimingParticipant,
  type TimingSubmission,
  type TimingRoundResult,
} from './timingBarLogic';
import {
  simulateAiRoundSubmission,
  buildAiSubmissionFn,
} from './timingBarAi';
import { getAll as getAllHouseguests, getById, findByName } from '../../data/houseguests';
import './TimingBar.css';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of AI participants in challenge (MinigameHost) mode. */
const CHALLENGE_PARTICIPANT_COUNT = 7;

/** Bar bounces back and forth: pixels per second at base speed (% of track per second). */
const BAR_BASE_SPEED_PCT_PER_S = 35;

/** Half-width of the moving bar as % of track. */
const BAR_WIDTH_PCT = 10;

const MEDALS = ['🥇', '🥈', '🥉'];

const WALL_CLOCKS = [
  { city: 'London', emoji: '🕐', cls: 'tbg__clock-item--1' },
  { city: 'Tokyo',  emoji: '🕓', cls: 'tbg__clock-item--2' },
  { city: 'New York', emoji: '🕛', cls: 'tbg__clock-item--3' },
  { city: 'Dubai', emoji: '🕔', cls: 'tbg__clock-item--4' },
  { city: 'Sydney', emoji: '🕙', cls: 'tbg__clock-item--5' },
];

// ── Game phases ────────────────────────────────────────────────────────────────

type GamePhase =
  | 'preround'       // waiting to start the first round
  | 'intro'          // round intro card (with optional timer-decrease notice)
  | 'playing'        // active round — bar is moving
  | 'locked'         // player has locked in; waiting for round to end
  | 'round_results'  // showing round leaderboard
  | 'eliminated'     // human was eliminated, choosing spectate/skip
  | 'spectating'     // AI-only simulation advancing automatically
  | 'final_results'; // game over

// ── AI profile type ────────────────────────────────────────────────────────────

/** Competition skill profile shape used to drive AI behaviour. */
type AiSkillProfile = {
  precision: number;
  nerve: number;
  clutch: number;
  chokeRisk: number;
  consistency: number;
  physical: number;
  mental: number;
  luck: number;
  overall?: number;
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  session?: MinigameSession;
  players?: Player[];
  onFinish?: (value: number, tiebreakerMs?: number) => void;
  seed?: number;
  autoStart?: boolean;
  /** Dev-only: start at a specific round number (skips preround, goes straight to intro). */
  initialRound?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isRecognizedHouseguestPlayer(player: Player): boolean {
  return !!(getById(player.id) ?? findByName(player.name));
}

function buildChallengePlayers(humanId: string, availablePlayers: Player[]): Player[] {
  const sourcePlayers = availablePlayers.filter((p) => p.status !== 'evicted');
  const resolvedSource = sourcePlayers.filter(isRecognizedHouseguestPlayer);
  const fallbackHouseguests = getAllHouseguests().map((hg) => ({
    id: hg.id,
    name: hg.name,
    avatar: '',
    status: 'active' as const,
    isUser: false,
    competitionProfile: hg.competitionProfile,
  }));

  const humanPlayer = sourcePlayers.find((p) => p.isUser)
    ?? {
      id: humanId,
      name: 'You',
      avatar: '🧑',
      status: 'active' as const,
      isUser: true,
    };

  const takenIds = new Set([humanPlayer.id]);
  const seenIds = new Set(takenIds);

  const aiPlayers = [...resolvedSource, ...fallbackHouseguests]
    .filter((p) => !p.isUser)
    .filter((p) => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    })
    .slice(0, CHALLENGE_PARTICIPANT_COUNT - 1)
    .map((p) => ({ ...p, status: 'active' as const, isUser: false }));

  return [
    { ...humanPlayer, status: 'active', isUser: true },
    ...aiPlayers,
  ];
}

function renderAvatar(participant: TimingParticipant, className: string) {
  if (participant.avatar.includes('/') || participant.avatar.startsWith('http')) {
    return (
      <img
        className={className}
        src={participant.avatar}
        alt=""
        aria-hidden="true"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return (
    <span className={`${className} tbg__entry-avatar--emoji`} aria-hidden="true">
      {participant.avatar || '🧑'}
    </span>
  );
}

function getRankDisplay(rank: number): string {
  if (rank === 1) return MEDALS[0];
  if (rank === 2) return MEDALS[1];
  if (rank === 3) return MEDALS[2];
  return `${rank}.`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TimingBar({
  session,
  players = [],
  onFinish,
  seed,
  autoStart = false,
  initialRound = 1,
}: Props) {
  const dispatch = useAppDispatch();
  const storePlayers = useAppSelector((s) => s.game.players);
  const humanId = storePlayers.find((p) => p.isUser)?.id;
  const challengeParticipantId = humanId ?? 'human';

  const challengePlayers = useMemo(
    () => buildChallengePlayers(challengeParticipantId, storePlayers),
    [challengeParticipantId, storePlayers],
  );

  const effectivePlayers = session ? players : challengePlayers;
  const effectiveSeed = session?.seed ?? seed ?? 1;
  const effectiveHumanId = session ? humanId : challengeParticipantId;
  const effectiveParticipantIds = session?.participants ?? challengePlayers.map((p) => p.id);

  /** Build TimingParticipant objects once. */
  const allParticipants = useMemo(
    () => buildParticipants(effectivePlayers, effectiveHumanId),
    [effectivePlayers, effectiveHumanId],
  );

  /** AI skill profiles keyed by participant id. */
  const aiProfileMap = useMemo(() => {
    const map: Record<string, AiSkillProfile> = {};
    effectivePlayers.forEach((p) => {
      if (!p.isUser && p.id !== effectiveHumanId) {
        map[p.id] = p.competitionProfile ?? {
          precision: 50,
          nerve: 50,
          clutch: 50,
          chokeRisk: 50,
          consistency: 50,
          physical: 50,
          mental: 50,
          luck: 50,
          overall: 50,
        };
      }
    });
    return map;
  }, [effectivePlayers, effectiveHumanId]);

  const defaultAiProfile = useMemo(() => ({
    precision: 50,
    nerve: 50,
    clutch: 50,
    chokeRisk: 50,
    consistency: 50,
    physical: 50,
    mental: 50,
    luck: 50,
    overall: 50,
  }), []);

  const aiSubmissionFn = useMemo(
    () => buildAiSubmissionFn(aiProfileMap, defaultAiProfile),
    [aiProfileMap, defaultAiProfile],
  );

  // ── Game state ─────────────────────────────────────────────────────────────

  // autoStart: skip the preround overview and go directly to the round intro.
  const [gamePhase, setGamePhase] = useState<GamePhase>(
    initialRound > 1 || autoStart ? 'intro' : 'preround',
  );
  const [roundNumber, setRoundNumber] = useState(initialRound);
  const [activeParticipantIds, setActiveParticipantIds] = useState<string[]>(
    effectiveParticipantIds,
  );

  // Bar animation state
  const [barPosition, setBarPosition] = useState(0); // 0–100
  const [barStopped, setBarStopped] = useState(false); // true during soft-stop pause
  const barDirectionRef = useRef<1 | -1>(1);
  const barPositionRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

  // Round timing
  const roundDurationSeconds = useMemo(() => getRoundDurationSeconds(roundNumber), [roundNumber]);
  const prevRoundDurationSeconds = useMemo(
    () => (roundNumber > 1 ? getRoundDurationSeconds(roundNumber - 1) : null),
    [roundNumber],
  );
  const timerDecreased = prevRoundDurationSeconds !== null
    && roundDurationSeconds < prevRoundDurationSeconds;

  const [timeRemainingMs, setTimeRemainingMs] = useState(roundDurationSeconds * 1000);
  const timeRemainingMsRef = useRef(roundDurationSeconds * 1000);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Attempt tracking
  const [softAttempts, setSoftAttempts] = useState<number[]>([]); // bar positions of soft stops
  const [lockedPosition, setLockedPosition] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const lockedPositionRef = useRef<number | null>(null);

  // Round results
  const [roundResult, setRoundResult] = useState<TimingRoundResult | null>(null);
  const [finalResults, setFinalResults] = useState<TimingRoundResult[]>([]);
  const [isSpectatorMode, setIsSpectatorMode] = useState(false);
  const [spectatorQueue, setSpectatorQueue] = useState<TimingRoundResult[]>([]);

  // Human's accumulated score (sum for averaging later; ref-only for stability)
  const humanTotalScoreRef = useRef(0);
  const humanRoundsPlayedRef = useRef(0);

  // ── Bar animation ──────────────────────────────────────────────────────────

  /**
   * Resume (or start) the bar animation from its current position.
   * Calling this when already animating is safe — the existing RAF is cancelled first.
   */
  const resumeBarAnimation = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    lastFrameTimeRef.current = null; // reset dt so first frame doesn't jump

    const speedPct = BAR_BASE_SPEED_PCT_PER_S * getRoundBarSpeed(roundNumber);

    function tick(now: number) {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = now;
      }
      const dtSeconds = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      const maxLeft = 100 - BAR_WIDTH_PCT;
      barPositionRef.current += barDirectionRef.current * speedPct * dtSeconds;

      if (barPositionRef.current >= maxLeft) {
        barPositionRef.current = maxLeft;
        barDirectionRef.current = -1;
      } else if (barPositionRef.current <= 0) {
        barPositionRef.current = 0;
        barDirectionRef.current = 1;
      }

      setBarPosition(barPositionRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [roundNumber]);

  /** Start bar from position 0 (new round). */
  const startBarAnimation = useCallback(() => {
    barPositionRef.current = 0;
    barDirectionRef.current = 1;
    setBarPosition(0);
    setBarStopped(false);
    resumeBarAnimation();
  }, [resumeBarAnimation]);

  const stopBarAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Timer ──────────────────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    // Clear any previously running interval before starting a new one.
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    timeRemainingMsRef.current = roundDurationSeconds * 1000;
    setTimeRemainingMs(roundDurationSeconds * 1000);

    const TICK_MS = 100;
    timerIntervalRef.current = setInterval(() => {
      timeRemainingMsRef.current -= TICK_MS;
      if (timeRemainingMsRef.current <= 0) {
        timeRemainingMsRef.current = 0;
        setTimeRemainingMs(0);
      } else {
        setTimeRemainingMs(timeRemainingMsRef.current);
      }
    }, TICK_MS);
  }, [roundDurationSeconds]);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // ── Timeout handler ────────────────────────────────────────────────────────

  const handleRoundTimeout = useCallback(() => {
    if (gamePhase !== 'playing') return;
    stopBarAnimation();
    stopTimer();
    setGamePhase('locked'); // show locked state briefly (0% / timeout)
    setLockedPosition(null);
    lockedPositionRef.current = null;
    setIsLocked(true);
  }, [gamePhase, stopBarAnimation, stopTimer]);

  useEffect(() => {
    if (gamePhase !== 'playing') return;
    if (timeRemainingMs <= 0) {
      const t = setTimeout(() => { handleRoundTimeout(); }, 0);
      return () => clearTimeout(t);
    }
  }, [gamePhase, handleRoundTimeout, timeRemainingMs]);

  // ── Resolve round after everyone locks / times out ─────────────────────────

  const resolveRound = useCallback(() => {
    const activeParticipants = allParticipants.filter((p) =>
      activeParticipantIds.includes(p.id),
    );

    const humanParticipant = activeParticipants.find((p) => p.isHuman);

    // Build human submission
    const submissions: TimingSubmission[] = [];

    if (humanParticipant) {
      const locked = lockedPositionRef.current;
      // Use the center of the bar (left edge + half bar width) for accuracy computation
      const lockedCenter = locked !== null ? locked + BAR_WIDTH_PCT / 2 : null;
      submissions.push({
        participantId: humanParticipant.id,
        lockedPosition: lockedCenter ?? 0,
        timeRemainingMs: locked !== null ? timeRemainingMsRef.current : 0,
        nonLockingAttempts: softAttempts.length,
        timedOut: locked === null,
      });
    }

    // Build AI submissions
    const roundSeed = deriveRoundSeed(effectiveSeed, roundNumber);
    activeParticipants
      .filter((p) => !p.isHuman)
      .forEach((p) => {
        const profile = aiProfileMap[p.id] ?? defaultAiProfile;
        submissions.push(simulateAiRoundSubmission(profile, p.id, roundNumber, roundSeed));
      });

    const result = buildTimingRoundResult({
      roundNumber,
      activeParticipants,
      submissions,
      allPlayers: effectivePlayers,
      seed: effectiveSeed,
    });

    // Accumulate human's accuracy for final average score
    const humanEntry = result.entries.find((e) => e.isHuman);
    if (humanEntry) {
      humanTotalScoreRef.current += humanEntry.finalAccuracy;
      humanRoundsPlayedRef.current += 1;
    }

    setRoundResult(result);
    setGamePhase('round_results');
  }, [
    activeParticipantIds,
    aiProfileMap,
    allParticipants,
    defaultAiProfile,
    effectivePlayers,
    effectiveSeed,
    roundNumber,
    softAttempts.length,
  ]);

  // After locking, wait briefly then resolve
  useEffect(() => {
    if (gamePhase !== 'locked') return;
    const t = setTimeout(() => {
      resolveRound();
    }, 1400);
    return () => clearTimeout(t);
  }, [gamePhase, resolveRound]);

  // ── Player actions ─────────────────────────────────────────────────────────

  /**
   * Stop the bar (soft attempt).
   * - First press: pauses the bar at its current position and records the attempt.
   * - Second press (while paused): resumes the bar so the player can try again.
   * Does not lock in the position.
   */
  const handleStop = useCallback(() => {
    if (gamePhase !== 'playing') return;

    if (!barStopped) {
      // Pause the bar and record this soft attempt position.
      stopBarAnimation();
      const pos = barPositionRef.current;
      setSoftAttempts((prev) => [...prev, pos]);
      setBarStopped(true);
    } else {
      // Resume the bar so the player can try again.
      setBarStopped(false);
      resumeBarAnimation();
    }
  }, [barStopped, gamePhase, resumeBarAnimation, stopBarAnimation]);

  /** Lock in the current bar position as the final answer. */
  const handleLockIn = useCallback(() => {
    if (gamePhase !== 'playing' || isLocked) return;
    const pos = barPositionRef.current;
    lockedPositionRef.current = pos;
    setLockedPosition(pos);
    setIsLocked(true);
    stopBarAnimation();
    stopTimer();
    setGamePhase('locked');
  }, [gamePhase, isLocked, stopBarAnimation, stopTimer]);

  /** Start the round (called from pre-round or intro). */
  const handleStartRound = useCallback(() => {
    // Reset round state
    setSoftAttempts([]);
    setLockedPosition(null);
    setIsLocked(false);
    setBarStopped(false);
    lockedPositionRef.current = null;
    barPositionRef.current = 0;
    setBarPosition(0);
    barDirectionRef.current = 1;
    lastFrameTimeRef.current = null;
    timeRemainingMsRef.current = roundDurationSeconds * 1000;
    setTimeRemainingMs(roundDurationSeconds * 1000);

    setGamePhase('playing');
    startBarAnimation();
    startTimer();
  }, [roundDurationSeconds, startBarAnimation, startTimer]);

  /** Move from pre-round to intro before round 1, or directly from pre-round. */
  const handleGoToIntro = useCallback(() => {
    setGamePhase('intro');
  }, []);

  /** Continue to next round. */
  const handleContinueToNextRound = useCallback(() => {
    if (!roundResult) return;
    const nextRound = roundResult.roundNumber + 1;
    setRoundNumber(nextRound);
    setActiveParticipantIds(roundResult.advancingIds);
    setRoundResult(null);
    setGamePhase('intro');
  }, [roundResult]);

  /** Human was eliminated — choose to keep watching. */
  const handleSpectate = useCallback(() => {
    if (!roundResult) return;
    const remaining = simulateRemainingRounds({
      activeParticipantIds: roundResult.advancingIds,
      allParticipants,
      aiSubmissionFn,
      startingRoundNumber: roundResult.roundNumber + 1,
      seed: effectiveSeed,
    });
    setFinalResults(remaining);
    setSpectatorQueue(remaining);
    setIsSpectatorMode(true);
    setActiveParticipantIds(roundResult.advancingIds);
    setGamePhase('spectating');
  }, [aiSubmissionFn, allParticipants, effectiveSeed, roundResult]);

  /** Human was eliminated — skip to final results. */
  const handleSkipToFinal = useCallback(() => {
    if (!roundResult) return;
    const remaining = simulateRemainingRounds({
      activeParticipantIds: roundResult.advancingIds,
      allParticipants,
      aiSubmissionFn,
      startingRoundNumber: roundResult.roundNumber + 1,
      seed: effectiveSeed,
    });
    setFinalResults(remaining);
    setGamePhase('final_results');
  }, [aiSubmissionFn, allParticipants, effectiveSeed, roundResult]);

  /** Done — dispatch outcome or call onFinish. */
  const handleDone = useCallback(() => {
    const allResults = [...finalResults];
    if (roundResult) allResults.push(roundResult);

    // Find the final round result for winner / last place
    const lastResult = allResults[allResults.length - 1];

    // Average accuracy across all rounds the human played (0–100 envelope).
    const averageScore = humanRoundsPlayedRef.current > 0
      ? Math.round(humanTotalScoreRef.current / humanRoundsPlayedRef.current)
      : 0;

    if (!session) {
      if (onFinish) onFinish(averageScore);
      return;
    }

    const winner = lastResult?.entries.find((e) => !e.isEliminated) ?? lastResult?.entries[0];
    const lastPlace = lastResult?.entries[lastResult.entries.length - 1];

    const payload: CompleteMinigamePayload = {
      humanScore: averageScore,
      winnerId: winner?.participantId,
      lastPlaceId: lastPlace?.participantId,
    };
    dispatch(completeMinigame(payload));
  }, [dispatch, finalResults, onFinish, roundResult, session]);

  // ── Spectator auto-advance ────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'spectating') return;
    if (spectatorQueue.length === 0) {
      const t = setTimeout(() => { setGamePhase('final_results'); }, 0);
      return () => clearTimeout(t);
    }

    const next = spectatorQueue[0];
    const t = setTimeout(() => {
      setRoundResult(next);
      setGamePhase('round_results');
    }, 2000);
    return () => clearTimeout(t);
  }, [gamePhase, spectatorQueue]);

  useEffect(() => {
    if (gamePhase !== 'round_results' || !isSpectatorMode || !roundResult) return;
    if (roundResult.isFinalRound || roundResult.eliminatedIds.length === 0) {
      const t = setTimeout(() => {
        setGamePhase('final_results');
      }, 2200);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setSpectatorQueue((prev) => prev.slice(1));
      setActiveParticipantIds(roundResult.advancingIds);
      setGamePhase('spectating');
    }, 2200);
    return () => clearTimeout(t);
  }, [gamePhase, isSpectatorMode, roundResult]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopBarAnimation();
      stopTimer();
    };
  }, [stopBarAnimation, stopTimer]);

  // ── Derived display values ─────────────────────────────────────────────────

  const timeRemainingDisplay = (timeRemainingMs / 1000).toFixed(1);
  const isTimerUrgent = timeRemainingMs <= 5000 && timeRemainingMs > 0;
  const progressPct = (timeRemainingMs / (roundDurationSeconds * 1000)) * 100;

  const activeParticipants = allParticipants.filter((p) =>
    activeParticipantIds.includes(p.id),
  );

  // Locked-in accuracy preview
  const lockedRawAccuracy = lockedPosition !== null ? computeRawAccuracy(lockedPosition + BAR_WIDTH_PCT / 2) : null;
  const lockedFinalAccuracy = lockedRawAccuracy !== null
    ? applyAttemptPenalty(lockedRawAccuracy, softAttempts.length)
    : null;


  // Whether the human player was eliminated this round
  const humanEntry = roundResult?.entries.find((e) => e.isHuman);
  const humanWasEliminated = !!humanEntry?.isEliminated;

  // Final results — collect all-time entries for display, sorted by official rank.
  const allFinalEntries = useMemo(() => {
    if (finalResults.length === 0) return [];
    const last = finalResults[finalResults.length - 1];
    // Sort by the authoritative rank (already encodes accuracy + tiebreakers).
    return [...last.entries].sort((a, b) => a.rank - b.rank);
  }, [finalResults]);

  const winnerName = allFinalEntries[0]?.name ?? roundResult?.entries[0]?.name ?? 'Unknown';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="tbg"
      role="dialog"
      aria-modal="true"
      aria-label="Timing Bar Competition"
      data-testid="timing-bar-comp"
    >
      {/* Decorative wall clocks */}
      <div className="tbg__clocks-bg" aria-hidden="true">
        {WALL_CLOCKS.map((clock) => (
          <div key={clock.city} className={`tbg__clock-item ${clock.cls}`}>
            <span className="tbg__clock-face">{clock.emoji}</span>
            <span className="tbg__clock-city">{clock.city}</span>
          </div>
        ))}
      </div>

      <div className="tbg__card">
        {/* ── Header ── */}
        <header className="tbg__header">
          <h2 className="tbg__title">⏱ Timing Bar</h2>
          <p className="tbg__subtitle">
            {isSpectatorMode
              ? '📹 Spectator mode — rounds advance automatically.'
              : 'Stop the bar at the centre and lock in your best shot.'}
          </p>
        </header>

        {/* Round + timer-decrease notice (shown in intro / playing / locked / results) */}
        {gamePhase !== 'preround' && gamePhase !== 'final_results' && (
          <div className="tbg__round-banner" aria-live="polite">
            <strong>
              Round {roundNumber} • {activeParticipants.length} players •{' '}
              {getEliminationCount(activeParticipants.length) > 0
                ? `${getEliminationCount(activeParticipants.length)} eliminated this round`
                : 'Final duel'}
            </strong>
            <span>{roundDurationSeconds}s per round</span>
          </div>
        )}

        {timerDecreased && gamePhase === 'intro' && (
          <p className="tbg__timer-notice" aria-live="assertive">
            ⚠️ Timer reduced to {roundDurationSeconds}s — lock in before time runs out!
          </p>
        )}

        {isSpectatorMode && gamePhase !== 'final_results' && (
          <p className="tbg__spectator-notice">📹 You&apos;re spectating — sit back and watch.</p>
        )}

        {/* ── Pre-round (waiting) ── */}
        {gamePhase === 'preround' && (
          <div className="tbg__preround">
            <span className="tbg__preround-icon">⏱</span>
            <h3 className="tbg__preround-title">Ready to compete?</h3>

            <ul className="tbg__preround-rules" aria-label="Game rules">
              <li>A bar bounces left and right — stop it near the centre.</li>
              <li>
                Press <strong>Lock In 🔒</strong> at any moment to freeze your score —{' '}
                no stopping required.
              </li>
              <li>
                <strong>Stop ✋</strong> is optional: it pauses the bar so you can{' '}
                inspect your position, then resume and try again.
              </li>
              <li>Each soft stop costs <strong>−{NON_LOCKING_PENALTY_PP}%</strong> accuracy. Lock In alone is free.</li>
              <li>If you don&apos;t lock in before time runs out, you score 0%.</li>
            </ul>

            <div className="tbg__players-preview" aria-label="Participants">
              {activeParticipants.map((p) => (
                <div
                  key={p.id}
                  className={`tbg__player-chip${p.isHuman ? ' tbg__player-chip--human' : ''}`}
                >
                  {renderAvatar(p, 'tbg__player-avatar')}
                  <span>{p.name}</span>
                </div>
              ))}
            </div>

            <div className="tbg__action-area" style={{ width: '100%', paddingBottom: 0 }}>
              <button
                className="tbg__btn tbg__btn--start"
                type="button"
                onClick={handleGoToIntro}
              >
                Start Round {roundNumber} ▶
              </button>
            </div>
          </div>
        )}

        {/* ── Round intro ── */}
        {gamePhase === 'intro' && (
          <div className="tbg__intro">
            <p className="tbg__intro-round-label">Get ready</p>
            <h3 className="tbg__intro-title">Round {roundNumber}</h3>

            <div className="tbg__intro-timer-chip">
              ⏱ {roundDurationSeconds} seconds
            </div>

            {timerDecreased && (
              <div className="tbg__intro-timer-reduced">
                ⚡ Timer dropped from {prevRoundDurationSeconds}s — move faster!
              </div>
            )}

            <p className="tbg__intro-hint">
              Hit <strong>Lock In 🔒</strong> directly for a penalty-free score, or use{' '}
              <strong>Stop ✋</strong> to pause and reposition (−{NON_LOCKING_PENALTY_PP}% per stop).
            </p>

            <div className="tbg__action-area" style={{ width: '100%', paddingBottom: 0 }}>
              <button
                className="tbg__btn tbg__btn--start"
                type="button"
                onClick={handleStartRound}
              >
                Begin Round {roundNumber} ▶
              </button>
            </div>
          </div>
        )}

        {/* ── Active round (playing) ── */}
        {(gamePhase === 'playing' || gamePhase === 'locked') && (
          <div className="tbg__playing">
            {/* Stats row */}
            <div className="tbg__stats-row">
              <span
                className={[
                  'tbg__timer',
                  isTimerUrgent ? 'tbg__timer--urgent' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-live={isTimerUrgent ? 'assertive' : 'off'}
                aria-atomic="true"
              >
                {timeRemainingDisplay}s
              </span>

              <div className="tbg__attempt-info">
                {softAttempts.length > 0 && (
                  <>
                    <span className="tbg__attempt-count">
                      {softAttempts.length} soft stop{softAttempts.length !== 1 ? 's' : ''}
                    </span>
                    <span className="tbg__penalty-hint">
                      −{(softAttempts.length * NON_LOCKING_PENALTY_PP).toFixed(1)}% penalty
                    </span>
                  </>
                )}
                {softAttempts.length === 0 && (
                  <span className="tbg__attempt-count">No soft stops yet</span>
                )}
              </div>
            </div>

            {/* Timer progress bar */}
            <div
              className="tbg__progress-bar"
              role="progressbar"
              aria-valuenow={timeRemainingMs}
              aria-valuemin={0}
              aria-valuemax={roundDurationSeconds * 1000}
            >
              <div
                className={[
                  'tbg__progress-fill',
                  isTimerUrgent ? 'tbg__progress-fill--urgent' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Bar track */}
            <div className="tbg__track-wrap">
              <div className="tbg__track-label">
                <span>0%</span>
                <span>Centre ◆</span>
                <span>100%</span>
              </div>

              <div
                className="tbg__track"
                role="presentation"
                aria-label="Timing bar track"
              >
                {/* Target zone highlight */}
                <div className="tbg__target-zone" aria-hidden="true" />

                {/* Centre marker */}
                <div className="tbg__center-mark" aria-hidden="true" />

                {/* Soft attempt markers */}
                {softAttempts.map((pos, i) => (
                  <div
                    key={i}
                    className="tbg__attempt-mark"
                    style={{ left: `${pos}%` }}
                    aria-hidden="true"
                  />
                ))}

                {/* Moving / locked bar */}
                <div
                  className={[
                    'tbg__bar',
                    isLocked ? 'tbg__bar--locked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ left: `${barPosition}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Locked-in banner */}
            {isLocked && lockedPosition !== null && lockedFinalAccuracy !== null && (
              <div className="tbg__locked-banner" aria-live="polite">
                <span>🔒 Locked in!</span>
                <span className="tbg__locked-accuracy">
                  {formatAccuracy(lockedFinalAccuracy)}
                </span>
                {softAttempts.length > 0 && (
                  <span style={{ fontSize: '0.72rem', color: '#86efac' }}>
                    (after −{(softAttempts.length * NON_LOCKING_PENALTY_PP).toFixed(1)}% penalty)
                  </span>
                )}
              </div>
            )}

            {isLocked && lockedPosition === null && (
              <div className="tbg__locked-banner" aria-live="polite">
                <span>⏰ Time&apos;s up — 0% this round.</span>
              </div>
            )}

            {/* Controls */}
            {!isLocked && (
              <div className="tbg__controls">
                <button
                  className={[
                    'tbg__btn',
                    barStopped ? 'tbg__btn--resume' : 'tbg__btn--stop',
                  ].join(' ')}
                  type="button"
                  onClick={handleStop}
                  aria-label={barStopped ? 'Resume the bar' : 'Stop the bar (soft attempt)'}
                >
                  {barStopped ? 'Resume ▶' : 'Stop ✋'}
                </button>
                <button
                  className="tbg__btn tbg__btn--lock"
                  type="button"
                  onClick={handleLockIn}
                  aria-label="Lock in this position as your final answer"
                >
                  Lock In 🔒
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Round results ── */}
        {gamePhase === 'round_results' && roundResult && (
          <div className="tbg__results">
            <h3 className="tbg__results-title">
              {roundResult.isFinalRound
                ? `🏆 ${winnerName} wins!`
                : roundResult.eliminatedIds.length > 0
                  ? `Round ${roundResult.roundNumber} — ${roundResult.eliminatedIds.length} player${roundResult.eliminatedIds.length > 1 ? 's' : ''} eliminated`
                  : `Round ${roundResult.roundNumber} complete`}
            </h3>

            <div className="tbg__leaderboard" role="list">
              {roundResult.entries.map((entry) => (
                <div
                  key={entry.participantId}
                  role="listitem"
                  className={[
                    'tbg__entry',
                    entry.isHuman ? 'tbg__entry--human' : '',
                    entry.isEliminated ? 'tbg__entry--eliminated' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span
                    className={[
                      'tbg__entry-rank',
                      `tbg__entry-rank--${entry.rank}`,
                    ].join(' ')}
                  >
                    {getRankDisplay(entry.rank)}
                  </span>

                  {renderAvatar(
                    {
                      id: entry.participantId,
                      name: entry.name,
                      avatar: entry.avatar,
                      isHuman: entry.isHuman,
                    },
                    'tbg__entry-avatar',
                  )}

                  <span className="tbg__entry-name">
                    {entry.name}
                    {entry.isHuman && ' (You)'}
                  </span>

                  <div className="tbg__entry-score-block">
                    <span className="tbg__entry-accuracy">
                      {formatAccuracy(entry.finalAccuracy)}
                    </span>
                    <span className="tbg__entry-meta">
                      {entry.timedOut
                        ? 'timed out'
                        : `${(entry.timeRemainingMs / 1000).toFixed(1)}s left`}
                      {entry.nonLockingAttempts > 0 && ` • ${entry.nonLockingAttempts} soft`}
                    </span>
                  </div>

                  {entry.isEliminated && (
                    <span className="tbg__entry-elim-badge">ELIMINATED</span>
                  )}
                  {entry.timedOut && !entry.isEliminated && (
                    <span className="tbg__entry-timeout-badge">TIMEOUT</span>
                  )}
                </div>
              ))}
            </div>

            {/* Action area */}
            {!isSpectatorMode && !humanWasEliminated && !roundResult.isFinalRound && (
              <div className="tbg__action-area">
                <button
                  className="tbg__btn tbg__btn--continue"
                  type="button"
                  onClick={handleContinueToNextRound}
                >
                  Continue to Round {roundResult.roundNumber + 1} ▶
                </button>
              </div>
            )}

            {!isSpectatorMode && !humanWasEliminated && roundResult.isFinalRound && (
              <div className="tbg__action-area">
                <button
                  className="tbg__btn tbg__btn--done"
                  type="button"
                  onClick={handleDone}
                >
                  See Final Results ▶
                </button>
              </div>
            )}

            {!isSpectatorMode && humanWasEliminated && (
              <div className="tbg__eliminated">
                <span className="tbg__eliminated-icon">💔</span>
                <h3 className="tbg__eliminated-title">You&apos;ve been eliminated</h3>
                <p className="tbg__eliminated-sub">
                  You scored {formatAccuracy(humanEntry?.finalAccuracy ?? 0)} this round.
                  {humanEntry?.timedOut ? " You didn't lock in before time ran out." : ''}
                </p>

                <div className="tbg__spectator-choices">
                  <button
                    className="tbg__btn tbg__btn--spectate"
                    type="button"
                    onClick={handleSpectate}
                  >
                    📹 Remain as spectator
                  </button>
                  <button
                    className="tbg__btn tbg__btn--skip"
                    type="button"
                    onClick={handleSkipToFinal}
                  >
                    ⏩ Skip to final results
                  </button>
                </div>
              </div>
            )}

            {isSpectatorMode && !roundResult.isFinalRound && (
              <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#9090a8', padding: '10px 0' }}>
                Auto-advancing to the next round…
              </p>
            )}
          </div>
        )}

        {/* ── Final results ── */}
        {gamePhase === 'final_results' && (
          <div className="tbg__final">
            <span className="tbg__final-icon">🏆</span>
            <h3 className="tbg__final-title">Timing Bar Complete!</h3>

            <div className="tbg__final-winner">
              <span className="tbg__final-winner-label">Winner</span>
              <span className="tbg__final-winner-name">
                {allFinalEntries[0]?.name ?? winnerName}
              </span>
            </div>

            {allFinalEntries.length > 0 && (
              <div className="tbg__leaderboard" role="list">
                {allFinalEntries.map((entry) => (
                  <div
                    key={entry.participantId}
                    role="listitem"
                    className={[
                      'tbg__entry',
                      entry.isHuman ? 'tbg__entry--human' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span
                      className={[
                        'tbg__entry-rank',
                        `tbg__entry-rank--${allFinalEntries.indexOf(entry) + 1}`,
                      ].join(' ')}
                    >
                      {getRankDisplay(allFinalEntries.indexOf(entry) + 1)}
                    </span>
                    {renderAvatar(
                      {
                        id: entry.participantId,
                        name: entry.name,
                        avatar: entry.avatar,
                        isHuman: entry.isHuman,
                      },
                      'tbg__entry-avatar',
                    )}
                    <span className="tbg__entry-name">
                      {entry.name}
                      {entry.isHuman && ' (You)'}
                    </span>
                    <div className="tbg__entry-score-block">
                      <span className="tbg__entry-accuracy">
                        {formatAccuracy(entry.finalAccuracy)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="tbg__action-area">
              <button
                className="tbg__btn tbg__btn--done"
                type="button"
                onClick={handleDone}
              >
                Continue ▶
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
