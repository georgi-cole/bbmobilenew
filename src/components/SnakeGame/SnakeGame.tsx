/**
 * SnakeGame — Nokia 3310-style Snake minigame component.
 *
 * Supports two rendering modes:
 *  1. HOH/LOH path: receives `session` + `players`; dispatches `completeMinigame`
 *     with a canonical `CompleteMinigamePayload` (humanScore + lastPlaceId).
 *  2. MinigameHost (challenge) path: receives `onFinish`; calls `onFinish(score)`.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { completeMinigame } from '../../store/gameSlice';
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types';
import './SnakeGame.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID_SIZE = 20;
const TILE_SIZE = 15;
const GAME_SPEED_MS = 150;
const CANVAS_SIZE = GRID_SIZE * TILE_SIZE; // 300px

const MEDALS = ['🥇', '🥈', '🥉'];

// Nokia LCD colour palette
const COLOR_BG = '#b7d378';
const COLOR_DARK = '#2d3a1e';
const COLOR_FOOD = '#1a2510';

// ── Types ─────────────────────────────────────────────────────────────────────

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type GamePhase = 'ready' | 'playing' | 'results';

interface Point {
  x: number;
  y: number;
}

interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  isHuman: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** HOH/LOH minigame path: full session data. */
  session?: MinigameSession;
  /** HOH/LOH minigame path: all game players (for name lookup). */
  players?: Player[];
  /** MinigameHost path: called with the human's final score. */
  onFinish?: (value: number) => void;
  /** MinigameHost path: competition seed (unused, reserved). */
  seed?: number;
  /** MinigameHost path: when true, skip an extra start button. */
  autoStart?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomFood(snake: Point[]): Point {
  let pos: Point;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
  return pos;
}

