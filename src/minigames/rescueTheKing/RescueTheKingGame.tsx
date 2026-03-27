/**
 * RescueTheKingGame.tsx
 *
 * Mobile-first match-3 puzzle minigame: Rescue the King.
 *
 * The player must clear all normal tiles from a finite board
 * before the 3:00 timer runs out. If cleared, the king is rescued.
 * If time runs out, the king drowns.
 *
 * Props: onFinish?(score: number), seed?: number, autoStart?: boolean
 *
 * DEVELOPER NOTE
 * ─────────────────────────────────────────────────────────────────
 * Solvability: Each level has a finite set of tiles (no refill).
 * When no moves exist, tiles are reshuffled (preserving symbol counts)
 * up to MAX_RESHUFFLES times. Win condition = 0 normal tiles remaining.
 *
 * Level variation: 5 hand-designed blocker layouts; one is chosen
 * deterministically from (seed % 5). The seed is also XOR'd with the level's
 * base seed in buildBoard() so symbol placement varies per session.
 *
 * Difficulty tuning: Edit SCORE_* constants and TIME_LIMIT_MS in
 * rescueTheKingLogic.ts. Edit blockerLayout in rescueTheKingLevels.ts.
 * Increase rows/cols in LevelConfig for larger boards.
 *
 * Score ranking:
 * - Nobody clears: tilesCleared×10 + blockerHits×15 + blockerDestroyed×50 + combo×25
 * - Multiple clear: above + 2000 boardClear + timeRemainingSec×20 (time-bonus)
 * This produces a total ordering in all competition scenarios.
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react';
import type { GameState, Cell, Board } from './rescueTheKingTypes';
import { SYMBOL_EMOJI, SYMBOL_COLOR } from './rescueTheKingTypes';
import {
  buildBoard,
  findAllMatches,
  applyMatchRemoval,
  hitBlockers,
  applyGravity,
  isValidSwap,
  performSwap,
  hasAnyValidMove,
  shuffleNormalTiles,
  countNormalTiles,
  computeFinalScore,
  mulberry32,
  TIME_LIMIT_MS,
  MAX_RESHUFFLES,
  SCORE_PER_TILE,
  SCORE_BLOCKER_HIT,
  SCORE_BLOCKER_DESTROYED,
  SCORE_COMBO_BONUS,
} from './rescueTheKingLogic';
import { pickLevel } from './rescueTheKingLevels';
import './RescueTheKingGame.css';

interface Props {
  onFinish?: (value: number) => void;
  seed?: number;
  autoStart?: boolean;
}

// ── Animation step durations (ms) ────────────────────────────────────────────
const SWAP_ANIM_MS = 200;
const MATCH_ANIM_MS = 350;
const FALL_ANIM_MS = 250;
const RESHUFFLE_TOAST_MS = 1800;

/** XOR salt applied to seed when initialising the reshuffle RNG, so it differs from the board seed. */
const RNG_RESHUFFLE_SALT = 0xDEAD_C0DE;

