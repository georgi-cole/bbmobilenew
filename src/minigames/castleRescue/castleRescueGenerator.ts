/**
 * castleRescueGenerator.ts
 *
 * Deterministic map generator for Castle Rescue.
 *
 * Key guarantees:
 *  - All randomness derives solely from the caller-supplied seed (mulberry32).
 *    No Date.now() or Math.random() is used inside this module.
 *  - If a generation attempt fails validation the generator retries with a
 *    derived seed (seed + attempt) up to MAX_GENERATOR_ATTEMPTS times.
 *    This keeps the fallback deterministic and reproducible.
 *  - The produced map always has exactly CORRECT_ROUTE_LENGTH (3) route pipes
 *    and between MIN_TOTAL_PIPES and MAX_TOTAL_PIPES total pipe segments.
 */

import { mulberry32 } from '../../store/rng';
import type { CastleRescueMap, CellPos, PipeSegment } from './castleRescueTypes';
import {
  GRID_ROWS,
  GRID_COLS,
  MAX_GENERATOR_ATTEMPTS,
  CORRECT_ROUTE_LENGTH,
  MIN_TOTAL_PIPES,
  MAX_TOTAL_PIPES,
} from './castleRescueConstants';
import { cellKey, areAdjacent, inBounds, isConnectedPath } from './castleRescueUtils';

// ─── Route templates ──────────────────────────────────────────────────────────

/**
 * A pre-validated route template.
 * source → route[0] → route[1] → route[2] → sink must form an
 * orthogonally-connected path with all positions inside the grid.
 */
interface RouteTemplate {
  source: CellPos;
  route: [CellPos, CellPos, CellPos];
  sink: CellPos;
}

/**
 * Hard-coded set of valid route templates.
 * Each template is verified by validateGeneratedMap() at runtime for safety,
 * but they have been manually confirmed correct.
 *
 * Having 8+ templates ensures the game feels varied across seeds.
 */
const ROUTE_TEMPLATES: RouteTemplate[] = [
  // ── Horizontal variants ──────────────────────────────────────────────────
  {
    // Straight horizontal through the middle row
    source: { row: 2, col: 0 },
    route: [{ row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }],
    sink: { row: 2, col: 4 },
  },
  {
    // Straight horizontal through the top row
    source: { row: 0, col: 0 },
    route: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
    sink: { row: 0, col: 4 },
  },
  {
    // Straight horizontal through the bottom row
    source: { row: 4, col: 0 },
    route: [{ row: 4, col: 1 }, { row: 4, col: 2 }, { row: 4, col: 3 }],
    sink: { row: 4, col: 4 },
  },
  // ── Vertical variants ─────────────────────────────────────────────────────
  {
    // Straight vertical through the middle column
    source: { row: 0, col: 2 },
    route: [{ row: 1, col: 2 }, { row: 2, col: 2 }, { row: 3, col: 2 }],
    sink: { row: 4, col: 2 },
  },
  // ── Curved / L-shaped variants ────────────────────────────────────────────
  {
    // Start middle-left, curve upward
    source: { row: 2, col: 0 },
    route: [{ row: 2, col: 1 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
    sink: { row: 1, col: 3 },
  },
  {
    // Start middle-left, curve downward
    source: { row: 2, col: 0 },
    route: [{ row: 2, col: 1 }, { row: 3, col: 1 }, { row: 3, col: 2 }],
    sink: { row: 3, col: 3 },
  },
  {
    // Start middle-left, go up first then right
    source: { row: 2, col: 0 },
    route: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
    sink: { row: 1, col: 3 },
  },
  {
    // Start middle-left, go down first then right
    source: { row: 2, col: 0 },
    route: [{ row: 3, col: 0 }, { row: 3, col: 1 }, { row: 3, col: 2 }],
    sink: { row: 3, col: 3 },
  },
  {
    // Right-then-up hook
    source: { row: 2, col: 0 },
    route: [{ row: 2, col: 1 }, { row: 2, col: 2 }, { row: 1, col: 2 }],
    sink: { row: 1, col: 3 },
  },
  {
    // Right-then-down hook
    source: { row: 2, col: 0 },
    route: [{ row: 2, col: 1 }, { row: 2, col: 2 }, { row: 3, col: 2 }],
    sink: { row: 3, col: 3 },
  },
];

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Pick `n` unique elements from `arr` using the provided RNG function.
 * Uses a Fisher-Yates partial shuffle so each call advances the RNG
 * deterministically by `n` steps regardless of array size.
 *
 * Returns fewer than `n` items if the array has fewer than `n` elements.
 */
function pickN<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    result.push(...pool.splice(idx, 1));
  }
  return result;
}

/**
 * Attempt to generate one map using the provided seed.
 * Returns null only if an unexpected internal error occurs (e.g. template
 * with zero available decoy cells); normal validation failures are handled
 * by the caller via retries.
 */
