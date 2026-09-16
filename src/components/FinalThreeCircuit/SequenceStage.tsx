import { useEffect, useMemo, useState } from 'react'
import {
  EMPTY_SEQUENCE_TILE,
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

export default function SequenceStage({ seed, onComplete }: SequenceStageProps) {
  const boards = useMemo(() => buildSequenceBoards(seed), [seed])
  const [boardIndex, setBoardIndex] = useState(0)
  const [order, setOrder] = useState<string[]>(boards[0].initial)
  const [moves, setMoves] = useState(0)
  const [remainingMs, setRemainingMs] = useState(boards[0].timeLimitMs)
  const [bank, setBank] = useState(0)
  const [boardScore, setBoardScore] = useState<number | null>(null)
  const [resetCount, setResetCount] = useState(0)
  const board = boards[boardIndex]

  useEffect(() => {
    if (boardScore != null) return
    const timer = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 100))
    }, 100)
    return () => window.clearInterval(timer)
  }, [boardScore])

  useEffect(() => {
    if (remainingMs > 0 || boardScore != null) return
    setBoardScore(scoreSequenceBoard(board, order, moves, 0, false))
  }, [board, boardScore, moves, order, remainingMs])

  const moveTile = (index: number) => {
    if (boardScore != null) return
    const next = slideSequenceTile(order, index, board.rows, board.columns)
    if (!next) return
    const nextMoves = moves + 1
    setOrder(next)
    setMoves(nextMoves)
    if (isSequenceSolved(next, board.target)) {
      setBoardScore(scoreSequenceBoard(board, next, nextMoves, remainingMs, true))
    }
  }

  const resetBoard = () => {
    if (boardScore != null) return
    setOrder(board.initial)
    setMoves((current) => current + 3)
    setResetCount((current) => current + 1)
    setRemainingMs((current) => Math.max(0, current - 2_000))
  }

  const next = () => {
    if (boardScore == null) return
    const adjustedScore = Math.max(0, boardScore - resetCount * 2)
    const nextBank = bank + adjustedScore
    if (boardIndex >= boards.length - 1) {
      onComplete(clampCircuitScore(nextBank))
      return
    }
    const nextIndex = boardIndex + 1
    setBank(nextBank)
    setBoardIndex(nextIndex)
    setOrder(boards[nextIndex].initial)
    setMoves(0)
    setRemainingMs(boards[nextIndex].timeLimitMs)
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
        <span>Board {boardIndex + 1} / 3</span>
      </div>

      <p className="f3-circuit__copy">
        The target stays visible, but only tiles touching the empty slot can move. Plan ahead - bad moves cost time and distance.
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
              <span key={`${token}:${index}`} className={token === EMPTY_SEQUENCE_TILE ? 'is-empty' : ''}>
                {token === EMPTY_SEQUENCE_TILE ? '' : token}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="f3-circuit__sequence-label">
            Your board
            <strong>{moves} moves · {Math.ceil(remainingMs / 100) / 10}s</strong>
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
        <button type="button" onClick={resetBoard} disabled={boardScore != null}>Reset -3 moves / -2s</button>
      </div>

      {boardScore != null && (
        <div className="f3-circuit__result-callout">
          <span>{isSequenceSolved(order, board.target) ? 'Solved' : 'Time expired'}</span>
          <strong>+{Math.max(0, boardScore - resetCount * 2)}</strong>
          <button type="button" onClick={next}>
            {boardIndex < 2 ? 'Next board' : 'See standings'}
          </button>
        </div>
      )}
    </section>
  )
}
