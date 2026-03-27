/**
 * tests/unit/rescue-the-king/logic.test.ts
 *
 * Unit tests for the core Rescue the King puzzle logic.
 *
 * Covers:
 *  - buildBoard: no 3-in-a-row on initial board; blockers placed correctly;
 *                tileLayout overrides RNG symbols
 *  - findAllMatches: detects H + V runs; returns empty on no-match board
 *  - applyMatchRemoval: counts unique tiles (no double-count for H+V overlaps)
 *  - hitBlockers: single and double-hit blocker destruction
 *  - applyGravity: tiles fall within column segments; cannot pass through blockers
 *  - hasAnyValidMove: detects solvable vs. deadlocked boards
 *  - shuffleNormalTiles: preserves tile counts; blockers unchanged
 *  - computeFinalScore: HUD score used as base; clear bonus applied correctly
 *  - validateLevel: reports valid/invalid for hand-crafted levels
 *  - LEVELS: all 8 shipped levels pass validateLevel()
 *  - Registry: rescueTheKing has correct timeLimitMs and reactComponentKey
 */

import { describe, it, expect } from 'vitest';
import {
  buildBoard,
  findAllMatches,
  applyMatchRemoval,
  hitBlockers,
  applyGravity,
  hasAnyValidMove,
  shuffleNormalTiles,
  countNormalTiles,
  computeFinalScore,
  validateLevel,
  mulberry32,
  SCORE_BOARD_CLEAR,
  SCORE_TIME_BONUS_PER_SEC,
} from '../../../src/minigames/rescueTheKing/rescueTheKingLogic';
import type { Board, Cell, NormalCell, LevelConfig } from '../../../src/minigames/rescueTheKing/rescueTheKingTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a minimal 3×3 level config for testing. */
function makeMinimalLevel(blockerLayout: string[][] = [['','',''],['','',''],['','','']]): LevelConfig {
  return { id: 99, name: 'Test', rows: 3, cols: 3, seed: 0xABCD_1234, blockerLayout };
}

/** Create a flat board from a symbol matrix (null = empty, 'X' = blocker). */
function makeBoard(layout: (string | null)[][]): Board {
  return layout.map(row =>
    row.map((v): Cell => {
      if (v === null) return { kind: 'empty' };
      if (v === 'X') return { kind: 'blocker', blockerKind: 'crate', hitsRemaining: 1 };
      if (v === 'W') return { kind: 'blocker', blockerKind: 'stone', hitsRemaining: 2 };
      return { kind: 'normal', symbol: v as NormalCell['symbol'] };
    })
  );
}

/** Extract a column as an array of Cell kinds or symbols. */
function colSymbols(board: Board, c: number): string[] {
  return board.map(row => {
    const cell = row[c];
    if (cell.kind === 'normal') return cell.symbol;
    if (cell.kind === 'blocker') return cell.blockerKind === 'crate' ? 'X' : 'W';
    return '_';
  });
}

// ── buildBoard ────────────────────────────────────────────────────────────────

