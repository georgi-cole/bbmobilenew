/**
 * BullseyeBlitz — native React minigame component (migrated from legacy targetPractice).
 *
 * Supports two rendering modes:
 *  1. HOH/LOH path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload`
 *     (humanScore + winnerId + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `onFinish`; runs the same knockout
 *     bracket flow and calls `onFinish(totalScore)` after the final results screen.
 *
 * Gameplay — "Bullseye Blitz":
 *  - HOH/LOH mode now runs as a knockout bracket with progressively harder rounds.
 *  - Standalone / MinigameHost mode still runs as a multiplayer knockout bracket,
 *    even when the player is the only human participant.
 *  - Canonical scoring: sum of all scored hits (including penalties)
 *  - Canonical last-place: lowest overall finisher from the knockout bracket
 */

import type { CSSProperties } from 'react';
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
  TARGET_CONFIGS,
  buildRankedLeaderboard,
  getBullseyeEliminationCount,
  getBullseyeRoundConfig,
  pickTargetKind,
  simulateBullseyeAiRoundScore,
} from './bullseyeBlitzUtils';
import type {
  BullseyeRoundConfig,
  ScoreEntry,
  TargetKind,
} from './bullseyeBlitzUtils';
import { resolveHybridAiScores } from '../../ai/competition/hybridScoreResolver';
import './BullseyeBlitz.css';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Ready countdown start value. */
const READY_COUNT = 3;

const MEDALS = ['🥇', '🥈', '🥉'];
const EMPTY_HITS = { standard: 0, bonus: 0, hazard: 0 };
const EMPTY_PLAYERS: Player[] = [];
const FINAL_SHOWDOWN_THRESHOLD = 2;
const SPECTATOR_ROUND_DELAY_MS = 2200;
const SPECTATOR_RESULTS_DELAY_MS = 2400;
const READY_TICK_MS = 1000;
const READY_GO_MS = 200;
const CHALLENGE_PARTICIPANT_COUNT = 7;
const CHALLENGE_AI_BASELINE_SCORE = -100;

// ── Internal target state ─────────────────────────────────────────────────────

interface ActiveTarget {
  id: number;
  kind: TargetKind;
  /** Left position as % of container width. */
  x: number;
  /** Top position as % of container height. */
  y: number;
  /** Unix ms when spawned. */
  spawnedAt: number;
  /** How long this target lives. */
  lifetimeMs: number;
}

interface RoundOutcome {
  roundNumber: number;
  activeParticipantIds: string[];
  rankedScores: ScoreEntry[];
  advancingIds: string[];
  eliminatedIds: string[];
  eliminatedEntries: ScoreEntry[];
  isFinal: boolean;
}

interface SpectatorPlan {
  rounds: RoundOutcome[];
  currentIndex: number;
}

type GamePhase = 'ready' | 'playing' | 'round_results' | 'spectating' | 'final_results';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** HOH/LOH minigame path: full session data. */
  session?: MinigameSession;
  /** HOH/LOH minigame path: all game players (for name lookup). */
  players?: Player[];
  /** MinigameHost path: called with the human's final cumulative score. */
  onFinish?: (value: number) => void;
  /** MinigameHost path: competition seed (reserved for future seeded RNG). */
  seed?: number;
  /** MinigameHost path: when true, skip the ready countdown delay. */
  autoStart?: boolean;
}