// ── Score pop entry ───────────────────────────────────────────────────────────
interface ScorePop {
  id: number;
  value: number;
  x: number;
  y: number;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function RescueTheKingGame({ onFinish, seed = 12345, autoStart = false }: Props) {
  const level = useMemo(() => pickLevel(seed), [seed]);

  // ── Initial state factory ────────────────────────────────────────────────
  // Takes a fresh RNG to use during the initial-validity shuffle, so callers
  // (including startGame) don't need to mutate rngRef directly.
  const buildInitialState = useCallback((rng: () => number): GameState => {
    let board = buildBoard(level, seed);
    let reshuffleCount = 0;
    // Guarantee at least one valid move before the player sees the board.
    while (!hasAnyValidMove(board) && countNormalTiles(board) > 0 && reshuffleCount < MAX_RESHUFFLES) {
      board = shuffleNormalTiles(board, rng);
      reshuffleCount++;
    }
    return {
      phase: autoStart ? 'playing' : 'idle',
      board,
      score: 0,
      tilesCleared: 0,
      blockersHit: 0,
      blockersDestroyed: 0,
      currentCombo: 0,
      maxCombo: 0,
      timeRemainingMs: TIME_LIMIT_MS,
      totalTimeMs: TIME_LIMIT_MS,
      selectedCell: null,
      reshuffleCount,
      initialNormalTileCount: countNormalTiles(board),
      boardCleared: false,
    };
  }, [level, autoStart, seed]);

  const [state, setState] = useState<GameState>(() => {
    const rng = mulberry32(seed ^ RNG_RESHUFFLE_SALT);
    return buildInitialState(rng);
  });

  // ── Animation state ──────────────────────────────────────────────────────
  const [matchingCells, setMatchingCells] = useState<Set<string>>(new Set());
  const [hitFlashCells, setHitFlashCells] = useState<Set<string>>(new Set());
  const [fallingCells, setFallingCells] = useState<Set<string>>(new Set());
  const [invalidSwapCells, setInvalidSwapCells] = useState<Set<string>>(new Set());
  const [reshuffleKey, setReshuffleKey] = useState<number>(0);
  const [showReshuffle, setShowReshuffle] = useState(false);
  const [scorePops, setScorePops] = useState<ScorePop[]>([]);
  const [shaking, setShaking] = useState(false);
  const popIdRef = useRef(0);

  // ── RNG ref (persists across renders for reshuffles) ─────────────────────
  const rngRef = useRef(mulberry32(seed ^ RNG_RESHUFFLE_SALT));

  // ── Refs for timer & finish guard ────────────────────────────────────────
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);

  // ── Board cell size (computed from viewport) ─────────────────────────────
  const cellSize = useMemo(() => {
    const maxW = Math.min(window.innerWidth, 480) - 24;
    return Math.floor((maxW - (level.cols - 1) * 3 - 8) / level.cols);
  }, [level.cols]);

