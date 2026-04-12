/**
 * SnakeGame — native React minigame component.
 *
 * Supports two rendering modes:
 *  1. LOH/POS path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload` (humanScore + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `participantIds` + `onFinish`;
 *     reveals a local leaderboard, then calls `onFinish(score)` after Continue.
 *
 * Presentation: Nokia 3310-style retro phone shell with a green LCD display.
 * Controls: keyboard (Arrow/WASD) + on-screen D-pad + swipe gestures.
 *
 * Scoring: Race-to-1000 mode. Foods award +25 (standard), +75 (bonus), or
 * −20 (penalty). Game ends when the player reaches 1000 points. Competition
 * is ranked primarily by completion time; players who do not complete the run
 * are ranked by highest accumulated score.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { completeMinigame } from '../../store/gameSlice';
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types';
import { simulateSnakeAiScore } from '../../ai/competition/snakeAiSimulator';
import type { SnakeAiScoreResult } from '../../ai/competition/snakeAiSimulator';
import { getDefaultCompetitionProfile } from '../../ai/competition';
import './SnakeGame.css';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of grid cells in each dimension. */
const GRID_SIZE = 20;
/** Size of each grid cell in CSS pixels. */
const TILE_SIZE = 15;
/** Canvas dimension derived from grid and tile sizes. */
const CANVAS_PX = GRID_SIZE * TILE_SIZE;
/** Milliseconds between game loop ticks. */
const TICK_MS = 150;
/** Points awarded for a standard food item. */
const POINTS_PER_STANDARD_FOOD = 25;
/** Points awarded for a bonus food item. */
const POINTS_PER_BONUS_FOOD = 75;
/** Points deducted for a penalty food item. */
const POINTS_PER_PENALTY_FOOD = -20;
/** Target score — game ends when accumulated score reaches this. */
const TARGET_SCORE = 1000;
/** Probability that a newly spawned food item is a bonus. */
const BONUS_FOOD_CHANCE = 0.15;
/** Probability that a newly spawned food item is a penalty (rare trap). */
const PENALTY_FOOD_CHANCE = 0.10;
/** Normalised score upper bound (matches store scale and TARGET_SCORE). */
const SCORE_SCALE = 1000;
const RESULTS_REVEAL_MS = 10_000;
const FAST_FORWARD_DELAY_MS = 4_000;
const FAST_FORWARD_RESOLVE_MS = 2_000;
const FOOD_PULSE_MIN_OPACITY = 0.68;
const FOOD_PULSE_RANGE = 0.32;
const FOOD_PULSE_STEP = 0.55;
/** Age (ms) after which non-standard food starts blinking. */
const FOOD_EXPIRY_BLINK_MS = 3_000;
/** Total lifetime (ms) of non-standard food before it auto-disappears. */
const FOOD_EXPIRY_TOTAL_MS = 6_000;
/** Emoji icons per food type rendered on the LCD canvas. */
const FOOD_EMOJI: Record<FoodType, string> = {
  standard: '🍎',
  bonus: '⭐',
  penalty: '💀',
};

/** Font used for food emoji on the LCD canvas (pre-computed from TILE_SIZE). */
const FOOD_FONT = `${TILE_SIZE - 2}px serif`;
/** Multiplier applied to foodPulsePhase to drive the faster expiry-blink animation. */
const BLINK_PHASE_MULTIPLIER = 6;

const MEDALS = ['🥇', '🥈', '🥉'];

// ── Types ─────────────────────────────────────────────────────────────────────

type Vec2 = { x: number; y: number };
type GamePhase = 'ready' | 'playing' | 'over' | 'waiting' | 'results';
type FoodType = 'standard' | 'bonus' | 'penalty';