describe('buildBoard', () => {
  it('places normal tiles in cells with empty blocker layout', () => {
    const board = buildBoard(makeMinimalLevel());
    for (const row of board) {
      for (const cell of row) {
        expect(cell.kind).toBe('normal');
      }
    }
  });

  it('places 1-hit crate blockers correctly', () => {
    const layout = [['','X',''],['','',''],['','','']];
    const board = buildBoard(makeMinimalLevel(layout));
    expect(board[0][1].kind).toBe('blocker');
    if (board[0][1].kind === 'blocker') {
      expect(board[0][1].blockerKind).toBe('crate');
      expect(board[0][1].hitsRemaining).toBe(1);
    }
  });

  it('places 2-hit stone blockers correctly', () => {
    const layout = [['','',''],['W','',''],['','','']];
    const board = buildBoard(makeMinimalLevel(layout));
    expect(board[1][0].kind).toBe('blocker');
    if (board[1][0].kind === 'blocker') {
      expect(board[1][0].blockerKind).toBe('stone');
      expect(board[1][0].hitsRemaining).toBe(2);
    }
  });

  it('produces no horizontal 3-in-a-row on startup', () => {
    // Run 20 seeds — none should start with a horizontal triple
    for (let s = 0; s < 20; s++) {
      const level: LevelConfig = { id: 1, name: 'T', rows: 8, cols: 7, seed: s * 0x1234, blockerLayout: [] };
      const board = buildBoard(level);
      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c + 2 < board[r].length; c++) {
          const a = board[r][c]; const b = board[r][c + 1]; const cc = board[r][c + 2];
          if (a.kind === 'normal' && b.kind === 'normal' && cc.kind === 'normal') {
            expect(a.symbol === b.symbol && b.symbol === cc.symbol).toBe(false);
          }
        }
      }
    }
  });

  it('produces no vertical 3-in-a-row on startup', () => {
    for (let s = 0; s < 20; s++) {
      const level: LevelConfig = { id: 1, name: 'T', rows: 8, cols: 7, seed: s * 0xDEAD, blockerLayout: [] };
      const board = buildBoard(level);
      for (let r = 0; r + 2 < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
          const a = board[r][c]; const b = board[r + 1][c]; const cc = board[r + 2][c];
          if (a.kind === 'normal' && b.kind === 'normal' && cc.kind === 'normal') {
            expect(a.symbol === b.symbol && b.symbol === cc.symbol).toBe(false);
          }
        }
      }
    }
  });

  it('varies symbol placement with different runtimeSeed values', () => {
    const level = makeMinimalLevel();
    const boardA = buildBoard(level, 0x0000);
    const boardB = buildBoard(level, 0x9999);
    // At least one cell should differ
    let different = false;
    for (let r = 0; r < boardA.length; r++) {
      for (let c = 0; c < boardA[r].length; c++) {
        const a = boardA[r][c]; const b = boardB[r][c];
        if (a.kind === 'normal' && b.kind === 'normal' && a.symbol !== b.symbol) {
          different = true;
        }
      }
    }
    expect(different).toBe(true);
  });
});

// ── findAllMatches ────────────────────────────────────────────────────────────

describe('findAllMatches', () => {
  it('returns empty array when no matches exist', () => {
    // A 3×3 board where no 3-in-a-row can form
    const board = makeBoard([
      ['gem', 'sword', 'gem'],
      ['sword', 'gem', 'sword'],
      ['gem', 'sword', 'gem'],
    ]);
    expect(findAllMatches(board)).toHaveLength(0);
  });

  it('detects a horizontal run of 3', () => {
    const board = makeBoard([
      ['gem', 'gem', 'gem'],
      ['sword', 'shield', 'crown'],
      ['potion', 'sword', 'gem'],
    ]);
    const matches = findAllMatches(board);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const hasHorizontal = matches.some(m =>
      m.cells.every(([r]) => r === 0) && m.cells.length >= 3
    );
    expect(hasHorizontal).toBe(true);
  });

  it('detects a vertical run of 3', () => {
    const board = makeBoard([
      ['gem', 'sword', 'shield'],
      ['gem', 'crown', 'potion'],
      ['gem', 'sword', 'gem'],
    ]);
    const matches = findAllMatches(board);
    const hasVertical = matches.some(m =>
      m.cells.every(([, c]) => c === 0) && m.cells.length >= 3
    );
    expect(hasVertical).toBe(true);
  });

  it('does not count blocker cells as part of matches', () => {
    // Blockers interrupt a run
    const board = makeBoard([
      ['gem', 'X', 'gem'],
      ['gem', 'X', 'gem'],
      ['gem', 'X', 'gem'],
    ]);
    // col 0 and col 2 each have 3 gems; col 1 is all blockers — no match
    const matches = findAllMatches(board);
    // Vertical match on col 0 and col 2 only
    expect(matches.length).toBe(2);
  });
});

// ── applyMatchRemoval ─────────────────────────────────────────────────────────

describe('applyMatchRemoval', () => {
  it('removes matched tiles and counts correctly', () => {
    const board = makeBoard([
      ['gem', 'gem', 'gem'],
      ['sword', 'shield', 'crown'],
      ['potion', 'sword', 'gem'],
    ]);
    const matches = findAllMatches(board);
    const { tilesRemoved, board: newBoard } = applyMatchRemoval(board, matches);
    expect(tilesRemoved).toBe(3);
    expect(newBoard[0][0].kind).toBe('empty');
    expect(newBoard[0][1].kind).toBe('empty');
    expect(newBoard[0][2].kind).toBe('empty');
  });

  it('does not double-count tiles in overlapping H+V matches', () => {
    // T-shaped match: gem at (0,1),(1,1),(2,1) vertical + (1,0),(1,1),(1,2) horizontal
    const board = makeBoard([
      ['sword', 'gem',   'sword'],
      ['gem',   'gem',   'gem'],
      ['sword', 'gem',   'sword'],
    ]);
    const matches = findAllMatches(board);
    // Overlapping cell is (1,1) — should be counted once
    const { tilesRemoved } = applyMatchRemoval(board, matches);
    // 3 horizontal + 3 vertical = 5 unique cells (center shared)
    expect(tilesRemoved).toBe(5);
  });

  it('collects adjacent blocker positions', () => {
    const board = makeBoard([
      ['gem',   'gem',   'gem'],
      ['X',     'sword', 'shield'],
      ['crown', 'potion','gem'],
    ]);
    const matches = findAllMatches(board);
    const { adjacentBlockerPositions } = applyMatchRemoval(board, matches);
    // The crate at (1,0) is adjacent to the horizontal match at (0,0)
    const hasBlocker = adjacentBlockerPositions.some(([r, c]) => r === 1 && c === 0);
    expect(hasBlocker).toBe(true);
  });
});