  // ── Finish game ──────────────────────────────────────────────────────────
  const finishGame = useCallback((finalState: GameState) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const score = computeFinalScore(finalState);
    onFinish?.(score);
  }, [onFinish]);

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.phase !== 'playing') return;

    timerRef.current = setInterval(() => {
      setState(prev => {
        if (prev.phase !== 'playing') return prev;
        const next = prev.timeRemainingMs - 100;
        if (next <= 0) {
          const loseState: GameState = { ...prev, timeRemainingMs: 0, phase: 'lose' };
          setTimeout(() => finishGame(loseState), 50);
          return loseState;
        }
        return { ...prev, timeRemainingMs: next };
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.phase, finishGame]);

  // ── Score pop helper ─────────────────────────────────────────────────────
  const spawnScorePop = useCallback((value: number, x: number, y: number) => {
    const id = ++popIdRef.current;
    setScorePops(prev => [...prev, { id, value, x, y }]);
    setTimeout(() => {
      setScorePops(prev => prev.filter(p => p.id !== id));
    }, 900);
  }, []);

  // ── Screen shake helper ──────────────────────────────────────────────────
  const triggerShake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 380);
  }, []);

  // ── Resolution loop (recursive cascade) ──────────────────────────────────
  // Use a ref to allow the callback to call itself recursively without triggering
  // the no-use-before-define ESLint rule on the const declaration.
  const resolveBoardRef = useRef<(board: Board, accState: GameState, comboDepth: number) => void>(() => undefined);

  const resolveBoard = useCallback((
    board: Board,
    accState: GameState,
    comboDepth: number
  ) => {
    const matches = findAllMatches(board);

    if (matches.length === 0) {
      // No matches — check if any moves remain
      const remaining = countNormalTiles(board);
      if (remaining === 0) {
        // Win!
        const winState: GameState = {
          ...accState,
          board,
          phase: 'win',
          boardCleared: true,
        };
        setState(winState);
        setTimeout(() => finishGame(winState), 200);
        return;
      }

      if (!hasAnyValidMove(board)) {
        // Consume the remaining reshuffle budget, incrementing the count on
        // every attempt (successful or not) so the limit is always honoured.
        let currentBoard = board;
        let reshuffleCount = accState.reshuffleCount;
        while (reshuffleCount < MAX_RESHUFFLES) {
          const candidate = shuffleNormalTiles(currentBoard, rngRef.current);
          reshuffleCount++;
          if (hasAnyValidMove(candidate)) {
            const newState: GameState = {
              ...accState,
              board: candidate,
              phase: 'playing',
              reshuffleCount,
              selectedCell: null,
            };
            setState(newState);
            setShowReshuffle(false);
            setTimeout(() => {
              setReshuffleKey(k => k + 1);
              setShowReshuffle(true);
              setTimeout(() => setShowReshuffle(false), RESHUFFLE_TOAST_MS);
            }, 0);
            return;
          }
          currentBoard = candidate;
        }
        // Reshuffles exhausted — no playable arrangement found.
        // End as a loss — never set boardCleared: true when tiles remain.
        const loseState: GameState = {
          ...accState,
          board: currentBoard,
          phase: 'lose',
          boardCleared: false,
          selectedCell: null,
        };
        setState(loseState);
        setTimeout(() => finishGame(loseState), 200);
        return;
      }

      // Normal idle state — resume playing
      setState({ ...accState, board, phase: 'playing', selectedCell: null });
      return;
    }

    // There are matches — resolve them
    const allMatchCells = new Set<string>();
    for (const g of matches) {
      for (const [r, c] of g.cells) allMatchCells.add(`${r},${c}`);
    }

    setMatchingCells(allMatchCells);

    setTimeout(() => {
      setMatchingCells(new Set());

      const { board: board2, tilesRemoved, adjacentBlockerPositions } =
        applyMatchRemoval(board, matches);

      const { board: board3, blockersHit, blockersDestroyed } =
        hitBlockers(board2, adjacentBlockerPositions);

      if (adjacentBlockerPositions.length > 0) {
        const flashSet = new Set<string>();
        for (const [r, c] of adjacentBlockerPositions) flashSet.add(`${r},${c}`);
        setHitFlashCells(flashSet);
        setTimeout(() => setHitFlashCells(new Set()), 350);
      }

      const board4 = applyGravity(board3);

      // Detect which cells have fallen (new normal tiles that weren't there before)
      const fallenSet = new Set<string>();
      for (let r = 0; r < board4.length; r++) {
        for (let c = 0; c < (board4[0]?.length ?? 0); c++) {
          if (board4[r][c].kind === 'normal' && board3[r][c].kind === 'empty') {
            fallenSet.add(`${r},${c}`);
          }
        }
      }
      setFallingCells(fallenSet);
      setTimeout(() => setFallingCells(new Set()), FALL_ANIM_MS + 50);

      const newCombo = comboDepth + 1;
      const comboBonus = newCombo >= 2 ? (newCombo - 1) * SCORE_COMBO_BONUS : 0;
      const matchScore =
        tilesRemoved * SCORE_PER_TILE +
        blockersHit * SCORE_BLOCKER_HIT +
        blockersDestroyed * SCORE_BLOCKER_DESTROYED +
        comboBonus;

      // Score pop — center of board
      if (matchScore > 0) {
        spawnScorePop(
          matchScore,
          50 + (Math.random() - 0.5) * 30,
          40 + (Math.random() - 0.5) * 20
        );
      }

      if (newCombo >= 3) triggerShake();

      const nextAccState: GameState = {
        ...accState,
        board: board4,
        tilesCleared: accState.tilesCleared + tilesRemoved,
        blockersHit: accState.blockersHit + blockersHit,
        blockersDestroyed: accState.blockersDestroyed + blockersDestroyed,
        currentCombo: newCombo,
        maxCombo: Math.max(accState.maxCombo, newCombo),
        score: accState.score + matchScore,
        phase: 'animating',
      };

      setState(nextAccState);

      setTimeout(() => {
        resolveBoardRef.current(board4, nextAccState, newCombo);
      }, FALL_ANIM_MS);

    }, MATCH_ANIM_MS);
  }, [finishGame, spawnScorePop, triggerShake]);

  // Keep the ref in sync so the recursive call always uses the latest version.
  useEffect(() => {
    resolveBoardRef.current = resolveBoard;
  }, [resolveBoard]);

  // ── Handle cell press ────────────────────────────────────────────────────
  const handleCellPress = useCallback((row: number, col: number) => {
    setState(prev => {
      if (prev.phase !== 'playing') return prev;
      const cell = prev.board[row][col];
      if (cell.kind !== 'normal') return prev;

      if (!prev.selectedCell) {
        return { ...prev, selectedCell: [row, col] };
      }

      const [sr, sc] = prev.selectedCell;

      // Tap same cell — deselect
      if (sr === row && sc === col) {
        return { ...prev, selectedCell: null };
      }

      // Adjacent? Try swap
      const dr = Math.abs(row - sr);
      const dc = Math.abs(col - sc);
      if (dr + dc === 1) {
        if (isValidSwap(prev.board, sr, sc, row, col)) {
          const swappedBoard = performSwap(prev.board, sr, sc, row, col);
          const animatingState: GameState = {
            ...prev,
            board: swappedBoard,
            phase: 'animating',
            selectedCell: null,
            currentCombo: 0,
          };
          // Schedule resolution after swap animation
          setTimeout(() => {
            resolveBoardRef.current(swappedBoard, animatingState, 0);
          }, SWAP_ANIM_MS);
          return animatingState;
        } else {
          // Invalid swap — flash both cells
          const invalidSet = new Set([`${sr},${sc}`, `${row},${col}`]);
          setInvalidSwapCells(invalidSet);
          setTimeout(() => setInvalidSwapCells(new Set()), 320);
          return { ...prev, selectedCell: null };
        }
      }

      // Non-adjacent — select new cell
      return { ...prev, selectedCell: [row, col] };
    });
  }, []);

  // ── Touch support ─────────────────────────────────────────────────────────
  const touchStartRef = useRef<{ row: number; col: number } | null>(null);

  const handleTouchStart = useCallback((row: number, col: number) => {
    touchStartRef.current = { row, col };
  }, []);

  const handleTouchEnd = useCallback((row: number, col: number, e: React.TouchEvent) => {
    e.preventDefault();
    if (touchStartRef.current) {
      const { row: sr, col: sc } = touchStartRef.current;
      if (sr === row && sc === col) {
        handleCellPress(row, col);
      }
    }
    touchStartRef.current = null;
  }, [handleCellPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    const rowAttr = el.getAttribute('data-row');
    const colAttr = el.getAttribute('data-col');
    if (rowAttr === null || colAttr === null) return;
    const targetRow = parseInt(rowAttr, 10);
    const targetCol = parseInt(colAttr, 10);
    const { row: sr, col: sc } = touchStartRef.current;
    if (targetRow === sr && targetCol === sc) return;
    // Treat as a drag-swap
    touchStartRef.current = null;
    // Select source first, then tap target
    setState(prev => {
      if (prev.phase !== 'playing') return prev;
      return { ...prev, selectedCell: [sr, sc] };
    });
    setTimeout(() => handleCellPress(targetRow, targetCol), 0);
  }, [handleCellPress]);

  // ── Start game ───────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    finishedRef.current = false;
    const freshRng = mulberry32(seed ^ RNG_RESHUFFLE_SALT);
    rngRef.current = freshRng;
    const newState = buildInitialState(freshRng);
    setState({ ...newState, phase: 'playing' });
  }, [buildInitialState, seed]);

  // ── Format timer ─────────────────────────────────────────────────────────
  const formatTime = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const timerDanger = state.timeRemainingMs <= 30_000;
  const waterPct = Math.min(100, (1 - state.timeRemainingMs / state.totalTimeMs) * 100);
  const kingPanic = timerDanger && state.phase === 'playing';
  const kingRescued = state.phase === 'win';
  const progressPct = state.initialNormalTileCount > 0
    ? Math.max(0, Math.min(100, (1 - countNormalTiles(state.board) / state.initialNormalTileCount) * 100))
    : 100;
  const finalScore = useMemo(() => computeFinalScore(state), [state]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`rtk-root${shaking ? ' rtk-shake' : ''}`}>
      {/* HUD */}
      <div className="rtk-hud">
        <div className="rtk-hud-score">⭐ {state.score.toLocaleString()}</div>
        <div className={`rtk-hud-timer${timerDanger ? ' rtk-timer-danger' : ''}`}>
          ⏱ {formatTime(state.timeRemainingMs)}
        </div>
        <div className="rtk-hud-combo">
          {state.currentCombo >= 2 ? `🔥 ×${state.currentCombo}` : ''}
        </div>
      </div>

      {/* Progress bar */}
      <div className="rtk-progress">
        <div className="rtk-progress-bar-bg">
          <div
            className="rtk-progress-bar-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Water bar */}
      <div className="rtk-water-bar">
        <div
          className={`rtk-water-bar-fill${timerDanger ? ' rtk-water-critical' : ''}`}
          style={{ width: `${waterPct}%` }}
        />
      </div>

      {/* Board */}
      <div className="rtk-board-wrapper">
        <div
          className="rtk-board"
          style={{ gridTemplateColumns: `repeat(${level.cols}, ${cellSize}px)` }}
        >
          {state.board.map((row, r) =>
            row.map((cell, c) => (
              <BoardCell
                key={`${r}-${c}`}
                cell={cell}
                row={r}
                col={c}
                size={cellSize}
                isSelected={
                  state.selectedCell?.[0] === r && state.selectedCell?.[1] === c
                }
                isMatching={matchingCells.has(`${r},${c}`)}
                isHitFlash={hitFlashCells.has(`${r},${c}`)}
                isFalling={fallingCells.has(`${r},${c}`)}
                isInvalidSwap={invalidSwapCells.has(`${r},${c}`)}
                onPress={handleCellPress}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
              />
            ))
          )}
        </div>

        {/* Score pops */}
        {scorePops.map(pop => (
          <div
            key={pop.id}
            className="rtk-score-pop"
            style={{ left: `${pop.x}%`, top: `${pop.y}%` }}
          >
            +{pop.value}
          </div>
        ))}

        {/* Reshuffle toast */}
        {showReshuffle && (
          <div key={reshuffleKey} className="rtk-reshuffle-toast">
            🔀 No moves! Shuffling…
          </div>
        )}
      </div>

      {/* King + water scene */}
      <div className={`rtk-scene${timerDanger ? ' rtk-water-critical' : ''}`}>
        <div
          className={`rtk-king${kingPanic ? ' rtk-king-panic' : ''}${kingRescued ? ' rtk-king-rescued' : ''}`}
        >
          <div className="rtk-king-emoji">👑</div>
          <div className="rtk-king-label">THE KING</div>
        </div>
        <div
          className="rtk-water"
          style={{ height: `${waterPct}%` }}
        />
      </div>

      {/* Start screen */}
      {state.phase === 'idle' && (
        <div className="rtk-start-screen">
          <div className="rtk-start-title">⚔️ Rescue the King!</div>
          <div className="rtk-start-subtitle">
            Match 3 or more identical symbols to clear the board.
            Destroy all tiles before the water rises to rescue the king!
          </div>
          <button className="rtk-overlay-btn rtk-overlay-btn-primary" onClick={startGame}>
            ▶ Start Game
          </button>
        </div>
      )}

      {/* Win overlay */}
      {state.phase === 'win' && (
        <div className="rtk-overlay rtk-overlay-win">
          <div className="rtk-overlay-emoji">🎉</div>
          <div className="rtk-overlay-title">King Rescued!</div>
          <div className="rtk-overlay-body">
            You cleared the board and saved the king from the rising waters!
          </div>
          <div className="rtk-overlay-score">Score: {finalScore.toLocaleString()}</div>
          <button className="rtk-overlay-btn rtk-overlay-btn-primary" onClick={startGame}>
            Play Again
          </button>
        </div>
      )}

      {/* Lose overlay */}
      {state.phase === 'lose' && (
        <div className="rtk-overlay rtk-overlay-lose">
          <div className="rtk-overlay-emoji">💀</div>
          <div className="rtk-overlay-title">The King Drowned!</div>
          <div className="rtk-overlay-body">
            Time ran out before the board was cleared. The king is gone…
          </div>
          <div className="rtk-overlay-score">Score: {finalScore.toLocaleString()}</div>
          <button className="rtk-overlay-btn rtk-overlay-btn-primary" onClick={startGame}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

// ── BoardCell sub-component ───────────────────────────────────────────────────

interface BoardCellProps {
  cell: Cell;
  row: number;
  col: number;
  size: number;
  isSelected: boolean;
  isMatching: boolean;
  isHitFlash: boolean;
  isFalling: boolean;
  isInvalidSwap: boolean;
  onPress: (row: number, col: number) => void;
  onTouchStart: (row: number, col: number) => void;
  onTouchEnd: (row: number, col: number, e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
}

function BoardCell({
  cell, row, col, size,
  isSelected, isMatching, isHitFlash, isFalling, isInvalidSwap,
  onPress, onTouchStart, onTouchEnd, onTouchMove,
}: BoardCellProps) {
  if (cell.kind === 'empty') {
    return (
      <div
        className="rtk-cell rtk-cell-empty"
        style={{ width: size, height: size }}
        data-row={row}
        data-col={col}
      />
    );
  }

  if (cell.kind === 'blocker') {
    const kindClass = cell.blockerKind === 'crate'
      ? 'rtk-cell-blocker-crate'
      : 'rtk-cell-blocker-stone';
    const damagedClass = (cell.blockerKind === 'stone' && cell.hitsRemaining === 1)
      ? ' rtk-cell-blocker-damaged'
      : '';
    const flashClass = isHitFlash ? ' rtk-cell-hit-flash' : '';
    return (
      <div
        className={`rtk-cell rtk-cell-blocker ${kindClass}${damagedClass}${flashClass}`}
        style={{ width: size, height: size }}
        data-row={row}
        data-col={col}
      >
        <span className="rtk-cell-blocker-icon">
          {cell.blockerKind === 'crate' ? '📦' : '🪨'}
        </span>
      </div>
    );
  }

  // Normal tile
  const selectedClass = isSelected ? ' rtk-cell-selected' : '';
  const matchingClass = isMatching ? ' rtk-cell-matching' : '';
  const fallingClass = isFalling ? ' rtk-cell-falling' : '';
  const invalidClass = isInvalidSwap ? ' rtk-cell-invalid-swap' : '';

  return (
    <div
      className={`rtk-cell rtk-cell-normal${selectedClass}${matchingClass}${fallingClass}${invalidClass}`}
      style={{
        width: size,
        height: size,
        background: isSelected
          ? `rgba(255,235,59,0.28)`
          : `${SYMBOL_COLOR[cell.symbol]}33`,
        borderColor: isSelected ? '#ffeb3b' : `${SYMBOL_COLOR[cell.symbol]}88`,
      }}
      data-row={row}
      data-col={col}
      onClick={() => onPress(row, col)}
      onTouchStart={() => onTouchStart(row, col)}
      onTouchEnd={e => onTouchEnd(row, col, e)}
      onTouchMove={onTouchMove}
    >
      {SYMBOL_EMOJI[cell.symbol]}
    </div>
  );
}
