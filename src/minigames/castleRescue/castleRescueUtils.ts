/**
 * castleRescueUtils.ts
 *
 * Pure, stateless helper functions shared across the Castle Rescue module.
 * All functions are free of side-effects and safe to call from tests.
 */

import type { CellPos } from './castleRescueTypes';
import { GRID_ROWS, GRID_COLS } from './castleRescueConstants';

// ── Pipe geometry constants ───────────────────────────────────────────────────

/** Default pipe collision width in pixels. */
export const PIPE_WIDTH = 48;

/** Default pipe collision height in pixels. */
export const PIPE_HEIGHT = 64;

// ── Geometry types ────────────────────────────────────────────────────────────

/**
 * Minimal platform geometry.
 * Structurally compatible with the local Platform interface in CastleRescueGame.
 */
export interface PlatformDef {
  x: number;
  y: number;
  w: number;
  h: number;
  oneWay?: boolean;
}

/**
 * Minimal pipe geometry.
 * Structurally compatible with the local Pipe interface in CastleRescueGame.
 */
export interface PipeDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  entryZoneWidth: number;
  slotIndex: number;
  routeIndex: number;
  pipeType: string;
  done: boolean;
}

/**
 * Minimal level geometry accepted by validateAndFixPipeClearance.
 * Structurally compatible with the local LevelGeom in CastleRescueGame.
 */
export interface LevelGeomDef {
  pipes: PipeDef[];
  platforms: PlatformDef[];
}

/**
 * Required vertical clearance (pixels) above each pipe top so that the player
 * can stand on the pipe without clipping into a platform or ceiling above.
 * = PH (40) + 8 px safety margin.
 */
export const REQUIRED_PIPE_CLEARANCE = 48;

// ── Factory functions ─────────────────────────────────────────────────────────

/**
 * Factory for platform geometry objects.
 *
 * The first parameter `_id` is present for API symmetry with `makePipe` (which
 * requires an id for its returned object).  Platform has no id field so the
 * value is intentionally ignored.
 *
 * @param _id             Unused — included for call-site symmetry with makePipe.
 * @param x               Left edge of the platform.
 * @param y               Top edge of the platform.
 * @param w               Platform width in pixels.
 * @param h               Platform height in pixels.
 * @param options.oneWay  When true the surface only blocks downward landings
 *                        (pass-through from below).  Omitted by default (FULL_SOLID).
 */
export function makePlatform(
  _id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options?: { oneWay?: boolean },
): PlatformDef {
  const def: PlatformDef = { x, y, w, h };
  if (options?.oneWay) def.oneWay = true;
  return def;
}

/**
 * Factory for pipe geometry objects.
 *
 * All pipes produced by this factory are FULL_SOLID by default (no oneWay).
 *
 * @param id              Unique identifier.
 * @param x               Left edge of the pipe.
 * @param y               Top edge of the pipe.
 * @param slotIndex       Index of the physical pipe slot in the level.
 * @param routeIndex      Route position (0/1/2) for correct pipes; -1 for wrong.
 * @param pipeType        Behaviour when entered (correct/setback/bonus/ambush/dead).
 * @param entryZoneWidth  Centred entry-zone width.  Defaults to PIPE_WIDTH.
 */
export function makePipe(
  id: string,
  x: number,
  y: number,
  slotIndex: number,
  routeIndex: number,
  pipeType: string,
  entryZoneWidth?: number,
): PipeDef {
  return {
    id,
    x, y,
    width: PIPE_WIDTH,
    height: PIPE_HEIGHT,
    entryZoneWidth: entryZoneWidth ?? PIPE_WIDTH,
    slotIndex,
    routeIndex,
    pipeType,
    done: false,
  };
}

/**
 * Validates and adjusts level geometry so that every pipe has at least
 * REQUIRED_PIPE_CLEARANCE (48 px) of unobstructed vertical space above it.
 *
 * For each pipe, finds the nearest horizontally-overlapping platform whose
 * bottom edge is above the pipe top.  If the clearance between that platform
 * bottom and the pipe top is less than REQUIRED_PIPE_CLEARANCE, the platform
 * is moved upward (y decreased) by the minimal amount needed to restore it.
 *
 * Mutates `level.platforms` in-place.
 */
export function validateAndFixPipeClearance(level: LevelGeomDef): void {
  for (const pipe of level.pipes) {
    const pipeTop = pipe.y;
    // Find the platform whose bottom is closest to (but at or above) the pipe top
    // AND whose x-range horizontally overlaps the pipe.
    let closestCeiling: PlatformDef | null = null;
    let closestBottom = -Infinity;
    for (const plat of level.platforms) {
      const platBottom = plat.y + plat.h;
      if (
        platBottom <= pipeTop &&
        plat.x < pipe.x + pipe.width &&
        plat.x + plat.w > pipe.x
      ) {
        if (platBottom > closestBottom) {
          closestBottom = platBottom;
          closestCeiling = plat;
        }
      }
    }
    if (closestCeiling !== null) {
      const clearance = pipeTop - closestBottom;
      if (clearance < REQUIRED_PIPE_CLEARANCE) {
        const deficit = REQUIRED_PIPE_CLEARANCE - clearance;
        // Move the ceiling platform upward (decrease y) to create sufficient clearance.
        closestCeiling.y -= deficit;
      }
    }
  }
}

/**
 * Serialise a CellPos to a canonical string key suitable for use in
 * Sets, Maps, and equality comparisons: "row,col".
 */
export function cellKey(pos: CellPos): string {
  return `${pos.row},${pos.col}`;
}

/**
 * True if two positions refer to the exact same grid cell.
 * Prefer this over deep-equality checks to avoid object-identity pitfalls.
 */
export function posEqual(a: CellPos, b: CellPos): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * True if two cells are orthogonally adjacent (Manhattan distance === 1).
 * Diagonal adjacency is intentionally NOT supported — pipes only connect
 * through shared edges, not corners.
 */
export function areAdjacent(a: CellPos, b: CellPos): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

/**
 * True if the given position lies within the playable grid.
 * Out-of-bounds positions must never appear in generated maps.
 */
export function inBounds(pos: CellPos): boolean {
  return pos.row >= 0 && pos.row < GRID_ROWS && pos.col >= 0 && pos.col < GRID_COLS;
}

/**
 * Verify that every position in an ordered sequence is within bounds
 * and that each consecutive pair is orthogonally adjacent.
 * Returns true only when the path is fully connected and in-bounds.
 *
 * Edge-case: a sequence of length 0 or 1 is trivially valid.
 */
export function isConnectedPath(positions: CellPos[]): boolean {
  for (let i = 0; i < positions.length; i++) {
    if (!inBounds(positions[i])) return false;
    if (i > 0 && !areAdjacent(positions[i - 1], positions[i])) return false;
  }
  return true;
}