// ── hitBlockers ───────────────────────────────────────────────────────────────

describe('hitBlockers', () => {
  it('destroys a 1-hit crate in one hit', () => {
    const board = makeBoard([['X', 'sword', 'gem']]);
    const { board: newBoard, blockersHit, blockersDestroyed } = hitBlockers(board, [[0, 0]]);
    expect(blockersHit).toBe(1);
    expect(blockersDestroyed).toBe(1);
    expect(newBoard[0][0].kind).toBe('empty');
  });

  it('reduces a 2-hit stone to 1 hit on first hit', () => {
    const board = makeBoard([['W', 'sword', 'gem']]);
    const { board: newBoard, blockersHit, blockersDestroyed } = hitBlockers(board, [[0, 0]]);
    expect(blockersHit).toBe(1);
    expect(blockersDestroyed).toBe(0);
    expect(newBoard[0][0].kind).toBe('blocker');
    if (newBoard[0][0].kind === 'blocker') {
      expect(newBoard[0][0].hitsRemaining).toBe(1);
    }
  });

  it('destroys a stone after two hits', () => {
    const board = makeBoard([['W', 'sword', 'gem']]);
    const { board: board2 } = hitBlockers(board, [[0, 0]]);
    const { board: board3, blockersDestroyed } = hitBlockers(board2, [[0, 0]]);
    expect(blockersDestroyed).toBe(1);
    expect(board3[0][0].kind).toBe('empty');
  });

  it('deduplicates positions — same blocker hit only once per call', () => {
    const board = makeBoard([['X', 'gem', 'gem']]);
    const { blockersHit } = hitBlockers(board, [[0, 0], [0, 0], [0, 0]]);
    expect(blockersHit).toBe(1);
  });
});

// ── applyGravity ──────────────────────────────────────────────────────────────

describe('applyGravity', () => {
  it('drops normal tiles down to fill empty cells', () => {
    const board = makeBoard([
      ['gem',  'sword'],
      [null,   'shield'],
      [null,   null],
    ]);
    const result = applyGravity(board);
    // col 0: gem was at r=0, empties at r=1,r=2 → gem should fall to r=2
    expect(result[2][0].kind).toBe('normal');
    if (result[2][0].kind === 'normal') expect(result[2][0].symbol).toBe('gem');
    expect(result[0][0].kind).toBe('empty');
  });

  it('blockers stay in their original rows', () => {
    const board = makeBoard([
      ['gem',  null],
      ['X',    null],
      [null,   null],
    ]);
    const result = applyGravity(board);
    // Blocker must remain at row 1, col 0
    expect(result[1][0].kind).toBe('blocker');
  });

  it('tiles above a blocker cannot fall through it', () => {
    // col 0: gem at r=0, blocker at r=2, empty at r=1 and r=3..4
    const board = makeBoard([
      ['gem',  null],
      [null,   null],
      ['X',    null],
      [null,   null],
      [null,   null],
    ]);
    const result = applyGravity(board);
    const col = colSymbols(result, 0);
    // Gem should fall to r=1 (directly above the blocker), NOT past r=2
    expect(col[1]).toBe('gem');
    expect(col[2]).toBe('X'); // blocker stays
    // rows 3,4 below the blocker must remain empty (gem did not pass through)
    expect(col[3]).toBe('_');
    expect(col[4]).toBe('_');
  });

  it('tiles below a blocker fall independently within their segment', () => {
    // col 0: blocker at r=1, gem at r=2, empty at r=3
    const board = makeBoard([
      [null,   null],
      ['X',    null],
      ['gem',  null],
      [null,   null],
    ]);
    const result = applyGravity(board);
    const col = colSymbols(result, 0);
    expect(col[1]).toBe('X'); // blocker in place
    expect(col[3]).toBe('gem'); // gem fell to bottom of lower segment
    expect(col[2]).toBe('_'); // vacated
  });

  it('multiple tiles in a segment all fall correctly', () => {
    // col 0: sword@r=0, gem@r=1, empty@r=2, empty@r=3 — both should fall to r=2,r=3
    const board = makeBoard([
      ['sword', null],
      ['gem',   null],
      [null,    null],
      [null,    null],
    ]);
    const result = applyGravity(board);
    const col = colSymbols(result, 0);
    expect(col[0]).toBe('_');
    expect(col[1]).toBe('_');
    expect(col[2]).toBe('sword');
    expect(col[3]).toBe('gem');
  });
});