function tryGenerate(seed: number): CastleRescueMap | null {
  const rng = mulberry32(seed >>> 0);

  // 1. Select a route template deterministically.
  const templateIdx = Math.floor(rng() * ROUTE_TEMPLATES.length);
  const template = ROUTE_TEMPLATES[templateIdx];
  const { source, route, sink } = template;

  // 2. Build route pipe segments (isRoute: true).
  const routePipes: PipeSegment[] = route.map((pos, i) => ({
    id: `route-${i}`,
    row: pos.row,
    col: pos.col,
    isRoute: true,
  }));

  // 3. Determine how many decoy pipes to add (3..5 so total is 6..8).
  // MAX_TOTAL_PIPES - CORRECT_ROUTE_LENGTH = 8 - 3 = 5 max decoys.
  // MIN_TOTAL_PIPES - CORRECT_ROUTE_LENGTH = 6 - 3 = 3 min decoys.
  const minDecoys = MIN_TOTAL_PIPES - CORRECT_ROUTE_LENGTH;
  const maxDecoys = MAX_TOTAL_PIPES - CORRECT_ROUTE_LENGTH;
  const decoyCount = minDecoys + Math.floor(rng() * (maxDecoys - minDecoys + 1));

  // 4. Build the set of occupied cells so decoys don't overlap with
  //    source, sink, or any route pipe.
  const occupiedKeys = new Set<string>([
    cellKey(source),
    cellKey(sink),
    ...route.map(cellKey),
  ]);

  const availableCells: CellPos[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const pos: CellPos = { row: r, col: c };
      if (!occupiedKeys.has(cellKey(pos))) {
        availableCells.push(pos);
      }
    }
  }

  if (availableCells.length < decoyCount) {
    // Should not happen with a 5×5 grid and at most 5 occupied cells, but
    // guard against template changes that reduce available space.
    return null;
  }

  // 5. Pick decoy positions deterministically.
  const decoyPositions = pickN(rng, availableCells, decoyCount);

  const decoyPipes: PipeSegment[] = decoyPositions.map((pos, i) => ({
    id: `decoy-${i}`,
    row: pos.row,
    col: pos.col,
    isRoute: false,
  }));

  return {
    gridRows: GRID_ROWS,
    gridCols: GRID_COLS,
    source,
    sink,
    pipes: [...routePipes, ...decoyPipes],
    correctRoute: routePipes.map((p) => p.id),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a generated map for structural correctness.
 *
 * Checks:
 *  - source and sink are in bounds
 *  - each route pipe exists in map.pipes and is marked isRoute
 *  - the full path (source → routePipes → sink) is connected and in-bounds
 *  - no duplicate pipe IDs or grid positions
 *  - total pipe count is within [MIN_TOTAL_PIPES, MAX_TOTAL_PIPES]
 *  - correctRoute length equals CORRECT_ROUTE_LENGTH
 *
 * Returns true if all checks pass, false otherwise.
 * This function is exported so tests can assert map validity directly.
 */
export function validateGeneratedMap(map: CastleRescueMap): boolean {
  // Bounds checks on fixed positions
  if (!inBounds(map.source) || !inBounds(map.sink)) return false;

  // Correct route length
  if (map.correctRoute.length !== CORRECT_ROUTE_LENGTH) return false;

  // Total pipe count
  if (map.pipes.length < MIN_TOTAL_PIPES || map.pipes.length > MAX_TOTAL_PIPES) return false;

  // Build a lookup of route pipe IDs → PipeSegment
  const pipeById = new Map<string, PipeSegment>();
  for (const pipe of map.pipes) {
    if (pipeById.has(pipe.id)) return false; // duplicate ID
    pipeById.set(pipe.id, pipe);
  }

  // Verify every correctRoute ID exists and is actually marked as a route pipe
  const routePipes: PipeSegment[] = [];
  for (const id of map.correctRoute) {
    const pipe = pipeById.get(id);
    if (!pipe || !pipe.isRoute) return false;
    routePipes.push(pipe);
  }

  // Build the full path: source → routePipe[0] → … → routePipe[2] → sink
  const fullPath: CellPos[] = [
    map.source,
    ...routePipes.map((p) => ({ row: p.row, col: p.col })),
    map.sink,
  ];

  // Every consecutive pair must be orthogonally adjacent and in bounds
  if (!isConnectedPath(fullPath)) return false;

  // No two pipes may share the same grid cell
  const posKeys = new Set<string>();
  for (const pipe of map.pipes) {
    const key = cellKey({ row: pipe.row, col: pipe.col });
    if (posKeys.has(key)) return false;
    posKeys.add(key);
  }

  // No pipe may overlap with source or sink
  for (const pipe of map.pipes) {
    if (
      (pipe.row === map.source.row && pipe.col === map.source.col) ||
      (pipe.row === map.sink.row && pipe.col === map.sink.col)
    ) {
      return false;
    }
  }

  // All route pipes must be adjacent to the correct neighbours
  // (already covered by isConnectedPath above, but explicit adjacency check
  //  between consecutive route pipes is also enforced here for clarity)
  for (let i = 0; i + 1 < routePipes.length; i++) {
    if (!areAdjacent({ row: routePipes[i].row, col: routePipes[i].col },
                     { row: routePipes[i + 1].row, col: routePipes[i + 1].col })) {
      return false;
    }
  }

  return true;
}

/**
 * Generate a deterministic, solvable Castle Rescue map for the given seed.
 *
 * If the first generation attempt does not pass validateGeneratedMap the
 * generator retries up to MAX_GENERATOR_ATTEMPTS times using derived seeds
 * (seed+1, seed+2, …).  This guarantees determinism: the same original seed
 * always produces the same final map regardless of how many retries occurred.
 *
 * Throws if all attempts fail (indicates a logic bug in the templates or
 * validation; should never happen in production).
 */
export function generateMapForSeed(seed: number): CastleRescueMap {
  for (let attempt = 0; attempt < MAX_GENERATOR_ATTEMPTS; attempt++) {
    // Deterministic fallback: shift seed by attempt index so retries are
    // reproducible without ever touching Math.random or Date.now.
    const effectiveSeed = (seed + attempt) >>> 0;
    const map = tryGenerate(effectiveSeed);
    if (map !== null && validateGeneratedMap(map)) {
      return map;
    }
  }
  throw new Error(
    `[castleRescue] generateMapForSeed failed after ${MAX_GENERATOR_ATTEMPTS} attempts ` +
      `(seed=${seed}). Check ROUTE_TEMPLATES and validateGeneratedMap.`,
  );
}
