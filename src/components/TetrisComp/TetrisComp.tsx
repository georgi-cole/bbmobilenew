/**
 * TetrisComp — Modernised native React Tetris competition minigame.
 *
 * Features:
 *  - Ghost piece (shows where the falling piece will land)
 *  - Hold piece (swap current piece to hold, once per piece)
 *  - Next-piece preview (shows 3 upcoming pieces)
 *  - Standard Tetris 7-bag random piece generation (no repeats within a bag)
 *  - Wall-kick rotation (SRS-inspired)
 *  - Standard scoring: 1=100, 2=300, 3=500, 4=800 (Tetris!), × level
 *  - Soft drop (+1/row) and hard drop (+2/row) bonus
 *  - Level up every 10 lines; speed increases with level
 *  - Visual effects: line-clear flash, level-up pulse, danger state above row 4,
 *    lock-flash on piece placement
 *  - Touch + keyboard controls
 *  - Results screen showing full ranked leaderboard (human + AI)
 *
 * Competition integration:
 *  - On mount, dispatches initTetris with pre-computed AI scores.
 *  - On game-over, dispatches setHumanScore then resolveTetrisOutcome.
 *  - After the user taps Continue on the results screen, calls onComplete.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import { initTetris, setHumanScore, resetTetris } from '../../features/tetris/tetrisSlice';
import { resolveTetrisOutcome } from '../../features/tetris/thunks';
import { getMinigameAiModel, simulateAiPerformance } from '../../ai/competition/index';
import { mulberry32 } from '../../store/rng';
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost';
import type { TetrisPrizeType } from '../../features/tetris/tetrisSlice';
import './TetrisComp.css';

// ─── Game constants ────────────────────────────────────────────────────────────

const COLS = 10;
const ROWS = 20;
/** Cells in the hidden buffer above row 0 (for piece spawning). */
const BUFFER_ROWS = 2;
const TOTAL_ROWS = ROWS + BUFFER_ROWS;
const CELL_PX = 28;
const DANGER_ROW = 4; // rows from top; board flashes red when stack reaches here

// ─── Tetromino definitions ─────────────────────────────────────────────────────

type PieceKey = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

const SHAPES: Record<PieceKey, number[][]> = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const COLORS: Record<PieceKey, string> = {
  I: '#00d4ff',
  O: '#ffe000',
  T: '#c855f5',
  S: '#44ee66',
  Z: '#ff4444',
  J: '#4477ff',
  L: '#ff9000',
};

const PIECE_KEYS: PieceKey[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// ─── Scoring ──────────────────────────────────────────────────────────────────

const LINE_CLEAR_POINTS = [0, 100, 300, 500, 800];
const SOFT_DROP_PER_ROW = 1;
const HARD_DROP_PER_ROW = 2;
const LINES_PER_LEVEL = 10;

/** Drop interval in ms at each level (capped at level 20). */
function dropIntervalMs(level: number): number {
  return Math.max(80, 1000 - (Math.min(level, 20) - 1) * 47);
}

// ─── SRS wall-kick offsets ─────────────────────────────────────────────────────
// Simplified wall kicks: try up to 2 shifts left and right when rotation collides.
const WALL_KICK_OFFSETS = [0, -1, 1, -2, 2];

// ─── Types ────────────────────────────────────────────────────────────────────

type Board = (string | null)[][];
type GamePhase = 'playing' | 'gameover';

interface Piece {
  key: PieceKey;
  shape: number[][];
  color: string;
}

interface FallingPiece extends Piece {
  x: number;
  y: number;
  rotationIndex: number;
}

interface LineEffect {
  id: number;
  rows: number[];
  kind: 'single' | 'double' | 'triple' | 'tetris';
}

interface LevelUpEffect {
  id: number;
  level: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyBoard(): Board {
  return Array.from({ length: TOTAL_ROWS }, () => Array<string | null>(COLS).fill(null));
}

/** Rotate a shape matrix 90° clockwise. */
function rotateShape(shape: number[][]): number[][] {
  return shape[0].map((_, col) => shape.map((row) => row[col]).reverse());
}

/** Check if placing `shape` at (x, y) collides with the board or walls. */
function collides(board: Board, shape: number[][], x: number, y: number): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = x + c;
      const ny = y + r;
      if (nx < 0 || nx >= COLS) return true;
      if (ny >= TOTAL_ROWS) return true;
      if (ny >= 0 && board[ny][nx] !== null) return true;
    }
  }
  return false;
}