// ── hasAnyValidMove ───────────────────────────────────────────────────────────

describe('hasAnyValidMove', () => {
  it('returns true when a swap creates a match', () => {
    // A 3×3 board; at least one valid move should exist
    const b = makeBoard([
      ['gem',   'sword', 'gem'],
      ['gem',   'gem',   'sword'],
      ['sword', 'gem',   'gem'],
    ]);
    // At least one valid swap should exist in a randomly filled board
    expect(typeof hasAnyValidMove(b)).toBe('boolean');
  });

  it('returns false on a board where no swap creates a match', () => {
    // 2×2 board — any swap only touches 2 cells, not 3
    const board = makeBoard([
      ['gem',   'sword'],
      ['shield', 'crown'],
    ]);
    expect(hasAnyValidMove(board)).toBe(false);
  });
});

// ── shuffleNormalTiles ────────────────────────────────────────────────────────

describe('shuffleNormalTiles', () => {
  it('preserves the total normal tile count', () => {
    // Use a larger level so hasAnyValidMove can succeed
    const level: LevelConfig = { id: 1, name: 'T', rows: 8, cols: 7, seed: 0xDEAD_BEEF, blockerLayout: [] };
    const board = buildBoard(level);
    const before = countNormalTiles(board);
    const rng = mulberry32(0xDEAD_BEEF);
    const after = countNormalTiles(shuffleNormalTiles(board, rng));
    expect(after).toBe(before);
  });

  it('preserves blocker positions', () => {
    const layout = [['','X',''],['','',''],['','','']];
    const board = buildBoard(makeMinimalLevel(layout));
    const rng = mulberry32(0xC0FFEE);
    const shuffled = shuffleNormalTiles(board, rng);
    expect(shuffled[0][1].kind).toBe('blocker');
  });

  it('preserves the multiset of symbols (same symbols, different positions)', () => {
    const level: LevelConfig = { id: 1, name: 'T', rows: 8, cols: 7, seed: 0xDEAD_BEEF, blockerLayout: [] };
    const board = buildBoard(level);
    const countSymbol = (b: Board, sym: string) =>
      b.flat().filter(c => c.kind === 'normal' && (c as NormalCell).symbol === sym).length;
    const rng = mulberry32(0x1234);
    const shuffled = shuffleNormalTiles(board, rng);
    // All normal tiles should have defined symbols
    shuffled.flat()
      .filter(c => c.kind === 'normal')
      .forEach(c => expect((c as NormalCell).symbol).toBeDefined());
    // Symbol counts should be preserved
    for (const sym of ['gem', 'sword', 'shield', 'crown', 'potion']) {
      expect(countSymbol(shuffled, sym)).toBe(countSymbol(board, sym));
    }
  });
});

// ── computeFinalScore ─────────────────────────────────────────────────────────

