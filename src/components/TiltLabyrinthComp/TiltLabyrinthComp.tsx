/**
 * TiltLabyrinthComp â€” Modernised native React Tilt Labyrinth competition minigame.
 *
 * Features:
 *  - Seeded recursive-backtracking maze generation (deterministic)
 *  - Ball physics with friction and acceleration
 *  - Keyboard controls (arrow keys / WASD)
 *  - Device orientation (tilt) support with graceful permission handling
 *  - Touch drag fallback for mobile devices without tilt access
 *  - Unlimited play with adjusted-time scoring (raw time + 3 seconds per hazard hit)
 *  - Results screen with full ranked leaderboard (ascending by time)
 *  - Reduced-motion: tilt controls fall back to keyboard/touch automatically
 *
 * Competition integration:
 *  - On mount, dispatches initTiltLabyrinth with pre-computed AI completion times.
 *  - On maze solved, dispatches setHumanScore then resolveTiltLabyrinthOutcome.
 *  - After the user taps Continue on the results screen, calls onComplete.
 *
 * Scoring: lower-is-better adjusted time. Winner = fastest after hazard penalties.
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
import { getDefaultCompetitionProfile } from '../../ai/competition/index';
import type { CompetitionSkillProfile } from '../../ai/competition/types';
import { mulberry32 } from '../../store/rng';
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost';
import type {
  TiltLabyrinthPrizeType,
  TiltLabyrinthRunDetails,
} from '../../features/tiltLabyrinth/tiltLabyrinthSlice';
import {
  calculateTiltAdjustedTime,
  resolveCollisions,
  type TiltLabyrinthMazeCell as MazeCell,
} from './tiltLabyrinthCollision';
import './TiltLabyrinthComp.css';

const EMPTY_GAME_PLAYERS: RootState['game']['players'] = [];

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MAZE_COLS = 19;
const MAZE_ROWS = 25;
const CELL_PX = 25;
const MAZE_W = MAZE_COLS * CELL_PX;
const MAZE_H = MAZE_ROWS * CELL_PX;
const WALL_THICKNESS = 2;
const VIGNETTE_CENTER_X_RATIO = 0.5;
const VIGNETTE_CENTER_Y_RATIO = 0.35;
const VIGNETTE_INNER_RADIUS_CELL_UNITS = 1.5;
const VIGNETTE_OUTER_RADIUS_WIDTH_RATIO = 0.8;
const BOARD_SHEEN_ALPHA = 0.12;
const WALL_GLOW_WIDTH = 5;
// Sub-pixel inset keeps the canvas border crisp around the maze area.
const MAZE_BORDER_OFFSET = 0.75;
const MAZE_BORDER_WIDTH = 1.5;
const MAZE_BORDER_INSET_TOTAL = MAZE_BORDER_OFFSET * 2;

const BALL_RADIUS = 6;
const FRICTION = 0.88;
const KEYBOARD_ACCEL = 0.55;
const TILT_ACCEL = 0.45;
const MAX_VEL = 4.5;
const MAX_COLLISION_STEP_PX = 1.5;
const HAZARD_COUNT = 4;
const HAZARD_RADIUS = 7;
const HAZARD_SPEED = 1.15;
const HAZARD_HIT_COOLDOWN_MS = 650;
const MAX_PLACEMENT_ATTEMPTS = 200;
const MIN_HAZARD_SPACING_CELLS = 2.75;
const KEY_RADIUS = 7;
const DOOR_RADIUS = 12;
const GOAL_RADIUS = 10;
const HINT_PATH_DURATION_MS = 3_000;
const ORIENTATION_DEAD_ZONE_DEGREES = 1.5;
const MAX_MAZE_RESEED_ATTEMPTS = 4;
const MAZE_RESEED_STEP = 0x9e3779b9;


const MEDALS = ['🥇', '🥈', '🥉'];

interface FeaturePoint {
  x: number;
  y: number;
  col: number;
  row: number;
}

interface Hazard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
}

interface MazePathPoint {
  col: number;
  row: number;
}

interface DeviceOrientationPermissionApi {
  requestPermission?: () => Promise<string>;
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
  hasKey: boolean;
  lockOpen: boolean;
  keyPos: FeaturePoint;
  doorPos: FeaturePoint;
  goalPos: FeaturePoint;
  hazards: Hazard[];
  hazardHits: number;
  lastHazardHitAt: number;
  hintUsed: boolean;
  hintPath: MazePathPoint[];
  hintPathUntil: number;
}

// â”€â”€â”€ Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface TiltLabyrinthCompProps {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType: TiltLabyrinthPrizeType;
  seed: number;
  onComplete: (completion?: ReactMinigameCompletion) => void;
}

// â”€â”€â”€ Seeded RNG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = ((s * 1664525 + 1013904223) >>> 0);
    return s / 0x100000000;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTiltDelta(
  deltaDegrees: number,
  deadZoneDegrees = ORIENTATION_DEAD_ZONE_DEGREES,
): number {
  if (!Number.isFinite(deltaDegrees)) return 0;
  if (Math.abs(deltaDegrees) <= deadZoneDegrees) return 0;
  const adjusted = deltaDegrees - Math.sign(deltaDegrees) * deadZoneDegrees;
  return clamp(adjusted / 30, -1, 1);
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function cellCenter(col: number, row: number): FeaturePoint {
  return {
    col,
    row,
    x: (col + 0.5) * CELL_PX,
    y: (row + 0.5) * CELL_PX,
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function formatTiltLabyrinthScore(timeMs: number): string {
  const totalSeconds = timeMs / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${(totalSeconds % 60).toFixed(2).padStart(5, '0')}`;
}

function pickFeaturePoint(
  rng: () => number,
  minCol: number,
  maxCol: number,
  minRow: number,
  maxRow: number,
  isValid: (point: FeaturePoint) => boolean,
): FeaturePoint {
  for (let i = 0; i < MAX_PLACEMENT_ATTEMPTS; i++) {
    const point = cellCenter(randomInt(rng, minCol, maxCol), randomInt(rng, minRow, maxRow));
    if (isValid(point)) return point;
  }
  return cellCenter(minCol, minRow);
}

function createHazards(
  rng: () => number,
  keyPos: FeaturePoint,
  doorPos: FeaturePoint,
  goalPos: FeaturePoint,
): Hazard[] {
  const hazards: Hazard[] = [];
  const startPos = cellCenter(0, 0);

  while (hazards.length < HAZARD_COUNT) {
    const candidate = cellCenter(
      randomInt(rng, 2, MAZE_COLS - 4),
      randomInt(rng, 2, MAZE_ROWS - 4),
    );
    const tooCloseToGameplayPoints = [
      startPos,
      keyPos,
      doorPos,
      goalPos,
      ...hazards.map((hazard) => ({ x: hazard.x, y: hazard.y })),
    ].some(
      (point) =>
        distance(candidate.x, candidate.y, point.x, point.y) <
        CELL_PX * MIN_HAZARD_SPACING_CELLS,
    );

    if (tooCloseToGameplayPoints) continue;

    const angle = rng() * Math.PI * 2;
    hazards.push({
      x: candidate.x,
      y: candidate.y,
      vx: Math.cos(angle) * HAZARD_SPEED,
      vy: Math.sin(angle) * HAZARD_SPEED,
      radius: HAZARD_RADIUS,
      phase: rng() * Math.PI * 2,
    });
  }

  return hazards;
}

// â”€â”€â”€ Maze generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SimulatedRun = TiltLabyrinthRunDetails;

function shortestPathLength(maze: MazeCell[][], start: FeaturePoint, end: FeaturePoint): number {
  const queue: Array<{ col: number; row: number; distance: number }> = [
    { col: start.col, row: start.row, distance: 0 },
  ];
  const visited = new Set([`${start.col}:${start.row}`]);
  const directions = [
    { wall: 'top' as const, dc: 0, dr: -1 },
    { wall: 'right' as const, dc: 1, dr: 0 },
    { wall: 'bottom' as const, dc: 0, dr: 1 },
    { wall: 'left' as const, dc: -1, dr: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.col === end.col && current.row === end.row) return current.distance;
    for (const direction of directions) {
      if (maze[current.row][current.col].walls[direction.wall]) continue;
      const col = current.col + direction.dc;
      const row = current.row + direction.dr;
      const key = `${col}:${row}`;
      if (col < 0 || row < 0 || col >= MAZE_COLS || row >= MAZE_ROWS || visited.has(key)) continue;
      visited.add(key);
      queue.push({ col, row, distance: current.distance + 1 });
    }
  }
  return MAZE_COLS * MAZE_ROWS;
}

interface ValidatedMazeSetup {
  maze: MazeCell[][];
  keyPos: FeaturePoint;
  doorPos: FeaturePoint;
  goalPos: FeaturePoint;
  hazards: Hazard[];
  routeCells: number;
}

function createValidatedMazeSetup(seed: number): ValidatedMazeSetup {
  const unreachablePathLength = MAZE_COLS * MAZE_ROWS;

  for (let attempt = 0; attempt < MAX_MAZE_RESEED_ATTEMPTS; attempt += 1) {
    const attemptSeed = (
      (seed >>> 0) ^
      0xfeedcafe ^
      Math.imul(attempt, MAZE_RESEED_STEP)
    ) >>> 0;
    const rng = makeRng(attemptSeed);
    const maze = generateMaze(MAZE_COLS, MAZE_ROWS, rng);
    const goalPos = cellCenter(MAZE_COLS - 1, MAZE_ROWS - 1);
    const keyPos = pickFeaturePoint(
      rng,
      Math.floor(MAZE_COLS * 0.3),
      Math.floor(MAZE_COLS * 0.55),
      Math.floor(MAZE_ROWS * 0.18),
      Math.floor(MAZE_ROWS * 0.55),
      (point) =>
        distance(point.x, point.y, CELL_PX / 2, CELL_PX / 2) > CELL_PX * 4 &&
        distance(point.x, point.y, goalPos.x, goalPos.y) > CELL_PX * 5,
    );
    const doorPos = pickFeaturePoint(
      rng,
      MAZE_COLS - 5,
      MAZE_COLS - 3,
      MAZE_ROWS - 6,
      MAZE_ROWS - 3,
      (point) =>
        distance(point.x, point.y, keyPos.x, keyPos.y) > CELL_PX * 4 &&
        distance(point.x, point.y, goalPos.x, goalPos.y) > CELL_PX * 1.75,
    );
    const routeSegments = [
      shortestPathLength(maze, cellCenter(0, 0), keyPos),
      shortestPathLength(maze, keyPos, doorPos),
      shortestPathLength(maze, doorPos, goalPos),
    ];
    if (routeSegments.every((length) => length < unreachablePathLength)) {
      return {
        maze,
        keyPos,
        doorPos,
        goalPos,
        hazards: createHazards(rng, keyPos, doorPos, goalPos),
        routeCells: routeSegments.reduce((total, length) => total + length, 0),
      };
    }
  }

  throw new Error('Tilt Labyrinth failed to generate a playable maze after automatic reseeding.');
}

function findMazePath(
  maze: MazeCell[][],
  start: MazePathPoint,
  end: MazePathPoint,
): MazePathPoint[] {
  const queue: MazePathPoint[] = [start];
  const previous = new Map<string, MazePathPoint | null>([[`${start.col}:${start.row}`, null]]);
  const directions = [
    { wall: 'top' as const, dc: 0, dr: -1 },
    { wall: 'right' as const, dc: 1, dr: 0 },
    { wall: 'bottom' as const, dc: 0, dr: 1 },
    { wall: 'left' as const, dc: -1, dr: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.col === end.col && current.row === end.row) {
      const path: MazePathPoint[] = [];
      let cursor: MazePathPoint | null = current;
      while (cursor) {
        path.push(cursor);
        cursor = previous.get(`${cursor.col}:${cursor.row}`) ?? null;
      }
      return path.reverse();
    }

    for (const direction of directions) {
      if (maze[current.row][current.col].walls[direction.wall]) continue;
      const next = { col: current.col + direction.dc, row: current.row + direction.dr };
      const key = `${next.col}:${next.row}`;
      if (
        next.col < 0 || next.row < 0 ||
        next.col >= MAZE_COLS || next.row >= MAZE_ROWS ||
        previous.has(key)
      ) continue;
      previous.set(key, current);
      queue.push(next);
    }
  }

  return [];
}

function buildRemainingRoute(maze: MazeCell[][], game: GameState): MazePathPoint[] {
  const start = {
    col: clamp(Math.floor(game.ball.x / CELL_PX), 0, MAZE_COLS - 1),
    row: clamp(Math.floor(game.ball.y / CELL_PX), 0, MAZE_ROWS - 1),
  };
  const destinations: MazePathPoint[] = [];
  if (!game.hasKey) destinations.push(game.keyPos);
  if (!game.lockOpen) destinations.push(game.doorPos);
  destinations.push(game.goalPos);

  const route: MazePathPoint[] = [start];
  let segmentStart = start;
  for (const destination of destinations) {
    const segment = findMazePath(maze, segmentStart, destination);
    route.push(...segment.slice(1));
    segmentStart = destination;
  }
  return route;
}

function simulateHumanLikeAiRun(
  profile: CompetitionSkillProfile,
  routeCells: number,
  rng: () => number,
): SimulatedRun {
  const navigationSkill =
    profile.mental * 0.35 + profile.precision * 0.4 + profile.nerve * 0.15 + profile.consistency * 0.1;
  const movementMs = routeCells * (180 + (100 - navigationSkill) * 1.2);
  const hesitationMs = routeCells * (40 + (100 - profile.mental) * 0.9);
  const mistakes = Math.floor(rng() * 3 + (100 - profile.mental) / 24);
  let mistakeMs = 0;
  for (let index = 0; index < mistakes; index++) mistakeMs += 3_000 + rng() * 9_000;
  const hazardHits = Math.floor(rng() * (1 + (100 - profile.precision) / 18));
  const recoveryMs = hazardHits * (1_000 + rng() * 3_000);
  const startAndGateHesitationMs = 5_000 + rng() * 10_000;
  const confusionChance = 0.03 + profile.chokeRisk / 500;
  const confusionMs = rng() < confusionChance ? 30_000 + rng() * 330_000 : 0;
  const rawTimeMs = Math.max(
    15_000,
    Math.round(movementMs + hesitationMs + mistakeMs + recoveryMs + startAndGateHesitationMs + confusionMs),
  );
  return {
    rawTimeMs,
    hazardHits,
    adjustedTimeMs: calculateTiltAdjustedTime(rawTimeMs, hazardHits),
  };
}
function traceMazeWalls(ctx: CanvasRenderingContext2D, maze: MazeCell[][]): void {
  ctx.beginPath();
  for (let row = 0; row < MAZE_ROWS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const x = col * CELL_PX;
      const y = row * CELL_PX;
      const cell = maze[row][col];

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
    }
  }
}

function drawMaze(
  ctx: CanvasRenderingContext2D,
  maze: MazeCell[][],
  game: GameState,
  elapsed: number,
) {
  const { ball, finishTime, hasKey, lockOpen, keyPos, doorPos, goalPos, hazards } = game;

  // Background
  ctx.fillStyle = '#10192d';
  ctx.fillRect(0, 0, MAZE_W, MAZE_H);

  const vignette = ctx.createRadialGradient(
    MAZE_W * VIGNETTE_CENTER_X_RATIO,
    MAZE_H * VIGNETTE_CENTER_Y_RATIO,
    CELL_PX * VIGNETTE_INNER_RADIUS_CELL_UNITS,
    MAZE_W * VIGNETTE_CENTER_X_RATIO,
    MAZE_H * VIGNETTE_CENTER_Y_RATIO,
    MAZE_W * VIGNETTE_OUTER_RADIUS_WIDTH_RATIO,
  );
  vignette.addColorStop(0, 'rgba(22, 32, 58, 0.16)');
  vignette.addColorStop(1, 'rgba(4, 10, 24, 0.28)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, MAZE_W, MAZE_H);

  const sheen = ctx.createLinearGradient(0, 0, 0, MAZE_H);
  sheen.addColorStop(0, `rgba(125, 211, 252, ${BOARD_SHEEN_ALPHA})`);
  sheen.addColorStop(0.2, 'rgba(125, 211, 252, 0.03)');
  sheen.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, MAZE_W, MAZE_H);

  const ambientOrb = ctx.createRadialGradient(
    MAZE_W * 0.72,
    MAZE_H * 0.24,
    0,
    MAZE_W * 0.72,
    MAZE_H * 0.24,
    CELL_PX * 6,
  );
  ambientOrb.addColorStop(0, 'rgba(96, 165, 250, 0.1)');
  ambientOrb.addColorStop(1, 'rgba(96, 165, 250, 0)');
  ctx.fillStyle = ambientOrb;
  ctx.fillRect(0, 0, MAZE_W, MAZE_H);

  const pulse = 0.6 + 0.4 * Math.sin(elapsed / 300);

  // Show the route from the ball through every remaining objective.
  if (game.hintPath.length > 1 && performance.now() < game.hintPathUntil) {
    ctx.save();
    ctx.beginPath();
    game.hintPath.forEach((point, index) => {
      const x = (point.col + 0.5) * CELL_PX;
      const y = (point.row + 0.5) * CELL_PX;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.34)';
    ctx.lineWidth = 11;
    ctx.shadowColor = 'rgba(250, 204, 21, 0.9)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.restore();
  }

  // Key
  if (!hasKey) {
    ctx.fillStyle = `rgba(251, 191, 36, ${0.35 + 0.25 * pulse})`;
    ctx.beginPath();
    ctx.arc(keyPos.x, keyPos.y, KEY_RADIUS + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(keyPos.x, keyPos.y, KEY_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#fff8dc';
    ctx.font = `${Math.round(CELL_PX * 0.52)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔑', keyPos.x, keyPos.y + 0.5);
  }

  // Door / gate near the goal
  const doorPulse = 0.65 + 0.35 * Math.sin(elapsed / 220 + 1);
  ctx.fillStyle = lockOpen
    ? `rgba(34, 197, 94, ${0.12 + 0.08 * doorPulse})`
    : `rgba(244, 63, 94, ${0.12 + 0.08 * doorPulse})`;
  ctx.beginPath();
  ctx.arc(doorPos.x, doorPos.y, DOOR_RADIUS + 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = lockOpen ? 'rgba(74, 222, 128, 0.8)' : 'rgba(251, 113, 133, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(doorPos.x, doorPos.y, DOOR_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `${Math.round(CELL_PX * 0.56)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = lockOpen ? '#dcfce7' : '#ffe4e6';
  ctx.fillText(lockOpen ? '🟢' : '🔒', doorPos.x, doorPos.y + 0.5);

  // Goal (only truly available once the lock opens)
  ctx.fillStyle = lockOpen
    ? `rgba(34, 197, 94, ${0.25 * pulse})`
    : 'rgba(148, 163, 184, 0.12)';
  ctx.fillRect(goalPos.col * CELL_PX + 1, goalPos.row * CELL_PX + 1, CELL_PX - 2, CELL_PX - 2);

  ctx.fillStyle = lockOpen ? `rgba(34, 197, 94, ${0.8 * pulse})` : 'rgba(148, 163, 184, 0.6)';
  ctx.font = `${Math.round(CELL_PX * 0.55)}px system-ui`;
  ctx.fillText('🏁', goalPos.x, goalPos.y);

  // Walls
  ctx.save();
  ctx.strokeStyle = 'rgba(99, 187, 255, 0.18)';
  ctx.lineWidth = WALL_GLOW_WIDTH;
  ctx.lineCap = 'round';
  traceMazeWalls(ctx, maze);
  ctx.stroke();

  ctx.strokeStyle = '#63bbff';
  ctx.lineWidth = WALL_THICKNESS;
  ctx.lineCap = 'square';
  traceMazeWalls(ctx, maze);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(99, 187, 255, 0.16)';
  ctx.lineWidth = MAZE_BORDER_WIDTH;
  ctx.strokeRect(
    MAZE_BORDER_OFFSET,
    MAZE_BORDER_OFFSET,
    MAZE_W - MAZE_BORDER_INSET_TOTAL,
    MAZE_H - MAZE_BORDER_INSET_TOTAL,
  );
  ctx.restore();

  // Hazards
  hazards.forEach((hazard) => {
    const glow = ctx.createRadialGradient(
      hazard.x,
      hazard.y,
      0,
      hazard.x,
      hazard.y,
      hazard.radius * 2.2,
    );
    glow.addColorStop(0, 'rgba(248, 113, 113, 0.7)');
    glow.addColorStop(1, 'rgba(248, 113, 113, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hazard.x, hazard.y, hazard.radius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#fff1f2';
    ctx.font = `${Math.round(CELL_PX * 0.42)}px system-ui`;
    ctx.fillText('✦', hazard.x, hazard.y + 0.5);
  });

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
  ctx.fillStyle = 'rgba(255, 248, 220, 0.65)';
  ctx.beginPath();
  ctx.arc(ball.x - 2, ball.y - 2, 2.1, 0, Math.PI * 2);
  ctx.fill();
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function TiltLabyrinthComp({
  participantIds,
  participants,
  prizeType,
  seed,
  onComplete,
}: TiltLabyrinthCompProps) {
  const dispatch = useAppDispatch();
  const labState = useAppSelector((s: RootState) => s.tiltLabyrinth);
  const gamePlayers = useAppSelector((s: RootState) => s.game?.players ?? EMPTY_GAME_PLAYERS);
  const competitionIdentity = [seed, prizeType, participantIds.join('\u0000')].join(':');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const mazeRef = useRef<MazeCell[][] | null>(null);
  const rafRef = useRef<number>(0);
  const resolvedRef = useRef(false);
  const initializedCompetitionRef = useRef<string | null>(null);
  const orientationCleanupRef = useRef<(() => void) | null>(null);
  const orientationBaselineRef = useRef<{ gamma: number; beta: number } | null>(null);
  const hintStatusTimerRef = useRef<number | null>(null);

  const [useTilt, setUseTilt] = useState(false);
  const [hazardHits, setHazardHits] = useState(0);
  const [hasKey, setHasKey] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hintStatus, setHintStatus] = useState(() => ({
    competitionIdentity,
    used: false,
    active: false,
  }));
  const hintUsed = hintStatus.competitionIdentity === competitionIdentity && hintStatus.used;
  const hintActive = hintStatus.competitionIdentity === competitionIdentity && hintStatus.active;

  // â”€â”€ Initialise on mount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    // Strict Mode replays effects by running cleanup and setup again. The cleanup
    // resets the slice to idle, so allow that replay to initialize the same
    // competition again. Once Redux is active, keep guarding against prop-only
    // rerenders so a completed result is never overwritten.
    if (
      initializedCompetitionRef.current === competitionIdentity &&
      labState?.phase !== 'idle'
    ) return;
    initializedCompetitionRef.current = competitionIdentity;

    const {
      maze,
      keyPos,
      doorPos,
      goalPos,
      hazards,
      routeCells,
    } = createValidatedMazeSetup(seed);
    mazeRef.current = maze;

    // Compute AI scores (completion times in ms â€” lower is better)
    const aiScores: Record<string, number> = {};
    const humanParticipant = participants?.find((p) => p.isHuman);
    const humanId = humanParticipant?.id ?? null;

    const runDetails: Record<string, SimulatedRun> = {};

    participants?.forEach((p, idx) => {
      if (p.isHuman) return;
      const profile = gamePlayers.find((player) => player.id === p.id)?.competitionProfile
        ?? getDefaultCompetitionProfile();
      const aiRng = makeRng((seed ^ Math.imul(idx + 1, 0x9e3779b9)) >>> 0);
      const run = simulateHumanLikeAiRun(profile, routeCells, aiRng);
      runDetails[p.id] = run;
      aiScores[p.id] = run.adjustedTimeMs;
    });

    // Fallback for when no participants structure is provided
    if (!participants || participants.length === 0) {
      const fallbackRng = mulberry32((seed >>> 0) ^ 0xabcdef01);
      for (const id of participantIds) {
        if (id === humanId) continue;
        const run = simulateHumanLikeAiRun(getDefaultCompetitionProfile(), routeCells, fallbackRng);
        runDetails[id] = run;
        aiScores[id] = run.adjustedTimeMs;
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
        aiRunDetails: runDetails,
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
      hasKey: false,
      lockOpen: false,
      keyPos,
      doorPos,
      goalPos,
      hazards,
      hazardHits: 0,
      lastHazardHitAt: -HAZARD_HIT_COOLDOWN_MS,
      hintUsed: false,
      hintPath: [],
      hintPathUntil: 0,
    };
    resolvedRef.current = false;

  // Include all props that supply competition data. The stable identity guard
  // prevents parent rerenders with new array instances from resetting a result.
  }, [
    competitionIdentity,
    dispatch,
    seed,
    participantIds,
    participants,
    prizeType,
    gamePlayers,
    labState?.phase,
  ]);

  useEffect(() => () => {
    dispatch(resetTiltLabyrinth());
    cancelAnimationFrame(rafRef.current);
    orientationCleanupRef.current?.();
    if (hintStatusTimerRef.current !== null) window.clearTimeout(hintStatusTimerRef.current);
  }, [dispatch]);

  // â”€â”€ Finish handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleFinish = useCallback(
    (timeMs: number) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      const hits = gameRef.current?.hazardHits ?? 0;
      const usedHint = gameRef.current?.hintUsed ?? false;
      const adjustedTimeMs = calculateTiltAdjustedTime(timeMs, hits, usedHint);
      dispatch(setHumanScore({
        rawTimeMs: timeMs,
        hazardHits: hits,
        hintUsed: usedHint,
        adjustedTimeMs,
      }));
      dispatch(resolveTiltLabyrinthOutcome());
    },
    [dispatch],
  );

  // â”€â”€ Game loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        const nextElapsedSeconds = Math.floor(gs.elapsed / 1000);
        setElapsedSeconds((current) => current === nextElapsedSeconds ? current : nextElapsedSeconds);


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
        const resolved = resolveCollisions(maze, nx, ny, gs.ball.vx, gs.ball.vy, {
          radius: BALL_RADIUS,
          cellPx: CELL_PX,
          mazeCols: MAZE_COLS,
          mazeRows: MAZE_ROWS,
          mazeWidth: MAZE_W,
          mazeHeight: MAZE_H,
          maxCollisionStepPx: MAX_COLLISION_STEP_PX,
        });
        gs.ball.x = resolved.bx;
        gs.ball.y = resolved.by;
        gs.ball.vx = resolved.vx;
        gs.ball.vy = resolved.vy;

        // Key pickup
        if (!gs.hasKey && distance(gs.ball.x, gs.ball.y, gs.keyPos.x, gs.keyPos.y) < KEY_RADIUS + BALL_RADIUS + 2) {
          gs.hasKey = true;
          setHasKey(true);
        }

        // Unlock the gate once the player brings the key to the lock.
        if (gs.hasKey && !gs.lockOpen && distance(gs.ball.x, gs.ball.y, gs.doorPos.x, gs.doorPos.y) < DOOR_RADIUS + BALL_RADIUS) {
          gs.lockOpen = true;
          setLockOpen(true);
        }

        // Floating hazards
        gs.hazards.forEach((hazard) => {
          hazard.x += hazard.vx;
          hazard.y += hazard.vy;

          if (hazard.x - hazard.radius < 0 || hazard.x + hazard.radius > MAZE_W) {
            hazard.vx *= -1;
            hazard.x = clamp(hazard.x, hazard.radius, MAZE_W - hazard.radius);
          }
          if (hazard.y - hazard.radius < 0 || hazard.y + hazard.radius > MAZE_H) {
            hazard.vy *= -1;
            hazard.y = clamp(hazard.y, hazard.radius, MAZE_H - hazard.radius);
          }

          const hitDistance = distance(gs.ball.x, gs.ball.y, hazard.x, hazard.y);
          if (
            hitDistance < BALL_RADIUS + hazard.radius &&
            gs.elapsed - gs.lastHazardHitAt > HAZARD_HIT_COOLDOWN_MS
          ) {
            gs.lastHazardHitAt = gs.elapsed;
            gs.hazardHits += 1;
            setHazardHits(gs.hazardHits);

            const angle = Math.atan2(gs.ball.y - hazard.y, gs.ball.x - hazard.x);
            gs.ball.vx += Math.cos(angle) * 2.6;
            gs.ball.vy += Math.sin(angle) * 2.6;
          }
        });

        // Check goal (only once the lock is open)
        const dist = distance(gs.ball.x, gs.ball.y, gs.goalPos.x, gs.goalPos.y);
        if (gs.lockOpen && dist < GOAL_RADIUS + BALL_RADIUS) {
          gs.finished = true;
          gs.finishTime = Math.round(gs.elapsed);
          handleFinish(gs.finishTime);
          // Draw final frame then stop â€” no RAF after goal reached
          drawMaze(ctx, maze, gs, gs.elapsed);
          return;
        }
      }

      drawMaze(ctx, maze, gs, gs.elapsed);
      // Only continue the loop while playing; stop once finished
      if (!gs.finished) {
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    rafRef.current = animId;

    return () => cancelAnimationFrame(animId);
  }, [handleFinish]);

  const handleHint = useCallback(() => {
    const game = gameRef.current;
    const maze = mazeRef.current;
    if (!game || !maze || game.finished || game.hintUsed) return;

    game.hintUsed = true;
    game.hintPath = buildRemainingRoute(maze, game);
    game.hintPathUntil = performance.now() + HINT_PATH_DURATION_MS;
    setHintStatus({ competitionIdentity, used: true, active: true });

    if (hintStatusTimerRef.current !== null) window.clearTimeout(hintStatusTimerRef.current);
    hintStatusTimerRef.current = window.setTimeout(() => {
      setHintStatus((current) => current.competitionIdentity === competitionIdentity
        ? { ...current, active: false }
        : current);
      hintStatusTimerRef.current = null;
    }, HINT_PATH_DURATION_MS);
  }, [competitionIdentity]);

  // â”€â”€ Keyboard controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const clearTransientInput = () => {
      const gs = gameRef.current;
      if (gs) {
        gs.keys.clear();
        gs.touchDrag.active = false;
        gs.tiltX = 0;
        gs.tiltY = 0;
      }
      orientationBaselineRef.current = null;
      setUseTilt(false);
    };
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
    const onVisibilityChange = () => {
      if (document.hidden) clearTransientInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearTransientInput);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearTransientInput();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearTransientInput);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // â”€â”€ Device orientation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const gs = gameRef.current;
      if (!gs) return;
      if (e.gamma == null || e.beta == null) return;
      if (!orientationBaselineRef.current) {
        orientationBaselineRef.current = { gamma: e.gamma, beta: e.beta };
        gs.tiltX = 0;
        gs.tiltY = 0;
        return;
      }
      gs.tiltX = normalizeTiltDelta(e.gamma - orientationBaselineRef.current.gamma);
      gs.tiltY = normalizeTiltDelta(e.beta - orientationBaselineRef.current.beta);
      setUseTilt(gs.tiltX !== 0 || gs.tiltY !== 0);
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as unknown as DeviceOrientationPermissionApi)
        .requestPermission === 'function'
    ) {
      // iOS 13+ requires explicit permission
      (DeviceOrientationEvent as unknown as Required<DeviceOrientationPermissionApi>)
        .requestPermission()
        .then((perm) => {
          if (perm === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
            orientationCleanupRef.current = () =>
              window.removeEventListener('deviceorientation', handleOrientation);
          }
        })
        .catch(() => {
          // Permission denied â€” keyboard/touch controls still work
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

  // â”€â”€ Pointer controls (mouse, touch, and pen) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stopDrag = () => {
      const gs = gameRef.current;
      if (gs) gs.touchDrag.active = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      const gs = gameRef.current;
      if (!gs) return;
      canvas.setPointerCapture?.(event.pointerId);
      gs.touchDrag = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      const gs = gameRef.current;
      if (!gs || !gs.touchDrag.active || !event.isPrimary) return;
      event.preventDefault();
      gs.touchDrag.lastX = event.clientX;
      gs.touchDrag.lastY = event.clientY;
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (canvas.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      stopDrag();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('lostpointercapture', stopDrag);

    return () => {
      stopDrag();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('lostpointercapture', stopDrag);
    };
  }, []);

  // â”€â”€ Results screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const leaderboard = useMemo(() => {
    if (!labState || labState.phase !== 'complete') return null;
    const entries = Object.entries(labState.finalScores)
      .map(([id, timeMs]) => {
        const p = labState.participants.find((x) => x.id === id);
        const details = labState.runDetails?.[id] ?? {
          rawTimeMs: timeMs,
          hazardHits: 0,
          adjustedTimeMs: timeMs,
        };
        return {
          id,
          name: p?.name ?? id,
          isHuman: p?.isHuman ?? false,
          timeMs,
          ...details,
        };
      })
      .sort((a, b) =>
        a.adjustedTimeMs - b.adjustedTimeMs ||
        a.hazardHits - b.hazardHits ||
        a.rawTimeMs - b.rawTimeMs ||
        a.id.localeCompare(b.id),
      );
    return entries;
  }, [labState]);

  if (leaderboard && labState?.phase === 'complete') {
    const winnerEntry = leaderboard[0];
    const humanEntry = leaderboard.find((e) => e.isHuman);
    const continueValue = labState.humanScore ?? 0;
    let resultsSummary = 'Final standings recorded.';
    if (humanEntry) {
      resultsSummary = `Your adjusted time: ${formatTiltLabyrinthScore(humanEntry.adjustedTimeMs)}`;
    } else if (winnerEntry) {
      resultsSummary = `${winnerEntry.name} finished in ${formatTiltLabyrinthScore(winnerEntry.timeMs)}`;
    }

    return (
      <MinigameCompleteWrapper
        className="tilt-labyrinth-results"
        onContinue={() => onComplete({
          rawValue: continueValue,
          rawResults: labState.finalScores,
          authoritativeWinnerId: labState.winnerId,
          authoritativeLastPlaceId: labState.lastPlaceId,
        })}
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
                  {formatTiltLabyrinthScore(entry.adjustedTimeMs)}
                  <small>
                    {` ${formatTiltLabyrinthScore(entry.rawTimeMs)} + ${entry.hazardHits * 3}s hazards${entry.hintUsed ? ' + 30s hint' : ''}`}
                  </small>
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
                {resultsSummary}
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

  // â”€â”€ Playing screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const objectiveText = !hasKey
    ? 'Find the key'
    : !lockOpen
      ? 'Unlock the gate'
      : 'Reach the goal';

  return (
    <div className="tilt-labyrinth-host" aria-label="Tilt Labyrinth">
      <div className="tilt-labyrinth-hud">
        <div className="tilt-labyrinth-controls-hint">
          {useTilt
            ? '📱 Tilt to move • Keys also work'
            : '⬆⬇⬅➡ Arrow keys / WASD or drag'}
        </div>
      </div>

      <div className="tilt-labyrinth-status-bar" aria-label="Tilt Labyrinth status">
        <div className="tilt-labyrinth-status-chip tilt-labyrinth-status-chip--objective">
          🎯 {objectiveText}
        </div>
        <div
          className={[
            'tilt-labyrinth-status-chip',
            hasKey ? 'tilt-labyrinth-status-chip--done' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          🔑 {hasKey ? 'Key found' : 'No key'}
        </div>
        <div
          className={[
            'tilt-labyrinth-status-chip',
            lockOpen ? 'tilt-labyrinth-status-chip--done' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          🚪 {lockOpen ? 'Gate open' : 'Gate locked'}
        </div>
        <div className="tilt-labyrinth-status-chip">
          Time {formatTiltLabyrinthScore(elapsedSeconds * 1000)}
        </div>
        <div className="tilt-labyrinth-status-chip tilt-labyrinth-status-chip--danger">
          Hazards {hazardHits} · +{hazardHits * 3}s
        </div>
        <button
          type="button"
          className={[
            'tilt-labyrinth-status-chip',
            'tilt-labyrinth-status-chip--hint',
            hintActive ? 'tilt-labyrinth-status-chip--hint-active' : '',
          ].filter(Boolean).join(' ')}
          onClick={handleHint}
          disabled={hintUsed}
          aria-label="Use hint: add 30 seconds and show the correct path for 3 seconds"
        >
          {hintActive ? '✨ Path shown · +30s' : hintUsed ? '✓ Hint used · +30s' : '💡 Hint · +30s'}
        </button>
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
        Find the 🔑 key, unlock the gate, and survive the floating hazards to reach the 🏁 goal.
      </p>
    </div>
  );
}
