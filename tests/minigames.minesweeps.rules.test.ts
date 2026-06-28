import { describe, expect, it } from 'vitest';

import {
  MINESWEEPS_COLS,
  MINESWEEPS_MINES,
  MINESWEEPS_ROWS,
  buildBoard,
  computeFinalScore,
  countFlags,
  countRevealedSafeCells,
  countSafeCells,
  createEmptyBoard,
  isBoardSolved,
  revealAllMines,
  revealCell,
  toggleFlag,
} from '../src/components/Minesweeps/minesweepsLogic';

describe('Minesweeps rules', () => {
  it('builds a seeded board with the expected dimensions and mine count', () => {
    const board = buildBoard({ seed: 7, safeCell: { row: 0, col: 0 } });

    expect(board).toHaveLength(MINESWEEPS_ROWS);
    expect(board[0]).toHaveLength(MINESWEEPS_COLS);
    expect(board[0][0].mine).toBe(false);
    expect(countSafeCells(board)).toBe(MINESWEEPS_ROWS * MINESWEEPS_COLS - MINESWEEPS_MINES);
  });

  it('reveals empty regions and detects solved boards', () => {
    const board = createEmptyBoard(3, 3);
    const { board: revealed, hitMine } = revealCell(board, 1, 1);

    expect(hitMine).toBe(false);
    expect(countRevealedSafeCells(revealed)).toBe(9);
    expect(isBoardSolved(revealed)).toBe(true);
  });

  it('toggles flags and leaves revealed cells untouched', () => {
    const flagged = toggleFlag(createEmptyBoard(2, 2), 0, 0);
    expect(countFlags(flagged)).toBe(1);

    const revealed = revealCell(flagged, 0, 1).board;
    const untouched = toggleFlag(revealed, 0, 1);
    expect(untouched[0][1].revealed).toBe(true);
    expect(untouched[0][1].flagged).toBe(false);
  });

  it('reveals mines and computes win/loss scores', () => {
    const board = buildBoard({ rows: 2, cols: 2, mines: 1, seed: 1 });
    const withMines = revealAllMines(board);

    expect(withMines.flat().some((cell) => cell.mine && cell.revealed)).toBe(true);
    expect(computeFinalScore({ won: true, revealedSafeCells: 10, totalSafeCells: 10, elapsedMs: 0 })).toBe(980);
    expect(computeFinalScore({ won: true, revealedSafeCells: 10, totalSafeCells: 10, elapsedMs: 180_000 })).toBe(650);
    expect(computeFinalScore({ won: false, revealedSafeCells: 5, totalSafeCells: 10 })).toBe(250);
  });
});
