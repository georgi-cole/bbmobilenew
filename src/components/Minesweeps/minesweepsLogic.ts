export const MINESWEEPS_ROWS = 9;
export const MINESWEEPS_COLS = 9;
export const MINESWEEPS_MINES = 10;
export const MINESWEEPS_SCORE_SCALE = 1000;
const MINESWEEPS_PARTIAL_PROGRESS_CAP = 50;

export interface MinesweepsCell {
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
  exploded: boolean;
}

export type MinesweepsBoard = MinesweepsCell[][];

interface CellPoint {
  row: number;
  col: number;
}

interface BuildBoardOptions {
  rows?: number;
  cols?: number;
  mines?: number;
  seed?: number;
  safeCell?: CellPoint;
}

interface FinalScoreOptions {
  won: boolean;
  revealedSafeCells: number;
  totalSafeCells: number;
}

function cloneCell(cell: MinesweepsCell): MinesweepsCell {
  return { ...cell };
}

export function createSeededRandom(seed = 1): () => number {
  let value = (Math.abs(Math.trunc(seed)) || 1) >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createEmptyBoard(
  rows = MINESWEEPS_ROWS,
  cols = MINESWEEPS_COLS,
): MinesweepsBoard {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      adjacent: 0,
      revealed: false,
      flagged: false,
      exploded: false,
    })),
  );
}

export function buildBoard({
  rows = MINESWEEPS_ROWS,
  cols = MINESWEEPS_COLS,
  mines = MINESWEEPS_MINES,
  seed = 1,
  safeCell,
}: BuildBoardOptions): MinesweepsBoard {
  const board = createEmptyBoard(rows, cols);
  const rng = createSeededRandom(seed);
  const maxMines = Math.min(mines, rows * cols - (safeCell ? 1 : 0));
  let placed = 0;

  while (placed < maxMines) {
    const row = Math.floor(rng() * rows);
    const col = Math.floor(rng() * cols);
    if (board[row][col].mine) continue;
    if (safeCell && safeCell.row === row && safeCell.col === col) continue;
    board[row][col].mine = true;
    placed += 1;
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (board[row][col].mine) continue;
      let adjacent = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          const nextRow = row + dr;
          const nextCol = col + dc;
          if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) continue;
          if (board[nextRow][nextCol].mine) adjacent += 1;
        }
      }
      board[row][col].adjacent = adjacent;
    }
  }

  return board;
}

export function countFlags(board: MinesweepsBoard): number {
  return board.flat().filter((cell) => cell.flagged).length;
}

export function countSafeCells(board: MinesweepsBoard): number {
  return board.flat().filter((cell) => !cell.mine).length;
}

export function countRevealedSafeCells(board: MinesweepsBoard): number {
  return board.flat().filter((cell) => !cell.mine && cell.revealed).length;
}

export function toggleFlag(board: MinesweepsBoard, row: number, col: number): MinesweepsBoard {
  const target = board[row]?.[col];
  if (!target || target.revealed) return board;
  return board.map((boardRow, rowIndex) =>
    boardRow.map((cell, colIndex) =>
      rowIndex === row && colIndex === col
        ? { ...cell, flagged: !cell.flagged }
        : cloneCell(cell),
    ),
  );
}

export function revealCell(
  board: MinesweepsBoard,
  row: number,
  col: number,
): { board: MinesweepsBoard; hitMine: boolean } {
  const target = board[row]?.[col];
  if (!target || target.flagged || target.revealed) {
    return { board, hitMine: false };
  }

  const nextBoard = board.map((boardRow) => boardRow.map(cloneCell));
  const firstCell = nextBoard[row][col];
  if (firstCell.mine) {
    firstCell.revealed = true;
    firstCell.exploded = true;
    return { board: nextBoard, hitMine: true };
  }

  const queue: CellPoint[] = [{ row, col }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const cell = nextBoard[current.row][current.col];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.adjacent !== 0) continue;

    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nextRow = current.row + dr;
        const nextCol = current.col + dc;
        if (
          nextRow < 0 ||
          nextRow >= nextBoard.length ||
          nextCol < 0 ||
          nextCol >= nextBoard[0].length
        ) {
          continue;
        }
        const nextCell = nextBoard[nextRow][nextCol];
        if (!nextCell.revealed && !nextCell.flagged && !nextCell.mine) {
          queue.push({ row: nextRow, col: nextCol });
        }
      }
    }
  }

  return { board: nextBoard, hitMine: false };
}

export function revealAllMines(board: MinesweepsBoard): MinesweepsBoard {
  return board.map((row) =>
    row.map((cell) =>
      cell.mine
        ? { ...cell, revealed: true }
        : cloneCell(cell),
    ),
  );
}

export function isBoardSolved(board: MinesweepsBoard): boolean {
  return board.flat().every((cell) => cell.mine || cell.revealed);
}

export function computeFinalScore({
  won,
  revealedSafeCells,
  totalSafeCells,
}: FinalScoreOptions): number {
  if (won) return MINESWEEPS_SCORE_SCALE;
  if (totalSafeCells <= 0) return 0;
  const rawScore = Math.round(
    (revealedSafeCells / totalSafeCells) * MINESWEEPS_PARTIAL_PROGRESS_CAP,
  );
  // Legacy scoring normalized Minesweeps to a 0-100 range and then surfaced it on
  // the shared 0-1000 minigame scale. Partial-loss progress tops out at 50 raw,
  // so multiplying by 10 preserves that historical 0-500 partial range.
  return Math.max(0, Math.min(MINESWEEPS_SCORE_SCALE, rawScore * 10));
}
