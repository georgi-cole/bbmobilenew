/**
 * Pure helpers for the finite Castle Rescue match-3 puzzle.
 *
 * The board never refills with new gems. Each handcrafted level starts with a
 * finite set of gems + blockers, gravity only pulls remaining gems downward,
 * and reshuffles preserve the exact remaining inventory so the board can still
 * be fully cleared.
 */

import { CASTLE_RESCUE_LEVELS } from './castleRescuePuzzleLevels';
import type {
  BlockerTile,
  BoardCell,
  CastleRescueLevelDefinition,
  GemColor,
  GemTile,
  MatchGroup,
  MoveCandidate,
  Position,
  PuzzleBoard,
  ResolutionResult,
  ResolutionStep,
  Tile,
  VoidTile,
} from './castleRescuePuzzleTypes';

const GEM_CODE_TO_COLOR: Record<string, GemColor> = {
  R: 'ruby',
  G: 'emerald',
  S: 'sapphire',
};

const COLOR_TO_GEM_CODE: Record<GemColor, string> = {
  ruby: 'R',
  emerald: 'G',
  sapphire: 'S',
};

const ORTHOGONAL_DIRECTIONS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function cloneBoard(board: PuzzleBoard): PuzzleBoard {
  return board.map((row) => row.map((cell) => (cell == null ? null : { ...cell })));
}

export function isGem(cell: BoardCell): cell is GemTile {
  return cell?.kind === 'gem';
}

export function isBlocker(cell: BoardCell): cell is BlockerTile {
  return cell?.kind === 'blocker';
}

export function isVoid(cell: BoardCell): cell is VoidTile {
  return cell?.kind === 'void';
}

export function positionsEqual(a: Position | null | undefined, b: Position | null | undefined): boolean {
  return a?.row === b?.row && a?.col === b?.col;
}

export function positionKey(position: Position): string {
  return `${position.row}:${position.col}`;
}

export function isWithinLevel(level: CastleRescueLevelDefinition, position: Position): boolean {
  return position.row >= 0 && position.row < level.height && position.col >= 0 && position.col < level.width;
}

export function createBoardFromLevel(level: CastleRescueLevelDefinition): PuzzleBoard {
  let gemId = 0;
  let blockerId = 0;

  return level.rows.map((row, rowIndex) => row.split('').map((cellCode, colIndex) => {
    if (cellCode === '.') {
      return { kind: 'void' } satisfies VoidTile;
    }
    if (cellCode === '1' || cellCode === '2') {
      blockerId += 1;
      return {
        kind: 'blocker',
        id: `blocker-${level.id}-${blockerId}-${rowIndex}-${colIndex}`,
        strength: Number(cellCode) as 1 | 2,
      } satisfies BlockerTile;
    }
    gemId += 1;
    return {
      kind: 'gem',
      id: `gem-${level.id}-${gemId}-${rowIndex}-${colIndex}`,
      color: GEM_CODE_TO_COLOR[cellCode],
    } satisfies GemTile;
  }));
}

export function pickCastleRescueLevel(seed: number | undefined): CastleRescueLevelDefinition {
  if (seed === undefined) {
    return CASTLE_RESCUE_LEVELS[Math.floor(Math.random() * CASTLE_RESCUE_LEVELS.length)];
  }
  return CASTLE_RESCUE_LEVELS[Math.abs(seed) % CASTLE_RESCUE_LEVELS.length];
}

export function getObjectiveUnitTotal(level: CastleRescueLevelDefinition): number {
  return level.rows.join('').split('').reduce((total, cellCode) => {
    if (cellCode === '.') return total;
    if (cellCode === '1' || cellCode === '2') return total + Number(cellCode);
    return total + 1;
  }, 0);
}

export function countRemainingObjectiveUnits(board: PuzzleBoard): number {
  return board.flat().reduce((total, cell) => {
    if (isGem(cell)) return total + 1;
    if (isBlocker(cell)) return total + cell.strength;
    return total;
  }, 0);
}

export function isBoardCleared(board: PuzzleBoard): boolean {
  return countRemainingObjectiveUnits(board) === 0;
}

function getBoardDimensions(board: PuzzleBoard): { width: number; height: number } {
  return { height: board.length, width: board[0]?.length ?? 0 };
}

export function serializeBoard(board: PuzzleBoard): string {
  return board.map((row) => row.map((cell) => {
    if (cell == null) return '_';
    if (isVoid(cell)) return '.';
    if (cell.kind === 'blocker') return `B${cell.strength}`;
    return COLOR_TO_GEM_CODE[cell.color];
  }).join('')).join('|');
}