function drawCanvas(
  ctx: CanvasRenderingContext2D,
  snake: Point[],
  food: Point,
): void {
  // Background
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Grid dots (subtle Nokia pixel grid)
  ctx.fillStyle = 'rgba(45,58,30,0.18)';
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      ctx.fillRect(x * TILE_SIZE + TILE_SIZE / 2 - 0.5, y * TILE_SIZE + TILE_SIZE / 2 - 0.5, 1, 1);
    }
  }

  // Food — pixel cross
  ctx.fillStyle = COLOR_FOOD;
  const fx = food.x * TILE_SIZE;
  const fy = food.y * TILE_SIZE;
  ctx.fillRect(fx + 3, fy + 1, 9, 13);
  ctx.fillRect(fx + 1, fy + 3, 13, 9);

  // Snake body
  ctx.fillStyle = COLOR_DARK;
  snake.forEach((seg, i) => {
    const sx = seg.x * TILE_SIZE;
    const sy = seg.y * TILE_SIZE;
    const inset = i === 0 ? 1 : 2; // head is slightly larger
    ctx.fillRect(sx + inset, sy + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
  });

  // Head highlight — two small pixel eyes
  if (snake.length > 0) {
    ctx.fillStyle = COLOR_BG;
    const hx = snake[0].x * TILE_SIZE;
    const hy = snake[0].y * TILE_SIZE;
    ctx.fillRect(hx + 3, hy + 3, 2, 2);
    ctx.fillRect(hx + 10, hy + 3, 2, 2);
  }
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
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [finalHumanScore, setFinalHumanScore] = useState(0);

  // Display state for status line (updated each tick via ref sync)
  const [displayLen, setDisplayLen] = useState(1);
  const [displayFood, setDisplayFood] = useState(0);

  // ── Refs ───────────────────────────────────────────────────────────────────

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<Point[]>([{ x: 10, y: 10 }]);
  const directionRef = useRef<Direction>('RIGHT');
  const pendingDirRef = useRef<Direction>('RIGHT');
  const foodRef = useRef<Point>({ x: 15, y: 10 });
  const foodEatenRef = useRef(0);
  const gameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gamePhaseRef = useRef<GamePhase>('ready');

  // Keep gamePhaseRef in sync
  useEffect(() => {
    gamePhaseRef.current = gamePhase;
  }, [gamePhase]);

  // Draw initial frame when canvas becomes visible
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCanvas(ctx, snakeRef.current, foodRef.current);
  }, [gamePhase]);

  // ── Game finish ────────────────────────────────────────────────────────────

  const finishGame = useCallback(() => {
    if (gameIntervalRef.current) {
      clearInterval(gameIntervalRef.current);
      gameIntervalRef.current = null;
    }

    const humanScore = foodEatenRef.current * 10;
    setFinalHumanScore(humanScore);

    if (session) {
      const allScores: Record<string, number> = {
        ...session.aiScores,
        ...(humanId ? { [humanId]: humanScore } : {}),
      };

      const entries: ScoreEntry[] = session.participants.map((id) => {
        const p = players.find((pl) => pl.id === id);
        return {
          id,
          name: p?.name ?? id,
          score: allScores[id] ?? 0,
          isHuman: id === humanId,
        };
      });
      const ranked = [...entries].sort((a, b) => b.score - a.score);
      setScores(ranked);
      setGamePhase('results');
    } else {
      if (onFinish) onFinish(humanScore);
    }
  }, [session, humanId, players, onFinish]);

  // ── Game loop ──────────────────────────────────────────────────────────────

  const startGame = useCallback(() => {
    // Reset game state
    const startSnake: Point[] = [{ x: 10, y: 10 }];
    snakeRef.current = startSnake;
    directionRef.current = 'RIGHT';
    pendingDirRef.current = 'RIGHT';
    foodRef.current = randomFood(startSnake);
    foodEatenRef.current = 0;
    setDisplayLen(1);
    setDisplayFood(0);

    setGamePhase('playing');

    // Draw initial frame after state update
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) drawCanvas(ctx, snakeRef.current, foodRef.current);
    }

    if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);

    gameIntervalRef.current = setInterval(() => {
      // Commit pending direction
      directionRef.current = pendingDirRef.current;

      const head = snakeRef.current[0];
      let newHead: Point = { x: head.x + 1, y: head.y }; // default: RIGHT
      switch (directionRef.current) {
        case 'UP':    newHead = { x: head.x,     y: head.y - 1 }; break;
        case 'DOWN':  newHead = { x: head.x,     y: head.y + 1 }; break;
        case 'LEFT':  newHead = { x: head.x - 1, y: head.y     }; break;
        case 'RIGHT': newHead = { x: head.x + 1, y: head.y     }; break;
      }

      // Wall collision
      if (
        newHead.x < 0 || newHead.x >= GRID_SIZE ||
        newHead.y < 0 || newHead.y >= GRID_SIZE
      ) {
        finishGame();
        return;
      }

      // Self collision
      if (snakeRef.current.some((s) => s.x === newHead.x && s.y === newHead.y)) {
        finishGame();
        return;
      }

      const ateFood = newHead.x === foodRef.current.x && newHead.y === foodRef.current.y;
      const newSnake = [newHead, ...snakeRef.current];
      if (!ateFood) {
        newSnake.pop();
      } else {
        foodEatenRef.current += 1;
        foodRef.current = randomFood(newSnake);
        setDisplayFood(foodEatenRef.current);
      }
      snakeRef.current = newSnake;
      setDisplayLen(newSnake.length);

      const cvs = canvasRef.current;
      if (cvs) {
        const ctx = cvs.getContext('2d');
        if (ctx) drawCanvas(ctx, newSnake, foodRef.current);
      }
    }, GAME_SPEED_MS);
  }, [finishGame]);

  // ── Auto-start (MinigameHost path) ─────────────────────────────────────────

  useEffect(() => {
    if (autoStart) {
      startGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run only on mount

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
    };
  }, []);

  // ── Keyboard controls ──────────────────────────────────────────────────────

  useEffect(() => {
    const OPPOSITE: Record<Direction, Direction> = {
      UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT',
    };

    const handleKey = (e: KeyboardEvent) => {
      if (gamePhaseRef.current !== 'playing') return;
      let next: Direction | null = null;
      switch (e.key) {
        case 'ArrowUp':    next = 'UP';    break;
        case 'ArrowDown':  next = 'DOWN';  break;
        case 'ArrowLeft':  next = 'LEFT';  break;
        case 'ArrowRight': next = 'RIGHT'; break;
        default: return;
      }
      e.preventDefault();
      if (next !== OPPOSITE[directionRef.current]) {
        pendingDirRef.current = next;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []); // stable — reads only refs

  // ── D-pad handler ──────────────────────────────────────────────────────────

  const handleDpad = useCallback((dir: Direction) => {
    if (gamePhaseRef.current !== 'playing') return;
    const OPPOSITE: Record<Direction, Direction> = {
      UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT',
    };
    if (dir !== OPPOSITE[directionRef.current]) {
      pendingDirRef.current = dir;
    }
  }, []);

  // ── Done handler ───────────────────────────────────────────────────────────

  const handleDone = useCallback(() => {
    if (!session) return;
    const lastPlaceId = scores.length > 0 ? scores[scores.length - 1].id : undefined;
    const payload: CompleteMinigamePayload = { humanScore: finalHumanScore, lastPlaceId };
    dispatch(completeMinigame(payload));
  }, [dispatch, scores, session, finalHumanScore]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="snake-game"
      role="dialog"
      aria-modal="true"
      aria-label="Snake Game Competition"
    >
      <div className="snake-phone">
        {/* ── Title bar ─────────────────────────────────────────────────── */}
        <div className="snake-title-bar">
          <span className="snake-title-text">SNAKE</span>
        </div>

        {/* ── LCD screen ────────────────────────────────────────────────── */}
        <div className="snake-lcd">
          {/* Status line */}
          <div className="snake-status" aria-live="polite" aria-atomic="true">
            <span>LEN {displayLen}</span>
            <span>F {displayFood}</span>
          </div>

          {/* Canvas + overlays */}
          <div className="snake-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="snake-canvas"
              aria-label="Snake game board"
            />
            {/* Scanline overlay */}
            <div className="snake-scanlines" aria-hidden="true" />

            {/* Ready overlay */}
            {gamePhase === 'ready' && !autoStart && (
              <div className="snake-overlay">
                <p className="snake-overlay-title">SNAKE</p>
                <button
                  className="snake-start-btn"
                  type="button"
                  onClick={startGame}
                >
                  ▶ START
                </button>
              </div>
            )}

            {/* Results overlay */}
            {gamePhase === 'results' && (
              <div className="snake-overlay snake-overlay--results">
                <p className="snake-overlay-game-over">GAME OVER</p>
                {session && scores.length > 0 ? (
                  <>
                    <ol className="snake-leaderboard">
                      {scores.map((entry, i) => (
                        <li
                          key={entry.id}
                          className={[
                            'snake-entry',
                            entry.isHuman ? 'snake-entry--you' : '',
                            i === 0 ? 'snake-entry--winner' : '',
                            i === scores.length - 1 ? 'snake-entry--last' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <span className="snake-rank" aria-hidden="true">
                            {MEDALS[i] ?? `${i + 1}.`}
                          </span>
                          <span className="snake-entry-name">
                            {entry.name}
                            {entry.isHuman && <span className="snake-you-tag"> (You)</span>}
                          </span>
                          <span className="snake-entry-score">{entry.score}</span>
                        </li>
                      ))}
                    </ol>
                    <button
                      className="snake-done-btn"
                      type="button"
                      onClick={handleDone}
                    >
                      Done ▶
                    </button>
                  </>
                ) : (
                  <p className="snake-final-score">Score: {finalHumanScore}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── D-pad controls ────────────────────────────────────────────── */}
        <div className="snake-dpad" aria-label="Direction controls">
          <button
            className="snake-dpad-btn snake-dpad-btn--up"
            type="button"
            onClick={() => handleDpad('UP')}
            aria-label="Up"
          >▲</button>
          <button
            className="snake-dpad-btn snake-dpad-btn--left"
            type="button"
            onClick={() => handleDpad('LEFT')}
            aria-label="Left"
          >◀</button>
          <div className="snake-dpad-center" aria-hidden="true" />
          <button
            className="snake-dpad-btn snake-dpad-btn--right"
            type="button"
            onClick={() => handleDpad('RIGHT')}
            aria-label="Right"
          >▶</button>
          <button
            className="snake-dpad-btn snake-dpad-btn--down"
            type="button"
            onClick={() => handleDpad('DOWN')}
            aria-label="Down"
          >▼</button>
        </div>
      </div>
    </div>
  );
}
