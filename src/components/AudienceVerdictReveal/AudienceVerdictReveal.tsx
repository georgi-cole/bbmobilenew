import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Player } from '../../types'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './AudienceVerdictReveal.css'

export interface AudienceVerdictRevealProps {
  nominees: Player[]
  voteShares: Record<string, number>
  savedId: string
  onDone: () => void
}

type VerdictPhase = 'interrupt' | 'lineup' | 'settling' | 'result' | 'exiting'

type PulseMetrics = {
  startX: number
  startY: number
  deltaX: number
  deltaY: number
}

const LINEUP_MS = 700
const SETTLING_MS = 2800
const RESULT_MS = 5000
const EXIT_MS = 10000
const DONE_MS = 10800
const CLOSE_VOTE_MARGIN = 2

function formatShare(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`
}

export default function AudienceVerdictReveal({
  nominees,
  voteShares,
  savedId,
  onDone,
}: AudienceVerdictRevealProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const timersRef = useRef<number[]>([])
  const doneRef = useRef(false)
  const [phase, setPhase] = useState<VerdictPhase>('interrupt')
  const [pulseMetrics, setPulseMetrics] = useState<PulseMetrics | null>(null)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current = []
  }, [])

  const fireDone = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    clearTimers()
    onDone()
  }, [clearTimers, onDone])

  useEffect(() => {
    doneRef.current = false
    if (document.body.classList.contains('no-animations')) {
      timersRef.current = [
        window.setTimeout(() => {
          setPhase('result')
          fireDone()
        }, 0),
      ]
      return clearTimers
    }

    timersRef.current = [
      window.setTimeout(() => setPhase('lineup'), LINEUP_MS),
      window.setTimeout(() => setPhase('settling'), SETTLING_MS),
      window.setTimeout(() => setPhase('result'), RESULT_MS),
      window.setTimeout(() => setPhase('exiting'), EXIT_MS),
      window.setTimeout(fireDone, DONE_MS),
    ]
    return clearTimers
  }, [clearTimers, fireDone])

  const ranked = useMemo(
    () =>
      [...nominees].sort(
        (left, right) =>
          (voteShares[right.id] ?? 0) - (voteShares[left.id] ?? 0) ||
          left.id.localeCompare(right.id)
      ),
    [nominees, voteShares]
  )
  const savedPlayer = nominees.find((player) => player.id === savedId)
  const runnerUp = ranked.find((player) => player.id !== savedId)
  const winningShare = voteShares[savedId] ?? 0
  const runnerUpShare = runnerUp ? (voteShares[runnerUp.id] ?? 0) : 0
  const closeVote = winningShare - runnerUpShare <= CLOSE_VOTE_MARGIN
  const resultVisible = phase === 'result' || phase === 'exiting'

  useEffect(() => {
    if (!resultVisible || !rootRef.current) return
    const target = document.querySelector<HTMLElement>(`[data-player-id="${savedId}"]`)
    if (!target) return

    const sourceRect = rootRef.current.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const startX = sourceRect.left + sourceRect.width / 2
    const startY = sourceRect.top + sourceRect.height / 2
    setPulseMetrics({
      startX,
      startY,
      deltaX: targetRect.left + targetRect.width / 2 - startX,
      deltaY: targetRect.top + targetRect.height / 2 - startY,
    })
  }, [resultVisible, savedId])

  const skipToResult = useCallback(() => {
    if (resultVisible || doneRef.current) return
    clearTimers()
    setPhase('result')
    timersRef.current = [
      window.setTimeout(() => setPhase('exiting'), 4200),
      window.setTimeout(fireDone, 5000),
    ]
  }, [clearTimers, fireDone, resultVisible])

  return (
    <>
      <div
        ref={rootRef}
        className={`avr avr--${phase}`}
        role="button"
        tabIndex={0}
        aria-label={`Audience Verdict: ${savedPlayer?.name ?? 'a nominee'} is saved. Activate to reveal now.`}
        onClick={skipToResult}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            skipToResult()
          }
        }}
      >
        <div className="avr__broadcast-head">
          <span className="avr__live-dot" aria-hidden="true" />
          <span>LIVE · AUDIENCE VERDICT</span>
        </div>
        <p className="avr__prompt">The public has voted to save one nominee.</p>

        <div className="avr__lineup">
          {nominees.map((player) => {
            const isSaved = player.id === savedId
            return (
              <div
                key={player.id}
                className={`avr__nominee${resultVisible && isSaved ? ' avr__nominee--saved' : ''}${resultVisible && !isSaved ? ' avr__nominee--danger' : ''}`}
              >
                <div className="avr__portrait">
                  <PlayerAvatar player={player} size="sm" />
                </div>
                <span className="avr__name">{player.name}</span>
                <span className="avr__share">
                  {phase === 'settling' || resultVisible
                    ? formatShare(voteShares[player.id] ?? 0)
                    : '—'}
                </span>
              </div>
            )
          })}
        </div>

        <div className="avr__vote-strip" aria-label="Public save vote distribution">
          {nominees.map((player) => (
            <span
              key={player.id}
              className={`avr__vote-segment${resultVisible && player.id === savedId ? ' avr__vote-segment--winner' : ''}`}
              style={{ width: `${voteShares[player.id] ?? 0}%` }}
              title={`${player.name}: ${formatShare(voteShares[player.id] ?? 0)}`}
            />
          ))}
        </div>

        {phase === 'settling' && closeVote && (
          <div className="avr__close-call">TOO CLOSE TO CALL</div>
        )}
        {/* The saved-player result is announced on the next TV screen so this vote panel stays readable. */}
      </div>

      {pulseMetrics &&
        resultVisible &&
        createPortal(
          <span
            className="avr-extraction-pulse"
            aria-hidden="true"
            style={
              {
                '--avr-pulse-x': `${pulseMetrics.startX}px`,
                '--avr-pulse-y': `${pulseMetrics.startY}px`,
                '--avr-pulse-dx': `${pulseMetrics.deltaX}px`,
                '--avr-pulse-dy': `${pulseMetrics.deltaY}px`,
              } as CSSProperties
            }
          >
            ◉
          </span>,
          document.body
        )}
    </>
  )
}
