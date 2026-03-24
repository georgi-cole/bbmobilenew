/**
 * TiltLabyrinthComp — Modernised native React Tilt Labyrinth competition minigame.
 *
 * Features:
 *  - Seeded recursive-backtracking maze generation (deterministic)
 *  - Ball physics with friction and acceleration
 *  - Keyboard controls (arrow keys / WASD)
 *  - Device orientation (tilt) support with graceful permission handling
 *  - Touch drag fallback for mobile devices without tilt access
 *  - Timer HUD (lower time = better score)
 *  - 60-second time limit — DNF recorded as 60 000 ms
 *  - Results screen with full ranked leaderboard (ascending by time)
 *  - Reduced-motion: tilt controls fall back to keyboard/touch automatically
 *
 * Competition integration:
 *  - On mount, dispatches initTiltLabyrinth with pre-computed AI completion times.
 *  - On maze solved (or timeout), dispatches setHumanScore then resolveTiltLabyrinthOutcome.
 *  - After the user taps Continue on the results screen, calls onComplete.
 *
 * Scoring: lower-is-better. Winner = fastest time. Last place = slowest time.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  initTiltLabyrinth,
  setHumanScore,
  resetTiltLabyrinth,
} from '../../features/tiltLabyrinth/tiltLabyrinthSlice';
import { resolveTiltLabyrinthOutcome } from '../../features/tiltLabyrinth/thunks';
import { getMinigameAiModel, simulateAiPerformance } from '../../ai/competition/index';
import { mulberry32 } from '../../store/rng';
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost';
import type { TiltLabyrinthPrizeType } from '../../features/tiltLabyrinth/tiltLabyrinthSlice';
import './TiltLabyrinthComp.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAZE_COLS = 13;
const MAZE_ROWS = 13;
const CELL_PX = 36;
const MAZE_W = MAZE_COLS * CELL_PX;
const MAZE_H = MAZE_ROWS * CELL_PX;
const WALL_THICKNESS = 2;

const BALL_RADIUS = 8;
const FRICTION = 0.88;
const KEYBOARD_ACCEL = 0.55;
const TILT_ACCEL = 0.45;
const MAX_VEL = 4.5;

const TIME_LIMIT_MS = 60_000;

const MEDALS = ['🥇', '🥈', '🥉'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface MazeCell {
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
}

interface GameState {
  ball: { x: number; y: number; vx: number; vy: number };
  tiltX: number;
  tiltY: number;
  keys: Set<string>;
  touchDrag: { active: boolean; startX: number; startY: number; lastX: number; lastY: number };
  startTime: number;
  elapsed: number;
  finished: boolean;
  finishTime: number | null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TiltLabyrinthCompProps {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType: TiltLabyrinthPrizeType;
  seed: number;
  onComplete: (completion?: ReactMinigameCompletion) => void;
}

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = ((s * 1664525 + 1013904223) >>> 0);
    return s / 0x100000000;
  };
}

// ─── Maze generation ─────────────────────────────────────────────────────────

function generateMaze(cols: number, rows: number, rng: () => number): MazeCell[][] {
  const grid: MazeCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      walls: { top: true, right: true, bottom: true, left: true },
    })),
  );

  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const stack: [number, number][] = [];
  let cx = 0;
  let cy = 0;
  visited[cy][cx] = true;

  for (;;) {
    const neighbours: [number, number, 'top' | 'right' | 'bottom' | 'left'][] = [];
    if (cy > 0 && !visited[cy - 1][cx]) neighbours.push([cx, cy - 1, 'top']);
    if (cx < cols - 1 && !visited[cy][cx + 1]) neighbours.push([cx + 1, cy, 'right']);
    if (cy < rows - 1 && !visited[cy + 1][cx]) neighbours.push([cx, cy + 1, 'bottom']);
    if (cx > 0 && !visited[cy][cx - 1]) neighbours.push([cx - 1, cy, 'left']);

    if (neighbours.length > 0) {
      const idx = Math.floor(rng() * neighbours.length);
      const [nx, ny, dir] = neighbours[idx];
      grid[cy][cx].walls[dir] = false;
      const opposite: Record<string, keyof MazeCell['walls']> = {
        top: 'bottom', right: 'left', bottom: 'top', left: 'right',
      };
      grid[ny][nx].walls[opposite[dir]] = false;
      visited[ny][nx] = true;
      stack.push([cx, cy]);
      cx = nx;
      cy = ny;
    } else if (stack.length > 0) {
      [cx, cy] = stack.pop()!;
    } else {
      break;
    }
  }

  return grid;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function drawMaze(
  ctx: CanvasRenderingContext2D,
  maze: MazeCell[][],
  ball: { x: number; y: number },
  finishTime: number | null,
  elapsed: number,
) {
  const w = MAZE_COLS * CELL_PX;
  const h = MAZE_ROWS * CELL_PX;

  // Background
  ctx.fillStyle = '#0d1424';
  ctx.fillRect(0, 0, w, h);

  // Goal highlight (bottom-right cell)
  const goalCX = (MAZE_COLS - 1) * CELL_PX;
  const goalCY = (MAZE_ROWS - 1) * CELL_PX;
  const pulse = 0.6 + 0.4 * Math.sin(elapsed / 300);
  ctx.fillStyle = `rgba(34, 197, 94, ${0.25 * pulse})`;
  ctx.fillRect(goalCX + 1, goalCY + 1, CELL_PX - 2, CELL_PX - 2);

  // Goal icon
  ctx.fillStyle = `rgba(34, 197, 94, ${0.8 * pulse})`;
  ctx.font = `${Math.round(CELL_PX * 0.55)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏁', goalCX + CELL_PX / 2, goalCY + CELL_PX / 2);

  // Walls
  ctx.strokeStyle = '#4ea8de';
  ctx.lineWidth = WALL_THICKNESS;
  ctx.lineCap = 'square';

  for (let row = 0; row < MAZE_ROWS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const x = col * CELL_PX;
      const y = row * CELL_PX;
      const cell = maze[row][col];

      ctx.beginPath();
      if (cell.walls.top) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + CELL_PX, y);
      }
      if (cell.walls.right) {
        ctx.moveTo(x + CELL_PX, y);
        ctx.lineTo(x + CELL_PX, y + CELL_PX);
      }
      if (cell.walls.bottom) {
        ctx.moveTo(x, y + CELL_PX);
        ctx.lineTo(x + CELL_PX, y + CELL_PX);
      }
      if (cell.walls.left) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + CELL_PX);
      }
      ctx.stroke();
    }
  }

  // Ball glow
  const gradient = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, BALL_RADIUS * 2);
  gradient.addColorStop(0, 'rgba(251,191,36,0.5)');
  gradient.addColorStop(1, 'rgba(251,191,36,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS * 2, 0, Math.PI * 2);
  ctx.fill();

  // Ball
  ctx.fillStyle = finishTime ? '#22c55e' : '#fbbf24';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ─── Ball–wall collision ──────────────────────────────────────────────────────

function resolveCollisions(
  maze: MazeCell[][],
  bx: number,
  by: number,
  vx: number,
  vy: number,
): { bx: number; by: number; vx: number; vy: number } {
  const r = BALL_RADIUS;
  const cp = CELL_PX;

  const col = Math.floor(bx / cp);
  const row = Math.floor(by / cp);

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cr = row + dy;
      const cc = col + dx;
      if (cr < 0 || cr >= MAZE_ROWS || cc < 0 || cc >= MAZE_COLS) continue;

      const cell = maze[cr][cc];
      const cx0 = cc * cp;
      const cy0 = cr * cp;
      const cx1 = cx0 + cp;
      const cy1 = cy0 + cp;

      // Top wall
      if (cell.walls.top && by - r < cy0 && bx > cx0 && bx < cx1) {
        by = cy0 + r;
        vy = Math.abs(vy) * 0.3;
      }
      // Bottom wall
      if (cell.walls.bottom && by + r > cy1 && bx > cx0 && bx < cx1) {
        by = cy1 - r;
        vy = -Math.abs(vy) * 0.3;
      }
      // Left wall
      if (cell.walls.left && bx - r < cx0 && by > cy0 && by < cy1) {
        bx = cx0 + r;
        vx = Math.abs(vx) * 0.3;
      }
      // Right wall
      if (cell.walls.right && bx + r > cx1 && by > cy0 && by < cy1) {
        bx = cx1 - r;
        vx = -Math.abs(vx) * 0.3;
      }
    }
  }

  // Clamp to canvas
  bx = Math.max(r, Math.min(MAZE_W - r, bx));
  by = Math.max(r, Math.min(MAZE_H - r, by));

  return { bx, by, vx, vy };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TiltLabyrinthComp({
  participantIds,
  participants,
  prizeType,
  seed,
  onComplete,
}: TiltLabyrinthCompProps) {
  const dispatch = useAppDispatch();
  const labState = useAppSelector(
    (s: RootState) =>
      (s as RootState & { tiltLabyrinth?: ReturnType<typeof import('../../features/tiltLabyrinth/tiltLabyrinthSlice').default> })
        .tiltLabyrinth,
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const mazeRef = useRef<MazeCell[][] | null>(null);
  const rafRef = useRef<number>(0);
  const resolvedRef = useRef(false);
  const orientationCleanupRef = useRef<(() => void) | null>(null);

  // Display timer (seconds, 1 decimal)
  const [displayTime, setDisplayTime] = useState(0);
  const [useTilt, setUseTilt] = useState(false);

  // ── Initialise on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const rng = makeRng((seed >>> 0) ^ 0xfeedcafe);
    const maze = generateMaze(MAZE_COLS, MAZE_ROWS, rng);
    mazeRef.current = maze;

    // Compute AI scores (completion times in ms — lower is better)
    const aiScores: Record<string, number> = {};
    const humanParticipant = participants?.find((p) => p.isHuman);
    const humanId = humanParticipant?.id ?? null;

    const aiModel = getMinigameAiModel('tiltLabyrinth');

    participants?.forEach((p, idx) => {
      if (p.isHuman) return;
      aiScores[p.id] = Math.round(
        simulateAiPerformance({
          minigameKey: 'tiltLabyrinth',
          seed,
          playerId: p.id,
          participantIndex: idx,
          profile: undefined,
          minigameModel: {
            ...aiModel,
            minScore: 5_000,
            maxScore: TIME_LIMIT_MS,
          },
        }),
      );
    });

    // Fallback for when no participants structure is provided
    if (!participants || participants.length === 0) {
      const fallbackRng = mulberry32((seed >>> 0) ^ 0xabcdef01);
      for (const id of participantIds) {
        if (id === humanId) continue;
        aiScores[id] = Math.round(5_000 + fallbackRng() * 45_000);
      }
    }

    const participantNames: Record<string, string> = {};
    for (const p of participants ?? []) {
      participantNames[p.id] = p.name;
    }
    for (const id of participantIds) {
      if (!participantNames[id]) participantNames[id] = id;
    }

    dispatch(
      initTiltLabyrinth({
        participantIds,
        participantNames,
        humanPlayerId: humanId,
        competitionType: prizeType,
        seed,
        aiScores,
      }),
    );

    // Initialise game state
    gameRef.current = {
      ball: { x: CELL_PX / 2, y: CELL_PX / 2, vx: 0, vy: 0 },
      tiltX: 0,
      tiltY: 0,
      keys: new Set(),
      touchDrag: { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0 },
      startTime: performance.now(),
      elapsed: 0,
      finished: false,
      finishTime: null,
    };

    return () => {
      dispatch(resetTiltLabyrinth());
      cancelAnimationFrame(rafRef.current);
      orientationCleanupRef.current?.();
    };
  // dispatch is stable (Redux guarantee) but included for exhaustive-deps correctness
  }, [dispatch]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Finish handler ─────────────────────────────────────────────────────────
  const handleFinish = useCallback(
    (timeMs: number) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      dispatch(setHumanScore(timeMs));
      dispatch(resolveTiltLabyrinthOutcome());
    },
    [dispatch],
  );

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;

    const tick = () => {
      const gs = gameRef.current;
      const maze = mazeRef.current;
      if (!gs || !maze) return;

      if (!gs.finished) {
        gs.elapsed = performance.now() - gs.startTime;

        // Update display timer every ~100ms
        setDisplayTime(Math.min(gs.elapsed, TIME_LIMIT_MS));

        // Check timeout
        if (gs.elapsed >= TIME_LIMIT_MS) {
          gs.finished = true;
          gs.finishTime = TIME_LIMIT_MS;
          handleFinish(TIME_LIMIT_MS);
          // Final frame
          drawMaze(ctx, maze, gs.ball, gs.finishTime, gs.elapsed);
          return;
        }

        // Compute acceleration
        let ax = 0;
        let ay = 0;

        // Keyboard / key input
        if (gs.keys.has('ArrowLeft') || gs.keys.has('KeyA')) ax -= KEYBOARD_ACCEL;
        if (gs.keys.has('ArrowRight') || gs.keys.has('KeyD')) ax += KEYBOARD_ACCEL;
        if (gs.keys.has('ArrowUp') || gs.keys.has('KeyW')) ay -= KEYBOARD_ACCEL;
        if (gs.keys.has('ArrowDown') || gs.keys.has('KeyS')) ay += KEYBOARD_ACCEL;

        // Tilt (device orientation)
        ax += gs.tiltX * TILT_ACCEL;
        ay += gs.tiltY * TILT_ACCEL;

        // Touch drag delta
        if (gs.touchDrag.active) {
          const dx = gs.touchDrag.lastX - gs.touchDrag.startX;
          const dy = gs.touchDrag.lastY - gs.touchDrag.startY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 4) {
            ax += (dx / dist) * KEYBOARD_ACCEL * Math.min(dist / 40, 1.5);
            ay += (dy / dist) * KEYBOARD_ACCEL * Math.min(dist / 40, 1.5);
          }
        }

        // Apply physics
        gs.ball.vx = (gs.ball.vx + ax) * FRICTION;
        gs.ball.vy = (gs.ball.vy + ay) * FRICTION;

        // Clamp velocity
        const spd = Math.sqrt(gs.ball.vx ** 2 + gs.ball.vy ** 2);
        if (spd > MAX_VEL) {
          gs.ball.vx = (gs.ball.vx / spd) * MAX_VEL;
          gs.ball.vy = (gs.ball.vy / spd) * MAX_VEL;
        }

        // Move ball
        const nx = gs.ball.x + gs.ball.vx;
        const ny = gs.ball.y + gs.ball.vy;

        // Resolve wall collisions
        const resolved = resolveCollisions(maze, nx, ny, gs.ball.vx, gs.ball.vy);
        gs.ball.x = resolved.bx;
        gs.ball.y = resolved.by;
        gs.ball.vx = resolved.vx;
        gs.ball.vy = resolved.vy;

        // Check goal (bottom-right cell centre ± tolerance)
        const goalX = (MAZE_COLS - 0.5) * CELL_PX;
        const goalY = (MAZE_ROWS - 0.5) * CELL_PX;
        const dist = Math.sqrt((gs.ball.x - goalX) ** 2 + (gs.ball.y - goalY) ** 2);
        if (dist < CELL_PX * 0.65) {
          gs.finished = true;
          gs.finishTime = Math.round(gs.elapsed);
          handleFinish(gs.finishTime);
        }
      }

      drawMaze(ctx, maze, gs.ball, gs.finishTime, gs.elapsed);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    rafRef.current = animId;

    return () => cancelAnimationFrame(animId);
  }, [handleFinish]);

  // ── Keyboard controls ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const gs = gameRef.current;
      if (!gs) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
           'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        gs.keys.add(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const gs = gameRef.current;
      if (!gs) return;
      gs.keys.delete(e.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ── Device orientation ────────────────────────────────────────────────────
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const gs = gameRef.current;
      if (!gs) return;
      const gamma = e.gamma ?? 0; // left/right tilt
      const beta = e.beta ?? 0;   // front/back tilt
      gs.tiltX = Math.max(-1, Math.min(1, gamma / 30));
      gs.tiltY = Math.max(-1, Math.min(1, (beta - 45) / 30));
      setUseTilt(true);
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function'
    ) {
      // iOS 13+ requires explicit permission
      (DeviceOrientationEvent as { requestPermission: () => Promise<string> })
        .requestPermission()
        .then((perm) => {
          if (perm === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
            orientationCleanupRef.current = () =>
              window.removeEventListener('deviceorientation', handleOrientation);
          }
        })
        .catch(() => {
          // Permission denied — keyboard/touch controls still work
        });
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      window.addEventListener('deviceorientation', handleOrientation);
      orientationCleanupRef.current = () =>
        window.removeEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      orientationCleanupRef.current?.();
      orientationCleanupRef.current = null;
    };
  }, []);

  // ── Touch controls ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const gs = gameRef.current;
      if (!gs) return;
      const t = e.touches[0];
      gs.touchDrag = {
        active: true,
        startX: t.clientX,
        startY: t.clientY,
        lastX: t.clientX,
        lastY: t.clientY,
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const gs = gameRef.current;
      if (!gs || !gs.touchDrag.active) return;
      const t = e.touches[0];
      gs.touchDrag.lastX = t.clientX;
      gs.touchDrag.lastY = t.clientY;
    };
    const onTouchEnd = () => {
      const gs = gameRef.current;
      if (!gs) return;
      gs.touchDrag.active = false;
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // ── Results screen ────────────────────────────────────────────────────────
  const leaderboard = useMemo(() => {
    if (!labState || labState.phase !== 'complete') return null;
    const entries = Object.entries(labState.finalScores)
      .map(([id, timeMs]) => {
        const p = labState.participants.find((x) => x.id === id);
        return {
          id,
          name: p?.name ?? id,
          isHuman: p?.isHuman ?? false,
          timeMs,
        };
      })
      .sort((a, b) => a.timeMs - b.timeMs); // ascending: best (lowest) first
    return entries;
  }, [labState]);

  if (leaderboard && labState?.phase === 'complete') {
    const humanEntry = leaderboard.find((e) => e.isHuman);
    const humanMs = humanEntry?.timeMs ?? TIME_LIMIT_MS;
    const winnerEntry = leaderboard[0];

    return (
      <MinigameCompleteWrapper
        className="tilt-labyrinth-results"
        onContinue={() => onComplete({ rawValue: humanMs })}
        placementsNode={
          <ol className="tilt-labyrinth-placements" role="list" aria-label="Final standings">
            {leaderboard.map((entry, i) => (
              <li
                key={entry.id}
                className={[
                  'tilt-labyrinth-placement-row',
                  entry.isHuman ? 'tilt-labyrinth-placement-row--you' : '',
                  i === 0 ? 'tilt-labyrinth-placement-row--winner' : '',
                  i === leaderboard.length - 1 ? 'tilt-labyrinth-placement-row--last' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="listitem"
              >
                <span className="tilt-labyrinth-rank">{MEDALS[i] ?? `${i + 1}.`}</span>
                <span className="tilt-labyrinth-pname">
                  {entry.name}
                  {entry.isHuman && (
                    <span className="tilt-labyrinth-you-tag" aria-label="(you)">
                      {' '}(you)
                    </span>
                  )}
                </span>
                <span className="tilt-labyrinth-time">
                  {entry.timeMs >= TIME_LIMIT_MS ? 'DNF' : `${(entry.timeMs / 1000).toFixed(2)}s`}
                </span>
              </li>
            ))}
          </ol>
        }
        placementsRole="list"
        placementsAriaLabel="Final standings"
      >
        <div className="tilt-labyrinth-results-hero">
          <div className="tilt-labyrinth-trophy">🏆</div>
          <h2 className="tilt-labyrinth-results-title">
            {humanEntry && humanEntry.id === winnerEntry?.id
              ? 'You Win!'
              : `${winnerEntry?.name ?? 'Winner'} Wins!`}
          </h2>
          {(() => {
            const rank = leaderboard.findIndex((e) => e.isHuman);
            return (
              <p className="tilt-labyrinth-results-subtitle">
                {humanMs >= TIME_LIMIT_MS
                  ? "You didn't finish in time."
                  : `Your time: ${(humanMs / 1000).toFixed(2)}s`}
                {rank >= 0 && (
                  <span className="tilt-labyrinth-your-rank">
                    {' '}• Rank {rank + 1} of {leaderboard.length}
                  </span>
                )}
              </p>
            );
          })()}
        </div>
      </MinigameCompleteWrapper>
    );
  }

  // ── Playing screen ────────────────────────────────────────────────────────
  const remainingMs = Math.max(0, TIME_LIMIT_MS - displayTime);
  const remainingSec = (remainingMs / 1000).toFixed(1);
  const timerWarning = remainingMs < 15_000;

  return (
    <div className="tilt-labyrinth-host" aria-label="Tilt Labyrinth">
      <div className="tilt-labyrinth-hud">
        <div
          className={['tilt-labyrinth-timer', timerWarning ? 'tilt-labyrinth-timer--warning' : '']
            .filter(Boolean)
            .join(' ')}
          aria-live="polite"
          aria-label={`Time remaining: ${remainingSec} seconds`}
        >
          ⏱ {remainingSec}s
        </div>
        <div className="tilt-labyrinth-controls-hint">
          {useTilt
            ? '📱 Tilt to move • Keys also work'
            : '⬆⬇⬅➡ Arrow keys / WASD or drag'}
        </div>
      </div>

      <div className="tilt-labyrinth-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={MAZE_W}
          height={MAZE_H}
          className="tilt-labyrinth-canvas"
          aria-hidden="true"
        />
      </div>

      <p className="tilt-labyrinth-goal-hint">
        Navigate the 🟡 ball to the 🏁 goal!
      </p>
    </div>
  );
}
