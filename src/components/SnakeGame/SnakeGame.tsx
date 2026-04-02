/**
 * SnakeGame — native React minigame component.
 *
 * Supports two rendering modes:
 *  1. LOH/LOH path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload` (humanScore + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `onFinish`; calls `onFinish(score)`.
 *
 * Presentation: Nokia 3310-style retro phone shell with a green LCD display.
 * Controls: keyboard (Arrow/WASD) + on-screen D-pad + swipe gestures.
 *
 * Scoring: higher-is-better.  Each food item eaten = 10 points (raw).
 * Raw score is normalized to the 0–1000 scale the store expects.
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
/** Points awarded per food item. */
const POINTS_PER_FOOD = 10;
/** Normalised score upper bound (matches store scale). */
const SCORE_SCALE = 1000;
/** Raw score cap before normalisation. */
const RAW_SCORE_CAP = 100;

const MEDALS = ['🥇', '🥈', '🥉'];

// ── Types ─────────────────────────────────────────────────────────────────────

type Vec2 = { x: number; y: number };
type GamePhase = 'ready' | 'playing' | 'over' | 'results';

interface ScoreEntry {
  id: string;
  name: string;
  score: number;  // normalised 0–1000 score
  foodEaten: number;
  isHuman: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** LOH/LOH minigame path: full session data. */
  session?: MinigameSession;
  /** LOH/LOH minigame path: all game players (for name lookup). */
  players?: Player[];
  /** MinigameHost path: called with the human's final score. */
  onFinish?: (value: number) => void;
  /** Competition seed (forwarded from host; reserved for future use). */
  seed?: number;
  /** When true the game starts immediately on mount. */
  autoStart?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseScore(foodEaten: number): number {
  const raw = Math.min(RAW_SCORE_CAP, foodEaten * POINTS_PER_FOOD);
  return Math.round((raw / RAW_SCORE_CAP) * SCORE_SCALE);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SnakeGame({
  session,
  players = [],
  onFinish,
  autoStart = false,
}: Props) {
  const dispatch = useAppDispatch();
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id);

  // ── State ──────────────────────────────────────────────────────────────────

  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [foodEaten, setFoodEaten] = useState(0);
  const [snakeLength, setSnakeLength] = useState(1);
  const [scores, setScores] = useState<ScoreEntry[]>([]);

  // ── Refs (game loop internals — never cause re-renders) ────────────────────

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<Vec2[]>([{ x: 10, y: 10 }]);
  const dirRef = useRef<Vec2>({ x: 1, y: 0 });
  const nextDirRef = useRef<Vec2>({ x: 1, y: 0 });
  const foodRef = useRef<Vec2>({ x: 5, y: 5 });
  const foodEatenRef = useRef(0);
  const gameOverRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gamePhaseRef = useRef<GamePhase>('ready');
  /** Stable ref to the latest endGame function, used by tick to avoid circular deps. */
  const endGameRef = useRef<(() => void) | null>(null);
  /** Timeout id for the post-game-over delay in endGame; cleared on unmount. */
  const endGameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep phaseRef in sync with React state for use inside event handlers
  useEffect(() => {
    gamePhaseRef.current = gamePhase;
  }, [gamePhase]);

  // ── Canvas drawing ─────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Nokia green background
    ctx.fillStyle = '#b7d378';
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

    // Snake body — darker head
    snakeRef.current.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#1a1a1a' : '#2d2d2d';
      ctx.fillRect(seg.x * TILE_SIZE, seg.y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
    });

