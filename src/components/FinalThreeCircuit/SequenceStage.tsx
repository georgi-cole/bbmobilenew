import { useCallback, useMemo, useState } from 'react'
import { buildSequenceBoards, clampCircuitScore, scoreSequenceBoard } from './finalThreeCircuitLogic'

interface SequenceStageProps {
  seed: number
  onComplete: (score: number) => void
}

export default function SequenceStage({ seed, onComplete }: SequenceStageProps) {
  const boards = useMemo(() => buildSequenceBoards(seed), [seed])
  const [boardIndex, setBoardIndex] = useState(0)
  const [order, setOrder] = useState<string[]>(boards[0].initial)
  const [selected, setSelected] = useState<number | null>(null)
  const [moves, setMoves] = useState(0)
  const [bank, setBank] = useState(0)
  const [boardScore, setBoardScore] = useState<number | null>(null)
  const board = boards[boardIndex]

  const selectTile = useCallback((index: number) => {
    if (boardScore != null) return
    if (selected == null) {
      setSelected(index)
      return
    }
    if (selected === index) {
      setSelected(null)
      return
    }
    const next = [...order]
    ;[next[selected], next[index]] = [next[index], next[selected]]
    const nextMoves = moves + 1
    setOrder(next)
    setMoves(nextMoves)
    setSelected(null)
    if (board.target.every((token, tokenIndex) => token === next[tokenIndex])) {
      setBoardScore(scoreSequenceBoard(nextMoves, board.optimalSwaps, board.maxPoints))
    }
  }, [board, boardScore, moves, order, selected])

  const next = useCallback(() => {
    if (boardScore == null) return
    const nextBank = bank + boardScore
    if (boardIndex < boards.length - 1) {
      const nextIndex = boardIndex + 1
      setBank(nextBank)
      setBoardIndex(nextIndex)
      setOrder(boards[nextIndex].initial)
      setSelected(null)
      setMoves(0)
      setBoardScore(null)
      return
    }
    onComplete(clampCircuitScore(nextBank))
  }, [bank, boardIndex, boardScore, boards, onComplete])

  return (
    <section className="f3-circuit__panel">
      <div className="f3-circuit__section-heading">
        <div><p className="f3-circuit__eyebrow">Stage 2 · Sequence Builder</p><h2>Rebuild the order</h2></div>
        <span>Board {boardIndex + 1} / 3</span>
      </div>
      <p className="f3-circuit__copy">The target stays visible. Tap two tiles to swap them. Fewer swaps earn more points.</p>
      <div className="f3-circuit__sequence-label">Target</div>
      <div className="f3-circuit__sequence-row is-target" aria-label="Target sequence">
        {board.target.map((token, index) => <span key={`${token}:${index}`}>{token}</span>)}
      </div>
      <div className="f3-circuit__sequence-label">Your board <strong>{moves} moves</strong></div>
      <div className="f3-circuit__sequence-row" aria-label="Current sequence">
        {order.map((token, index) => (
          <button type="button" key={`${token}:${index}`} className={selected === index ? 'is-selected' : ''} onClick={() => selectTile(index)} disabled={boardScore != null}>{token}</button>
        ))}
      </div>
      {boardScore != null && <div className="f3-circuit__result-callout"><span>Board score</span><strong>+{boardScore}</strong><button type="button" onClick={next}>{boardIndex < 2 ? 'Next board' : 'See standings'}</button></div>}
      <p className="f3-circuit__hint">Perfect route: {board.optimalSwaps} swaps · Worth {board.maxPoints} pts</p>
    </section>
  )
}