/** Compute the Y position where the piece would land (for ghost). */
function ghostY(board: Board, piece: FallingPiece): number {
  let gy = piece.y;
  while (!collides(board, piece.shape, piece.x, gy + 1)) gy++;
  return gy;
}

/** Build a 7-bag from a seeded RNG. */
function buildBag(rng: () => number): PieceKey[] {
  const bag = [...PIECE_KEYS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function makePiece(key: PieceKey): Piece {
  return { key, shape: SHAPES[key].map((r) => [...r]), color: COLORS[key] };
}

function spawnFalling(key: PieceKey): FallingPiece {
  const piece = makePiece(key);
  const x = Math.floor((COLS - piece.shape[0].length) / 2);
  // Spawn in the buffer rows (above visible area)
  const y = BUFFER_ROWS - piece.shape.length;
  return { ...piece, x, y, rotationIndex: 0 };
}

/** Lock piece onto board, returns new board (immutable). */
function lockPiece(board: Board, piece: FallingPiece): Board {
  const next = board.map((row) => [...row]);
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const ny = piece.y + r;
      const nx = piece.x + c;
      if (ny >= 0 && ny < TOTAL_ROWS && nx >= 0 && nx < COLS) {
        next[ny][nx] = piece.color;
      }
    }
  }
  return next;
}

/** Clear full lines, return { clearedBoard, clearedRowIndices }. */
function clearFullLines(board: Board): { clearedBoard: Board; clearedRows: number[] } {
  const clearedRows: number[] = [];
  let remaining = board.filter((row, i) => {
    const full = row.every((cell) => cell !== null);
    if (full) clearedRows.push(i);
    return !full;
  });
  // Add empty rows at the top
  while (remaining.length < TOTAL_ROWS) {
    remaining = [Array<string | null>(COLS).fill(null), ...remaining];
  }
  return { clearedBoard: remaining, clearedRows };
}

