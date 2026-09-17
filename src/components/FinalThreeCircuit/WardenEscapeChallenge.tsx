import { useEffect, useMemo, useState } from 'react'
import { getGridNeighbors, resolveWardenTurn, type RiskTier } from './finalThreeCircuitLogic'
import { buildVariedWardenBoard } from './wardenBoardVariations'

interface WardenEscapeChallengeProps {
  seed: number
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

export default function WardenEscapeChallenge({
  seed,
  tier,
  onFinish,
}: WardenEscapeChallengeProps) {
  const board = useMemo(() => buildVariedWardenBoard(tier, seed), [seed, tier])
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
    const timer = window.setTimeout(() => onFinish(0.08), 520)
    return () => window.clearTimeout(timer)
  }, [onFinish, remainingMs, status])

  const validMoves = useMemo(
    () => new Set(getGridNeighbors(player, board.size, board.walls)),
    [board, player]
  )

  const chooseCell = (nextPlayer: number) => {
    if (status !== 'playing' || !validMoves.has(nextPlayer) || nextPlayer === warden) return

    const nextMoves = moves + 1
    const turn = resolveWardenTurn(board, warden, nextPlayer)

    setPlayer(nextPlayer)
    setMoves(nextMoves)
    setWarden(turn.nextWarden)

    // EXIT is terminal. Once the player steps onto it, the escape has already
    // happened and the guard does not get another two-step pursuit response.
    if (turn.escaped) {
      const moveRatio = Math.max(0, 1 - nextMoves / Math.max(1, board.moveBudget))
      const timeRatio = Math.max(0, Math.min(1, remainingMs / timeLimitMs))
      setStatus('escaped')
      const accuracy = Math.min(1, 0.78 + moveRatio * 0.14 + timeRatio * 0.08)
      window.setTimeout(() => onFinish(accuracy), 700)
      return
    }

    if (turn.caught) {
      setStatus('caught')
      const accuracy = Math.max(0.06, Math.min(0.22, (nextMoves / board.moveBudget) * 0.22))
      window.setTimeout(() => onFinish(accuracy), 620)
      return
    }

    if (nextMoves >= board.moveBudget) {
      setStatus('caught')
      window.setTimeout(() => onFinish(0.1), 620)
    }
  }

  return (
    <div className={`f3-circuit__risk-game f3-circuit__warden-game is-${status}`}>
      <div className="f3-circuit__warden-rule-strip" aria-label="Movement rule">
        <div className="is-player-rule">
          <span className="f3-circuit__mini-person" aria-hidden="true">
            <i />
            <b />
          </span>
          <div>
            <small>You</small>
            <strong>1 tile</strong>
          </div>
        </div>
        <span className="f3-circuit__versus">VS</span>
        <div className="is-warden-rule">
          <span className="f3-circuit__mini-warden" aria-hidden="true">
            <i />
          </span>
          <div>
            <small>Guard</small>
            <strong>2 tiles</strong>
          </div>
        </div>
      </div>

      <div className="f3-circuit__challenge-meter">
        <span>{Math.max(0, board.moveBudget - moves)} moves</span>
        <span>{formatTime(remainingMs)}</span>
        <span>
          {board.size}×{board.size}
        </span>
      </div>

      <p className="f3-circuit__copy f3-circuit__warden-copy">
        Trap the guard against walls, then reach the illuminated exit.
      </p>

      <div className="f3-circuit__prison-frame">
        <div className="f3-circuit__prison-lights" aria-hidden="true">
          <span />
          <span />
          <span />
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
            ]
              .filter(Boolean)
              .join(' ')

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
                {isPlayer && (
                  <span
                    className="f3-circuit__player-token"
                    key={`player-${player}-${moves}`}
                    aria-hidden="true"
                  >
                    <i className="f3-circuit__player-head" />
                    <i className="f3-circuit__player-body" />
                  </span>
                )}
                {isWarden && (
                  <span
                    className="f3-circuit__warden-token"
                    key={`warden-${warden}-${moves}`}
                    aria-hidden="true"
                  >
                    <i className="f3-circuit__warden-cap" />
                    <i className="f3-circuit__warden-visor" />
                    <i className="f3-circuit__warden-body" />
                  </span>
                )}
                {isExit && !isPlayer && (
                  <span className="f3-circuit__exit-token" aria-hidden="true">
                    <i />
                    EXIT
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {status !== 'playing' && (
          <div className={`f3-circuit__warden-status is-${status}`} role="status">
            <strong>
              {status === 'escaped' ? 'ESCAPED' : status === 'caught' ? 'CAUGHT' : 'LOCKDOWN'}
            </strong>
            <span>
              {status === 'escaped'
                ? 'Route cleared'
                : status === 'caught'
                  ? 'The guard closed the route'
                  : 'Time expired'}
            </span>
          </div>
        )}
      </div>

      <div className="f3-circuit__warden-legend">
        <span>
          <i className="is-player" />
          You
        </span>
        <span>
          <i className="is-warden" />
          Guard
        </span>
        <span>
          <i className="is-exit" />
          Exit
        </span>
        <span>
          <i className="is-move" />
          Legal move
        </span>
      </div>
    </div>
  )
}
