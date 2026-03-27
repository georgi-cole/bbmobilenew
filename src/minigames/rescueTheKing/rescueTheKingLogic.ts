/**
 * rescueTheKingLogic.ts
 *
 * Pure game logic for Rescue the King: board construction, match detection,
 * gravity, swap validation, scoring, and shuffle utilities.
 * No React or DOM dependencies — fully deterministic and unit-testable.
 */

import type {
  Board,
  Cell,
  NormalCell,
  TileSymbol,
  LevelConfig,
  GameState,
} from './rescueTheKingTypes';
import { SYMBOLS } from './rescueTheKingTypes';

// ── Difficulty tuning constants ────────────────────────────────────────────────
// Edit these to adjust game feel without touching game logic.

/** Points awarded per normal tile cleared in a match. */
export const SCORE_PER_TILE = 10;
/** Points awarded per blocker hit (but not destroyed). */
export const SCORE_BLOCKER_HIT = 15;
/** Points awarded when a blocker is fully destroyed. */
export const SCORE_BLOCKER_DESTROYED = 50;
/** Extra points per combo depth (depth = consecutive cascade count). */
export const SCORE_COMBO_BONUS = 25;
/** Bonus awarded when all normal tiles are cleared. */
export const SCORE_BOARD_CLEAR = 2000;
/** Points per second remaining on timer when board is cleared. */
export const SCORE_TIME_BONUS_PER_SEC = 20;
/** Game duration in milliseconds. */
export const TIME_LIMIT_MS = 180_000; // 3 minutes
/** Maximum auto-reshuffles before forced clear (safety net). */
export const MAX_RESHUFFLES = 8;

// ── RNG ───────────────────────────────────────────────────────────────────────

/** Mulberry32 PRNG — deterministic, fast, good distribution. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let z = s;
    z = ((z ^ (z >>> 15)) * (z | 1)) >>> 0;
    z = (z ^ (z + ((z ^ (z >>> 7)) * (z | 61)))) >>> 0;
    return (z ^ (z >>> 14)) / 0x100000000;
  };
}

// ── Board construction ────────────────────────────────────────────────────────

/**
 * Build the initial board from a LevelConfig.
 * Blockers are placed as defined; normal tiles are assigned symbols
 * using the level's seed so the board is fully deterministic.
 * The algorithm avoids placing 3-in-a-row at startup.
 */
export function buildBoard(config: LevelConfig): Board {
  const rng = mulberry32(config.seed);
  const { rows, cols, blockerLayout } = config;
  const board: Board = [];

  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      const code = blockerLayout[r]?.[c] ?? '';
      if (code === 'X') {
        row.push({ kind: 'blocker', blockerKind: 'crate', hitsRemaining: 1 });
      } else if (code === 'W') {
        row.push({ kind: 'blocker', blockerKind: 'stone', hitsRemaining: 2 });
      } else {
        const symbol = pickSymbol(rng, board, r, c);
        row.push({ kind: 'normal', symbol });
      }
    }
    board.push(row);
  }

  return board;
}

/** Pick a symbol that avoids a 3-in-a-row at position (r, c). */
function pickSymbol(rng: () => number, board: Board, r: number, c: number): TileSymbol {
  // Try each symbol in random order (Fisher-Yates); fall back to any if none avoid the pattern.
  const shuffled = [...SYMBOLS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const sym of shuffled) {
    if (!wouldCreate3(board, r, c, sym)) return sym;
  }
  return shuffled[0];
}

function wouldCreate3(board: Board, r: number, c: number, sym: TileSymbol): boolean {
  const get = (row: number, col: number): TileSymbol | null => {
    const cell = board[row]?.[col];
    return cell?.kind === 'normal' ? cell.symbol : null;
  };
  // Horizontal: left-left + left
  if (get(r, c - 2) === sym && get(r, c - 1) === sym) return true;
  // Vertical: up-up + up
  if (get(r - 2, c) === sym && get(r - 1, c) === sym) return true;
  return false;
}

