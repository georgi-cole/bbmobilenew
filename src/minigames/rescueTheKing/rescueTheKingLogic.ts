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
    // `z ^ (z >>> 14)` uses XOR which returns a signed 32-bit integer in JS.
    // The extra `>>> 0` coerces to unsigned so the result is always in [0, 1).
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

// ── Board construction ────────────────────────────────────────────────────────

/**
 * Build the initial board from a LevelConfig.
 *
 * Symbol resolution priority (per cell):
 *  1. If `config.tileLayout[r][c]` is a non-empty valid symbol → use it directly.
 *     This allows fully deterministic, hand-validated levels.
 *  2. Otherwise fall back to the seeded RNG with the 3-in-a-row avoidance algorithm.
 *
 * The combined seed is `config.seed ^ runtimeSeed` (defaults to config.seed when
 * runtimeSeed is 0) so the board varies deterministically per session while
 * remaining fully reproducible.
 *
 * @param config       - Level configuration with blocker layout and base seed.
 * @param runtimeSeed  - Optional per-session seed XOR'd with config.seed.
 *                       Defaults to 0 (no variation beyond config.seed).
 */
export function buildBoard(config: LevelConfig, runtimeSeed = 0): Board {
  const rng = mulberry32((config.seed ^ runtimeSeed) >>> 0);
  const { rows, cols, blockerLayout } = config;
  const board: Board = [];

  for (let r = 0; r < rows; r++) {
    // Push an empty row placeholder so horizontal look-back works during
    // construction (wouldCreate3 reads board[r][c-1] and board[r][c-2]).
    const row: Cell[] = Array.from({ length: cols }, (): Cell => ({ kind: 'empty' }));
    board.push(row);

    for (let c = 0; c < cols; c++) {
      const code = blockerLayout[r]?.[c] ?? '';
      if (code === 'X') {
        row[c] = { kind: 'blocker', blockerKind: 'crate', hitsRemaining: 1 };
      } else if (code === 'W') {
        row[c] = { kind: 'blocker', blockerKind: 'stone', hitsRemaining: 2 };
      } else {
        // Resolve symbol: use tileLayout if provided and valid, else RNG.
        // A non-empty, invalid tileLayout symbol (e.g. a typo) is surfaced via
        // validateLevel() so authors discover it before shipping.  At runtime we
        // fall back to the RNG rather than throwing, which is safe in production.
        const layoutSym = config.tileLayout?.[r]?.[c] ?? '';
        const isValidLayoutSym = layoutSym !== '' && (SYMBOLS as readonly string[]).includes(layoutSym);
        const symbol = isValidLayoutSym
          ? (layoutSym as TileSymbol)
          : pickSymbol(rng, board, r, c);
        row[c] = { kind: 'normal', symbol };
      }
    }
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

/**
 * Check whether placing `sym` at (r, c) would complete a horizontal or
 * vertical run of 3.  The board must already contain cells for (r, 0..c-1)
 * (i.e. the current row must be populated up to col c-1 before this call).
 */
function wouldCreate3(board: Board, r: number, c: number, sym: TileSymbol): boolean {
  const get = (row: number, col: number): TileSymbol | null => {
    const cell = board[row]?.[col];
    return cell?.kind === 'normal' ? cell.symbol : null;
  };
  // Horizontal: left-left + left (same row, already written)
  if (get(r, c - 2) === sym && get(r, c - 1) === sym) return true;
  // Vertical: up-up + up (prior rows)
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
 * for the hit-blocker step.  Uses the matchSet of unique positions so cells
 * that are part of both a horizontal and vertical match are only counted once.
 */
export function applyMatchRemoval(board: Board, matches: MatchGroup[]): ResolutionResult {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const matchSet = new Set<string>();

  for (const g of matches) {
    for (const [r, c] of g.cells) matchSet.add(`${r},${c}`);
  }

  const newBoard: Board = board.map(row => row.map(cell => ({ ...cell } as Cell)));
  const adjacentBlockerPositions: [number, number][] = [];
  let tilesRemoved = 0;

  for (const key of matchSet) {
    const [rStr, cStr] = key.split(',');
    const r = parseInt(rStr, 10);
    const c = parseInt(cStr, 10);
    (newBoard[r][c] as Cell) = { kind: 'empty' };
    tilesRemoved++;
    // Check 4-directional neighbours for blockers
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      const nr = r + dr; const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (matchSet.has(`${nr},${nc}`)) continue;
      if (board[nr][nc].kind === 'blocker') {
        adjacentBlockerPositions.push([nr, nc]);
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
 * Apply gravity: normal tiles fall downward to fill empty cells within each
 * column segment.  Blockers are immovable and segment the column — tiles
 * above a blocker cannot fall through it to fill empty cells below.
 *
 * Algorithm: scan each column bottom→top, maintaining a `writeRow` pointer
 * for the next slot to receive a falling tile.  When a blocker is encountered,
 * it is fixed in place and `writeRow` is reset to the row immediately above it
 * so tiles above the blocker can only fill empty rows in their own segment.
 */
export function applyGravity(board: Board): Board {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const newBoard: Board = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (__, c): Cell => ({ ...board[r][c] }))
  );

  for (let c = 0; c < cols; c++) {
    // First pass: fix all blockers in-place (already copied from board above).
    // Second pass: apply gravity within each segment between blockers.
    let writeRow = rows - 1;

    for (let r = rows - 1; r >= 0; r--) {
      const cell = board[r][c];

      if (cell.kind === 'blocker') {
        // Blocker stays; empty out any rows that writeRow skipped above it.
        while (writeRow > r) {
          newBoard[writeRow][c] = { kind: 'empty' };
          writeRow--;
        }
        // writeRow === r; set it to r to mark blocker row as occupied.
        writeRow = r - 1;
      } else if (cell.kind === 'normal') {
        // Place this tile at writeRow (which is ≤ r), then move writeRow up.
        // When writeRow === r the tile is already in its correct position
        // within this segment — skip the move but still decrement writeRow
        // so the next tile above knows this slot is taken.
        if (writeRow >= 0 && writeRow !== r) {
          newBoard[writeRow][c] = cell;
          newBoard[r][c] = { kind: 'empty' };
        }
        writeRow--;
      }
      // empty cells are just gaps; writeRow stays put so the next normal tile
      // fills this slot.
    }

    // Fill any remaining slots above the last blocker with empty.
    while (writeRow >= 0) {
      newBoard[writeRow][c] = { kind: 'empty' };
      writeRow--;
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

// ── Valid move enumeration ─────────────────────────────────────────────────────

/** A pair of adjacent cells whose swap produces at least one match. */
export interface ValidMove {
  r1: number; c1: number; r2: number; c2: number;
}

/**
 * Return ALL adjacent swaps that produce at least one match.
 *
 * This is the canonical "move catalogue" used by:
 * - The hint system (highlight a suggested move after inactivity).
 * - The debug overlay (show total valid move count).
 * - The AI simulator (verify the board is playable before each step).
 *
 * Each swap is listed once: the cell with the smaller (row, col) pair is always
 * (r1, c1).  Only right and down neighbours are checked per origin cell, so
 * there are no duplicates.
 *
 * Returns an empty array when the board is deadlocked.
 *
 * Solvability note:
 * - Some code paths use a lightweight predicate (e.g. hasAnyValidMove()) for
 *   simple deadlock checks and reshuffles.
 * - When full move enumeration is needed (hints, debugging, AI), callers
 *   should rely on getAllValidMoves() as the single source of truth.
 */
export function getAllValidMoves(board: Board): ValidMove[] {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const moves: ValidMove[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].kind !== 'normal') continue;
      // Check right neighbour
      if (c + 1 < cols && board[r][c + 1].kind === 'normal' &&
          swapCreatesMatch(board, r, c, r, c + 1)) {
        moves.push({ r1: r, c1: c, r2: r, c2: c + 1 });
      }
      // Check down neighbour
      if (r + 1 < rows && board[r + 1][c].kind === 'normal' &&
          swapCreatesMatch(board, r, c, r + 1, c)) {
        moves.push({ r1: r, c1: c, r2: r + 1, c2: c });
      }
    }
  }

  return moves;
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

// ── Level validation ──────────────────────────────────────────────────────────

export interface LevelValidationResult {
  valid: boolean;
  /** True when the initial board (with runtimeSeed = 0) has at least one valid swap. */
  hasInitialMove: boolean;
  /** Number of normal tiles on the initial board. */
  normalTileCount: number;
  /**
   * True when every column segment (the contiguous run of non-blocker, non-empty
   * rows within a column, split by blockers) contains at least 3 normal tiles.
   *
   * A segment with fewer than 3 normal tiles cannot independently form a match-3
   * run.  This flag is purely informational — the runtime shuffle safeguard can
   * recover from a deadlock caused by tiny segments, but well-designed levels
   * should not need it on the very first move.
   *
   * Note: only normal tiles count toward segment size.  Empty cells within a
   * segment are treated as passable gaps (they do not end the segment count).
   */
  noTinyIsolatedSegments: boolean;
  /** First error message if invalid, empty string if valid. */
  message: string;
}

/**
 * Validate that a level configuration is playable.
 *
 * Checks performed:
 * 1. The initial board (runtimeSeed = 0) has at least one valid move.
 * 2. The board has a meaningful number of normal tiles (≥ 30 % of cells).
 * 3. No column segment isolated by blockers has fewer than 3 normal cells
 *    (informational — the runtime shuffle safeguard can still recover, but
 *    well-designed levels should not need it on the first move).
 *
 * Usage in tests:
 *   import { validateLevel } from './rescueTheKingLogic';
 *   const result = validateLevel(LEVELS[0]);
 *   expect(result.valid).toBe(true);
 */
export function validateLevel(config: LevelConfig): LevelValidationResult {
  const board = buildBoard(config, 0);
  const normalTileCount = countNormalTiles(board);
  const totalCells = config.rows * config.cols;
  const hasInitialMove = hasAnyValidMove(board);

  // Detect invalid (misspelled) symbols in tileLayout.  A non-empty value that
  // is not a valid TileSymbol silently falls back to RNG in buildBoard, making
  // the board non-deterministic.  Catch it here so authors see the error early.
  const invalidTileLayoutCells: string[] = [];
  if (config.tileLayout) {
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        const sym = config.tileLayout[r]?.[c] ?? '';
        if (sym !== '' && !(SYMBOLS as readonly string[]).includes(sym)) {
          invalidTileLayoutCells.push(`[${r},${c}]="${sym}"`);
        }
      }
    }
  }

  // Check for tiny isolated column segments.
  let noTinyIsolatedSegments = true;
  for (let c = 0; c < config.cols; c++) {
    let segmentSize = 0;
    for (let r = 0; r < config.rows; r++) {
      const cell = board[r][c];
      if (cell.kind === 'blocker') {
        if (segmentSize > 0 && segmentSize < 3) {
          noTinyIsolatedSegments = false;
        }
        segmentSize = 0;
      } else if (cell.kind === 'normal') {
        segmentSize++;
      }
      // empty cells (gaps in the initial board) are treated as passable;
      // they do not increment segmentSize and do not end the current segment.
    }
    if (segmentSize > 0 && segmentSize < 3) {
      noTinyIsolatedSegments = false;
    }
  }

  // Use Math.ceil so the threshold is a strict ≥ 30 % check for all board sizes.
  const minTiles = Math.ceil(totalCells * 0.3);
  let message = '';
  if (invalidTileLayoutCells.length > 0) {
    message = `Level ${config.id}: invalid tileLayout symbol(s) at ${invalidTileLayoutCells.join(', ')}. Check for typos.`;
  } else if (!hasInitialMove) {
    message = `Level ${config.id}: initial board has no valid move (runtimeSeed=0). Adjust tileLayout or seed.`;
  } else if (normalTileCount < minTiles) {
    message = `Level ${config.id}: only ${normalTileCount} normal tiles (< ${minTiles} min). Add more normal cells.`;
  }

  return {
    valid: invalidTileLayoutCells.length === 0 && hasInitialMove && normalTileCount >= minTiles,
    hasInitialMove,
    normalTileCount,
    noTinyIsolatedSegments,
    message,
  };
}



/** Count normal tiles remaining on the board. */
export function countNormalTiles(board: Board): number {
  let count = 0;
  for (const row of board) for (const cell of row) if (cell.kind === 'normal') count++;
  return count;
}

// ── Target-based win condition ────────────────────────────────────────────────

/**
 * Count the number of target positions that have NOT yet been cleared.
 *
 * A target is cleared when the cell at its [row, col] is empty.
 *
 * When `targetPositions` is empty, returns the number of normal tiles remaining
 * (fallback to the original "clear all tiles" behaviour).
 *
 * Solvability guarantee:
 * - Every target position must be breakable via the standard match/blocker-hit
 *   mechanic.  Level authors ensure this by only placing targets at blocker
 *   cells that are adjacent to normal-tile neighbours.
 */
export function countRemainingTargets(board: Board, targetPositions: [number, number][]): number {
  if (targetPositions.length === 0) return countNormalTiles(board);
  return targetPositions.filter(([r, c]) => board[r]?.[c]?.kind !== 'empty').length;
}

/**
 * Return true when the win condition for the current board state is satisfied.
 *
 * Win condition:
 * - If `targetPositions` is non-empty: ALL target positions must be empty (cleared).
 *   This is the "target tile" model — players win by destroying specific obstacles.
 * - If `targetPositions` is empty or omitted: ALL normal tiles must be cleared
 *   (original fallback behaviour for levels without explicit targets).
 *
 * Using explicit targets avoids the "full-board-clear with infinite refill"
 * contradiction: once all targets are cleared the board is genuinely won,
 * regardless of any remaining non-target normal tiles.
 */
export function checkWinCondition(board: Board, targetPositions?: [number, number][]): boolean {
  if (!targetPositions || targetPositions.length === 0) {
    return countNormalTiles(board) === 0;
  }
  return targetPositions.every(([r, c]) => board[r]?.[c]?.kind === 'empty');
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Compute the final raw score for a completed (or timed-out) game.
 *
 * The `score` field on `GameState` is the *live* accumulated score tracked
 * during gameplay (tile clears + blocker hits + per-cascade combo bonuses).
 * `computeFinalScore` uses that accumulator as-is and appends the one-time
 * board-clear + time bonuses when applicable, so the result screen always
 * matches the HUD value.
 *
 * Ranking rules:
 * - Nobody clears: highest accumulated score (tiles × 10, blockers × 15/50,
 *   combo cascade bonuses) determines ranking.
 * - Multiple clear: same base, then +2000 board-clear + time-remaining × 20
 *   separates players who all finished.
 * - Score provides strict total ordering in both cases.
 */
export function computeFinalScore(state: Pick<GameState,
  'score' | 'boardCleared' | 'timeRemainingMs'
>): number {
  let total = state.score;
  if (state.boardCleared) {
    total += SCORE_BOARD_CLEAR;
    total += Math.floor(state.timeRemainingMs / 1000) * SCORE_TIME_BONUS_PER_SEC;
  }
  return total;
}

// ── AI simulation ─────────────────────────────────────────────────────────────

/**
 * Lightweight deterministic AI score simulation.
 *
 * Used by the competition framework to rank AI players without running the
 * full game loop. AI "plays" by clearing tiles at a rate proportional to a
 * skill level (0 = worst, 1 = best).
 *
 * The simulated `score` accumulator mirrors the real game: tiles × 10,
 * blocker hits × 15, blocker destroys × 50, and per-cascade combo bonuses.
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

  // Build an accumulated score the same way the live game does, then pass to
  // computeFinalScore so the AI and human scores use the same formula.
  const accumulatedScore =
    tilesCleared * SCORE_PER_TILE +
    blockersHit * SCORE_BLOCKER_HIT +
    blockersDestroyed * SCORE_BLOCKER_DESTROYED +
    Math.max(0, maxCombo - 1) * SCORE_COMBO_BONUS;

  return computeFinalScore({ score: accumulatedScore, boardCleared, timeRemainingMs });
}
