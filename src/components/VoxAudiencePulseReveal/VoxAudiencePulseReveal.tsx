import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VoteRingAvatar } from '../AnimatedVoteResultsModal/AnimatedVoteResultsModal'
import type { Player } from '../../types'
import './VoxAudiencePulseReveal.css'

export type VoxAudiencePulseExit = 'auto' | 'play'

interface Props {
  players: Player[]
  percentages: Record<string, number>
  durationMs?: number
  onComplete: (reason: VoxAudiencePulseExit) => void
}

function buildMovingPercentages(
  players: Player[],
  percentages: Record<string, number>,
  tick: number
): Record<string, number> {
  const weighted = players.map((player, index) => {
    const base = Math.max(0.1, percentages[player.id] ?? 0.1)
    const wave = Math.sin((tick + 1) * (index + 1) * 1.37) * (0.45 + (index % 3) * 0.32)
    return { id: player.id, value: Math.max(0.1, base + wave) }
  })
  const total = weighted.reduce((sum, entry) => sum + entry.value, 0)
  const result: Record<string, number> = {}
  let assigned = 0
  weighted.forEach((entry, index) => {
    const share =
      index === weighted.length - 1
        ? Number(Math.max(0, 100 - assigned).toFixed(1))
        : Number(((entry.value / total) * 100).toFixed(1))
    result[entry.id] = share
    assigned = Number((assigned + share).toFixed(1))
  })
  return result
}

export default function VoxAudiencePulseReveal({
  players,
  percentages,
  durationMs = 11_000,
  onComplete,
}: Props) {
  const [tick, setTick] = useState(0)
  const finishedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const finish = useCallback((reason: VoxAudiencePulseExit) => {
    if (finishedRef.current) return
    finishedRef.current = true
    onCompleteRef.current(reason)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setTick((current) => current + 1), 520)
    const timeout = window.setTimeout(() => finish('auto'), durationMs)
    const handlePlay = (event: Event) => {
      if (finishedRef.current) return
      // The reveal owns this physical Play press. Without cancellation the FAB
      // also performs its normal advance(), producing a second transition from
      // the same click while the reveal is closing.
      event.preventDefault()
      finish('play')
    }
    window.addEventListener('ui:playPressed', handlePlay)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
      window.removeEventListener('ui:playPressed', handlePlay)
    }
  }, [durationMs, finish])

  const movingPercentages = useMemo(
    () => buildMovingPercentages(players, percentages, tick),
    [percentages, players, tick]
  )
  const leaderId = [...players].sort(
    (left, right) =>
      (movingPercentages[right.id] ?? 0) - (movingPercentages[left.id] ?? 0)
  )[0]?.id

  return (
    <section
      className="avrm avrm--tv vox-audience-pulse"
      aria-label="Temporary audience vote results"
    >
      <div className="avrm__card avrm__card--tv">
        <header className="avrm__header">
          <h2 className="avrm__title">TEMP RESULTS</h2>
          <span className="avrm__live-badge">Live</span>
        </header>
        <div className="avrm__tv-stage">
          <div
            className="avrm__tallies avrm__tallies--tv"
            data-nominee-count={players.length}
          >
            {players.map((player, index) => {
              const percentage = movingPercentages[player.id] ?? 0
              const isLeading = player.id === leaderId
              return (
                <Fragment key={player.id}>
                  {players.length === 2 && index === 1 && (
                    <div className="avrm__tv-duel-divider" aria-hidden="true">
                      <span>VS</span>
                    </div>
                  )}
                  <div
                    className={`avrm__tally avrm__tally--visible avrm__tally--tv${
                      players.length > 2 ? ' avrm__tally--tv-triple' : ''
                    }${isLeading ? ' avrm__tally--leading' : ''}`}
                  >
                    <VoteRingAvatar
                      player={player}
                      progress={percentage / 100}
                      tone={isLeading ? 'leading' : 'trailing'}
                    />
                    <span className="visually-hidden">{player.name}</span>
                    <span
                      className="avrm__tally-count"
                      aria-label={`${player.name}, ${percentage.toFixed(1)} percent`}
                    >
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