export function swapBoardCells(board: PuzzleBoard, from: Position, to: Position): PuzzleBoard {
  const nextBoard = cloneBoard(board);
  const fromCell = nextBoard[from.row][from.col];
  nextBoard[from.row][from.col] = nextBoard[to.row][to.col];
  nextBoard[to.row][to.col] = fromCell;
  return nextBoard;
}

export function findMatches(board: PuzzleBoard): MatchGroup[] {
  const matches: MatchGroup[] = [];
  const { width, height } = getBoardDimensions(board);

  for (let row = 0; row < height; row += 1) {
    let col = 0;
    while (col < width) {
      const cell = board[row][col];
      if (!isGem(cell)) {
        col += 1;
        continue;
      }
      let end = col + 1;
      while (end < width) {
        const candidate = board[row][end];
        if (!isGem(candidate) || candidate.color !== cell.color) {
          break;
        }
        end += 1;
      }
      if (end - col >= 3) {
        matches.push({
          color: cell.color,
          cells: Array.from({ length: end - col }, (_, offset) => ({ row, col: col + offset })),
        });
      }
      col = end;
    }
  }

  for (let col = 0; col < width; col += 1) {
    let row = 0;
    while (row < height) {
      const cell = board[row][col];
      if (!isGem(cell)) {
        row += 1;
        continue;
      }
      let end = row + 1;
      while (end < height) {
        const candidate = board[end][col];
        if (!isGem(candidate) || candidate.color !== cell.color) {
          break;
        }
        end += 1;
      }
      if (end - row >= 3) {
        matches.push({
          color: cell.color,
          cells: Array.from({ length: end - row }, (_, offset) => ({ row: row + offset, col })),
        });
      }
      row = end;
    }
  }

  return matches;
}

export function collapseBoard(board: PuzzleBoard): PuzzleBoard {
  const { width, height } = getBoardDimensions(board);
  const nextBoard: PuzzleBoard = Array.from({ length: height }, () => Array.from({ length: width }, () => null));

  for (let col = 0; col < width; col += 1) {
    let row = height - 1;
    while (row >= 0) {
      const cell = board[row][col];
      if (cell == null) {
        row -= 1;
        continue;
      }
      if (isVoid(cell)) {
        nextBoard[row][col] = cell;
        row -= 1;
        continue;
      }
      if (cell.kind === 'blocker') {
        nextBoard[row][col] = { ...cell };
        row -= 1;
        continue;
      }

      const segmentEnd = row;
      while (row >= 0) {
        const cursor = board[row][col];
        if (isVoid(cursor)) {
          break;
        }
        if (cursor != null && cursor.kind === 'blocker') {
          break;
        }
        row -= 1;
      }
      const segmentStart = row + 1;
      const gems: GemTile[] = [];
      for (let scan = segmentEnd; scan >= segmentStart; scan -= 1) {
        const scanCell = board[scan][col];
        if (isGem(scanCell)) {
          gems.push({ ...scanCell });
        }
      }
      let writeRow = segmentEnd;
      for (const gem of gems) {
        nextBoard[writeRow][col] = gem;
        writeRow -= 1;
      }
      while (writeRow >= segmentStart) {
        nextBoard[writeRow][col] = null;
        writeRow -= 1;
      }
    }
  }

  return nextBoard;
}

export function resolveBoard(board: PuzzleBoard): ResolutionResult {
  let workingBoard = cloneBoard(board);
  const steps: ResolutionStep[] = [];

  while (true) {
    const groups = findMatches(workingBoard);
    if (groups.length === 0) {
      return { board: workingBoard, steps };
    }

    const matchedMap = new Map<string, Position>();
    for (const group of groups) {
      for (const cell of group.cells) {
        matchedMap.set(positionKey(cell), cell);
      }
    }
    const matched = [...matchedMap.values()];
    const nextBoard = cloneBoard(workingBoard);
    const blockerHitMap = new Map<string, { position: Position; damage: 1; destroyed: boolean }>();

    for (const cell of matched) {
      nextBoard[cell.row][cell.col] = null;
      for (const [rowDelta, colDelta] of ORTHOGONAL_DIRECTIONS) {
        const blockerPosition = { row: cell.row + rowDelta, col: cell.col + colDelta };
        if (
          blockerPosition.row < 0 ||
          blockerPosition.row >= nextBoard.length ||
          blockerPosition.col < 0 ||
          blockerPosition.col >= (nextBoard[0]?.length ?? 0)
        ) {
          continue;
        }
        const blocker = nextBoard[blockerPosition.row]?.[blockerPosition.col];
        if (!isBlocker(blocker)) {
          continue;
        }
        const nextStrength = blocker.strength - 1;
        const destroyed = nextStrength <= 0;
        blockerHitMap.set(positionKey(blockerPosition), { position: blockerPosition, damage: 1, destroyed });
        if (destroyed) {
          nextBoard[blockerPosition.row][blockerPosition.col] = null;
        } else {
          blocker.strength = nextStrength as 1 | 2;
        }
      }
    }

    workingBoard = collapseBoard(nextBoard);
    steps.push({
      cascadeIndex: steps.length + 1,
      matched,
      removedGemCount: matched.length,
      blockerHits: [...blockerHitMap.values()],
      resultingBoard: cloneBoard(workingBoard),
    });
  }
}