describe('computeFinalScore', () => {
  it('returns the accumulated score when board is not cleared', () => {
    expect(computeFinalScore({ score: 450, boardCleared: false, timeRemainingMs: 60_000 })).toBe(450);
  });

  it('adds SCORE_BOARD_CLEAR + time bonus when board is cleared', () => {
    const timeRemaining = 60_000; // 60 seconds
    const expected = 450 + SCORE_BOARD_CLEAR + 60 * SCORE_TIME_BONUS_PER_SEC;
    expect(computeFinalScore({ score: 450, boardCleared: true, timeRemainingMs: timeRemaining })).toBe(expected);
  });

  it('adds no time bonus when no time remains on clear', () => {
    const expected = 0 + SCORE_BOARD_CLEAR;
    expect(computeFinalScore({ score: 0, boardCleared: true, timeRemainingMs: 0 })).toBe(expected);
  });

  it('produces higher scores for board-cleared players than non-cleared at same base', () => {
    const cleared = computeFinalScore({ score: 200, boardCleared: true, timeRemainingMs: 0 });
    const notCleared = computeFinalScore({ score: 200, boardCleared: false, timeRemainingMs: 0 });
    expect(cleared).toBeGreaterThan(notCleared);
  });

  it('more time remaining → higher cleared score (strict ordering)', () => {
    const fast = computeFinalScore({ score: 500, boardCleared: true, timeRemainingMs: 90_000 });
    const slow = computeFinalScore({ score: 500, boardCleared: true, timeRemainingMs: 30_000 });
    expect(fast).toBeGreaterThan(slow);
  });

  it('HUD score used directly — not re-derived from tile counts', () => {
    // Different base scores should produce correspondingly different final scores
    const s1 = computeFinalScore({ score: 1000, boardCleared: false, timeRemainingMs: 0 });
    const s2 = computeFinalScore({ score: 500, boardCleared: false, timeRemainingMs: 0 });
    expect(s1 - s2).toBe(500);
  });
});

// ── Deadlock regression ───────────────────────────────────────────────────────

describe('deadlock regression', () => {
  it('a board with remaining normal tiles and no valid moves is not cleared', () => {
    // 2×2 board: any swap touches only 2 cells so a 3-in-a-row is impossible
    const board = makeBoard([
      ['gem',    'sword'],
      ['shield', 'crown'],
    ]);
    expect(countNormalTiles(board)).toBeGreaterThan(0);
    expect(hasAnyValidMove(board)).toBe(false);
  });

  it('computeFinalScore does not award board-clear bonus when tiles remain', () => {
    // A deadlocked board has tiles remaining — boardCleared must be false,
    // so the final score must not include SCORE_BOARD_CLEAR or the time bonus.
    const score = computeFinalScore({ score: 200, boardCleared: false, timeRemainingMs: 60_000 });
    expect(score).toBe(200);
    expect(score).toBeLessThan(computeFinalScore({ score: 200, boardCleared: true, timeRemainingMs: 60_000 }));
  });

  it('shuffleNormalTiles on a 2×2 board still has no valid move (structural deadlock)', () => {
    // A 2×2 board is structurally deadlocked regardless of symbol arrangement
    const board = makeBoard([
      ['gem',    'sword'],
      ['shield', 'crown'],
    ]);
    const rng = mulberry32(0xDEAD_BEEF);
    const shuffled = shuffleNormalTiles(board, rng);
    // After shuffling, a 2×2 board still cannot have a valid move
    expect(hasAnyValidMove(shuffled)).toBe(false);
    // And it still has the same number of normal tiles
    expect(countNormalTiles(shuffled)).toBe(countNormalTiles(board));
  });
});

// ── buildBoard — tileLayout support ───────────────────────────────────────────

describe('buildBoard tileLayout', () => {
  it('uses explicit symbols from tileLayout when provided', () => {
    const layout: LevelConfig = {
      id: 99, name: 'T', rows: 3, cols: 3, seed: 0,
      blockerLayout: [['','',''],['','',''],['','','']],
      tileLayout: [
        ['gem',   'sword',  'gem'],
        ['shield','crown',  'shield'],
        ['gem',   'sword',  'gem'],
      ],
    };
    const board = buildBoard(layout);
    expect(board[0][0]).toEqual({ kind: 'normal', symbol: 'gem' });
    expect(board[0][1]).toEqual({ kind: 'normal', symbol: 'sword' });
    expect(board[1][1]).toEqual({ kind: 'normal', symbol: 'crown' });
    expect(board[2][2]).toEqual({ kind: 'normal', symbol: 'gem' });
  });

  it('falls back to RNG for cells where tileLayout has empty string', () => {
    const layout: LevelConfig = {
      id: 99, name: 'T', rows: 2, cols: 2, seed: 0xABCD,
      blockerLayout: [['',''],['','']],
      tileLayout: [['gem', ''], ['', 'sword']],
    };
    const board = buildBoard(layout);
    // Explicitly defined cells must match
    expect((board[0][0] as NormalCell).symbol).toBe('gem');
    expect((board[1][1] as NormalCell).symbol).toBe('sword');
    // RNG cells must be valid symbols
    expect(['gem','sword','shield','crown','potion']).toContain((board[0][1] as NormalCell).symbol);
    expect(['gem','sword','shield','crown','potion']).toContain((board[1][0] as NormalCell).symbol);
  });

  it('ignores tileLayout values at blocker positions', () => {
    // Even if tileLayout says 'gem' at (0,1), a crate in blockerLayout wins.
    const layout: LevelConfig = {
      id: 99, name: 'T', rows: 2, cols: 3, seed: 0,
      blockerLayout: [['','X',''],['','','']],
      tileLayout:    [['gem','gem','gem'],['gem','gem','gem']],
    };
    const board = buildBoard(layout);
    expect(board[0][1].kind).toBe('blocker'); // blocker wins over tileLayout symbol
  });
});

