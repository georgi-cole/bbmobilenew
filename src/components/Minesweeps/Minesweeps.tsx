import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
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
  type MinesweepsBoard,
  type MinesweepsCell,
} from './minesweepsLogic';
import './Minesweeps.css';

type Phase = 'intro' | 'playing' | 'finished';
type FinishState = 'won' | 'lost' | null;

const RESULT_DELAY_MS = 900;
const LONG_PRESS_MS = 420;

function formatTimer(elapsedMs: number): string {
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

function getCellContent(cell: MinesweepsCell): string {
  if (!cell.revealed) return cell.flagged ? '🚩' : '';
  if (cell.mine) return '💣';
  if (cell.adjacent <= 0) return '';
  return String(cell.adjacent);
}

function getCellLabel(cell: MinesweepsCell, row: number, col: number): string {
  const prefix = `Row ${row + 1}, column ${col + 1}`;
  if (!cell.revealed) {
    if (cell.flagged) return `${prefix}, flagged as a mine`;
    return `${prefix}, hidden`;
  }
  if (cell.mine) return `${prefix}, mine`;
  if (cell.adjacent === 0) return `${prefix}, empty`;
  return `${prefix}, ${cell.adjacent} adjacent mines`;
}

export default function Minesweeps({ onFinish, seed = 1, autoStart = false }: GenericMinigameProps) {
  const [board, setBoard] = useState<MinesweepsBoard>(() => createEmptyBoard());
  const [phase, setPhase] = useState<Phase>(autoStart ? 'playing' : 'intro');
  const [flagMode, setFlagMode] = useState(false);
  const [finishState, setFinishState] = useState<FinishState>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const finishTimeoutRef = useRef<number | null>(null);
  const longPressRef = useRef<number | null>(null);
  const longPressCellRef = useRef<string | null>(null);
  const forwardedFinishRef = useRef(false);

  const safeCells = MINESWEEPS_ROWS * MINESWEEPS_COLS - MINESWEEPS_MINES;
  const revealedSafeCells = useMemo(() => countRevealedSafeCells(board), [board]);
  const minesRemaining = MINESWEEPS_MINES - countFlags(board);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (finishTimeoutRef.current !== null) window.clearTimeout(finishTimeoutRef.current);
      if (longPressRef.current !== null) window.clearTimeout(longPressRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'playing') {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      if (startTimeRef.current === null) return;
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  const beginSessionIfNeeded = useCallback((row: number, col: number, currentBoard: MinesweepsBoard) => {
    if (startTimeRef.current !== null) return currentBoard;
    startTimeRef.current = Date.now();
    setHasStarted(true);
    setElapsedMs(0);
    return buildBoard({
      rows: MINESWEEPS_ROWS,
      cols: MINESWEEPS_COLS,
      mines: MINESWEEPS_MINES,
      seed,
      safeCell: { row, col },
    });
  }, [seed]);

  const finalizeGame = useCallback((nextBoard: MinesweepsBoard, nextFinishState: FinishState) => {
    if (nextFinishState === null) return;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const finalElapsedMs = startTimeRef.current === null ? elapsedMs : Date.now() - startTimeRef.current;
    const score = computeFinalScore({
      won: nextFinishState === 'won',
      revealedSafeCells: countRevealedSafeCells(nextBoard),
      totalSafeCells: countSafeCells(nextBoard),
    });

    setElapsedMs(finalElapsedMs);
    setBoard(nextBoard);
    setFinishState(nextFinishState);
    setPhase('finished');

    if (!onFinish || forwardedFinishRef.current) return;
    finishTimeoutRef.current = window.setTimeout(() => {
      if (forwardedFinishRef.current) return;
      forwardedFinishRef.current = true;
      onFinish(score);
    }, RESULT_DELAY_MS);
  }, [elapsedMs, onFinish]);

  const applyAction = useCallback((row: number, col: number, action: 'reveal' | 'flag') => {
    if (phase !== 'playing') return;

    const workingBoard = beginSessionIfNeeded(row, col, board);
    if (action === 'flag') {
      setBoard(toggleFlag(workingBoard, row, col));
      return;
    }

    const revealResult = revealCell(workingBoard, row, col);
    if (revealResult.hitMine) {
      finalizeGame(revealAllMines(revealResult.board), 'lost');
      return;
    }

    if (isBoardSolved(revealResult.board)) {
      finalizeGame(revealAllMines(revealResult.board), 'won');
      return;
    }

    setBoard(revealResult.board);
  }, [beginSessionIfNeeded, board, finalizeGame, phase]);

  const handleCellClick = useCallback((row: number, col: number) => {
    const longPressKey = `${row}:${col}`;
    if (longPressCellRef.current === longPressKey) {
      longPressCellRef.current = null;
      return;
    }
    applyAction(row, col, flagMode ? 'flag' : 'reveal');
  }, [applyAction, flagMode]);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const handleLongPressStart = useCallback((row: number, col: number, pointerType: string) => {
    if (pointerType === 'mouse' || phase !== 'playing') return;
    clearLongPress();
    longPressRef.current = window.setTimeout(() => {
      longPressCellRef.current = `${row}:${col}`;
      applyAction(row, col, 'flag');
    }, LONG_PRESS_MS);
  }, [applyAction, clearLongPress, phase]);

  const statusCopy = useMemo(() => {
    if (finishState === 'won') return 'Board cleared. Nicely swept.';
    if (finishState === 'lost') return 'Boom — a mine was triggered.';
    if (flagMode) return 'Flag mode active. Tap a tile to mark or unmark a mine.';
    if (!hasStarted) return 'First reveal is always safe.';
    return 'Sweep every safe tile and use flags to map out the bombs.';
  }, [finishState, flagMode, hasStarted]);

  return (
    <section className="minesweeps" data-testid="minesweeps-game" aria-label="Minesweeps">
      <div className="minesweeps__shell">
        <header className="minesweeps__header">
          <div>
            <p className="minesweeps__eyebrow">Logic challenge</p>
            <h2 className="minesweeps__title">Minesweeps</h2>
            <p className="minesweeps__subtitle">
              Clear the field, track your flags, and enjoy a safe first tap every round.
            </p>
          </div>

          <div className="minesweeps__stats" aria-label="Minesweeps stats">
            <div className="minesweeps__stat">
              <span className="minesweeps__stat-label">Mines left</span>
              <strong className="minesweeps__stat-value">{minesRemaining}</strong>
            </div>
            <div className="minesweeps__stat">
              <span className="minesweeps__stat-label">Timer</span>
              <strong className="minesweeps__stat-value">{formatTimer(elapsedMs)}</strong>
            </div>
          </div>
        </header>

        <div className="minesweeps__toolbar">
          <p className="minesweeps__status" role="status" aria-live="polite">
            {statusCopy}
          </p>

          <div className="minesweeps__controls">
            {phase === 'intro' && (
              <button
                type="button"
                className="minesweeps__control"
                onClick={() => setPhase('playing')}
              >
                Start sweep
              </button>
            )}
            <button
              type="button"
              className={`minesweeps__control ${flagMode ? 'minesweeps__control--active' : ''}`}
              onClick={() => setFlagMode((current) => !current)}
              aria-pressed={flagMode}
              disabled={phase !== 'playing'}
            >
              🚩 {flagMode ? 'Flag mode on' : 'Toggle flags'}
            </button>
          </div>
        </div>

        <div className="minesweeps__board-wrap">
          <div className="minesweeps__board" role="grid" aria-label="Minesweeps board">
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <button
                  key={`${rowIndex}:${colIndex}`}
                  type="button"
                  role="gridcell"
                  className={[
                    'minesweeps__cell',
                    cell.revealed ? 'minesweeps__cell--revealed' : '',
                    cell.mine && cell.revealed ? 'minesweeps__cell--mine' : '',
                    cell.exploded ? 'minesweeps__cell--exploded' : '',
                    cell.flagged && !cell.revealed ? 'minesweeps__cell--flagged' : '',
                    cell.revealed && cell.adjacent > 0 ? `minesweeps__cell--adjacent-${cell.adjacent}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={getCellLabel(cell, rowIndex, colIndex)}
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    applyAction(rowIndex, colIndex, 'flag');
                  }}
                  onPointerDown={(event) => handleLongPressStart(rowIndex, colIndex, event.pointerType)}
                  onPointerUp={clearLongPress}
                  onPointerLeave={clearLongPress}
                  disabled={phase !== 'playing'}
                >
                  {getCellContent(cell)}
                </button>
              )),
            )}
          </div>
        </div>

        <footer className="minesweeps__footer">
          <span>{revealedSafeCells} / {safeCells} safe tiles revealed</span>
          <span>Right-click or long-press to flag</span>
        </footer>
      </div>
    </section>
  );
}
