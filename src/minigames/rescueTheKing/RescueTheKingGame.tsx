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
 * Level variation: 8 hand-designed levels (7×8 boards); one is chosen
 * deterministically from (seed % 8). The seed is also XOR'd with the level's
 * base seed in buildBoard() so symbol placement varies per session.
 *
 * Level definitions (rescueTheKingLevels.ts) may include a tileLayout field
 * that hard-codes the initial symbols per cell, guaranteeing a deterministic
 * and hand-validated starting position.  Cells without an explicit symbol use
 * the seeded RNG with 3-in-a-row avoidance.
 *
 * Solvability guarantee:
 * 1. buildInitialState() calls hasAnyValidMove() and reshuffles if needed.
 * 2. resolveBoard() never sets boardCleared = true when tiles remain.
 * 3. validateLevel() in rescueTheKingLogic.ts can be used in tests to verify
 *    each level before shipping.
 *
 * Blocker rules:
 * - crate (📦): breaks after 1 adjacent match (hitsRemaining = 1)
 * - stone (🪨): breaks after 2 adjacent matches (hitsRemaining = 2, then 1, then gone)
 * A "hit" happens when a normal tile that is part of a match is directly adjacent
 * (up/down/left/right) to a blocker.  Blockers cannot be directly clicked.
 *
 * Debug mode (DEV builds only):
 * Shows level ID, tile count, validation status and a "↺ Regen" button to
 * reset with a new random seed. Controlled by the VITE_RTK_DEBUG env var or
 * any DEV build (import.meta.env.DEV).
 *
 * Difficulty tuning: Edit SCORE_* constants and TIME_LIMIT_MS in
 * rescueTheKingLogic.ts.  Edit blockerLayout / tileLayout in rescueTheKingLevels.ts.
 *
 * Score ranking:
 * - Nobody clears: tilesCleared×10 + blockerHits×15 + blockerDestroyed×50 + combo×25
 * - Multiple clear: above + 2000 boardClear + timeRemainingSec×20 (time-bonus)
 * This produces a total ordering in all competition scenarios.
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react';
import type { GameState, Cell, Board, LoseReason } from './rescueTheKingTypes';
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
  getAllValidMoves,
  shuffleNormalTiles,
  countNormalTiles,
  countRemainingTargets,
  checkWinCondition,
  computeFinalScore,
  validateLevel,
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