// ── Match detection ───────────────────────────────────────────────────────────

export interface MatchGroup {
  cells: [number, number][];
  symbol: TileSymbol;
}

/**
 * Find all horizontal and vertical match-3+ groups on the board.
 * Returns an array of MatchGroup objects. Overlapping matches are merged
 * in a later step; here we return raw contiguous runs.
 */
export function findAllMatches(board: Board): MatchGroup[] {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const groups: MatchGroup[] = [];

  // Horizontal
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const cell = board[r][c];
      if (cell.kind !== 'normal') { c++; continue; }
      const sym = cell.symbol;
      let len = 1;
      while (c + len < cols) {
        const next = board[r][c + len];
        if (next.kind === 'normal' && next.symbol === sym) len++;
        else break;
      }
      if (len >= 3) {
        const cells: [number, number][] = [];
        for (let i = 0; i < len; i++) cells.push([r, c + i]);
        groups.push({ cells, symbol: sym });
      }
      c += len;
    }
  }

  // Vertical
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const cell = board[r][c];
      if (cell.kind !== 'normal') { r++; continue; }
      const sym = cell.symbol;
      let len = 1;
      while (r + len < rows) {
        const next = board[r + len][c];
        if (next.kind === 'normal' && next.symbol === sym) len++;
        else break;
      }
      if (len >= 3) {
        const cells: [number, number][] = [];
        for (let i = 0; i < len; i++) cells.push([r + i, c]);
        groups.push({ cells, symbol: sym });
      }
      r += len;
    }
  }

  return groups;
}

// ── Match resolution ──────────────────────────────────────────────────────────

export interface ResolutionResult {
  board: Board;
  tilesRemoved: number;
  adjacentBlockerPositions: [number, number][];
}

/**
 * Remove matched cells from the board and collect adjacent blocker positions
 * for the hit-blocker step.
 */
export function applyMatchRemoval(board: Board, matches: MatchGroup[]): ResolutionResult {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const matchSet = new Set<string>();
  let tilesRemoved = 0;

  for (const g of matches) {
    for (const [r, c] of g.cells) matchSet.add(`${r},${c}`);
  }

  const newBoard: Board = board.map(row => row.map(cell => ({ ...cell } as Cell)));
  const adjacentBlockerPositions: [number, number][] = [];

  for (const g of matches) {
    for (const [r, c] of g.cells) {
      (newBoard[r][c] as Cell) = { kind: 'empty' };
      tilesRemoved++;
      // Check 4-directional neighbours for blockers
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
        const nr = r + dr; const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (matchSet.has(`${nr},${nc}`)) continue;
        if (board[nr][nc].kind === 'blocker') {
          adjacentBlockerPositions.push([nr, nc]);
        }
      }
    }
  }

  return { board: newBoard, tilesRemoved, adjacentBlockerPositions };
}

export interface BlockerHitResult {
  board: Board;
  blockersHit: number;
  blockersDestroyed: number;
}