interface ScoreEntry {
  id: string;
  name: string;
  score: number;       // accumulated 0–1000 score
  foodEaten: number;
  isHuman: boolean;
  /** Elapsed ms at completion (reached TARGET_SCORE); undefined if run ended by collision. */
  completionMs?: number;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** LOH/POS minigame path: full session data. */
  session?: MinigameSession;
  /** LOH/POS minigame path: all game players (for name lookup). */
  players?: Player[];
  /** MinigameHost path: called with the human's final score. */
  onFinish?: (value: number) => void;
  /** Competition seed (forwarded from host; reserved for future use). */
  seed?: number;
  /** When true the game starts immediately on mount. */
  autoStart?: boolean;
  /** Hosted competition participant ids for local leaderboard display. */
  participantIds?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clamp an accumulated score to the valid [0, SCORE_SCALE] range. */
function normaliseScore(score: number): number {
  return Math.max(0, Math.min(SCORE_SCALE, score));
}

/** Format milliseconds as M:SS.t (e.g. 1:23.4). */
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const tenth = Math.floor((ms % 1000) / 100);
  return `${min}:${String(sec).padStart(2, '0')}.${tenth}`;
}

/**
 * Sort ScoreEntry items for leaderboard display.
 * Completers (reached TARGET_SCORE) rank above non-completers, sorted by
 * completion time ascending.  Non-completers are sorted by score descending.
 */
