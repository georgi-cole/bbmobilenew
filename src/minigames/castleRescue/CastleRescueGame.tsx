import { AnimatePresence, motion } from 'framer-motion';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GenericMinigameProps } from '../reactComponents';
import './CastleRescueGame.css';
import {
  cloneBoard,
  countRemainingObjectiveUnits,
  createBoardFromLevel,
  findAvailableMoves,
  findSolvableReshuffle,
  getObjectiveUnitTotal,
  isBlocker,
  isBoardCleared,
  isGem,
  isVoid,
  pickCastleRescueLevel,
  positionKey,
  positionsEqual,
  resolveBoard,
  swapBoardCells,
} from './castleRescuePuzzleLogic';
import type {
  CastleRescueLevelDefinition,
  MoveCandidate,
  Position,
  PuzzleBoard,
  ResolutionStep,
} from './castleRescuePuzzleTypes';

const DEFAULT_TIME_LIMIT_MS = 120_000;
const INVALID_SWAP_BUMP_PX = 12;
const INVALID_SWAP_DURATION_MS = 220;
const MATCH_FLASH_MS = 220;
const CASCADE_SETTLE_MS = 170;
const RESHUFFLE_FLASH_MS = 320;
const HINT_DELAY_MS = 9_000;
const PANIC_WINDOW_MS = 25_000;
const SCORE_PER_GEM = 90;
const SCORE_PER_BLOCKER_HIT = 70;
const SCORE_PER_BLOCKER_BREAK = 140;
const SCORE_PER_BONUS_GEM = 30;
const SCORE_PER_CASCADE = 55;
const RESCUE_BONUS = 900;
const TIME_BONUS_PER_SECOND = 12;

type GamePhase = 'ready' | 'playing' | 'won' | 'lost';

interface SwapFeedback {
  from: Position;
  to: Position;
  x: number;
  y: number;
}

interface FinaleState {
  rescued: boolean;
  score: number;
  timeRemainingMs: number;
}

interface RuntimeBoardPiece {
  id: string;
  row: number;
  col: number;
  className: string;
  label: string;
  icon: string;
}

const GEM_UI = {
  ruby: { className: 'cr__tile--ruby', icon: '◆', label: 'Ruby crest' },
  emerald: { className: 'cr__tile--emerald', icon: '✦', label: 'Emerald crest' },
  sapphire: { className: 'cr__tile--sapphire', icon: '⬢', label: 'Sapphire crest' },
} as const;

function getRandomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  } catch {
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  }
}

function buildScoreDelta(step: ResolutionStep): number {
  const destroyedBlockers = step.blockerHits.filter((hit) => hit.destroyed).length;
  return step.removedGemCount * SCORE_PER_GEM
    + step.blockerHits.length * SCORE_PER_BLOCKER_HIT
    + destroyedBlockers * SCORE_PER_BLOCKER_BREAK
    + Math.max(0, step.removedGemCount - 3) * SCORE_PER_BONUS_GEM
    + Math.max(0, step.cascadeIndex - 1) * SCORE_PER_CASCADE;
}

function computeSwapVector(from: Position, to: Position): { x: number; y: number } {
  return {
    x: (to.col - from.col) * INVALID_SWAP_BUMP_PX,
    y: (to.row - from.row) * INVALID_SWAP_BUMP_PX,
  };
}

function areAdjacent(a: Position, b: Position): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