function formatNameList(entries: ScoreEntry[]): string {
  const names = entries.map((entry) => (entry.isHuman && entry.name !== 'You' ? `${entry.name} (You)` : entry.name));
  if (names.length === 0) return 'Nobody';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function formatHazardPenaltyDisplay(hazardPenalty: number): string {
  return `💣 ${hazardPenalty}`;
}

function getTargetAriaLabel(kind: TargetKind, config: BullseyeRoundConfig): string {
  if (kind === 'hazard') {
    return `Hazard! Minus ${Math.abs(config.hazardPenalty)} points if tapped`;
  }
  return TARGET_CONFIGS[kind].label;
}

function buildNextRoundPreview(roundNumber: number): string[] {
  const currentConfig = getBullseyeRoundConfig(roundNumber);
  const nextConfig = getBullseyeRoundConfig(roundNumber + 1);
  const preview: string[] = [];

  if (nextConfig.spawnIntervalMs < currentConfig.spawnIntervalMs) {
    preview.push(`Targets spawn ${currentConfig.spawnIntervalMs - nextConfig.spawnIntervalMs}ms faster.`);
  }
  if (nextConfig.targetWeights.hazard > currentConfig.targetWeights.hazard) {
    preview.push(`Hazards rise to ${Math.round(nextConfig.targetWeights.hazard * 100)}% of spawns.`);
  }
  if (nextConfig.hazardPenalty < currentConfig.hazardPenalty) {
    preview.push(`Bomb taps drop to ${nextConfig.hazardPenalty} pts.`);
  }

  return preview;
}

function buildFinalStandings(finalists: ScoreEntry[], eliminationHistory: ScoreEntry[][]): ScoreEntry[] {
  const seen = new Set<string>();
  return [...finalists, ...[...eliminationHistory].reverse().flat()].filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function buildRoundOutcome(params: {
  activeParticipantIds: string[];
  aiScores: Record<string, number>;
  humanId?: string;
  humanScore?: number;
  humanHits?: { standard: number; bonus: number; hazard: number };
  players: Player[];
  roundNumber: number;
  seed: number;
}): RoundOutcome {
  const {
    activeParticipantIds,
    aiScores,
    humanId,
    humanScore,
    humanHits,
    players,
    roundNumber,
    seed,
  } = params;

  const roundScores: Record<string, number> = {};
  activeParticipantIds.forEach((id) => {
    if (humanId && id === humanId && typeof humanScore === 'number') {
      roundScores[id] = humanScore;
      return;
    }
    roundScores[id] = simulateBullseyeAiRoundScore(aiScores[id] ?? 0, roundNumber, seed, id);
  });

  const rankedScores = buildRankedLeaderboard(
    activeParticipantIds,
    roundScores,
    humanId,
    players,
    humanHits,
  );

  if (activeParticipantIds.length <= 1) {
    return {
      roundNumber,
      activeParticipantIds,
      rankedScores,
      advancingIds: rankedScores.slice(0, 1).map((entry) => entry.id),
      eliminatedIds: [],
      eliminatedEntries: [],
      isFinal: true,
    };
  }

  const eliminationCount = getBullseyeEliminationCount(activeParticipantIds.length);
  const survivingCount = rankedScores.length - eliminationCount;
  const isFinal = survivingCount <= 1;

  return {
    roundNumber,
    activeParticipantIds,
    rankedScores,
    advancingIds: rankedScores.slice(0, survivingCount).map((entry) => entry.id),
    eliminatedIds: rankedScores.slice(survivingCount).map((entry) => entry.id),
    eliminatedEntries: rankedScores.slice(survivingCount),
    isFinal,
  };
}

function simulateRemainingRounds(params: {
  activeParticipantIds: string[];
  aiScores: Record<string, number>;
  players: Player[];
  roundNumber: number;
  seed: number;
  eliminationHistory: ScoreEntry[][];
}): { rounds: RoundOutcome[]; finalStandings: ScoreEntry[] } {
  const { aiScores, players, seed } = params;
  let activeParticipantIds = [...params.activeParticipantIds];
  let roundNumber = params.roundNumber;
  const eliminationHistory = [...params.eliminationHistory];
  const rounds: RoundOutcome[] = [];

  while (activeParticipantIds.length >= 2) {
    const outcome = buildRoundOutcome({
      activeParticipantIds,
      aiScores,
      players,
      roundNumber,
      seed,
    });
    rounds.push(outcome);

    if (outcome.isFinal) {
      return {
        rounds,
        finalStandings: buildFinalStandings(outcome.rankedScores, eliminationHistory),
      };
    }

    eliminationHistory.push(outcome.eliminatedEntries);
    activeParticipantIds = outcome.advancingIds;
    roundNumber += 1;
  }

  return { rounds, finalStandings: [] };
}

function buildRoundBanner(config: BullseyeRoundConfig, activeCount: number, isFinalRound: boolean): string {
  if (activeCount <= 1) {
    return `Round ${config.roundNumber} • Championship result`;
  }
  if (isFinalRound) {
    return `Round ${config.roundNumber} • Final duel • Winner takes the challenge`;
  }

  const eliminated = getBullseyeEliminationCount(activeCount);
  return `Round ${config.roundNumber} • ${activeCount} players • ${eliminated} eliminated`;
}

function getDisplayedRoundNumber(params: {
  spectatorRound: RoundOutcome | null;
  roundOutcome: RoundOutcome | null;
  gamePhase: GamePhase;
  roundNumber: number;
}): number | null {
  const {
    spectatorRound,
    roundOutcome,
    gamePhase,
    roundNumber,
  } = params;

  if (spectatorRound) return spectatorRound.roundNumber;
  if (roundOutcome) return roundOutcome.roundNumber;
  if (gamePhase === 'final_results') return null;
  return roundNumber;
}

function getReadyHintText(activeCount: number): string {
  if (activeCount <= FINAL_SHOWDOWN_THRESHOLD) {
    return 'Final showdown — the highest score wins it all.';
  }
  return `${getBullseyeEliminationCount(activeCount)} players will be cut this round.`;
}

function buildChallengePlayers(humanId: string): Player[] {
  return [
    { id: humanId, name: 'You', avatar: '🧑', status: 'active', isUser: true },
    ...Array.from({ length: CHALLENGE_PARTICIPANT_COUNT - 1 }, (_, index) => ({
      id: `challenge-ai-${index + 1}`,
      name: `Player ${index + 1}`,
      avatar: '🧑',
      status: 'active' as const,
      isUser: false,
    })),
  ];
}

function appendRoundEliminations(
  eliminationHistory: ScoreEntry[][],
  roundOutcome: RoundOutcome,
): ScoreEntry[][] {
  if (roundOutcome.isFinal || roundOutcome.eliminatedEntries.length === 0) {
    return eliminationHistory;
  }
  const lastEliminationBatch = eliminationHistory[eliminationHistory.length - 1];
  if (
    lastEliminationBatch?.length === roundOutcome.eliminatedEntries.length
    && lastEliminationBatch.every((entry, index) => entry.id === roundOutcome.eliminatedEntries[index]?.id)
  ) {
    return eliminationHistory;
  }
  return [...eliminationHistory, roundOutcome.eliminatedEntries];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BullseyeBlitz({
  session,
  players = EMPTY_PLAYERS,
  onFinish,
  seed,
  autoStart = false,
}: Props) {
  const dispatch = useAppDispatch();
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id);
  const challengeParticipantId = humanId ?? 'human';
  const challengePlayers = useMemo(
    () => buildChallengePlayers(challengeParticipantId),
    [challengeParticipantId],
  );
  const effectivePlayers = session ? players : challengePlayers;
  const effectiveParticipantIds = session?.participants ?? challengePlayers.map((player) => player.id);
  const effectiveSeed = session?.seed ?? seed ?? 1;
  const effectiveHumanId = session ? humanId : challengeParticipantId;
  const isKnockoutMode = effectiveParticipantIds.length > 1;
  const challengeAiScores = useMemo(
    () => Object.fromEntries(
      challengePlayers
        .filter((player) => !player.isUser)
        .map((player) => [player.id, CHALLENGE_AI_BASELINE_SCORE]),
    ),
    [challengePlayers],
  );
  const [autoStartEnabled] = useState(autoStart);
  const initialRoundConfig = getBullseyeRoundConfig(1);

  const [roundNumber, setRoundNumber] = useState(1);
  const [activeParticipantIds, setActiveParticipantIds] = useState<string[]>(
    effectiveParticipantIds,
  );
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [countdown, setCountdown] = useState(autoStartEnabled ? 0 : READY_COUNT);
  const [timeLeft, setTimeLeft] = useState(initialRoundConfig.durationSeconds);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [score, setScore] = useState(0);
  const [targets, setTargets] = useState<ActiveTarget[]>([]);
  const [hits, setHits] = useState(EMPTY_HITS);
  const [popEffects, setPopEffects] = useState<{ id: number; emoji: string; x: number; y: number; kind: TargetKind }[]>([]);
  const [rankedScores, setRankedScores] = useState<ScoreEntry[]>([]);
  const [roundOutcome, setRoundOutcome] = useState<RoundOutcome | null>(null);
  const [finalStandings, setFinalStandings] = useState<ScoreEntry[]>([]);
  const [eliminationHistory, setEliminationHistory] = useState<ScoreEntry[][]>([]);
  const [spectatorPlan, setSpectatorPlan] = useState<SpectatorPlan | null>(null);
  const [isSpectatorMode, setIsSpectatorMode] = useState(false);
  const [tournamentScoreTotal, setTournamentScoreTotal] = useState(0);

  const currentRoundConfig = useMemo(() => getBullseyeRoundConfig(roundNumber), [roundNumber]);

  // Stable refs for values accessed in intervals/callbacks
  const scoreRef = useRef(0);
  const hitsRef = useRef(EMPTY_HITS);
  const targetIdRef = useRef(0);
  const popIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  /**
   * Cached hybrid-resolved AI scores, computed once when the human finishes
   * round 1 of the tournament.  Stored in a ref so every subsequent round and
   * the "skip / keep watching" simulation paths all use the same per-player
   * baseline — keeping the displayed leaderboards consistent with the Redux
   * outcome that `completeMinigame` will derive.
   */
  const resolvedAiScoresRef = useRef<Record<string, number> | null>(null);

  const clearPopTimeouts = useCallback(() => {
    popTimeoutsRef.current.forEach(clearTimeout);
    popTimeoutsRef.current = [];
  }, []);

  const clearRoundTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnRef.current) clearInterval(spawnRef.current);
    if (expireRef.current) clearInterval(expireRef.current);
  }, []);

  const resetRoundState = useCallback((nextRoundNumber: number) => {
    const nextConfig = getBullseyeRoundConfig(nextRoundNumber);
    clearRoundTimers();
    clearPopTimeouts();
    scoreRef.current = 0;
    hitsRef.current = EMPTY_HITS;
    setScore(0);
    setHits(EMPTY_HITS);
    setTargets([]);
    setPopEffects([]);
    setTimeLeft(nextConfig.durationSeconds);
    setNowMs(Date.now());
    setCountdown(autoStartEnabled ? 0 : READY_COUNT);
  }, [autoStartEnabled, clearPopTimeouts, clearRoundTimers]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearRoundTimers();
      clearPopTimeouts();
    };
  }, [clearPopTimeouts, clearRoundTimers]);

  // ── Ready countdown ────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'ready') return;
    const delay = countdown <= 0 ? READY_GO_MS : READY_TICK_MS;
    const t = setTimeout(() => {
      if (countdown <= 0) {
        setGamePhase('playing');
        return;
      }
      setCountdown((c) => c - 1);
    }, delay);
    return () => clearTimeout(t);
  }, [countdown, gamePhase]);

  const finishGame = useCallback(() => {
    clearRoundTimers();
    clearPopTimeouts();
    setTargets([]);

    const humanFinalScore = scoreRef.current;
    const humanFinalHits = { ...hitsRef.current };

    // HOH/LOH tournament path.
    // For hybrid sessions, resolve per-player AI base scores once (round 1 only),
    // using the cumulative total that will ultimately be dispatched to the store.
    // `tournamentScoreTotal` at this point holds all previous rounds' scores;
    // adding `humanFinalScore` gives the same value that `handleDone` will pass
    // to `completeMinigame` as `humanScore`.
    if (session?.hybridResolveOnComplete && resolvedAiScoresRef.current === null) {
      const finalTotal = tournamentScoreTotal + humanFinalScore;
      const aiParticipants = session.participants
        .filter((id) => id !== humanId)
        .map((id) => {
          const p = players.find((pl) => pl.id === id);
          return { id, profile: p?.competitionProfile };
        });
      resolvedAiScoresRef.current = resolveHybridAiScores({
        gameKey: session.key,
        humanScore: finalTotal,
        aiParticipants,
        seed: session.seed,
      });
    }

    // Use the hybrid-resolved scores when available; fall back to precomputed
    // session scores for non-hybrid (legacy / endurance) sessions.
    const effectiveAiScores = session
      ? resolvedAiScoresRef.current ?? session.aiScores
      : challengeAiScores;

    const outcome = buildRoundOutcome({
      activeParticipantIds,
      aiScores: effectiveAiScores,
      humanId: effectiveHumanId,
      humanScore: humanFinalScore,
      humanHits: humanFinalHits,
      players: effectivePlayers,
      roundNumber,
      seed: effectiveSeed,
    });

    setTournamentScoreTotal((prev) => prev + humanFinalScore);
    setRoundOutcome(outcome);
    setRankedScores(outcome.rankedScores);

    if (outcome.isFinal) {
      setFinalStandings(buildFinalStandings(outcome.rankedScores, eliminationHistory));
      setGamePhase('final_results');
      return;
    }

    setEliminationHistory((prev) => [...prev, outcome.eliminatedEntries]);
    setGamePhase('round_results');
  }, [
    activeParticipantIds,
    challengeAiScores,
    clearPopTimeouts,
    clearRoundTimers,
    eliminationHistory,
    effectiveHumanId,
    effectivePlayers,
    effectiveSeed,
    humanId,
    players,
    roundNumber,
    session,
    tournamentScoreTotal,
  ]);

  // ── Playing — game timer ───────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    timerRef.current = setInterval(() => {
      setNowMs(Date.now());
      setTimeLeft((prev) => {
        const next = Math.round((prev - 0.1) * 10) / 10;
        if (next <= 0) {
          finishGame();
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [finishGame, gamePhase]);

  // ── Playing — target spawner ───────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    spawnRef.current = setInterval(() => {
      setTargets((prev) => {
        if (prev.length >= currentRoundConfig.maxTargets) return prev;
        targetIdRef.current += 1;
        const kind = pickTargetKind(Math.random(), currentRoundConfig.targetWeights);
        const newTarget: ActiveTarget = {
          id: targetIdRef.current,
          kind,
          x: 5 + Math.random() * 82,
          y: 5 + Math.random() * 82,
          spawnedAt: Date.now(),
          lifetimeMs: currentRoundConfig.targetLifetimes[kind],
        };
        return [...prev, newTarget];
      });
    }, currentRoundConfig.spawnIntervalMs);

    return () => {
      if (spawnRef.current) clearInterval(spawnRef.current);
    };
  }, [currentRoundConfig.maxTargets, currentRoundConfig.spawnIntervalMs, currentRoundConfig.targetLifetimes, currentRoundConfig.targetWeights, gamePhase]);

  // ── Playing — target expiry ────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return;

    expireRef.current = setInterval(() => {
      const now = Date.now();
      setTargets((prev) => prev.filter((t) => now - t.spawnedAt < t.lifetimeMs));
    }, 150);

    return () => {
      if (expireRef.current) clearInterval(expireRef.current);
    };
  }, [gamePhase]);

  useEffect(() => {
    if (gamePhase !== 'spectating' || !spectatorPlan) return;
    const upcomingRound = spectatorPlan.rounds[spectatorPlan.currentIndex];
    const t = setTimeout(() => {
      if (!upcomingRound) {
        setGamePhase('final_results');
        return;
      }
      setRoundOutcome(upcomingRound);
      setRankedScores(upcomingRound.rankedScores);
      setGamePhase('round_results');
    }, upcomingRound ? SPECTATOR_ROUND_DELAY_MS : 0);

    return () => clearTimeout(t);
  }, [gamePhase, spectatorPlan]);

  useEffect(() => {
    if (gamePhase !== 'round_results' || !isSpectatorMode || !roundOutcome) return;

    const t = setTimeout(() => {
      if (roundOutcome.isFinal) {
        setGamePhase('final_results');
        return;
      }

      setActiveParticipantIds(roundOutcome.advancingIds);
      if (spectatorPlan) {
        setSpectatorPlan({
          ...spectatorPlan,
          currentIndex: spectatorPlan.currentIndex + 1,
        });
      }
      setGamePhase('spectating');
    }, SPECTATOR_RESULTS_DELAY_MS);

    return () => clearTimeout(t);
  }, [gamePhase, isSpectatorMode, roundOutcome, spectatorPlan]);

  // ── Tap handler ────────────────────────────────────────────────────────────

  const handleTargetTap = useCallback(
    (target: ActiveTarget) => {
      if (gamePhase !== 'playing') return;

      const cfg = TARGET_CONFIGS[target.kind];
      const points = target.kind === 'hazard' ? currentRoundConfig.hazardPenalty : cfg.points;

      scoreRef.current += points;
      setScore(scoreRef.current);

      hitsRef.current = {
        ...hitsRef.current,
        [target.kind]: hitsRef.current[target.kind] + 1,
      };
      setHits({ ...hitsRef.current });

      popIdRef.current += 1;
      const popId = popIdRef.current;
      setPopEffects((prev) => [
        ...prev.slice(-12),
        { id: popId, emoji: cfg.emoji, x: target.x, y: target.y, kind: target.kind },
      ]);
      const tId = setTimeout(() => {
        setPopEffects((prev) => prev.filter((p) => p.id !== popId));
      }, 600);
      popTimeoutsRef.current.push(tId);

      setTargets((prev) => prev.filter((t) => t.id !== target.id));
    },
    [currentRoundConfig.hazardPenalty, gamePhase],
  );

  // ── Round / completion handlers ─────────────────────────────────────────────

  const handleContinueRound = useCallback(() => {
    if (!roundOutcome) return;
    const nextRoundNumber = roundOutcome.roundNumber + 1;
    resetRoundState(nextRoundNumber);
    setRoundOutcome(null);
    setRankedScores([]);
    setActiveParticipantIds(roundOutcome.advancingIds);
    setRoundNumber(nextRoundNumber);
    setGamePhase('ready');
  }, [resetRoundState, roundOutcome]);

  const handleSkipToFinal = useCallback(() => {
    if (!roundOutcome) return;
    const simulation = simulateRemainingRounds({
      activeParticipantIds: roundOutcome.advancingIds,
      aiScores: session ? resolvedAiScoresRef.current ?? session.aiScores : challengeAiScores,
      players: effectivePlayers,
      roundNumber: roundOutcome.roundNumber + 1,
      seed: effectiveSeed,
      eliminationHistory: appendRoundEliminations(eliminationHistory, roundOutcome),
    });
    setFinalStandings(simulation.finalStandings);
    setGamePhase('final_results');
  }, [challengeAiScores, effectivePlayers, effectiveSeed, eliminationHistory, roundOutcome, session]);

  const handleKeepWatching = useCallback(() => {
    if (!roundOutcome) return;
    const simulation = simulateRemainingRounds({
      activeParticipantIds: roundOutcome.advancingIds,
      aiScores: session ? resolvedAiScoresRef.current ?? session.aiScores : challengeAiScores,
      players: effectivePlayers,
      roundNumber: roundOutcome.roundNumber + 1,
      seed: effectiveSeed,
      eliminationHistory: appendRoundEliminations(eliminationHistory, roundOutcome),
    });

    setIsSpectatorMode(true);
    setFinalStandings(simulation.finalStandings);
    setSpectatorPlan({ rounds: simulation.rounds, currentIndex: 0 });
    setActiveParticipantIds(roundOutcome.advancingIds);
    setGamePhase('spectating');
  }, [challengeAiScores, effectivePlayers, effectiveSeed, eliminationHistory, roundOutcome, session]);

  const handleDone = useCallback(() => {
    if (!session) {
      if (onFinish) onFinish(tournamentScoreTotal);
      return;
    }
    const resolvedStandings = finalStandings.length > 0 ? finalStandings : rankedScores;
    const payload: CompleteMinigamePayload = {
      humanScore: tournamentScoreTotal,
      winnerId: resolvedStandings[0]?.id,
      lastPlaceId: resolvedStandings[resolvedStandings.length - 1]?.id,
    };
    dispatch(completeMinigame(payload));
  }, [dispatch, finalStandings, onFinish, rankedScores, session, tournamentScoreTotal]);

  // ── Derived UI ─────────────────────────────────────────────────────────────

  const progressPct = (timeLeft / currentRoundConfig.durationSeconds) * 100;
  const isUrgent = timeLeft <= 5;
  const now = nowMs;
  const activeCount = activeParticipantIds.length;
  const headerSubtitle = isKnockoutMode
    ? gamePhase === 'spectating'
      ? '📹 Spectator mode — the remaining rounds advance automatically.'
      : 'Survive each knockout round as the arena gets tougher.'
    : 'Clear every round and build the highest cumulative score you can.';
  // Used both for spectator-mode rendering and for keeping the round banner in
  // sync with the currently displayed tournament phase.
  const spectatorRound = spectatorPlan ? spectatorPlan.rounds[spectatorPlan.currentIndex] : null;
  const displayedRoundNumber = getDisplayedRoundNumber({
    spectatorRound,
    roundOutcome,
    gamePhase,
    roundNumber,
  });
  const displayedRoundConfig = displayedRoundNumber != null
    ? getBullseyeRoundConfig(displayedRoundNumber)
    : null;
  const displayedActiveCount =
    spectatorRound?.activeParticipantIds.length
    ?? roundOutcome?.activeParticipantIds.length
    ?? activeCount;
  const roundBanner = displayedRoundConfig
    ? buildRoundBanner(
      displayedRoundConfig,
      displayedActiveCount,
      displayedActiveCount <= FINAL_SHOWDOWN_THRESHOLD,
    )
    : null;
  const showRoundBanner = displayedRoundConfig != null && roundBanner != null;
  const currentHumanEntry = roundOutcome?.rankedScores.find((entry) => entry.isHuman)
    ?? finalStandings.find((entry) => entry.isHuman)
    ?? rankedScores.find((entry) => entry.isHuman);
  const humanWasEliminated = !!roundOutcome
    && !!effectiveHumanId
    && roundOutcome.eliminatedIds.includes(effectiveHumanId);
  const advancingEntries = roundOutcome
    ? roundOutcome.rankedScores.filter((entry) => roundOutcome.advancingIds.includes(entry.id))
    : [];
  const nextRoundConfig = roundOutcome && !roundOutcome.isFinal
    ? getBullseyeRoundConfig(roundOutcome.roundNumber + 1)
    : null;
  const nextRoundPreview = roundOutcome && !roundOutcome.isFinal
    ? buildNextRoundPreview(roundOutcome.roundNumber)
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="bbl"
      role="dialog"
      aria-modal="true"
      aria-label="Bullseye Blitz Competition"
      data-testid="bullseye-blitz-comp"
    >
      <div className="bbl__card">
        <header className="bbl__header">
          <h2 className="bbl__title">🎯 Bullseye Blitz</h2>
          <p className="bbl__subtitle">{headerSubtitle}</p>
        </header>

        <div className="bbl__legend" aria-label="Target legend">
          <span className="bbl__legend-item bbl__legend-item--standard">🎯 +10</span>
          <span className="bbl__legend-item bbl__legend-item--bonus">⭐ +25</span>
          <span className="bbl__legend-item bbl__legend-item--hazard">{formatHazardPenaltyDisplay(currentRoundConfig.hazardPenalty)}</span>
        </div>

        {showRoundBanner && (
          <div className="bbl__round-banner" aria-live="polite">
            <strong>{roundBanner}</strong>
            <span>{displayedRoundConfig.difficultyLabel}</span>
          </div>
        )}

        {gamePhase === 'ready' && (
          <div className="bbl__ready">
            <span className="bbl__countdown" aria-live="assertive">
              {countdown === 0 ? 'GO!' : countdown}
            </span>
              <p className="bbl__hint">{getReadyHintText(activeCount)}</p>
          </div>
        )}

        {gamePhase === 'playing' && (
          <div className="bbl__playing">
            <div className="bbl__stats">
              <div className="bbl__score-block">
                <span
                  className="bbl__score-value"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {score}
                </span>
                <span className="bbl__score-label">pts</span>
              </div>
              <span
                className={[
                  'bbl__time',
                  isUrgent ? 'bbl__time--urgent' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-live={isUrgent ? 'assertive' : 'off'}
                aria-atomic="true"
              >
                {timeLeft.toFixed(1)}s
              </span>
            </div>

            <div
              className="bbl__progress-bar"
              role="progressbar"
              aria-valuenow={timeLeft}
              aria-valuemin={0}
              aria-valuemax={currentRoundConfig.durationSeconds}
            >
              <div
                className="bbl__progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="bbl__arena" aria-label="Target arena">
              <div className="bbl__pops" aria-hidden="true">
                {popEffects.map((p) => (
                  <span
                    key={p.id}
                    className={['bbl__pop', `bbl__pop--${p.kind}`].join(' ')}
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    aria-hidden="true"
                  >
                    {p.emoji}
                  </span>
                ))}
              </div>

              {targets.map((t) => {
                const cfg = TARGET_CONFIGS[t.kind];
                const age = now - t.spawnedAt;
                const lifeFraction = Math.min(1, age / t.lifetimeMs);
                const scale = Math.max(0.4, 1 - lifeFraction * 0.6);
                const opacity =
                  lifeFraction > 0.75
                    ? Math.max(0.3, 1 - (lifeFraction - 0.75) * 2.8)
                    : 1;
                const targetTransformStyle: CSSProperties = t.kind === 'hazard'
                  ? { '--bbl-scale': scale.toFixed(3) } as CSSProperties
                  : {
                    transform: `translate(-50%, -50%) scale(${scale.toFixed(3)})`,
                  };

                return (
                  <button
                    key={t.id}
                    className={['bbl__target', cfg.cls].join(' ')}
                    style={{
                      left: `${t.x}%`,
                      top: `${t.y}%`,
                      ...targetTransformStyle,
                      opacity,
                    }}
                    onClick={() => handleTargetTap(t)}
                    type="button"
                    aria-label={getTargetAriaLabel(t.kind, currentRoundConfig)}
                  >
                    {cfg.emoji}
                  </button>
                );
              })}
            </div>

            <div className="bbl__hit-row" aria-label="Hit counters">
              <span className="bbl__hit-item bbl__hit-item--standard">
                🎯 ×{hits.standard}
              </span>
              <span className="bbl__hit-item bbl__hit-item--bonus">
                ⭐ ×{hits.bonus}
              </span>
              <span className="bbl__hit-item bbl__hit-item--hazard">
                💣 ×{hits.hazard}
              </span>
            </div>
          </div>
        )}

        {gamePhase === 'spectating' && spectatorRound && (
          <div className="bbl__spectating">
            <span className="bbl__spectator-pill">📹 Spectator mode</span>
            <h3 className="bbl__spectating-title">Round {spectatorRound.roundNumber} recording</h3>
            <p className="bbl__spectating-copy">
              {spectatorRound.activeParticipantIds.length} players remain. The next summary will appear automatically.
            </p>
            <div className="bbl__spectating-pulse" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {gamePhase === 'round_results' && roundOutcome && (
          <div className="bbl__results">
            <p className="bbl__winner-line">
              {roundOutcome.isFinal
                ? isKnockoutMode
                  ? `🏆 ${roundOutcome.rankedScores[0]?.name ?? 'Unknown'} wins the final round!`
                  : `🏁 Round ${roundOutcome.roundNumber} complete — your final total is locked in.`
                : roundOutcome.eliminatedEntries.length > 0
                  ? `Round ${roundOutcome.roundNumber} complete — ${formatNameList(roundOutcome.eliminatedEntries)} ${roundOutcome.eliminatedEntries.length === 1 ? 'is' : 'are'} eliminated.`
                  : `Round ${roundOutcome.roundNumber} complete — your score carries into the next round.`}
            </p>
            <ol className="bbl__leaderboard">
              {roundOutcome.rankedScores.map((entry, i) => {
                const isEliminated = !roundOutcome.isFinal && roundOutcome.eliminatedIds.includes(entry.id);
                return (
                  <li
                    key={entry.id}
                    className={[
                      'bbl__entry',
                      entry.isHuman ? 'bbl__entry--you' : '',
                      i === 0 ? 'bbl__entry--winner' : '',
                      isEliminated ? 'bbl__entry--last' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="bbl__rank">
                      {i < 3 ? MEDALS[i] : `${i + 1}.`}
                    </span>
                    <span className="bbl__entry-name">
                      {entry.name}
                      {entry.isHuman && (
                        <span className="bbl__you-tag"> (You)</span>
                      )}
                    </span>
                    <span className="bbl__entry-score">{entry.score} pts</span>
                    {!roundOutcome.isFinal && roundOutcome.rankedScores.length > 1 && (
                      <span
                        className={[
                          'bbl__status-tag',
                          isEliminated ? 'bbl__status-tag--out' : 'bbl__status-tag--safe',
                        ].join(' ')}
                      >
                        {isEliminated ? 'OUT' : 'SAFE'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {currentHumanEntry && (
              <p className="bbl__hit-summary">
                Your round: 🎯 ×{currentHumanEntry.hits.standard} ⭐ ×{currentHumanEntry.hits.bonus} 💣 ×{currentHumanEntry.hits.hazard}
              </p>
            )}
            {!roundOutcome.isFinal && (
              <div className="bbl__round-feedback" aria-label="Round recap">
                <p className="bbl__spectator-copy">
                  Advancing: {formatNameList(advancingEntries)}.
                </p>
                {roundOutcome.eliminatedEntries.length > 0 && (
                  <p className="bbl__spectator-copy">
                    Eliminated: {formatNameList(roundOutcome.eliminatedEntries)}.
                  </p>
                )}
                {nextRoundConfig && (
                  <div className="bbl__next-round-preview">
                    <p className="bbl__spectator-copy">
                      Next round: {nextRoundConfig.difficultyLabel}
                    </p>
                    {nextRoundPreview.length > 0 && (
                      <ul className="bbl__preview-list">
                        {nextRoundPreview.map((preview) => (
                          <li key={preview}>{preview}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            {humanWasEliminated && !isSpectatorMode && (
              <p className="bbl__spectator-copy">
                You&apos;ve been eliminated. Skip ahead or keep watching the rest of the bracket in spectator mode.
              </p>
            )}
            {isSpectatorMode && !roundOutcome.isFinal && (
              <p className="bbl__spectator-copy">Auto-advancing to the next recorded round…</p>
            )}
            {!roundOutcome.isFinal && !humanWasEliminated && !isSpectatorMode && (
              <button
                className="bbl__done-btn"
                onClick={handleContinueRound}
                type="button"
              >
                Continue to Round {roundOutcome.roundNumber + 1} ▶
              </button>
            )}
            {!roundOutcome.isFinal && humanWasEliminated && !isSpectatorMode && (
              <div className="bbl__btn-row">
                <button
                  className="bbl__done-btn bbl__done-btn--secondary"
                  onClick={handleSkipToFinal}
                  type="button"
                >
                  Skip to final results
                </button>
                <button
                  className="bbl__done-btn"
                  onClick={handleKeepWatching}
                  type="button"
                >
                  Keep watching ▶
                </button>
              </div>
            )}
          </div>
        )}

        {gamePhase === 'final_results' && finalStandings.length > 0 && (
          <div className="bbl__results">
            <p className="bbl__winner-line">
              {isKnockoutMode
                ? finalStandings[0].isHuman
                  ? '🏆 You win Bullseye Blitz!'
                  : `🏆 ${finalStandings[0].name} wins Bullseye Blitz!`
                : '🏆 Bullseye Blitz complete!'}
            </p>
            <ol className="bbl__leaderboard">
              {finalStandings.map((entry, i) => (
                <li
                  key={entry.id}
                  className={[
                    'bbl__entry',
                    entry.isHuman ? 'bbl__entry--you' : '',
                    i === 0 ? 'bbl__entry--winner' : '',
                    i === finalStandings.length - 1 ? 'bbl__entry--last' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="bbl__rank">
                    {i < 3 ? MEDALS[i] : `${i + 1}.`}
                  </span>
                  <span className="bbl__entry-name">
                    {entry.name}
                    {entry.isHuman && (
                      <span className="bbl__you-tag"> (You)</span>
                    )}
                  </span>
                  <span className="bbl__entry-score">{entry.score} pts</span>
                  {i === finalStandings.length - 1 && (
                    <span className="bbl__last-tag" aria-label="Last place">
                      💔
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {currentHumanEntry && (
              <p className="bbl__hit-summary">
                Your total score: {tournamentScoreTotal} pts.
              </p>
            )}
            <button
              className="bbl__done-btn"
              onClick={handleDone}
              type="button"
            >
              Continue ▶
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
