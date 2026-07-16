export const TILT_HAZARD_HIT_PENALTY_MS = 3_000;
export const TILT_HINT_PENALTY_MS = 30_000;

export function calculateTiltAdjustedTime(
  rawTimeMs: number,
  hazardHits: number,
  hintUsed = false,
): number {
  return rawTimeMs
    + Math.max(0, hazardHits) * TILT_HAZARD_HIT_PENALTY_MS
    + (hintUsed ? TILT_HINT_PENALTY_MS : 0);
}

/**
 * tiltLabyrinthCollision — shared collision helpers for Tilt Labyrinth.
 *
 * Kept outside the component module so TiltLabyrinthComp.tsx satisfies the
 * react-refresh/only-export-components lint rule.
 */

export interface TiltLabyrinthMazeCell {
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
}

export interface TiltLabyrinthCollisionConfig {
  radius: number;
  cellPx: number;
  mazeCols: number;
  mazeRows: number;
  mazeWidth: number;
  mazeHeight: number;
  maxCollisionStepPx: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceToSegmentSquared(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return (px - x1) ** 2 + (py - y1) ** 2;
  }

  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  const closestX = x1 + dx * t;
  const closestY = y1 + dy * t;
  return (px - closestX) ** 2 + (py - closestY) ** 2;
}

function circleTouchesMazeWall(
  maze: TiltLabyrinthMazeCell[][],
  bx: number,
  by: number,
  config: TiltLabyrinthCollisionConfig,
): boolean {
  const { radius, cellPx, mazeCols, mazeRows, mazeWidth, mazeHeight } = config;

  if (bx - radius < 0 || bx + radius > mazeWidth || by - radius < 0 || by + radius > mazeHeight) {
    return true;
  }

  const minCol = clamp(Math.floor((bx - radius) / cellPx), 0, mazeCols - 1);
  const maxCol = clamp(Math.floor((bx + radius) / cellPx), 0, mazeCols - 1);
  const minRow = clamp(Math.floor((by - radius) / cellPx), 0, mazeRows - 1);
  const maxRow = clamp(Math.floor((by + radius) / cellPx), 0, mazeRows - 1);
  const radiusSq = radius * radius;

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cell = maze[row][col];
      const x0 = col * cellPx;
      const y0 = row * cellPx;
      const x1 = x0 + cellPx;
      const y1 = y0 + cellPx;

      if (
        (cell.walls.top && distanceToSegmentSquared(bx, by, x0, y0, x1, y0) < radiusSq) ||
        (cell.walls.right && distanceToSegmentSquared(bx, by, x1, y0, x1, y1) < radiusSq) ||
        (cell.walls.bottom && distanceToSegmentSquared(bx, by, x0, y1, x1, y1) < radiusSq) ||
        (cell.walls.left && distanceToSegmentSquared(bx, by, x0, y0, x0, y1) < radiusSq)
      ) {
        return true;
      }
    }
  }

  return false;
}

export function resolveCollisions(
  maze: TiltLabyrinthMazeCell[][],
  bx: number,
  by: number,
  vx: number,
  vy: number,
  config: TiltLabyrinthCollisionConfig,
): { bx: number; by: number; vx: number; vy: number } {
  const startX = bx - vx;
  const startY = by - vy;
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) / config.maxCollisionStepPx),
  );

  let nextX = startX;
  let nextY = startY;
  let nextVx = vx;
  let nextVy = vy;
  let stepX = vx / steps;
  let stepY = vy / steps;

  for (let i = 0; i < steps; i++) {
    if (stepX !== 0) {
      const candidateX = nextX + stepX;
      if (!circleTouchesMazeWall(maze, candidateX, nextY, config)) {
        nextX = candidateX;
      } else {
        stepX = 0;
        nextVx = 0;
      }
    }

    if (stepY !== 0) {
      const candidateY = nextY + stepY;
      if (!circleTouchesMazeWall(maze, nextX, candidateY, config)) {
        nextY = candidateY;
      } else {
        stepY = 0;
        nextVy = 0;
      }
    }

    if (stepX === 0 && stepY === 0) break;
  }

  nextX = clamp(nextX, config.radius, config.mazeWidth - config.radius);
  nextY = clamp(nextY, config.radius, config.mazeHeight - config.radius);

  return { bx: nextX, by: nextY, vx: nextVx, vy: nextVy };
}
