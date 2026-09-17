import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyWardenHintPenalty,
  getGridNeighbors,
  resolveWardenTurn,
  WARDEN_HINT_PENALTY,
  type RiskTier,
} from './finalThreeCircuitLogic'
import { buildVariedWardenBoard, getWardenHintMove } from './wardenBoardVariations'

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
  const [hintCell, setHintCell] = useState<number | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintUsedAtMove, setHintUsedAtMove] = useState<number | null>(null)
  const [hintMessage, setHintMessage] = useState<string | null>(null)
  const hintsUsedRef = useRef(0)
  const settledRef = useRef(false)

  const scoreWithHintPenalty = (accuracy: number) =>
    applyWardenHintPenalty(accuracy, hintsUsedRef.current)

  useEffect(() => {
    if (status !== 'playing') return
    const ticker = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 100))
    }, 100)
    const expiry = window.setTimeout(() => {
      if (settledRef.current) return
      settledRef.current = true
      setRemainingMs(0)
      setStatus('timeout')
      window.setTimeout(() => onFinish(scoreWithHintPenalty(0.08)), 520)
    }, timeLimitMs)
    return () => {
      window.clearInterval(ticker)
      window.clearTimeout(expiry)
    }
  }, [onFinish, status, timeLimitMs])

  const validMoves = useMemo(
    () => new Set(getGridNeighbors(player, board.size, board.walls)),
    [board, player]
  )

  const useHint = () => {
    if (status !== 'playing' || hintUsedAtMove === moves) return
    const recommended = getWardenHintMove(board, player, warden, moves)
    setHintUsedAtMove(moves)

    if (recommended == null) {
      setHintMessage('No guaranteed escape route remains from this position.')
      return
    }

    hintsUsedRef.current += 1
    setHintsUsed(hintsUsedRef.current)
    setHintCell(recommended)
    setHintMessage('The glowing tile is a safe next move on a winning route.')
  }

  const chooseCell = (nextPlayer: number) => {
    if (status !== 'playing' || !validMoves.has(nextPlayer) || nextPlayer === warden) return

    setHintCell(null)
    setHintMessage(null)
    const nextMoves = moves + 1
    const turn = resolveWardenTurn(board, warden, nextPlayer)

    setPlayer(nextPlayer)
    setMoves(nextMoves)
    setWarden(turn.nextWarden)

    // EXIT is terminal. Once the player steps onto it, the escape has already
    // happened and the guard does not get another two-step pursuit response.
    if (turn.escaped) {
      settledRef.current = true
      const moveRatio = Math.max(0, 1 - nextMoves / Math.max(1, board.moveBudget))
      const timeRatio = Math.max(0, Math.min(1, remainingMs / timeLimitMs))
      setStatus('escaped')
      const accuracy = Math.min(1, 0.78 + moveRatio * 0.14 + timeRatio * 0.08)
      window.setTimeout(() => onFinish(scoreWithHintPenalty(accuracy)), 700)
      return
    }

    if (turn.caught) {
      settledRef.current = true
      setStatus('caught')
      const accuracy = Math.max(0.06, Math.min(0.22, (nextMoves / board.moveBudget) * 0.22))
      window.setTimeout(() => onFinish(scoreWithHintPenalty(accuracy)), 620)
      return
    }

    if (nextMoves >= board.moveBudget) {
      settledRef.current = true
      setStatus('caught')
      window.setTimeout(() => onFinish(scoreWithHintPenalty(0.1)), 620)
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

      <div className="f3-circuit__warden-hint-bar">
        <button
          type="button"
          className="f3-circuit__warden-hint"
          disabled={status !== 'playing' || hintUsedAtMove === moves}
          onClick={useHint}
        >
          <span>Hint</span>
          <small>−{Math.round(WARDEN_HINT_PENALTY * 100)}% score</small>
        </button>
        <div>
          <strong>
            {hintsUsed === 0
              ? 'Need a way out?'
              : `${hintsUsed} hint${hintsUsed === 1 ? '' : 's'} used`}
          </strong>
          <span>
            {hintMessage ??
              (hintsUsed === 0
                ? 'Highlights one safe next move.'
                : `Current Warden score cap: ${Math.max(0, 100 - hintsUsed * 20)}%`)}
          </span>
        </div>
      </div>

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
            const isHint = canMove && cell === hintCell
            const classNames = [
              wall ? 'is-wall' : '',
              isPlayer ? 'is-player' : '',
              isWarden ? 'is-warden' : '',
              isExit ? 'is-exit' : '',
              canMove ? 'is-valid-move' : '',
              isHint ? 'is-hint' : '',
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
                          : isHint
                            ? 'Hint: recommended move'
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