export default function CastleRescueGame({
  seed,
  autoStart = true,
  onFinish,
  timeLimitMs = DEFAULT_TIME_LIMIT_MS,
}: GenericMinigameProps & { timeLimitMs?: number }) {
  const [initialState] = useState(() => {
    const initialSeed = seed ?? getRandomSeed();
    const initialLevel = pickCastleRescueLevel(initialSeed);
    return {
      runSeed: initialSeed,
      level: initialLevel,
      board: createBoardFromLevel(initialLevel),
    };
  });
  const [phase, setPhase] = useState<GamePhase>(autoStart ? 'playing' : 'ready');
  const [runSeed, setRunSeed] = useState<number>(initialState.runSeed);
  const [level, setLevel] = useState<CastleRescueLevelDefinition>(initialState.level);
  const [board, setBoard] = useState<PuzzleBoard>(initialState.board);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [matchedKeys, setMatchedKeys] = useState<string[]>([]);
  const [hintMove, setHintMove] = useState<MoveCandidate | null>(null);
  const [statusText, setStatusText] = useState('Swap adjacent crests to break the floodgate.');
  const [swapFeedback, setSwapFeedback] = useState<SwapFeedback | null>(null);
  const [startTimeMs, setStartTimeMs] = useState(() => performance.now());
  const [nowMs, setNowMs] = useState(() => performance.now());
  const [lastInteractionMs, setLastInteractionMs] = useState(() => performance.now());
  const [reshuffleCount, setReshuffleCount] = useState(0);
  const [shakeCount, setShakeCount] = useState(0);
  const [finale, setFinale] = useState<FinaleState | null>(null);

  const boardRef = useRef(board);
  const scoreRef = useRef(score);
  const phaseRef = useRef(phase);
  const startTimeRef = useRef(startTimeMs);
  const finishReportedRef = useRef(false);
  const timeoutIdsRef = useRef<number[]>([]);
  const pointerStartRef = useRef<{ position: Position; clientX: number; clientY: number } | null>(null);

  const syncBoard = useCallback((nextBoard: PuzzleBoard) => {
    boardRef.current = nextBoard;
    setBoard(nextBoard);
  }, []);

  const syncScore = useCallback((nextScore: number) => {
    scoreRef.current = nextScore;
    setScore(nextScore);
  }, []);

  const clearTimers = useCallback(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];
  }, []);

  const waitFor = useCallback((durationMs: number) => new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((candidate) => candidate !== timeoutId);
      resolve();
    }, durationMs);
    timeoutIdsRef.current.push(timeoutId);
  }), []);

  const remainingMs = finale?.timeRemainingMs
    ?? Math.max(0, timeLimitMs - (nowMs - startTimeMs));
  const objectiveTotal = useMemo(() => getObjectiveUnitTotal(level), [level]);
  const remainingUnits = useMemo(() => countRemainingObjectiveUnits(board), [board]);
  const clearedUnits = objectiveTotal - remainingUnits;
  const progressPercent = objectiveTotal === 0 ? 100 : Math.round((clearedUnits / objectiveTotal) * 100);
  const inPanicWindow = phase === 'playing' && remainingMs <= PANIC_WINDOW_MS;

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    startTimeRef.current = startTimeMs;
  }, [startTimeMs]);

  const beginRun = useCallback((forceSeed?: number, nextPhase: GamePhase = 'playing') => {
    clearTimers();
    const nextSeed = forceSeed ?? seed ?? getRandomSeed();
    const nextLevel = pickCastleRescueLevel(nextSeed);
    const nextBoard = createBoardFromLevel(nextLevel);

    finishReportedRef.current = false;
    setRunSeed(nextSeed);
    setLevel(nextLevel);
    syncBoard(nextBoard);
    syncScore(0);
    setMatchedKeys([]);
    setSelected(null);
    setHintMove(null);
    setStatusText('Swap adjacent crests to break the floodgate.');
    setBusy(false);
    setSwapFeedback(null);
    setReshuffleCount(0);
    setShakeCount(0);
    setFinale(null);
    setNowMs(performance.now());
    setStartTimeMs(performance.now());
    setLastInteractionMs(performance.now());
    setPhase(nextPhase);
  }, [clearTimers, seed, syncBoard, syncScore]);

  useEffect(() => {
    beginRun(seed, autoStart ? 'playing' : 'ready');
  }, [autoStart, beginRun, seed]);

  useEffect(() => () => {
    clearTimers();
  }, [clearTimers]);

  const finishRun = useCallback((rescued: boolean, finalScore: number, timeRemainingMs: number) => {
    if (phaseRef.current === 'won' || phaseRef.current === 'lost') {
      return;
    }
    syncScore(finalScore);
    setBusy(false);
    setSelected(null);
    setHintMove(null);
    setMatchedKeys([]);
    setSwapFeedback(null);
    setFinale({ rescued, score: finalScore, timeRemainingMs });
    setPhase(rescued ? 'won' : 'lost');
    setStatusText(rescued
      ? 'The blockage shatters, the water drains, and the king is rescued!'
      : 'The flood wins this round — the king disappears beneath the water.');
    if (!finishReportedRef.current) {
      finishReportedRef.current = true;
      onFinish?.(finalScore);
    }
  }, [onFinish, syncScore]);

  useEffect(() => {
    if (phase !== 'playing' && phase !== 'ready') {
      return undefined;
    }
    let frameId = 0;
    const tick = () => {
      const nextNow = performance.now();
      setNowMs(nextNow);
      if (phaseRef.current === 'playing' && nextNow - startTimeRef.current >= timeLimitMs) {
        finishRun(false, scoreRef.current, 0);
        return;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [finishRun, phase, timeLimitMs]);

  useEffect(() => {
    if (phase !== 'playing' || busy) {
      setHintMove(null);
      return;
    }
    if (nowMs - lastInteractionMs < HINT_DELAY_MS) {
      setHintMove(null);
      return;
    }
    const [nextHint] = findAvailableMoves(board);
    setHintMove(nextHint ?? null);
  }, [board, busy, lastInteractionMs, nowMs, phase]);

  const maybeReshuffle = useCallback(async (candidateBoard: PuzzleBoard): Promise<PuzzleBoard> => {
    if (isBoardCleared(candidateBoard)) {
      return candidateBoard;
    }
    if (findAvailableMoves(candidateBoard).length > 0) {
      return candidateBoard;
    }

    setStatusText('No moves left — the castle shifts and reveals a new opening.');
    const reshuffledBoard = findSolvableReshuffle(candidateBoard, runSeed + reshuffleCount + 1);
    if (!reshuffledBoard) {
      return candidateBoard;
    }
    setBusy(true);
    await waitFor(RESHUFFLE_FLASH_MS);
    syncBoard(reshuffledBoard);
    setReshuffleCount((count) => count + 1);
    setBusy(false);
    return reshuffledBoard;
  }, [reshuffleCount, runSeed, syncBoard, waitFor]);

  const resolveValidSwap = useCallback(async (from: Position, to: Position) => {
    setBusy(true);
    setSelected(null);
    setHintMove(null);
    setStatusText('The wall cracks — keep the cascade flowing.');

    const swappedBoard = swapBoardCells(boardRef.current, from, to);
    syncBoard(swappedBoard);
    await waitFor(CASCADE_SETTLE_MS);

    const resolution = resolveBoard(swappedBoard);
    let currentScore = scoreRef.current;
    for (const step of resolution.steps) {
      if (phaseRef.current !== 'playing') {
        return;
      }
      setMatchedKeys(step.matched.map(positionKey));
      if (step.cascadeIndex > 1 || step.removedGemCount >= 4 || step.blockerHits.length > 0) {
        setShakeCount((count) => count + 1);
      }
      setStatusText(step.cascadeIndex > 1 ? `Cascade x${step.cascadeIndex}!` : 'Stone and jewels burst apart.');
      await waitFor(MATCH_FLASH_MS);
      currentScore += buildScoreDelta(step);
      syncScore(currentScore);
      syncBoard(cloneBoard(step.resultingBoard));
      setMatchedKeys([]);
      await waitFor(CASCADE_SETTLE_MS);
    }

    let settledBoard = resolution.board;
    if (isBoardCleared(settledBoard)) {
      const finalScore = currentScore + RESCUE_BONUS + Math.floor(remainingMs / 1000) * TIME_BONUS_PER_SECOND;
      finishRun(true, finalScore, remainingMs);
      return;
    }

    settledBoard = await maybeReshuffle(settledBoard);
    syncBoard(settledBoard);
    setBusy(false);
    setStatusText('The king still needs a path — keep clearing the board.');
  }, [finishRun, maybeReshuffle, remainingMs, syncBoard, syncScore, waitFor]);

  const triggerInvalidSwap = useCallback(async (from: Position, to: Position) => {
    const vector = computeSwapVector(from, to);
    setSwapFeedback({ from, to, x: vector.x, y: vector.y });
    setStatusText('That swap does not make a match. Try a different opening.');
    setBusy(true);
    await waitFor(INVALID_SWAP_DURATION_MS);
    setSwapFeedback(null);
    setBusy(false);
  }, [waitFor]);

  const attemptSwap = useCallback(async (from: Position, to: Position) => {
    if (busy || phaseRef.current !== 'playing') {
      return;
    }
    if (!areAdjacent(from, to)) {
      setSelected(to);
      return;
    }
    setLastInteractionMs(performance.now());
    const fromCell = boardRef.current[from.row]?.[from.col];
    const toCell = boardRef.current[to.row]?.[to.col];
    if (!isGem(fromCell) || !isGem(toCell)) {
      return;
    }

    const swapped = swapBoardCells(boardRef.current, from, to);
    if (resolveBoard(swapped).steps.length === 0) {
      await triggerInvalidSwap(from, to);
      return;
    }
    await resolveValidSwap(from, to);
  }, [busy, resolveValidSwap, triggerInvalidSwap]);

  const handleTileActivate = useCallback(async (position: Position) => {
    if (phase !== 'playing' || busy) {
      return;
    }
    const cell = boardRef.current[position.row]?.[position.col];
    if (!isGem(cell)) {
      return;
    }
    if (!selected) {
      setSelected(position);
      setLastInteractionMs(performance.now());
      setStatusText('Select an adjacent crest to swap.');
      return;
    }
    if (positionsEqual(selected, position)) {
      setSelected(null);
      return;
    }
    await attemptSwap(selected, position);
  }, [attemptSwap, busy, phase, selected]);

  const handlePointerDown = useCallback((position: Position, event: ReactPointerEvent<HTMLButtonElement>) => {
    pointerStartRef.current = {
      position,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }, []);

  const handlePointerUp = useCallback(async (position: Position, event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointerStart = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!pointerStart || !positionsEqual(pointerStart.position, position)) {
      await handleTileActivate(position);
      return;
    }

    const deltaX = event.clientX - pointerStart.clientX;
    const deltaY = event.clientY - pointerStart.clientY;
    if (Math.abs(deltaX) > 18 || Math.abs(deltaY) > 18) {
      const swipeDirection = Math.abs(deltaX) > Math.abs(deltaY)
        ? { row: 0, col: deltaX > 0 ? 1 : -1 }
        : { row: deltaY > 0 ? 1 : -1, col: 0 };
      const swipeTarget = { row: position.row + swipeDirection.row, col: position.col + swipeDirection.col };
      if (
        swipeTarget.row >= 0 && swipeTarget.row < boardRef.current.length
        && swipeTarget.col >= 0 && swipeTarget.col < (boardRef.current[0]?.length ?? 0)
      ) {
        await attemptSwap(position, swipeTarget);
        return;
      }
    }

    await handleTileActivate(position);
  }, [attemptSwap, handleTileActivate]);

  const cellSlots = useMemo(() => board.flatMap((row, rowIndex) => row.map((cell, colIndex) => ({
    key: `slot-${rowIndex}-${colIndex}`,
    row: rowIndex,
    col: colIndex,
    voidCell: isVoid(cell),
    empty: cell == null,
  }))), [board]);

  const boardPieces = useMemo<RuntimeBoardPiece[]>(() => {
    const pieces: RuntimeBoardPiece[] = [];
    board.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (isGem(cell)) {
          pieces.push({
            id: cell.id,
            row: rowIndex,
            col: colIndex,
            className: GEM_UI[cell.color].className,
            icon: GEM_UI[cell.color].icon,
            label: GEM_UI[cell.color].label,
          });
          return;
        }
        if (isBlocker(cell)) {
          pieces.push({
            id: cell.id,
            row: rowIndex,
            col: colIndex,
            className: `cr__tile--blocker cr__tile--blocker-${cell.strength}`,
            icon: cell.strength === 2 ? '🧱' : '🪵',
            label: cell.strength === 2 ? 'Reinforced stone blocker' : 'Cracked wooden blocker',
          });
        }
      });
    });
    return pieces;
  }, [board]);

  const boardClassName = [
    'cr__board',
    busy ? 'cr__board--busy' : '',
    phase === 'won' || phase === 'lost' ? 'cr__board--complete' : '',
    shakeCount % 2 === 1 ? 'cr__board--shake' : '',
  ].filter(Boolean).join(' ');

  const waterHeightPercent = useMemo(() => {
    if (phase === 'won') {
      return 6;
    }
    if (phase === 'lost') {
      return 100;
    }
    return Math.min(100, Math.max(8, ((timeLimitMs - remainingMs) / timeLimitMs) * 100));
  }, [phase, remainingMs, timeLimitMs]);

  const handleOverlayButton = useCallback(() => {
    if (onFinish) {
      return;
    }
    beginRun(seed, 'playing');
  }, [beginRun, onFinish, seed]);

  return (
    <div className={`cr ${inPanicWindow ? 'cr--panic' : ''}`}>
      <motion.div
        className="cr__shell"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <header className="cr__header">
          <div>
            <p className="cr__eyebrow">Castle Rescue • finite match-3</p>
            <h2 className="cr__title">Break the floodgate. Save the king.</h2>
            <p className="cr__subtitle">{level.name}: {level.summary}</p>
          </div>
          <div className="cr__metrics">
            <div className="cr__metric">
              <span>Time</span>
              <strong>{Math.ceil(remainingMs / 1000)}s</strong>
            </div>
            <div className="cr__metric">
              <span>Score</span>
              <strong>{score}</strong>
            </div>
            <div className="cr__metric">
              <span>Clearance</span>
              <strong>{progressPercent}%</strong>
            </div>
          </div>
        </header>

        <section className="cr__scene">
          <motion.div
            className="cr__water"
            animate={{ height: `${waterHeightPercent}%` }}
            transition={{ duration: phase === 'won' ? 0.8 : 0.25, ease: 'easeOut' }}
          />
          <div className="cr__kingframe">
            <div className={`cr__king ${phase === 'won' ? 'cr__king--saved' : phase === 'lost' ? 'cr__king--lost' : ''}`}>
              <span className="cr__king-emoji">🤴</span>
              <span className="cr__king-caption">
                {phase === 'won' ? 'Saved!' : phase === 'lost' ? 'Submerged' : 'Trapped'}
              </span>
            </div>
            <div className={`cr__blockage ${phase === 'won' ? 'cr__blockage--broken' : ''}`}>
              {phase === 'won' ? 'Gate shattered' : 'Floodgate blocked'}
            </div>
          </div>

          <div className="cr__board-wrap">
            <div className={boardClassName} aria-label="Castle Rescue match-3 board">
              <div
                className="cr__board-grid"
                style={{
                  gridTemplateColumns: `repeat(${level.width}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${level.height}, minmax(0, 1fr))`,
                }}
              >
                {cellSlots.map((slot) => (
                  slot.voidCell ? (
                    <div key={slot.key} style={{ gridColumn: slot.col + 1, gridRow: slot.row + 1 }} />
                  ) : (
                    <div
                      key={slot.key}
                      className={`cr__slot ${slot.empty ? 'cr__slot--empty' : ''}`}
                      style={{ gridColumn: slot.col + 1, gridRow: slot.row + 1 }}
                    />
                  )
                ))}

                {boardPieces.map((piece) => {
                  const piecePosition = { row: piece.row, col: piece.col };
                  const isSelected = positionsEqual(selected, piecePosition);
                  const isHinted = positionsEqual(hintMove?.from, piecePosition) || positionsEqual(hintMove?.to, piecePosition);
                  const isMatched = matchedKeys.includes(positionKey(piecePosition));
                  const feedbackOffset = swapFeedback == null
                    ? { x: 0, y: 0 }
                    : positionsEqual(swapFeedback.from, piecePosition)
                      ? { x: swapFeedback.x, y: swapFeedback.y }
                      : positionsEqual(swapFeedback.to, piecePosition)
                        ? { x: -swapFeedback.x, y: -swapFeedback.y }
                        : { x: 0, y: 0 };
                  const className = [
                    'cr__tile',
                    piece.className,
                    isSelected ? 'cr__tile--selected' : '',
                    isHinted ? 'cr__tile--hint' : '',
                    isMatched ? 'cr__tile--matched' : '',
                  ].filter(Boolean).join(' ');

                  return (
                    <motion.button
                      key={piece.id}
                      type="button"
                      layout
                      className={className}
                      style={{ gridColumn: piece.col + 1, gridRow: piece.row + 1 }}
                      aria-label={piece.label}
                      onPointerDown={(event) => handlePointerDown(piecePosition, event)}
                      onPointerUp={(event) => void handlePointerUp(piecePosition, event)}
                      disabled={busy || phase !== 'playing' || piece.className.includes('blocker')}
                      animate={{
                        x: feedbackOffset.x,
                        y: feedbackOffset.y,
                        scale: isMatched ? 0.82 : 1,
                        opacity: isMatched ? 0.2 : 1,
                      }}
                      transition={{ type: 'spring', stiffness: 340, damping: 22, mass: 0.7 }}
                    >
                      <span className="cr__tile-icon">{piece.icon}</span>
                      {piece.className.includes('blocker') && <span className="cr__tile-hitpoints">{piece.className.endsWith('-2') ? '2' : '1'}</span>}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div className="cr__statusbar">
              <div>
                <strong>Mission status</strong>
                <p>{statusText}</p>
              </div>
              <div className="cr__status-actions">
                <button
                  type="button"
                  className="cr__ghost-button"
                  onClick={() => {
                    setLastInteractionMs(0);
                    setStatusText('Look for the glowing hint — it marks the next promising swap.');
                  }}
                  disabled={phase !== 'playing' || busy}
                >
                  Hint
                </button>
                <button
                  type="button"
                  className="cr__ghost-button"
                  onClick={async () => {
                    if (busy || phase !== 'playing') return;
                    setLastInteractionMs(performance.now());
                    const reshuffledBoard = await maybeReshuffle(boardRef.current);
                    syncBoard(reshuffledBoard);
                  }}
                  disabled={phase !== 'playing' || busy}
                >
                  Reshuffle
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {phase === 'ready' && (
              <motion.div className="cr__overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="cr__overlay-card">
                  <h3>Ready the rescue</h3>
                  <p>Clear every gem and blocker before the water reaches the king.</p>
                  <button className="cr__cta" type="button" onClick={() => beginRun(seed, 'playing')}>Start rescue</button>
                </div>
              </motion.div>
            )}
            {(phase === 'won' || phase === 'lost') && finale && (
              <motion.div className="cr__overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div
                  className="cr__overlay-card"
                  initial={{ scale: 0.92, y: 18 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                >
                  <h3>{phase === 'won' ? 'The king is saved!' : 'The flood wins this round'}</h3>
                  <p>
                    {phase === 'won'
                      ? `Final score ${finale.score} • ${Math.ceil(finale.timeRemainingMs / 1000)}s left on the clock.`
                      : `Final score ${finale.score} • clear more board next time to outrank the rest of the challenge field.`}
                  </p>
                  <button
                    type="button"
                    className="cr__cta"
                    style={{ touchAction: 'manipulation', pointerEvents: 'auto' }}
                    onClick={handleOverlayButton}
                  >
                    {onFinish ? 'Continue' : 'Play Again'}
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <details className="cr__developer-note">
          <summary>Developer note</summary>
          <ul>
            <li>Solvability is ensured by finite handcrafted layouts in <code>castleRescuePuzzleLevels.ts</code>, plus a solver-backed reshuffle that preserves the remaining gem inventory whenever no moves remain.</li>
            <li>Five level variations come from different board silhouettes and blocker mixes; tweak rows, board size, or blocker density in <code>castleRescuePuzzleLevels.ts</code>.</li>
            <li>Timer length, hint timing, scoring, and animation pacing live near the top of <code>CastleRescueGame.tsx</code> for quick difficulty tuning.</li>
            <li>Score ranks the challenge field even on failures: clearing gems, damaging blockers, combos, and rescue/time bonuses all add points. If multiple players clear the board, the highest score wins; if nobody clears, the highest progress-derived score still decides first and last place.</li>
          </ul>
        </details>
      </motion.div>
    </div>
  );
}