/** True if the stack has reached the danger zone (any cell in visible rows 0–DANGER_ROW). */
function boardInDanger(board: Board): boolean {
  for (let r = BUFFER_ROWS; r < BUFFER_ROWS + DANGER_ROW; r++) {
    if (board[r].some((c) => c !== null)) return true;
  }
  return false;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TetrisCompProps {
  participantIds: string[];
  participants: MinigameParticipant[] | undefined;
  prizeType: TetrisPrizeType;
  seed: number;
  onComplete: (completion?: ReactMinigameCompletion) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];
let effectIdCounter = 0;

export default function TetrisComp({
  participantIds,
  participants,
  prizeType,
  seed,
  onComplete,
}: TetrisCompProps) {
  const dispatch = useAppDispatch();
  const tetrisState = useAppSelector((s: RootState) =>
    (s as RootState & { tetris?: ReturnType<typeof import('../../features/tetris/tetrisSlice').default> }).tetris,
  );

  // ── Initialise on mount ──────────────────────────────────────────────────
  useEffect(() => {
    // Compute AI scores using simulateAiPerformance
    const aiScores: Record<string, number> = {};
    const humanParticipant = participants?.find((p) => p.isHuman);
    const humanId = humanParticipant?.id ?? null;

    const rng = mulberry32((seed >>> 0) ^ 0xdeadcafe);

    const tetrisAiModel = {
      ...getMinigameAiModel('tetris'),
      minScore: 0,
      maxScore: 2000,
    };

    participants?.forEach((p, idx) => {
      if (p.isHuman) return;
      aiScores[p.id] = simulateAiPerformance({
        minigameKey: 'tetris',
        seed,
        playerId: p.id,
        participantIndex: idx,
        profile: undefined,
        minigameModel: tetrisAiModel,
      });
    });

    // If no participants provided (fallback), generate minimal AI scores
    if (!participants || participants.length === 0) {
      for (let i = 0; i < participantIds.length; i++) {
        const id = participantIds[i];
        if (id === humanId) continue;
        aiScores[id] = Math.floor(rng() * 1500);
      }
    }

    const participantNames: Record<string, string> = {};
    for (const p of participants ?? []) {
      participantNames[p.id] = p.name;
    }
    // Fallback names for IDs not in participants
    for (const id of participantIds) {
      if (!participantNames[id]) participantNames[id] = id;
    }

    dispatch(
      initTetris({
        participantIds,
        participantNames,
        humanPlayerId: humanId,
        competitionType: prizeType,
        seed,
        aiScores,
      }),
    );

    return () => {
      dispatch(resetTetris());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Game state ────────────────────────────────────────────────────────────
  const [gamePhase, setGamePhase] = useState<GamePhase>('playing');
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [current, setCurrent] = useState<FallingPiece | null>(null);
  const [held, setHeld] = useState<Piece | null>(null);
  const [canHold, setCanHold] = useState(true);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [lineEffects, setLineEffects] = useState<LineEffect[]>([]);
  const [levelUpEffects, setLevelUpEffects] = useState<LevelUpEffect[]>([]);
  const [lockFlash, setLockFlash] = useState(false);
  const [isDanger, setIsDanger] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Bag + upcoming pieces
  const rngRef = useRef<() => number>(mulberry32(seed >>> 0));
  const bagRef = useRef<PieceKey[]>([]);
  const upcomingRef = useRef<PieceKey[]>([]);
  const [upcoming, setUpcoming] = useState<PieceKey[]>([]);

  const boardRef = useRef<Board>(emptyBoard());
  const currentRef = useRef<FallingPiece | null>(null);
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const levelRef = useRef(1);
  const canHoldRef = useRef(true);
  const heldRef = useRef<Piece | null>(null);
  const gamePhaseRef = useRef<GamePhase>('playing');

  // Keep refs in sync with state for use inside callbacks
  boardRef.current = board;
  currentRef.current = current;
  scoreRef.current = score;
  linesRef.current = lines;
  levelRef.current = level;
  canHoldRef.current = canHold;
  heldRef.current = held;
  gamePhaseRef.current = gamePhase;

  // ── Piece queue helpers ──────────────────────────────────────────────────

  const refillBag = useCallback(() => {
    if (bagRef.current.length === 0) {
      bagRef.current = buildBag(rngRef.current);
    }
  }, []);

  const dequeue = useCallback((): PieceKey => {
    // Ensure there is at least one piece available in the upcoming queue
    while (upcomingRef.current.length < 1) {
      refillBag();
      if (bagRef.current.length === 0) break;
      upcomingRef.current.push(bagRef.current.shift()!);
    }

    // Take the next active piece from the upcoming queue
    const key = upcomingRef.current.shift()!;

    // Replenish upcoming queue back to 3 preview pieces
    while (upcomingRef.current.length < 3) {
      refillBag();
      if (bagRef.current.length === 0) break;
      upcomingRef.current.push(bagRef.current.shift()!);
    }
    setUpcoming([...upcomingRef.current]);
    return key;
  }, [refillBag]);

  // ── Spawn a new piece ─────────────────────────────────────────────────────

  const spawnPiece = useCallback(
    (currentBoard: Board): boolean => {
      const key = dequeue();
      const piece = spawnFalling(key);
      if (collides(currentBoard, piece.shape, piece.x, piece.y)) {
        // Game over — collision on spawn
        return false;
      }
      setCurrent(piece);
      return true;
    },
    [dequeue],
  );

  // ── Lock current piece and process line clears ────────────────────────────

  const lockCurrentPiece = useCallback(() => {
    const piece = currentRef.current;
    const currentBoard = boardRef.current;
    if (!piece) return;

    const newBoard = lockPiece(currentBoard, piece);
    const { clearedBoard, clearedRows } = clearFullLines(newBoard);

    // Score for line clears
    const cleared = clearedRows.length;
    let addScore = 0;
    if (cleared > 0) {
      addScore += LINE_CLEAR_POINTS[Math.min(cleared, 4)] * levelRef.current;
      const kind =
        cleared === 1 ? 'single' : cleared === 2 ? 'double' : cleared === 3 ? 'triple' : 'tetris';
      const effect: LineEffect = {
        id: ++effectIdCounter,
        rows: clearedRows.map((r) => r - BUFFER_ROWS), // convert to visible row indices
        kind,
      };
      setLineEffects((prev) => [...prev, effect]);
      setTimeout(() => {
        setLineEffects((prev) => prev.filter((e) => e.id !== effect.id));
      }, 600);
    }

    const newLines = linesRef.current + cleared;
    const newLevel = Math.floor(newLines / LINES_PER_LEVEL) + 1;
    const leveledUp = newLevel > levelRef.current;

    if (leveledUp) {
      const lvlEffect: LevelUpEffect = { id: ++effectIdCounter, level: newLevel };
      setLevelUpEffects((prev) => [...prev, lvlEffect]);
      setTimeout(() => {
        setLevelUpEffects((prev) => prev.filter((e) => e.id !== lvlEffect.id));
      }, 1200);
    }

    const newScore = scoreRef.current + addScore;

    setBoard(clearedBoard);
    boardRef.current = clearedBoard;
    setScore(newScore);
    scoreRef.current = newScore;
    setLines(newLines);
    linesRef.current = newLines;
    setLevel(newLevel);
    levelRef.current = newLevel;
    setCanHold(true);
    canHoldRef.current = true;
    setIsDanger(boardInDanger(clearedBoard));

    // Lock flash effect
    setLockFlash(true);
    setTimeout(() => setLockFlash(false), 100);

    // Spawn next piece
    const spawned = spawnPiece(clearedBoard);
    if (!spawned) {
      endGame(newScore);
    }
  }, [spawnPiece]);

  // ── End game ──────────────────────────────────────────────────────────────

  const endGame = useCallback(
    (finalScore?: number) => {
      setGamePhase('gameover');
      gamePhaseRef.current = 'gameover';
      const s = finalScore ?? scoreRef.current;
      dispatch(setHumanScore(s));
      dispatch(resolveTetrisOutcome());
      // Show results after a brief pause
      setTimeout(() => setShowResults(true), 800);
    },
    [dispatch],
  );

  // ── Movement helpers ──────────────────────────────────────────────────────

  const tryMove = useCallback((dx: number, dy: number): boolean => {
    const piece = currentRef.current;
    const currentBoard = boardRef.current;
    if (!piece || gamePhaseRef.current !== 'playing') return false;
    if (!collides(currentBoard, piece.shape, piece.x + dx, piece.y + dy)) {
      const moved = { ...piece, x: piece.x + dx, y: piece.y + dy };
      setCurrent(moved);
      return true;
    }
    return false;
  }, []);

  const tryRotate = useCallback(() => {
    const piece = currentRef.current;
    const currentBoard = boardRef.current;
    if (!piece || gamePhaseRef.current !== 'playing') return;
    const newShape = rotateShape(piece.shape);
    const newRotIndex = (piece.rotationIndex + 1) % 4;
    for (const dx of WALL_KICK_OFFSETS) {
      if (!collides(currentBoard, newShape, piece.x + dx, piece.y)) {
        setCurrent({ ...piece, shape: newShape, rotationIndex: newRotIndex, x: piece.x + dx });
        return;
      }
    }
  }, []);

  const softDrop = useCallback(() => {
    const piece = currentRef.current;
    const currentBoard = boardRef.current;
    if (!piece || gamePhaseRef.current !== 'playing') return;
    if (!collides(currentBoard, piece.shape, piece.x, piece.y + 1)) {
      const moved = { ...piece, y: piece.y + 1 };
      setCurrent(moved);
      setScore((s) => s + SOFT_DROP_PER_ROW);
      scoreRef.current += SOFT_DROP_PER_ROW;
    } else {
      lockCurrentPiece();
    }
  }, [lockCurrentPiece]);

  const hardDrop = useCallback(() => {
    const piece = currentRef.current;
    const currentBoard = boardRef.current;
    if (!piece || gamePhaseRef.current !== 'playing') return;
    const gy = ghostY(currentBoard, piece);
    const dropped = gy - piece.y;
    const bonus = dropped * HARD_DROP_PER_ROW;
    const landed = { ...piece, y: gy };
    setCurrent(landed);
    currentRef.current = landed;
    setScore((s) => s + bonus);
    scoreRef.current += bonus;
    lockCurrentPiece();
  }, [lockCurrentPiece]);

  const holdPiece = useCallback(() => {
    if (!canHoldRef.current || gamePhaseRef.current !== 'playing') return;
    const piece = currentRef.current;
    if (!piece) return;

    const currentHeld = heldRef.current;
    const newHeld: Piece = { key: piece.key, shape: SHAPES[piece.key].map((r) => [...r]), color: piece.color };

    setHeld(newHeld);
    heldRef.current = newHeld;
    setCanHold(false);
    canHoldRef.current = false;

    if (currentHeld) {
      const spawned = spawnFalling(currentHeld.key);
      if (!collides(boardRef.current, spawned.shape, spawned.x, spawned.y)) {
        setCurrent(spawned);
      } else {
        endGame();
      }
    } else {
      spawnPiece(boardRef.current);
    }
  }, [spawnPiece, endGame]);

  // ── Gravity timer ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return;
    const interval = setInterval(() => {
      if (gamePhaseRef.current !== 'playing') return;
      const piece = currentRef.current;
      const currentBoard = boardRef.current;
      if (!piece) return;
      if (!collides(currentBoard, piece.shape, piece.x, piece.y + 1)) {
        setCurrent((p) => (p ? { ...p, y: p.y + 1 } : p));
      } else {
        lockCurrentPiece();
      }
    }, dropIntervalMs(level));

    return () => clearInterval(interval);
  }, [gamePhase, level, lockCurrentPiece]);

  // ── Initial spawn ─────────────────────────────────────────────────────────

  useEffect(() => {
    // Pre-fill the upcoming queue then spawn first piece
    refillBag();
    while (upcomingRef.current.length < 3 && bagRef.current.length > 0) {
      upcomingRef.current.push(bagRef.current.shift()!);
    }
    setUpcoming([...upcomingRef.current]);
    const startBoard = emptyBoard();
    setBoard(startBoard);
    boardRef.current = startBoard;
    spawnPiece(startBoard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard input ────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (gamePhaseRef.current !== 'playing') return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          tryMove(-1, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          tryMove(1, 0);
          break;
        case 'ArrowDown':
          e.preventDefault();
          softDrop();
          break;
        case 'ArrowUp':
        case 'x':
        case 'X':
          e.preventDefault();
          tryRotate();
          break;
        case ' ':
          e.preventDefault();
          hardDrop();
          break;
        case 'c':
        case 'C':
        case 'Shift':
          e.preventDefault();
          holdPiece();
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tryMove, tryRotate, softDrop, hardDrop, holdPiece]);

  // ── Ghost piece ───────────────────────────────────────────────────────────

  const ghost = useMemo<FallingPiece | null>(() => {
    if (!current || gamePhase !== 'playing') return null;
    const gy = ghostY(board, current);
    if (gy === current.y) return null; // same position, skip
    return { ...current, y: gy };
  }, [current, board, gamePhase]);

  // ── Render board ──────────────────────────────────────────────────────────

  /** Visible board = rows BUFFER_ROWS..TOTAL_ROWS-1 */
  const visibleBoard = useMemo<(string | null)[][]>(() => {
    const base = board.slice(BUFFER_ROWS);
    // Overlay current piece
    const display = base.map((row) => [...row]);
    if (ghost && gamePhase === 'playing') {
      for (let r = 0; r < ghost.shape.length; r++) {
        for (let c = 0; c < ghost.shape[r].length; c++) {
          if (!ghost.shape[r][c]) continue;
          const vy = ghost.y - BUFFER_ROWS + r;
          const vx = ghost.x + c;
          if (vy >= 0 && vy < ROWS && vx >= 0 && vx < COLS && !display[vy][vx]) {
            display[vy][vx] = '__ghost__' + ghost.color;
          }
        }
      }
    }
    if (current && gamePhase === 'playing') {
      for (let r = 0; r < current.shape.length; r++) {
        for (let c = 0; c < current.shape[r].length; c++) {
          if (!current.shape[r][c]) continue;
          const vy = current.y - BUFFER_ROWS + r;
          const vx = current.x + c;
          if (vy >= 0 && vy < ROWS && vx >= 0 && vx < COLS) {
            display[vy][vx] = current.color;
          }
        }
      }
    }
    return display;
  }, [board, current, ghost, gamePhase]);

  // ── Build sorted leaderboard ──────────────────────────────────────────────

  const leaderboard = useMemo(() => {
    if (!tetrisState || tetrisState.phase !== 'complete') return [];
    const allScores = tetrisState.finalScores;
    return tetrisState.participants
      .map((p) => ({ ...p, score: allScores[p.id] ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }, [tetrisState]);

  // ── Results screen ────────────────────────────────────────────────────────

  if (showResults && tetrisState?.phase === 'complete') {
    const winnerEntry = leaderboard[0];
    return (
      <MinigameCompleteWrapper
        className="tetris-results"
        onContinue={() => onComplete({ rawValue: score })}
        placementsNode={
          <ol className="tetris-results-list" role="list" aria-label="Final rankings">
            {leaderboard.map((entry, i) => (
              <li
                key={entry.id}
                className={[
                  'tetris-results-entry',
                  entry.isHuman ? 'tetris-results-entry--you' : '',
                  i === 0 ? 'tetris-results-entry--winner' : '',
                  i === leaderboard.length - 1 ? 'tetris-results-entry--last' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="listitem"
              >
                <span className="tetris-results-rank">{MEDALS[i] ?? `${i + 1}.`}</span>
                <span className="tetris-results-name">
                  {entry.name}
                  {entry.isHuman && (
                    <span className="tetris-results-you-tag" aria-label="(you)">
                      {' '}(you)
                    </span>
                  )}
                </span>
                <span className="tetris-results-score">{entry.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        }
        placementsRole="list"
        placementsAriaLabel="Final standings"
      >
        <div className="tetris-results-hero">
          <div className="tetris-results-trophy">🏆</div>
          <h2 className="tetris-results-title">
            {winnerEntry?.isHuman ? 'You Win!' : `${winnerEntry?.name ?? '?'} Wins!`}
          </h2>
          <p className="tetris-results-subtitle">
            {winnerEntry?.isHuman
              ? 'You achieved the highest score!'
              : 'Better luck next time…'}
          </p>
          <div className="tetris-results-your-score">
            Your score: <strong>{score.toLocaleString()}</strong>
          </div>
        </div>
      </MinigameCompleteWrapper>
    );
  }

  // ── Playing / game-over screen ────────────────────────────────────────────

  const isGameOver = gamePhase === 'gameover';

  return (
    <div className={['tetris-root', isDanger && !isGameOver ? 'tetris-root--danger' : ''].filter(Boolean).join(' ')}>
      {/* Level-up overlay effects */}
      {levelUpEffects.map((ef) => (
        <div key={ef.id} className="tetris-levelup-overlay" aria-live="polite">
          ⬆ LEVEL {ef.level}!
        </div>
      ))}

      {/* Game-over overlay */}
      {isGameOver && (
        <div className="tetris-gameover-overlay" aria-live="assertive">
          <div className="tetris-gameover-text">GAME OVER</div>
          <div className="tetris-gameover-score">{score.toLocaleString()}</div>
          <div className="tetris-gameover-sub">Calculating results…</div>
        </div>
      )}

      {/* Main layout */}
      <div className="tetris-layout">
        {/* Left panel: hold + stats */}
        <div className="tetris-panel tetris-panel--left">
          <section className="tetris-hold" aria-label="Hold piece">
            <div className="tetris-panel-label">HOLD</div>
            <MiniPieceGrid piece={held} dimmed={!canHold} />
          </section>
          <section className="tetris-stats" aria-label="Game stats">
            <div className="tetris-stat">
              <span className="tetris-stat-label">SCORE</span>
              <span className="tetris-stat-value">{score.toLocaleString()}</span>
            </div>
            <div className="tetris-stat">
              <span className="tetris-stat-label">LINES</span>
              <span className="tetris-stat-value">{lines}</span>
            </div>
            <div className="tetris-stat">
              <span className="tetris-stat-label">LEVEL</span>
              <span className="tetris-stat-value">{level}</span>
            </div>
          </section>
        </div>

        {/* Board */}
        <div
          className={['tetris-board-wrap', lockFlash ? 'tetris-board-wrap--flash' : ''].filter(Boolean).join(' ')}
          aria-label="Tetris board"
          role="img"
        >
          <div
            className="tetris-board"
            style={{ '--cols': COLS, '--rows': ROWS, '--cell': `${CELL_PX}px` } as React.CSSProperties}
          >
            {visibleBoard.map((row, ry) => {
              const isLineClear = lineEffects.some((ef) => ef.rows.includes(ry));
              return row.map((cell, cx) => {
                const isGhost = cell?.startsWith('__ghost__') ?? false;
                const color = isGhost ? cell!.slice(9) : cell;
                return (
                  <div
                    key={`${ry}-${cx}`}
                    className={[
                      'tetris-cell',
                      cell ? 'tetris-cell--filled' : 'tetris-cell--empty',
                      isGhost ? 'tetris-cell--ghost' : '',
                      isLineClear && cell && !isGhost ? 'tetris-cell--clear' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={color ? ({ '--cell-color': color } as React.CSSProperties) : undefined}
                    aria-hidden="true"
                  />
                );
              });
            })}
          </div>
        </div>

        {/* Right panel: next pieces */}
        <div className="tetris-panel tetris-panel--right">
          <section className="tetris-next" aria-label="Next pieces">
            <div className="tetris-panel-label">NEXT</div>
            {upcoming.slice(0, 3).map((key, i) => (
              <MiniPieceGrid key={i} piece={makePiece(key)} />
            ))}
          </section>
        </div>
      </div>

      {/* Touch controls */}
      <div className="tetris-touch-controls" aria-label="Touch controls">
        <div className="tetris-touch-row">
          <button
            className="tetris-btn tetris-btn--hold"
            onPointerDown={(e) => { e.preventDefault(); holdPiece(); }}
            aria-label="Hold"
            disabled={isGameOver}
          >
            HOLD
          </button>
          <button
            className="tetris-btn tetris-btn--rotate"
            onPointerDown={(e) => { e.preventDefault(); tryRotate(); }}
            aria-label="Rotate"
            disabled={isGameOver}
          >
            ↻
          </button>
          <button
            className="tetris-btn tetris-btn--hard-drop"
            onPointerDown={(e) => { e.preventDefault(); hardDrop(); }}
            aria-label="Hard drop"
            disabled={isGameOver}
          >
            ⬇
          </button>
        </div>
        <div className="tetris-touch-row">
          <button
            className="tetris-btn tetris-btn--left"
            onPointerDown={(e) => { e.preventDefault(); tryMove(-1, 0); }}
            aria-label="Move left"
            disabled={isGameOver}
          >
            ◀
          </button>
          <button
            className="tetris-btn tetris-btn--soft-drop"
            onPointerDown={(e) => { e.preventDefault(); softDrop(); }}
            aria-label="Soft drop"
            disabled={isGameOver}
          >
            ▼
          </button>
          <button
            className="tetris-btn tetris-btn--right"
            onPointerDown={(e) => { e.preventDefault(); tryMove(1, 0); }}
            aria-label="Move right"
            disabled={isGameOver}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MiniPieceGrid ─────────────────────────────────────────────────────────────

interface MiniPieceGridProps {
  piece: Piece | null;
  dimmed?: boolean;
}

function MiniPieceGrid({ piece, dimmed = false }: MiniPieceGridProps) {
  if (!piece) {
    return <div className="tetris-mini-grid tetris-mini-grid--empty" aria-hidden="true" />;
  }

  const rows = piece.shape.length;
  const cols = piece.shape[0]?.length ?? 0;

  return (
    <div
      className={['tetris-mini-grid', dimmed ? 'tetris-mini-grid--dimmed' : ''].filter(Boolean).join(' ')}
      style={{ '--mini-rows': rows, '--mini-cols': cols } as React.CSSProperties}
      aria-hidden="true"
    >
      {piece.shape.map((row, ri) =>
        row.map((cell, ci) => (
          <div
            key={`${ri}-${ci}`}
            className={['tetris-mini-cell', cell ? 'tetris-mini-cell--filled' : 'tetris-mini-cell--empty'].join(' ')}
            style={cell ? ({ '--cell-color': piece.color } as React.CSSProperties) : undefined}
          />
        )),
      )}
    </div>
  );
}