// Debug overlay — shown only in DEV builds.
// Set VITE_RTK_DEBUG=0 in your .env.local to suppress it even in dev.
const DEBUG = import.meta.env.DEV && import.meta.env.VITE_RTK_DEBUG !== '0';

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

  // Debug: validate the selected level (only computes once per level in DEV)
  // DEBUG is a module-level compile-time constant (import.meta.env.DEV); it
  // never changes at runtime so it doesn't need to be in the deps array.
  const levelValidation = useMemo(() => (DEBUG ? validateLevel(level) : null), [level]);

  // Debug: allow regenerating with a new runtime seed
  const [debugSeedOffset, setDebugSeedOffset] = useState(0);

  // ── Initial state factory ────────────────────────────────────────────────
  // Takes a fresh RNG to use during the initial-validity shuffle, so callers
  // (including startGame) don't need to mutate rngRef directly.
  const buildInitialState = useCallback((rng: () => number, runtimeSeedOverride?: number): GameState => {
    const runtimeSeed = runtimeSeedOverride ?? seed;
    let board = buildBoard(level, runtimeSeed);
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
      initialTargetCount: level.targetPositions?.length ?? 0,
      boardCleared: false,
      loseReason: null,
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

  // ── Hint system ──────────────────────────────────────────────────────────
  // After HINT_DELAY_MS of inactivity highlight a random valid move.
  const HINT_DELAY_MS = 5000;
  const [hintCells, setHintCells] = useState<Set<string>>(new Set());
  // null = activity not yet recorded (hint won't fire until first interaction).
  const lastActivityRef = useRef<number | null>(null);
  // Keep a ref to the current board so the hint timer doesn't capture a stale closure.
  const boardRef = useRef(state.board);
  useEffect(() => { boardRef.current = state.board; }, [state.board]);

  // When we enter the playing phase (including via autoStart) and no activity
  // has been recorded yet, initialize lastActivityRef so inactivity hints work
  // from the start of gameplay.
  useEffect(() => {
    if (state.phase === 'playing' && lastActivityRef.current === null) {
      lastActivityRef.current = Date.now();
    }
  }, [state.phase]);
  // ── RNG ref (persists across renders for reshuffles) ─────────────────────
  const rngRef = useRef(mulberry32(seed ^ RNG_RESHUFFLE_SALT));

  // ── Refs for timer & finish guard ────────────────────────────────────────
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);

  // ── Board cell size (computed from viewport) ─────────────────────────────
  // Target: fit cols×rows board above the king/water area on a 360-480px wide
  // portrait screen.  Max tile size is capped at 52px so large-screen layouts
  // don't look cartoonishly oversized.  Gap between tiles is 3px.
  const cellSize = useMemo(() => {
    const maxW = Math.min(window.innerWidth, 480) - 24;
    const computed = Math.floor((maxW - (level.cols - 1) * 3 - 8) / level.cols);
    return Math.min(computed, 52);
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
          const loseState: GameState = { ...prev, timeRemainingMs: 0, phase: 'lose', loseReason: 'timeout' as LoseReason };
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

  // ── Hint timer ───────────────────────────────────────────────────────────
  // Single long-lived interval; all mutable values are accessed via refs so
  // there are no stale-closure or synchronous-setState-in-effect issues.
  const phaseRef = useRef(state.phase);
  useEffect(() => { phaseRef.current = state.phase; }, [state.phase]);

  useEffect(() => {
    const hintInterval = setInterval(() => {
      if (phaseRef.current !== 'playing') {
        setHintCells(prev => (prev.size > 0 ? new Set() : prev));
        return;
      }
      const last = lastActivityRef.current;
      if (last !== null && Date.now() - last >= HINT_DELAY_MS) {
        const moves = getAllValidMoves(boardRef.current);
        if (moves.length > 0) {
          // Use the seeded RNG (rngRef) for consistent hint selection.
          const pick = moves[Math.floor(rngRef.current() * moves.length)];
          setHintCells(new Set([`${pick.r1},${pick.c1}`, `${pick.r2},${pick.c2}`]));
        }
      } else {
        setHintCells(prev => (prev.size > 0 ? new Set() : prev));
      }
    }, 1000);
    return () => clearInterval(hintInterval);
  }, []); // intentionally empty: all values read via refs


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
      if (remaining === 0 || checkWinCondition(board, level.targetPositions)) {
        // Win! All targets cleared (or all tiles cleared for target-less levels).
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
          loseReason: 'deadlock',
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
  }, [finishGame, spawnScorePop, triggerShake, level.targetPositions]);

  // Keep the ref in sync so the recursive call always uses the latest version.
  useEffect(() => {
    resolveBoardRef.current = resolveBoard;
  }, [resolveBoard]);

  // ── Handle cell press ────────────────────────────────────────────────────
  const handleCellPress = useCallback((row: number, col: number) => {
    lastActivityRef.current = Date.now();
    setHintCells(new Set()); // clear hint on any activity
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
  const startGame = useCallback((runtimeSeedOverride?: number) => {
    finishedRef.current = false;
    lastActivityRef.current = Date.now(); // reset hint timer on new game
    setHintCells(new Set());
    const freshRng = mulberry32((runtimeSeedOverride ?? seed) ^ RNG_RESHUFFLE_SALT);
    rngRef.current = freshRng;
    const newState = buildInitialState(freshRng, runtimeSeedOverride);
    setState({ ...newState, phase: 'playing' });
  }, [buildInitialState, seed]);

  // Debug: regenerate with a new runtime seed to verify the level works across
  // multiple seeds.  Each click increments the offset so the board changes.
  const debugRegen = useCallback(() => {
    const nextOffset = debugSeedOffset + 1;
    setDebugSeedOffset(nextOffset);
    startGame(seed ^ (nextOffset * 0x1337));
  }, [debugSeedOffset, seed, startGame]);

  // Debug: trigger a manual reshuffle of movable tiles (same as deadlock recovery).
  const debugReshuffle = useCallback(() => {
    setState(prev => {
      if (prev.phase !== 'playing') return prev;
      const candidate = shuffleNormalTiles(prev.board, rngRef.current);
      return { ...prev, board: candidate, reshuffleCount: prev.reshuffleCount + 1, selectedCell: null };
    });
    setHintCells(new Set());
    lastActivityRef.current = Date.now();
  }, []);

  // Debug: load the next level by index.
  const [debugLevelOffset, setDebugLevelOffset] = useState(0);
  const debugNextLevel = useCallback(() => {
    const nextOffset = debugLevelOffset + 1;
    setDebugLevelOffset(nextOffset);
    // 0x9E37_79B9 is the Fibonacci hashing constant (2^32 / golden ratio), chosen
    // because it spreads seed values evenly across the LEVELS array, making each
    // successive debug step land on a different level.
    startGame(seed + nextOffset * 0x9E37_79B9);
  }, [debugLevelOffset, seed, startGame]);

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
  // Progress: use target count when the level has targets; else normal tile count.
  const progressPct = (() => {
    if (state.initialTargetCount > 0) {
      const remaining = countRemainingTargets(state.board, level.targetPositions ?? []);
      return Math.max(0, Math.min(100, (1 - remaining / state.initialTargetCount) * 100));
    }
    return state.initialNormalTileCount > 0
      ? Math.max(0, Math.min(100, (1 - countNormalTiles(state.board) / state.initialNormalTileCount) * 100))
      : 100;
  })();
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

      {/* Debug overlay — only visible in DEV builds */}
      {DEBUG && (
        <div className="rtk-debug">
          <span>Lvl {level.id} · {level.name} · {level.rows}×{level.cols}</span>
          <span className={levelValidation?.valid ? 'rtk-debug-ok' : 'rtk-debug-err'}>
            {levelValidation?.valid ? '✔ valid' : `✘ ${levelValidation?.message}`}
          </span>
          <span>tiles: {countNormalTiles(state.board)}/{state.initialNormalTileCount}</span>
          <span>moves: {getAllValidMoves(state.board).length}</span>
          <button className="rtk-debug-btn" onClick={debugReshuffle}>↺ Shuffle</button>
          <button className="rtk-debug-btn" onClick={debugNextLevel}>→ Next Lvl</button>
          <button className="rtk-debug-btn" onClick={debugRegen}>↺ Regen</button>
        </div>
      )}

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
                isHint={hintCells.has(`${r},${c}`)}
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
          <button className="rtk-overlay-btn rtk-overlay-btn-primary" onClick={() => startGame()}>
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
          <button className="rtk-overlay-btn rtk-overlay-btn-primary" onClick={() => startGame()}>
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
            {state.loseReason === 'deadlock'
              ? 'No more moves could be found. The board is stuck and the king is lost…'
              : 'Time ran out before the board was cleared. The king is gone…'}
          </div>
          <div className="rtk-overlay-score">Score: {finalScore.toLocaleString()}</div>
          <button className="rtk-overlay-btn rtk-overlay-btn-primary" onClick={() => startGame()}>
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
  isHint: boolean;
  onPress: (row: number, col: number) => void;
  onTouchStart: (row: number, col: number) => void;
  onTouchEnd: (row: number, col: number, e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
}

function BoardCell({
  cell, row, col, size,
  isSelected, isMatching, isHitFlash, isFalling, isInvalidSwap, isHint,
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
  const hintClass = isHint && !isSelected ? ' rtk-cell-hint' : '';

  return (
    <div
      className={`rtk-cell rtk-cell-normal${selectedClass}${matchingClass}${fallingClass}${invalidClass}${hintClass}`}
      style={{
        width: size,
        height: size,
        background: isSelected
          ? `rgba(255,235,59,0.28)`
          : isHint
            ? `rgba(100,220,100,0.28)`
            : `${SYMBOL_COLOR[cell.symbol]}33`,
        borderColor: isSelected
          ? '#ffeb3b'
          : isHint
            ? '#66ee66'
            : `${SYMBOL_COLOR[cell.symbol]}88`,
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