    // Food
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(
      foodRef.current.x * TILE_SIZE,
      foodRef.current.y * TILE_SIZE,
      TILE_SIZE - 1,
      TILE_SIZE - 1,
    );
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
      foodEatenRef.current += 1;
      setFoodEaten(foodEatenRef.current);
      setSnakeLength(snakeRef.current.length);
      placeFood();
    } else {
      snakeRef.current = snakeRef.current.slice(0, -1);
    }

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

    setGamePhase('over');

    endGameTimeoutRef.current = setTimeout(() => {
      const humanFood = foodEatenRef.current;
      const humanScore = normaliseScore(humanFood);

      if (session) {
        // LOH/LOH path — build ranked leaderboard.
        // AI scores come from real headless simulation runs using the same
        // board rules as the human game.  Each AI plays its own board and
        // produces a genuine food-eaten count rather than a precomputed value.
        let resolvedAiScores: Record<string, number>;
        if (session.hybridResolveOnComplete) {
          resolvedAiScores = {};
          for (const id of session.participants) {
            if (id === humanId) continue;
            const p = players.find((pl) => pl.id === id);
            resolvedAiScores[id] = simulateSnakeAiScore({
              sessionSeed: session.seed,
              playerId: id,
              profile: p?.competitionProfile ?? getDefaultCompetitionProfile(),
            });
          }
        } else {
          resolvedAiScores = session.aiScores;
        }

        const allScores: Record<string, number> = {
          ...resolvedAiScores,
          ...(humanId ? { [humanId]: humanScore } : {}),
        };

        const entries: ScoreEntry[] = session.participants.map((id) => {
          const p = players.find((pl) => pl.id === id);
          const isHuman = id === humanId;
          const score = allScores[id] ?? 0;
          // Reverse-engineer food count for display: score / SCORE_SCALE * RAW_SCORE_CAP / POINTS_PER_FOOD
          const approxFood = isHuman
            ? humanFood
            : Math.round((score / SCORE_SCALE) * RAW_SCORE_CAP / POINTS_PER_FOOD);
          return {
            id,
            name: p?.name ?? id,
            score,
            foodEaten: approxFood,
            isHuman,
          };
        });

        const ranked = [...entries].sort((a, b) => b.score - a.score);
        setScores(ranked);
        setGamePhase('results');
      } else {
        // MinigameHost challenge path
        if (onFinish) onFinish(humanScore);
      }
    }, 1200);
  }, [session, humanId, players, onFinish]);

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
    gameOverRef.current = false;

    setFoodEaten(0);
    setSnakeLength(1);
    setGamePhase('playing');
    gamePhaseRef.current = 'playing';

    placeFood();
    draw();

    tickRef.current = setInterval(tick, TICK_MS);
  }, [draw, placeFood, tick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
      }
      if (endGameTimeoutRef.current !== null) {
        clearTimeout(endGameTimeoutRef.current);
      }
    };
  }, []);

  // Auto-start support
  useEffect(() => {
    if (autoStart && gamePhase === 'ready') {
      startGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Initial canvas render
  useEffect(() => {
    if (canvasRef.current) draw();
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
    if (!session) return;
    const humanScore = normaliseScore(foodEatenRef.current);
    const lastPlaceId = scores.length > 0 ? scores[scores.length - 1].id : undefined;
    const payload: CompleteMinigamePayload = { humanScore, lastPlaceId };
    dispatch(completeMinigame(payload));
  }, [dispatch, scores, session]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="snake-root" role="dialog" aria-modal="true" aria-label="Snake Competition">
      {/* Nokia 3310 phone shell */}
      <div className="snake-phone">
        {/* LCD area */}
        <div className="snake-lcd-bezel">
          <div className="snake-lcd-container">
            {/* Status line */}
            <div className="snake-status-line" aria-live="polite">
              LEN {snakeLength}&nbsp;&nbsp;F {foodEaten}
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
                <p className="snake-overlay-title">🐍 SNAKE</p>
                <p className="snake-overlay-hint">Arrow keys or D-pad to move</p>
                <button className="snake-btn snake-btn--start" onClick={startGame}>
                  START
                </button>
              </div>
            )}

            {/* Game-over overlay */}
            {gamePhase === 'over' && (
              <div className="snake-overlay">
                <p className="snake-overlay-title" style={{ color: '#ff6b6b' }}>
                  GAME OVER
                </p>
                <p className="snake-overlay-hint">
                  Food: {foodEaten} · Score: {normaliseScore(foodEaten)}
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

        {/* Bottom action buttons */}
        <div className="snake-action-row" aria-hidden="true">
          <div className="snake-action-btn" />
          <div className="snake-action-btn snake-action-btn--main" />
          <div className="snake-action-btn" />
        </div>
      </div>

      {/* Results screen (shown outside the phone body for readability) */}
      {gamePhase === 'results' && scores.length > 0 && (
        <div className="snake-results" role="region" aria-label="Competition results">
          <h2 className="snake-results-title">🏁 Results</h2>
          <p className="snake-results-winner">
            🏆 {scores[0].name} wins{scores[0].isHuman ? " — that's you!" : '!'}
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
                <span className="snake-leaderboard-score">{entry.score}</span>
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
