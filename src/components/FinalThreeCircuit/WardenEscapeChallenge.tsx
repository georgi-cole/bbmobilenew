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

const TIME_LIMITS: Record<RiskTier, number> = {
  safe: 120_000,
  standard: 95_000,
  risky: 75_000,
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function WardenEscapeChallenge({ tier, onFinish }: WardenEscapeChallengeProps) {
  const board = useMemo(() => buildWardenBoard(tier), [tier])
  const timeLimitMs = TIME_LIMITS[tier]
  const [player, setPlayer] = useState(board.start)
  const [warden, setWarden] = useState(board.wardenStart)
  const [moves, setMoves] = useState(0)
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
    onFinish(0.08)
  }, [onFinish, remainingMs, status])

  const validMoves = useMemo(
    () => new Set(getGridNeighbors(player, board.size, board.walls)),
    [board, player]
  )

  const chooseCell = (nextPlayer: number) => {
    if (status !== 'playing' || !validMoves.has(nextPlayer) || nextPlayer === warden) return

    const nextMoves = moves + 1
    const nextWarden = moveWardenTowardPlayer(board, warden, nextPlayer)

    setPlayer(nextPlayer)
    setMoves(nextMoves)
    setWarden(nextWarden)

    if (nextWarden === nextPlayer) {
      setStatus('caught')
      onFinish(Math.max(0.06, Math.min(0.22, nextMoves / board.moveBudget * 0.22)))
      return
    }

    if (nextPlayer === board.exit) {
      const moveRatio = Math.max(0, 1 - nextMoves / Math.max(1, board.moveBudget))
      const timeRatio = Math.max(0, Math.min(1, remainingMs / timeLimitMs))
      setStatus('escaped')
      onFinish(Math.min(1, 0.78 + moveRatio * 0.14 + timeRatio * 0.08))
      return
    }

    if (nextMoves >= board.moveBudget) {
      setStatus('caught')
      onFinish(0.1)
    }
  }

  return (
    <div className="f3-circuit__risk-game f3-circuit__warden-game">
      <div className="f3-circuit__challenge-meter">
        <span>{Math.max(0, board.moveBudget - moves)} moves left</span>
        <span>{formatTime(remainingMs)}</span>
        <span>Guard moves 2 tiles</span>
      </div>

      <p className="f3-circuit__copy">
        <strong>Outsmart the guard, don’t outrun him.</strong> Every time you move one tile, the guard moves up to two. He always tries to close the horizontal gap first, then the vertical gap. Use the walls to bait and trap him before you head for the exit.
      </p>

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
                isPlayer
                  ? 'Your position'
                  : isWarden
                    ? 'Warden'
                    : isExit
                      ? 'Exit'
                      : wall
                        ? 'Wall'
                        : `Cell ${cell + 1}`
              }
            >
              {isPlayer ? '●' : isWarden ? '◆' : isExit ? '◎' : ''}
            </button>
          )
        })}
      </div>

      <div className="f3-circuit__warden-legend">
        <span><i className="is-player" />You</span>
        <span><i className="is-warden" />Guard</span>
        <span><i className="is-exit" />Exit</span>
      </div>

      <p className="f3-circuit__hint">
        The guard does not intelligently route around the maze: horizontal pursuit has priority. Getting him stuck on the wrong side of a wall is the key to escaping.
      </p>
    </div>
  )
}
