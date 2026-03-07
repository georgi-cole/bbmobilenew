/**
 * castleRescueUtils.ts
 *
 * Pure, stateless helper functions shared across the Castle Rescue module.
 * All functions are free of side-effects and safe to call from tests.
 */

import type { CellPos } from './castleRescueTypes';
import { GRID_ROWS, GRID_COLS } from './castleRescueConstants';

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