function sortScoreEntries(a: ScoreEntry, b: ScoreEntry): number {
  const aCompleted = a.completionMs != null;
  const bCompleted = b.completionMs != null;
  if (aCompleted && bCompleted) return a.completionMs! - b.completionMs!;
  if (aCompleted) return -1;
  if (bCompleted) return 1;
  return b.score - a.score;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SnakeGame({
  session,
  players = [],
  onFinish,
  seed = 0,
  autoStart = false,
  participantIds = [],
}: Props) {
  const dispatch = useAppDispatch();
  const storePlayers = useAppSelector((s) => s.game.players);
  const resolvedPlayers = players.length > 0 ? players : storePlayers;
  const humanId = resolvedPlayers.find((p) => p.isUser)?.id;

  // ── State ──────────────────────────────────────────────────────────────────

  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [currentScore, setCurrentScore] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [goalReached, setGoalReached] = useState(false);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [showFastForward, setShowFastForward] = useState(false);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [screenFx, setScreenFx] = useState<'boot' | 'death' | null>('boot');
  const showPhoneShell = gamePhase === 'ready' || gamePhase === 'playing' || gamePhase === 'over';

  // ── Refs (game loop internals — never cause re-renders) ────────────────────

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<Vec2[]>([{ x: 10, y: 10 }]);
  const dirRef = useRef<Vec2>({ x: 1, y: 0 });
  const nextDirRef = useRef<Vec2>({ x: 1, y: 0 });
  const foodRef = useRef<Vec2>({ x: 5, y: 5 });
  /** Type of the currently active food item. */
  const foodTypeRef = useRef<FoodType>('standard');
  /**
   * Timestamp (Date.now()) when the current non-standard food was placed.
   * 0 for standard food or before first placement.
   */
  const foodSpawnTimeRef = useRef<number>(0);
  const foodEatenRef = useRef(0);
  const currentScoreRef = useRef(0);
  /** Timestamp (Date.now()) when the current run started; null before first start. */
  const startTimeRef = useRef<number | null>(null);
  /** Final elapsed ms captured in endGame; used for the completion time report. */
  const elapsedMsRef = useRef(0);
  /** Last Date.now() at which we pushed an elapsedMs state update (throttle). */
  const lastTimerUpdateRef = useRef(0);
  /** True when the run ended by reaching TARGET_SCORE (not a collision). */
  const goalReachedRef = useRef(false);
  const foodPulsePhaseRef = useRef(0);
  const gameOverRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gamePhaseRef = useRef<GamePhase>('ready');
  /** Stable ref to the latest endGame function, used by tick to avoid circular deps. */
  const endGameRef = useRef<(() => void) | null>(null);
  /** Timeout id for the post-game-over delay in endGame; cleared on unmount. */
  const endGameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Timeout id for revealing the leaderboard after the waiting animation. */
  const resultsRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Timeout id for showing the fast-forward affordance. */
  const fastForwardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep phaseRef in sync with React state for use inside event handlers
  useEffect(() => {
    gamePhaseRef.current = gamePhase;
  }, [gamePhase]);

  useEffect(() => {
    if (gamePhase === 'ready') {
      setScreenFx('boot');
      const timeoutId = setTimeout(() => setScreenFx(null), 650);
      return () => clearTimeout(timeoutId);
    }

    if (gamePhase === 'over') {
      setScreenFx('death');
      const timeoutId = setTimeout(() => setScreenFx(null), 850);
      return () => clearTimeout(timeoutId);
    }

    setScreenFx(null);
    return undefined;
  }, [gamePhase]);

  const clearWaitingTimers = useCallback(() => {
    if (resultsRevealTimeoutRef.current !== null) {
      clearTimeout(resultsRevealTimeoutRef.current);
      resultsRevealTimeoutRef.current = null;
    }
    if (fastForwardTimeoutRef.current !== null) {
      clearTimeout(fastForwardTimeoutRef.current);
      fastForwardTimeoutRef.current = null;
    }
  }, []);

  const revealResults = useCallback(() => {
    clearWaitingTimers();
    setShowFastForward(false);
    setIsFastForwarding(false);
    setGamePhase('results');
  }, [clearWaitingTimers]);

  const beginLeaderboardReveal = useCallback((ranked: ScoreEntry[]) => {
    setScores(ranked);

    if (ranked.length <= 1) {
      setGamePhase('results');
      return;
    }

    setShowFastForward(false);
    setIsFastForwarding(false);
    setGamePhase('waiting');

    fastForwardTimeoutRef.current = setTimeout(() => {
      setShowFastForward(true);
    }, FAST_FORWARD_DELAY_MS);

    resultsRevealTimeoutRef.current = setTimeout(() => {
      revealResults();
    }, RESULTS_REVEAL_MS);
  }, [revealResults]);

  // ── Canvas drawing ─────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (typeof ctx.createLinearGradient === 'function') {
      const lcdGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_PX);
      lcdGradient.addColorStop(0, '#9bbc0f');
      lcdGradient.addColorStop(1, '#8bac0f');
      ctx.fillStyle = lcdGradient;
    } else {
      ctx.fillStyle = '#8bac0f';
    }
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

    // Snake body — darker head for LCD contrast
    snakeRef.current.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#081820' : '#0f380f';
      ctx.fillRect(seg.x * TILE_SIZE, seg.y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
    });

    const foodAge =
      foodTypeRef.current !== 'standard' && foodSpawnTimeRef.current > 0
        ? Date.now() - foodSpawnTimeRef.current
        : 0;

    let foodAlpha: number;
    if (gamePhaseRef.current === 'playing') {
      if (foodTypeRef.current !== 'standard' && foodAge >= FOOD_EXPIRY_BLINK_MS) {
        // Fast blink when approaching expiry: use a multiple of the existing
        // pulse phase so no extra Date.now() call is needed in the render loop.
        foodAlpha = 0.5 + 0.5 * Math.sin(foodPulsePhaseRef.current * BLINK_PHASE_MULTIPLIER);
      } else {
        // Gentle pulse (existing behaviour for all non-blinking food)
        foodAlpha =
          FOOD_PULSE_MIN_OPACITY +
          (((Math.sin(foodPulsePhaseRef.current) + 1) / 2) * FOOD_PULSE_RANGE);
      }
    } else {
      foodAlpha = 1;
    }

    ctx.globalAlpha = foodAlpha;
    ctx.fillText(
      FOOD_EMOJI[foodTypeRef.current],
      foodRef.current.x * TILE_SIZE + TILE_SIZE / 2,
      foodRef.current.y * TILE_SIZE + TILE_SIZE / 2,
    );
    ctx.globalAlpha = 1;
  }, []);

  // ── Food placement ─────────────────────────────────────────────────────────

  const placeFood = useCallback(() => {
    // If snake fills the entire grid, the player has won — end the game.
    if (snakeRef.current.length >= GRID_SIZE * GRID_SIZE) {
      endGameRef.current?.();
      return;
    }
    let candidate: Vec2;
    do {
      candidate = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
    } while (snakeRef.current.some((s) => s.x === candidate.x && s.y === candidate.y));
    foodRef.current = candidate;
    // Assign a food type based on random roll
    const r = Math.random();
    const newType: FoodType =
      r < BONUS_FOOD_CHANCE ? 'bonus'
      : r < BONUS_FOOD_CHANCE + PENALTY_FOOD_CHANCE ? 'penalty'
      : 'standard';
    foodTypeRef.current = newType;
    // Track spawn time so non-standard food can expire
    foodSpawnTimeRef.current = newType !== 'standard' ? Date.now() : 0;
  }, []);

  // ── Game tick ──────────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    if (gameOverRef.current) return;

    dirRef.current = nextDirRef.current;
    const head = snakeRef.current[0];
    const newHead: Vec2 = {
      x: head.x + dirRef.current.x,
      y: head.y + dirRef.current.y,
    };

    // Wall collision
    if (
      newHead.x < 0 ||
      newHead.x >= GRID_SIZE ||
      newHead.y < 0 ||
      newHead.y >= GRID_SIZE
    ) {
      endGameRef.current?.();
      return;
    }

    // Self collision
    if (snakeRef.current.some((s) => s.x === newHead.x && s.y === newHead.y)) {
      endGameRef.current?.();
      return;
    }

    snakeRef.current = [newHead, ...snakeRef.current];

    if (newHead.x === foodRef.current.x && newHead.y === foodRef.current.y) {
      const points =
        foodTypeRef.current === 'bonus' ? POINTS_PER_BONUS_FOOD
        : foodTypeRef.current === 'penalty' ? POINTS_PER_PENALTY_FOOD
        : POINTS_PER_STANDARD_FOOD;

      // Clamp to TARGET_SCORE so the score never exceeds the goal even when
      // a large bonus food overshoots (e.g. 975 + 75 → 1000, not 1050).
      const rawScore = Math.max(0, currentScoreRef.current + points);
      const newScore = rawScore >= TARGET_SCORE ? TARGET_SCORE : rawScore;
      currentScoreRef.current = newScore;
      foodEatenRef.current += 1;
      setCurrentScore(newScore);

      // Check if the player has reached the target score
      if (newScore >= TARGET_SCORE) {
        goalReachedRef.current = true;
        endGameRef.current?.();
        return;
      }

      placeFood();
    } else {
      snakeRef.current = snakeRef.current.slice(0, -1);
      // Food expiry: non-standard food disappears after FOOD_EXPIRY_TOTAL_MS,
      // ensuring bad food can never block progress indefinitely.
      if (foodTypeRef.current !== 'standard' && foodSpawnTimeRef.current > 0) {
        if (Date.now() - foodSpawnTimeRef.current >= FOOD_EXPIRY_TOTAL_MS) {
          placeFood();
        }
      }
    }

    // Update live elapsed time display — throttled to every ~250ms to avoid
    // triggering a full React re-render on every 150ms game-loop tick.
    if (startTimeRef.current !== null) {
      const now = Date.now();
      if (now - lastTimerUpdateRef.current >= 250) {
        lastTimerUpdateRef.current = now;
        setElapsedMs(now - startTimeRef.current);
      }
    }

    foodPulsePhaseRef.current += FOOD_PULSE_STEP;
    draw();
  }, [draw, placeFood]);

  // ── End game ───────────────────────────────────────────────────────────────

  const endGame = useCallback(() => {
    if (gameOverRef.current) return;
    gameOverRef.current = true;

    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    // Capture elapsed time before state updates
    const elapsed = startTimeRef.current !== null ? Date.now() - startTimeRef.current : 0;
    elapsedMsRef.current = elapsed;
    setElapsedMs(elapsed);
    setGoalReached(goalReachedRef.current);
    setGamePhase('over');

    endGameTimeoutRef.current = setTimeout(() => {
      const humanFood = foodEatenRef.current;
      const humanScore = normaliseScore(currentScoreRef.current);
      const humanCompletionMs = goalReachedRef.current ? elapsedMsRef.current : undefined;

      if (session) {
        // LOH/POS path — build ranked leaderboard.
        // AI scores come from real headless simulation runs using the same
        // board rules as the human game.
        let resolvedAiResults: Record<string, SnakeAiScoreResult>;
        if (session.hybridResolveOnComplete) {
          resolvedAiResults = {};
          for (const id of session.participants) {
            if (id === humanId) continue;
            const p = resolvedPlayers.find((pl) => pl.id === id);
            resolvedAiResults[id] = simulateSnakeAiScore({
              sessionSeed: session.seed,
              playerId: id,
              profile: p?.competitionProfile ?? getDefaultCompetitionProfile(),
            });
          }
        } else {
          // Re-simulate AI runs to obtain completion times needed for
          // race-to-1000 leaderboard ordering.  Plain `session.aiScores`
          // only stores numeric scores and cannot carry completionMs.
          resolvedAiResults = {};
          for (const id of session.participants) {
            if (id === humanId) continue;
            const p = resolvedPlayers.find((pl) => pl.id === id);
            resolvedAiResults[id] = simulateSnakeAiScore({
              sessionSeed: session.seed,
              playerId: id,
              profile: p?.competitionProfile ?? getDefaultCompetitionProfile(),
            });
          }
        }

        const entries: ScoreEntry[] = session.participants.map((id) => {
          const p = resolvedPlayers.find((pl) => pl.id === id);
          const isHuman = id === humanId;
          const aiResult = resolvedAiResults[id] ?? { score: 0, completionMs: null };
          const score = isHuman ? humanScore : aiResult.score;
          const completionMs = isHuman ? humanCompletionMs : (aiResult.completionMs ?? undefined);
          return {
            id,
            name: p?.name ?? id,
            score,
            foodEaten: isHuman ? humanFood : 0,
            isHuman,
            completionMs,
          };
        });

        const ranked = [...entries].sort(sortScoreEntries);
        beginLeaderboardReveal(ranked);
      } else {
        let activeParticipantIds = participantIds;
        if (activeParticipantIds.length === 0 && humanId) {
          activeParticipantIds = [humanId];
        }

        if (activeParticipantIds.length <= 1) {
          if (onFinish) onFinish(humanScore);
          return;
        }

        const ranked = activeParticipantIds
          .map((id) => {
            const p = resolvedPlayers.find((pl) => pl.id === id);
            const isHuman = id === humanId;
            const simulationResult = isHuman
              ? null
              : simulateSnakeAiScore({
                  sessionSeed: seed,
                  playerId: id,
                  profile: p?.competitionProfile ?? getDefaultCompetitionProfile(),
                });

            return {
              id,
              name: p?.name ?? id,
              score: isHuman ? humanScore : simulationResult!.score,
              foodEaten: isHuman ? humanFood : 0,
              isHuman,
              completionMs: isHuman ? humanCompletionMs : (simulationResult?.completionMs ?? undefined),
            };
          })
          .sort(sortScoreEntries);

        beginLeaderboardReveal(ranked);
      }
    }, 1200);
  }, [session, humanId, resolvedPlayers, onFinish, beginLeaderboardReveal, participantIds, seed]);

  // Keep endGameRef pointing to the latest endGame closure so tick can call
  // it without capturing a stale reference (avoids circular useCallback deps).
  useEffect(() => {
    endGameRef.current = endGame;
  }, [endGame]);

  // ── Start game ─────────────────────────────────────────────────────────────

  const startGame = useCallback(() => {
    // Clear any existing interval to prevent concurrent game loops.
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    snakeRef.current = [{ x: 10, y: 10 }];
    dirRef.current = { x: 1, y: 0 };
    nextDirRef.current = { x: 1, y: 0 };
    foodEatenRef.current = 0;
    currentScoreRef.current = 0;
    goalReachedRef.current = false;
    startTimeRef.current = Date.now();
    lastTimerUpdateRef.current = 0;
    elapsedMsRef.current = 0;
    foodPulsePhaseRef.current = 0;
    foodSpawnTimeRef.current = 0;
    gameOverRef.current = false;

    setCurrentScore(0);
    setElapsedMs(0);
    setGoalReached(false);
    setScores([]);
    setShowFastForward(false);
    setIsFastForwarding(false);
    clearWaitingTimers();
    setGamePhase('playing');
    gamePhaseRef.current = 'playing';

    placeFood();
    draw();

    tickRef.current = setInterval(tick, TICK_MS);
  }, [clearWaitingTimers, draw, placeFood, tick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
      }
      if (endGameTimeoutRef.current !== null) {
        clearTimeout(endGameTimeoutRef.current);
      }
      clearWaitingTimers();
    };
  }, [clearWaitingTimers]);

  // Auto-start support
  useEffect(() => {
    if (autoStart && gamePhase === 'ready') {
      startGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Initial canvas render + one-time text property setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Set text properties once; they persist for the lifetime of the context.
      ctx.font = FOOD_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }
    draw();
  }, [draw]);

  // ── Direction handling ─────────────────────────────────────────────────────

  const setDirection = useCallback((dir: Vec2) => {
    // Prevent 180° reversal
    if (
      dir.x === -dirRef.current.x &&
      dir.y === -dirRef.current.y
    ) return;
    nextDirRef.current = dir;
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (gamePhaseRef.current !== 'playing') return;
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          setDirection({ x: 0, y: -1 });
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          setDirection({ x: 0, y: 1 });
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          setDirection({ x: -1, y: 0 });
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          setDirection({ x: 1, y: 0 });
          break;
      }
    },
    [setDirection],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Touch / swipe support on canvas ────────────────────────────────────────

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!e.touches[0]) return;
    e.preventDefault();
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (gamePhaseRef.current !== 'playing') return;
      if (!touchStartRef.current || !e.changedTouches[0]) return;
      e.preventDefault();

      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      const MIN_SWIPE = 30;
      if (Math.abs(dx) < MIN_SWIPE && Math.abs(dy) < MIN_SWIPE) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        setDirection(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
      } else {
        setDirection(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
      }

      if (navigator.vibrate) navigator.vibrate(10);
    },
    [setDirection],
  );

  // ── D-pad button handler ───────────────────────────────────────────────────

  const handleDPad = useCallback(
    (dir: Vec2) => (e: React.PointerEvent) => {
      e.preventDefault();
      if (gamePhaseRef.current !== 'playing') return;
      setDirection(dir);
      if (navigator.vibrate) navigator.vibrate(10);
    },
    [setDirection],
  );

  // ── Dispatch on "Continue" ─────────────────────────────────────────────────

  const handleDone = useCallback(() => {
    const humanScore = normaliseScore(currentScoreRef.current);
    if (session) {
      const lastPlaceId = scores.length > 0 ? scores[scores.length - 1].id : undefined;
      const payload: CompleteMinigamePayload = { humanScore, lastPlaceId };
      dispatch(completeMinigame(payload));
      return;
    }
    if (onFinish) onFinish(humanScore);
  }, [dispatch, onFinish, scores, session]);

  const handleFastForward = useCallback(() => {
    if (gamePhase !== 'waiting' || isFastForwarding) return;
    if (resultsRevealTimeoutRef.current !== null) {
      clearTimeout(resultsRevealTimeoutRef.current);
    }
    setShowFastForward(false);
    setIsFastForwarding(true);
    resultsRevealTimeoutRef.current = setTimeout(() => {
      revealResults();
    }, FAST_FORWARD_RESOLVE_MS);
  }, [gamePhase, isFastForwarding, revealResults]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="snake-root" role="dialog" aria-modal="true" aria-label="Snake Competition">
      {showPhoneShell && (
        <div className="snake-phone">
          {/* LCD area */}
          <div className="snake-lcd-bezel">
            <div
              className={[
                'snake-lcd-container',
                screenFx ? `snake-lcd-container--fx-${screenFx}` : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Status line — no aria-live to avoid spamming screen readers with the live timer */}
              <div className="snake-status-line" aria-live="off">
                {currentScore} PTS&nbsp;&nbsp;{formatTime(elapsedMs)}
              </div>

              {/* Game canvas */}
              <canvas
                ref={canvasRef}
                className="snake-canvas"
                width={CANVAS_PX}
                height={CANVAS_PX}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                aria-label="Snake game board"
              />

              {/* CRT scanlines */}
              <div className="snake-scanlines" aria-hidden="true" />

              {/* Ready overlay */}
              {gamePhase === 'ready' && (
                <div className="snake-overlay">
                  <p className="snake-overlay-title" aria-label="Snake">
                    SNAKE
                  </p>
                  <p className="snake-overlay-hint">Reach 1000 pts to win!</p>
                  <p className="snake-overlay-hint">Arrow keys or D-pad</p>
                  <button className="snake-btn snake-btn--start" onClick={startGame}>
                    START
                  </button>
                </div>
              )}

              {/* Game-over overlay */}
              {gamePhase === 'over' && (
                <div className="snake-overlay">
                  <p className={[
                    'snake-overlay-title',
                    !goalReached ? 'snake-overlay-title--danger' : '',
                  ].filter(Boolean).join(' ')}>
                    {goalReached ? 'GOAL!' : 'GAME OVER'}
                  </p>
                  <p className="snake-overlay-hint">
                    {goalReached
                      ? `Done in ${formatTime(elapsedMs)}`
                      : `Score: ${currentScore}`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Nokia brand strip */}
          <div className="snake-brand" aria-hidden="true">
            <span className="snake-brand-text">Nokia</span>
          </div>

          {/* D-pad */}
          <div className="snake-dpad" aria-label="Direction controls">
            <div className="snake-dpad-row">
              <button
                className="snake-dpad-btn snake-dpad-up"
                aria-label="Up"
                onPointerDown={handleDPad({ x: 0, y: -1 })}
              />
            </div>
            <div className="snake-dpad-row snake-dpad-row--mid">
              <button
                className="snake-dpad-btn snake-dpad-left"
                aria-label="Left"
                onPointerDown={handleDPad({ x: -1, y: 0 })}
              />
              <div className="snake-dpad-center" aria-hidden="true" />
              <button
                className="snake-dpad-btn snake-dpad-right"
                aria-label="Right"
                onPointerDown={handleDPad({ x: 1, y: 0 })}
              />
            </div>
            <div className="snake-dpad-row">
              <button
                className="snake-dpad-btn snake-dpad-down"
                aria-label="Down"
                onPointerDown={handleDPad({ x: 0, y: 1 })}
              />
            </div>
          </div>

          {/* Decorative action buttons */}
          <div className="snake-action-buttons" aria-hidden="true">
            <div className="snake-action-button" />
            <div className="snake-action-button snake-action-button--primary" />
            <div className="snake-action-button" />
          </div>
        </div>
      )}

      {gamePhase === 'waiting' && (
        <div className="snake-waiting" role="status" aria-live="polite">
          <h2 className="snake-waiting-title">Some players still wrapping up…</h2>
          <p className="snake-waiting-copy">
            This challenge resolves asynchronously. Rankings unlock once every player posts
            their run.
          </p>
          <div className="snake-mini-shell" role="img" aria-label="Snake activity animation">
            <div className="snake-mini-lcd">
              <div className="snake-mini-food" />
              <div className="snake-mini-snake">
                <span className="snake-mini-segment snake-mini-segment--head" />
                <span className="snake-mini-segment" />
                <span className="snake-mini-segment" />
                <span className="snake-mini-segment" />
              </div>
              <div className="snake-mini-scanlines" />
            </div>
          </div>
          {(showFastForward || isFastForwarding) && (
            <button
              className="snake-btn snake-btn--ff"
              onClick={handleFastForward}
              disabled={isFastForwarding}
              aria-label={isFastForwarding ? 'Fast forwarding rankings' : 'Fast forward ranking reveal'}
            >
              {isFastForwarding ? 'Fast forwarding…' : 'Fast forward'}
            </button>
          )}
        </div>
      )}

      {/* Results screen (shown outside the phone body for readability) */}
      {gamePhase === 'results' && scores.length > 0 && (
        <div className="snake-results" role="region" aria-label="Competition results">
          <h2 className="snake-results-title">🏁 Results</h2>
          <p className="snake-results-winner">
            🏆 {scores[0].name} wins{scores[0].isHuman ? " — that's you!" : '!'}
            {scores[0].completionMs != null ? ` · ${formatTime(scores[0].completionMs)}` : ''}
          </p>
          <ol className="snake-leaderboard">
            {scores.map((entry, i) => (
              <li
                key={entry.id}
                className={[
                  'snake-leaderboard-entry',
                  entry.isHuman ? 'snake-leaderboard-entry--you' : '',
                  i === 0 ? 'snake-leaderboard-entry--winner' : '',
                  i === scores.length - 1 ? 'snake-leaderboard-entry--last' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="snake-leaderboard-rank">
                  {i < MEDALS.length ? MEDALS[i] : `${i + 1}.`}
                </span>
                <span className="snake-leaderboard-name">
                  {entry.name}
                  {entry.isHuman ? ' (you)' : ''}
                </span>
                <span className="snake-leaderboard-score">
                  {entry.completionMs != null
                    ? formatTime(entry.completionMs)
                    : `${entry.score} pts`}
                </span>
              </li>
            ))}
          </ol>
          <button className="snake-btn snake-btn--done" onClick={handleDone}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