/** Apply one hit to each unique blocker at the given positions. */
export function hitBlockers(board: Board, positions: [number, number][]): BlockerHitResult {
  const seen = new Set<string>();
  const newBoard: Board = board.map(row => row.map(cell => ({ ...cell } as Cell)));
  let blockersHit = 0;
  let blockersDestroyed = 0;

  for (const [r, c] of positions) {
    const key = `${r},${c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cell = newBoard[r][c];
    if (cell.kind !== 'blocker') continue;
    blockersHit++;
    const newHits = cell.hitsRemaining - 1;
    if (newHits <= 0) {
      (newBoard[r][c] as Cell) = { kind: 'empty' };
      blockersDestroyed++;
    } else {
      (newBoard[r][c] as Cell) = { ...cell, hitsRemaining: newHits };
    }
  }

  return { board: newBoard, blockersHit, blockersDestroyed };
}

// ── Gravity ───────────────────────────────────────────────────────────────────

/**
 * Apply gravity: tiles fall downward to fill empty cells.
 * Blockers do NOT fall — they stay in their rows.
 */
export function applyGravity(board: Board): Board {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  // Build new board, column by column
  const newBoard: Board = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (): Cell => ({ kind: 'empty' }))
  );

  for (let c = 0; c < cols; c++) {
    // Collect blockers with their rows (they stay)
    const blockers: { row: number; cell: Cell }[] = [];
    // Collect normal tiles (they fall)
    const normals: Cell[] = [];

    for (let r = 0; r < rows; r++) {
      const cell = board[r][c];
      if (cell.kind === 'blocker') {
        blockers.push({ row: r, cell });
      } else if (cell.kind === 'normal') {
        normals.push(cell);
      }
      // empty cells are just gaps
    }

    // Place blockers back at their original rows
    for (const { row, cell } of blockers) {
      newBoard[row][c] = cell;
    }

    // Fill normal tiles from bottom up, skipping blocker rows
    const emptyRows: number[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (newBoard[r][c].kind === 'empty') emptyRows.push(r);
    }
    // emptyRows is already bottom-first
    for (let i = 0; i < normals.length && i < emptyRows.length; i++) {
      newBoard[emptyRows[i]][c] = normals[normals.length - 1 - i];
    }
  }

  return newBoard;
}

// ── Swap validation ───────────────────────────────────────────────────────────

/** Return true if swapping (r1,c1) and (r2,c2) creates at least one match. */
export function swapCreatesMatch(
  board: Board, r1: number, c1: number, r2: number, c2: number
): boolean {
  const tmp: Board = board.map(row => [...row]);
  [tmp[r1][c1], tmp[r2][c2]] = [tmp[r2][c2], tmp[r1][c1]];
  return findAllMatches(tmp).length > 0;
}

/** Return true if the two cells are adjacent normal tiles and the swap creates a match. */
export function isValidSwap(
  board: Board, r1: number, c1: number, r2: number, c2: number
): boolean {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  if (r1 < 0 || r1 >= rows || c1 < 0 || c1 >= cols) return false;
  if (r2 < 0 || r2 >= rows || c2 < 0 || c2 >= cols) return false;
  if (Math.abs(r2 - r1) + Math.abs(c2 - c1) !== 1) return false;
  if (board[r1][c1].kind !== 'normal') return false;
  if (board[r2][c2].kind !== 'normal') return false;
  return swapCreatesMatch(board, r1, c1, r2, c2);
}

/** Apply a swap (no validation). */
export function performSwap(board: Board, r1: number, c1: number, r2: number, c2: number): Board {
  const newBoard: Board = board.map(row => [...row]);
  [newBoard[r1][c1], newBoard[r2][c2]] = [newBoard[r2][c2], newBoard[r1][c1]];
  return newBoard;
}

/** Return true if any valid swap exists on the board. */
export function hasAnyValidMove(board: Board): boolean {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].kind !== 'normal') continue;
      if (c + 1 < cols && board[r][c + 1].kind === 'normal' &&
          swapCreatesMatch(board, r, c, r, c + 1)) return true;
      if (r + 1 < rows && board[r + 1][c].kind === 'normal' &&
          swapCreatesMatch(board, r, c, r + 1, c)) return true;
    }
  }
  return false;
}

// ── Reshuffle ─────────────────────────────────────────────────────────────────

/**
 * Shuffle all normal tiles (preserve blockers and empty cells).
 * Uses Fisher-Yates shuffle; retries up to 10 times to ensure
 * at least one valid move exists after shuffling.
 */
export function shuffleNormalTiles(board: Board, rng: () => number): Board {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const positions: [number, number][] = [];
  const symbols: TileSymbol[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].kind === 'normal') {
        positions.push([r, c]);
        symbols.push((board[r][c] as NormalCell).symbol);
      }
    }
  }

  // Fisher-Yates shuffle with up to 10 retries to ensure valid moves exist
  for (let attempt = 0; attempt < 10; attempt++) {
    for (let i = symbols.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
    }

    const candidate: Board = board.map(row => [...row]);
    for (let i = 0; i < positions.length; i++) {
      const [r, c] = positions[i];
      (candidate[r][c] as Cell) = { kind: 'normal', symbol: symbols[i] };
    }

    if (hasAnyValidMove(candidate)) {
      return candidate;
    }
  }

  // Fallback: return last attempted board (hasAnyValidMove checked in caller)
  const newBoard: Board = board.map(row => [...row]);
  for (let i = 0; i < positions.length; i++) {
    const [r, c] = positions[i];
    (newBoard[r][c] as Cell) = { kind: 'normal', symbol: symbols[i] };
  }

  return newBoard;
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Count normal tiles remaining on the board. */
export function countNormalTiles(board: Board): number {
  let count = 0;
  for (const row of board) for (const cell of row) if (cell.kind === 'normal') count++;
  return count;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Compute the final raw score for a completed (or timed-out) game.
 *
 * Ranking rules:
 * - Nobody clears: highest tilesCleared + blockersDestroyed + comboBonus wins
 * - Multiple clear: highest boardClear + timeBonus + progressScore wins
 * - Score provides total ordering in both cases
 */
export function computeFinalScore(state: Pick<GameState,
  'tilesCleared' | 'blockersHit' | 'blockersDestroyed' | 'maxCombo' | 'boardCleared' | 'timeRemainingMs'
>): number {
  let score = 0;
  score += state.tilesCleared * SCORE_PER_TILE;
  score += state.blockersHit * SCORE_BLOCKER_HIT;
  score += state.blockersDestroyed * SCORE_BLOCKER_DESTROYED;
  score += Math.max(0, state.maxCombo - 1) * SCORE_COMBO_BONUS;
  if (state.boardCleared) {
    score += SCORE_BOARD_CLEAR;
    score += Math.floor(state.timeRemainingMs / 1000) * SCORE_TIME_BONUS_PER_SEC;
  }
  return score;
}

// ── AI simulation ─────────────────────────────────────────────────────────────

/**
 * Lightweight deterministic AI score simulation.
 *
 * Used by the competition framework to rank AI players without running the
 * full game loop. AI "plays" by clearing tiles at a rate proportional to a
 * skill level (0 = worst, 1 = best).
 *
 * @param seed - Deterministic seed for the AI's performance variation.
 * @param skillLevel - Float in [0, 1]. Controls clear rate and clear chance.
 * @param totalTiles - Total normal tiles on the board (from initialNormalTileCount).
 * @param totalTimeMs - Total time limit in ms.
 */
export function simulateAiScore(seed: number, skillLevel: number, totalTiles: number, totalTimeMs: number): number {
  const rng = mulberry32(seed);

  // AI clears a fraction of the board proportional to skill
  const clearFraction = 0.3 + skillLevel * 0.65 + (rng() - 0.5) * 0.1;
  const tilesCleared = Math.min(totalTiles, Math.round(totalTiles * Math.max(0, Math.min(1, clearFraction))));
  const blockersDestroyed = Math.round(tilesCleared * 0.1 * skillLevel);
  const blockersHit = Math.round(tilesCleared * 0.15 * skillLevel);
  const maxCombo = 1 + Math.floor(skillLevel * 4 * rng());
  const boardCleared = skillLevel > 0.75 && tilesCleared >= totalTiles && rng() > 0.3;
  const timeRemainingMs = boardCleared ? Math.round(totalTimeMs * 0.3 * skillLevel * rng()) : 0;

  return computeFinalScore({ tilesCleared, blockersHit, blockersDestroyed, maxCombo, boardCleared, timeRemainingMs });
}
