import { useEffect, useMemo, useState } from 'react'
import {
  buildWardenBoard,
  getGridNeighbors,
  moveWardenTowardPlayer,
  type RiskTier,
} from './finalThreeCircuitLogic'

interface WardenEscapeChallengeProps {
  tier: RiskTier
  onFinish: (accuracy: number) => void
}

export default function WardenEscapeChallenge({ tier, onFinish }: WardenEscapeChallengeProps) {
  const board = useMemo(() => buildWardenBoard(tier), [tier])
  const timeLimitMs = tier === 'safe' ? 45_000 : tier === 'standard' ? 35_000 : 28_000
  const [player, setPlayer] = useState(board.start)
  const [warden, setWarden] = useState(board.wardenStart)
  const [moves, setMoves] = useState(0)
  const [cadence, setCadence] = useState(0)
  const [freezeTokens, setFreezeTokens] = useState(board.freezeTokens)
  const [freezeArmed, setFreezeArmed] = useState(false)
  const [remainingMs, setRemainingMs] = useState(timeLimitMs)
  const [status, setStatus] = useState<'playing' | 'escaped' | 'caught' | 'timeout'>('playing')

  useEffect(() => {
    if (status !== 'playing') return
    const timer = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 100))
    }, 100)
    return () => window.clearInterval(timer)
  }, [status])

  useEffect(() => {
    if (remainingMs > 0 || status !== 'playing') return
    setStatus('timeout')
    onFinish(0.12)
  }, [onFinish, remainingMs, status])

  const validMoves = useMemo(
    () => new Set(getGridNeighbors(player, board.size, board.walls)),
    [board, player]
  )

  const chooseCell = (nextPlayer: number) => {
    if (status !== 'playing' || !validMoves.has(nextPlayer) || nextPlayer === warden) return

    const nextMoves = moves + 1
    let nextWarden = warden
    let nextCadence = cadence + 1

    if (freezeArmed) {
      setFreezeArmed(false)
      setFreezeTokens((current) => Math.max(0, current - 1))
      nextCadence = 0
    } else if (nextCadence >= board.moveEvery) {
      nextWarden = moveWardenTowardPlayer(board, warden, nextPlayer)
      nextCadence = 0
    }

    setPlayer(nextPlayer)
    setMoves(nextMoves)
    setWarden(nextWarden)
    setCadence(nextCadence)

    if (nextWarden === nextPlayer) {
      setStatus('caught')
      onFinish(Math.max(0.12, (nextMoves / board.moveBudget) * 0.22))
      return
    }

    if (nextPlayer === board.exit) {
      const moveEfficiency = Math.max(0, 1 - Math.max(0, nextMoves - 10) / Math.max(1, board.moveBudget))
      const timeRatio = Math.max(0, Math.min(1, remainingMs / timeLimitMs))
      setStatus('escaped')
      onFinish(Math.min(1, 0.72 + moveEfficiency * 0.18 + timeRatio * 0.1))
      return
    }

    if (nextMoves >= board.moveBudget) {
      setStatus('caught')
      onFinish(0.18)
    }
  }

  return (
    <div className="f3-circuit__risk-game f3-circuit__warden-game">
      <div className="f3-circuit__challenge-meter">
        <span>{Math.max(0, board.moveBudget - moves)} moves</span>
        <span>{Math.ceil(remainingMs / 100) / 10}s</span>
        <span>Warden {board.moveEvery === 1 ? 'moves every turn' : 'moves every 2 turns'}</span>
      </div>

      <div
        className="f3-circuit__warden-grid"
        style={{ gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))` }}
        aria-label="Warden Escape board"
      >
        {Array.from({ length: board.size * board.size }, (_unused, cell) => {
          const wall = board.walls.has(cell)
          const isPlayer = cell === player
          const isWarden = cell === warden
          const isExit = cell === board.exit
          const canMove = validMoves.has(cell) && !wall && !isWarden
          const classNames = [
            wall ? 'is-wall' : '',
            isPlayer ? 'is-player' : '',
            isWarden ? 'is-warden' : '',
            isExit ? 'is-exit' : '',
            canMove ? 'is-valid-move' : '',
          ].filter(Boolean).join(' ')

          return (
            <button
              type="button"
              key={cell}
              className={classNames}
              disabled={!canMove || status !== 'playing'}
              onClick={() => chooseCell(cell)}
              aria-label={
                isPlayer ? 'Your position' : isWarden ? 'Warden' : isExit ? 'Exit' : wall ? 'Wall' : `Cell ${cell + 1}`
              }
            >
              {isPlayer ? '●' : isWarden ? '◆' : isExit ? '◎' : wall ? '' : ''}
            </button>
          )
        })}
      </div>

      <div className="f3-circuit__warden-legend">
        <span><i className="is-player" />You</span>
        <span><i className="is-warden" />Warden</span>
        <span><i className="is-exit" />Exit</span>
      </div>

      {freezeTokens > 0 && status === 'playing' && (
        <button
          type="button"
          className={`f3-circuit__utility-button ${freezeArmed ? 'is-armed' : ''}`}
          onClick={() => setFreezeArmed((current) => !current)}
        >
          {freezeArmed ? 'Freeze armed - make your move' : `Freeze warden (${freezeTokens})`}
        </button>
      )}

      <p className="f3-circuit__hint">
        The warden calculates the shortest route toward you after your move. Reach the gold exit before he closes the gap.
      </p>
    </div>
  )
}