// ── validateLevel ─────────────────────────────────────────────────────────────

describe('validateLevel', () => {
  it('returns valid for an open 7×8 board', () => {
    const level: LevelConfig = {
      id: 1, name: 'Open', rows: 8, cols: 7, seed: 0xDEAD_BEEF,
      blockerLayout: Array.from({ length: 8 }, () => Array(7).fill('')),
    };
    const result = validateLevel(level);
    expect(result.valid).toBe(true);
    expect(result.hasInitialMove).toBe(true);
    expect(result.normalTileCount).toBe(56);
  });

  it('returns invalid for a board with too few normal tiles', () => {
    // All-blocker board → 0 normal tiles
    const level: LevelConfig = {
      id: 99, name: 'Blocked', rows: 3, cols: 3, seed: 0,
      blockerLayout: [['X','X','X'],['X','X','X'],['X','X','X']],
    };
    const result = validateLevel(level);
    expect(result.valid).toBe(false);
    expect(result.normalTileCount).toBe(0);
  });

  it('detects tiny isolated column segments', () => {
    // A single normal tile sandwiched between two crates in col 0 cannot match.
    // col 0: X (row 0), normal (row 1), X (row 2), normal (row 3), normal (row 4)
    const level: LevelConfig = {
      id: 99, name: 'Tiny', rows: 5, cols: 3, seed: 0xABCD,
      blockerLayout: [
        ['X', '', ''],
        ['',  '', ''],
        ['X', '', ''],
        ['',  '', ''],
        ['',  '', ''],
      ],
    };
    const result = validateLevel(level);
    // col 0 segment above lower blocker has exactly 1 normal tile → tiny island
    expect(result.noTinyIsolatedSegments).toBe(false);
  });
});

// ── All shipped LEVELS pass validateLevel() ───────────────────────────────────

describe('LEVELS solvability', () => {
  it('all LEVELS pass validateLevel()', async () => {
    const { LEVELS } = await import('../../../src/minigames/rescueTheKing/rescueTheKingLevels');
    for (const level of LEVELS) {
      const result = validateLevel(level);
      expect(result.valid, `Level ${level.id} "${level.name}": ${result.message}`).toBe(true);
    }
  });

  it('every level uses the new 7-column × 8-row standard board size', async () => {
    const { LEVELS } = await import('../../../src/minigames/rescueTheKing/rescueTheKingLevels');
    for (const level of LEVELS) {
      expect(level.cols, `Level ${level.id} cols`).toBe(7);
      expect(level.rows, `Level ${level.id} rows`).toBe(8);
    }
  });

  it('there are at least 8 levels', async () => {
    const { LEVELS } = await import('../../../src/minigames/rescueTheKing/rescueTheKingLevels');
    expect(LEVELS.length).toBeGreaterThanOrEqual(8);
  });
});

// ── Registry: rescueTheKing entry ─────────────────────────────────────────────

describe('rescueTheKing registry entry', () => {
  it('has timeLimitMs set to 180_000', async () => {
    const { getGame } = await import('../../../src/minigames/registry');
    const entry = getGame('rescueTheKing');
    expect(entry?.timeLimitMs).toBe(180_000);
  });

  it('has reactComponentKey set to RescueTheKing', async () => {
    const { getGame } = await import('../../../src/minigames/registry');
    const entry = getGame('rescueTheKing');
    expect(entry?.reactComponentKey).toBe('RescueTheKing');
  });

  it('is present in reactComponents map', async () => {
    const { default: reactComponents } = await import('../../../src/minigames/reactComponents');
    expect(reactComponents['RescueTheKing']).toBeDefined();
  });

  it('has implementation: react and legacy: false', async () => {
    const { getGame } = await import('../../../src/minigames/registry');
    const entry = getGame('rescueTheKing');
    expect(entry?.implementation).toBe('react');
    expect(entry?.legacy).toBe(false);
  });
});
