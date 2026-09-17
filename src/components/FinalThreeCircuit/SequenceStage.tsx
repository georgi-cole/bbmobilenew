import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EMPTY_SEQUENCE_TILE,
  SEQUENCE_STAGE_TIME_MS,
  buildSequenceBoards,
  clampCircuitScore,
  isSequenceSolved,
  scoreSequenceBoard,
  slideSequenceTile,
} from './finalThreeCircuitLogic'

interface SequenceStageProps {
  seed: number
  onComplete: (score: number) => void
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function SequenceStage({ seed, onComplete }: SequenceStageProps) {
  const boards = useMemo(() => buildSequenceBoards(seed), [seed])
  const [boardIndex, setBoardIndex] = useState(0)
  const [order, setOrder] = useState<string[]>(boards[0].initial)
  const [moves, setMoves] = useState(0)
  const [remainingMs, setRemainingMs] = useState(SEQUENCE_STAGE_TIME_MS)
  const [bank, setBank] = useState(0)
  const [boardScore, setBoardScore] = useState<number | null>(null)
  const [resetCount, setResetCount] = useState(0)
  const orderRef = useRef<string[]>(boards[0].initial)
  const movesRef = useRef(0)
  const remainingMsRef = useRef(SEQUENCE_STAGE_TIME_MS)
  const board = boards[boardIndex]

  useEffect(() => {
    if (boardScore != null) return
    const timer = window.setInterval(() => {
      const nextRemaining = Math.max(0, remainingMsRef.current - 100)
      remainingMsRef.current = nextRemaining
      setRemainingMs(nextRemaining)
      if (nextRemaining > 0) return
      window.clearInterval(timer)
      setBoardScore(scoreSequenceBoard(board, orderRef.current, movesRef.current, 0, false))
    }, 100)
    return () => window.clearInterval(timer)
  }, [board, boardScore])

  const moveTile = (index: number) => {
    if (boardScore != null) return
    const next = slideSequenceTile(order, index, board.rows, board.columns)
    if (!next) return
    const nextMoves = moves + 1
    orderRef.current = next
    movesRef.current = nextMoves
    setOrder(next)
    setMoves(nextMoves)
    if (isSequenceSolved(next, board.target)) {
      setBoardScore(scoreSequenceBoard(board, next, nextMoves, remainingMsRef.current, true))
    }
  }

  const resetBoard = () => {
    if (boardScore != null) return
    const resetOrder = [...board.initial]
    const nextMoves = moves + 3
    const nextRemaining = Math.max(0, remainingMsRef.current - 5_000)
    orderRef.current = resetOrder
    movesRef.current = nextMoves
    remainingMsRef.current = nextRemaining
    setOrder(resetOrder)
    setMoves(nextMoves)
    setResetCount((current) => current + 1)
    setRemainingMs(nextRemaining)
    if (nextRemaining <= 0) {
      setBoardScore(scoreSequenceBoard(board, resetOrder, nextMoves, 0, false))
    }
  }

  const next = () => {
    if (boardScore == null) return
    const adjustedScore = Math.max(0, boardScore - resetCount * 2)
    const nextBank = bank + adjustedScore
    if (boardIndex >= boards.length - 1 || remainingMsRef.current <= 0) {
      onComplete(clampCircuitScore(nextBank))
      return
    }
    const nextIndex = boardIndex + 1
    const nextOrder = [...boards[nextIndex].initial]
    orderRef.current = nextOrder
    movesRef.current = 0
    setBank(nextBank)
    setBoardIndex(nextIndex)
    setOrder(nextOrder)
    setMoves(0)
    setResetCount(0)
    setBoardScore(null)
  }

  return (
    <section className="f3-circuit__arena-card f3-circuit__arena-card--sequence">
      <div className="f3-circuit__section-heading">
        <div>
          <p className="f3-circuit__eyebrow">Stage 2 · Sequence Builder</p>
          <h2>Slide the circuit into place</h2>
        </div>
        <span>
          Board {boardIndex + 1} / {boards.length}
        </span>
      </div>

      <div className="f3-circuit__challenge-meter">
        <span>{formatTime(remainingMs)} total time</span>
        <span>{bank} pts banked</span>
        <span>{board.maxPoints} pts available</span>
      </div>

      <p className="f3-circuit__copy">
        You have five minutes for both boards. The target stays visible, but only tiles touching the
        empty slot can move. The first board is a warm-up; the second is the full 3 × 3 challenge.
      </p>

      <div className="f3-circuit__sequence-layout">
        <div>
          <div className="f3-circuit__sequence-label">Target</div>
          <div
            className="f3-circuit__slide-grid is-target"
            style={{ gridTemplateColumns: `repeat(${board.columns}, minmax(0, 1fr))` }}
            aria-label="Target arrangement"
          >
            {board.target.map((token, index) => (
              <span
                key={`${token}:${index}`}
                className={token === EMPTY_SEQUENCE_TILE ? 'is-empty' : ''}
              >
                {token === EMPTY_SEQUENCE_TILE ? '' : token}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="f3-circuit__sequence-label">
            Your board
            <strong>{moves} moves</strong>
          </div>
          <div
            className="f3-circuit__slide-grid"
            style={{ gridTemplateColumns: `repeat(${board.columns}, minmax(0, 1fr))` }}
            aria-label="Sliding puzzle"
          >
            {order.map((token, index) => (
              <button
                type="button"
                key={`${token}:${index}`}
                className={token === EMPTY_SEQUENCE_TILE ? 'is-empty' : ''}
                onClick={() => moveTile(index)}
                disabled={boardScore != null || token === EMPTY_SEQUENCE_TILE}
                aria-label={token === EMPTY_SEQUENCE_TILE ? 'Empty slot' : `Tile ${token}`}
              >
                {token === EMPTY_SEQUENCE_TILE ? '' : token}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="f3-circuit__micro-stats">
        <span>Scramble depth {board.scrambleMoves}</span>
        <span>{resetCount} resets</span>
        <button type="button" onClick={resetBoard} disabled={boardScore != null}>
          Reset -3 moves / -5s
        </button>
      </div>

      {boardScore != null && (
        <div className="f3-circuit__result-callout">
          <span>{isSequenceSolved(order, board.target) ? 'Solved' : 'Time expired'}</span>
          <strong>+{Math.max(0, boardScore - resetCount * 2)}</strong>
          <button type="button" onClick={next}>
            {boardIndex < boards.length - 1 && remainingMs > 0 ? 'Hard board' : 'See standings'}
          </button>
        </div>
      )}
    </section>
  )
}