export function findAvailableMoves(board: PuzzleBoard): MoveCandidate[] {
  const { width, height } = getBoardDimensions(board);
  const moves: MoveCandidate[] = [];

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const cell = board[row][col];
      if (!isGem(cell)) {
        continue;
      }
      for (const [rowDelta, colDelta] of [[1, 0], [0, 1]] as const) {
        const target = { row: row + rowDelta, col: col + colDelta };
        if (target.row < 0 || target.row >= height || target.col < 0 || target.col >= width) {
          continue;
        }
        const targetCell = board[target.row][target.col];
        if (!isGem(targetCell)) {
          continue;
        }
        const swapped = swapBoardCells(board, { row, col }, target);
        const immediateMatches = findMatches(swapped);
        if (immediateMatches.length === 0) {
          continue;
        }
        const immediateMatchCount = immediateMatches.reduce((sum, group) => sum + group.cells.length, 0);
        moves.push({ from: { row, col }, to: target, immediateMatchCount });
      }
    }
  }

  moves.sort((left, right) => right.immediateMatchCount - left.immediateMatchCount);
  return moves;
}

interface SolverBudget {
  remaining: number;
}

export function solveBoard(board: PuzzleBoard, maxVisitedStates = 25000): boolean {
  const memo = new Map<string, boolean>();
  const budget: SolverBudget = { remaining: maxVisitedStates };

  const dfs = (currentBoard: PuzzleBoard): boolean => {
    if (budget.remaining <= 0) {
      return false;
    }
    budget.remaining -= 1;

    if (isBoardCleared(currentBoard)) {
      return true;
    }

    const cacheKey = serializeBoard(currentBoard);
    const cached = memo.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const moves = findAvailableMoves(currentBoard);
    if (moves.length === 0) {
      memo.set(cacheKey, false);
      return false;
    }

    for (const move of moves) {
      const nextBoard = resolveBoard(swapBoardCells(currentBoard, move.from, move.to)).board;
      if (dfs(nextBoard)) {
        memo.set(cacheKey, true);
        return true;
      }
    }

    memo.set(cacheKey, false);
    return false;
  };

  return dfs(board);
}

function shuffleArray<T>(items: T[], random: () => number): T[] {
  const nextItems = [...items];
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }
  return nextItems;
}

export function findSolvableReshuffle(board: PuzzleBoard, seed: number, maxAttempts = 400): PuzzleBoard | null {
  const gemPositions: Position[] = [];
  const gems: Tile[] = [];
  const reshuffleBase = cloneBoard(board);

  for (let row = 0; row < reshuffleBase.length; row += 1) {
    for (let col = 0; col < reshuffleBase[row].length; col += 1) {
      const cell = reshuffleBase[row][col];
      if (!isGem(cell)) {
        continue;
      }
      gemPositions.push({ row, col });
      gems.push({ ...cell });
      reshuffleBase[row][col] = null;
    }
  }

  if (gems.length < 3) {
    return null;
  }

  const random = mulberry32(seed);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const shuffledGems = shuffleArray(gems, random);
    const candidateBoard = cloneBoard(reshuffleBase);
    gemPositions.forEach((position, index) => {
      candidateBoard[position.row][position.col] = { ...(shuffledGems[index] as GemTile) };
    });

    if (findMatches(candidateBoard).length > 0) {
      continue;
    }
    if (findAvailableMoves(candidateBoard).length === 0) {
      continue;
    }
    if (solveBoard(candidateBoard, 9000)) {
      return candidateBoard;
    }
  }

  return null;
}
