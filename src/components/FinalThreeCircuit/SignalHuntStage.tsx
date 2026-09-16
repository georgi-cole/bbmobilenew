import { useEffect, useMemo, useState } from 'react'
import {
  buildSignalBoard,
  buildSignalRounds,
  clampCircuitScore,
  scoreSignalRound,
} from './finalThreeCircuitLogic'

interface SignalHuntStageProps {
  seed: number
  onComplete: (score: number) => void
}

export default function SignalHuntStage({ seed, onComplete }: SignalHuntStageProps) {
  const rounds = useMemo(() => buildSignalRounds(seed), [seed])
  const [roundIndex, setRoundIndex] = useState(0)
  const [step, setStep] = useState(0)
  const [remainingMs, setRemainingMs] = useState(rounds[0].timeLimitMs)
  const [mistakes, setMistakes] = useState(0)
  const [bank, setBank] = useState(0)
  const [roundScore, setRoundScore] = useState<number | null>(null)
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null)
  const round = rounds[roundIndex]
  const target = round.targetOrder[Math.min(step, round.targetOrder.length - 1)]
  const board = useMemo(
    () => buildSignalBoard(seed, roundIndex, step, round.cellCount),
    [round.cellCount, roundIndex, seed, step]
  )

  useEffect(() => {
    if (roundScore != null) return
    const timer = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 100))
    }, 100)
    return () => window.clearInterval(timer)
  }, [roundScore])

  useEffect(() => {
    if (remainingMs > 0 || roundScore != null) return
    setRoundScore(
      scoreSignalRound(
        step,
        round.targetCount,
        0,
        round.timeLimitMs,
        round.maxPoints,
        mistakes
      )
    )
  }, [mistakes, remainingMs, round, roundScore, step])

  const tapCell = (value: number) => {
    if (roundScore != null || remainingMs <= 0) return
    if (value !== target) {
      setMistakes((current) => current + 1)
      setRemainingMs((current) => Math.max(0, current - 900))
      setFlash('bad')
      window.setTimeout(() => setFlash(null), 180)
      return
    }

    const nextStep = step + 1
    setFlash('good')
    window.setTimeout(() => setFlash(null), 140)
    if (nextStep >= round.targetCount) {
      setRoundScore(
        scoreSignalRound(
          nextStep,
          round.targetCount,
          remainingMs,
          round.timeLimitMs,
          round.maxPoints,
          mistakes
        )
      )
      return
    }
    setStep(nextStep)
  }

  const nextRound = () => {
    if (roundScore == null) return
    const nextBank = bank + roundScore
    if (roundIndex >= rounds.length - 1) {
      onComplete(clampCircuitScore(nextBank))
      return
    }
    const nextIndex = roundIndex + 1
    setBank(nextBank)
    setRoundIndex(nextIndex)
    setStep(0)
    setMistakes(0)
    setRoundScore(null)
    setRemainingMs(rounds[nextIndex].timeLimitMs)
  }

  return (
    <section className="f3-circuit__arena-card f3-circuit__arena-card--signal">
      <div className="f3-circuit__section-heading">
        <div>
          <p className="f3-circuit__eyebrow">Stage 1 · Signal Hunt</p>
          <h2>Find the live node</h2>
        </div>
        <span>Round {roundIndex + 1} / 3</span>
      </div>

      <div className="f3-circuit__signal-command">
        <span>Target</span>
        <strong>{target}</strong>
        <small>{Math.ceil(remainingMs / 100) / 10}s</small>
      </div>

      <p className="f3-circuit__copy">
        Find the requested node. The board scrambles after every correct hit. A wrong tap costs time and points.
      </p>

      <div
        className={`f3-circuit__signal-grid ${flash ? `is-${flash}` : ''}`}
        style={{ gridTemplateColumns: `repeat(${round.columns}, minmax(0, 1fr))` }}
        aria-label="Signal Hunt board"
      >
        {board.map((value) => (
          <button
            type="button"
            key={value}
            onClick={() => tapCell(value)}
            disabled={roundScore != null}
            aria-label={`Node ${value}`}
          >
            <span>{value}</span>
          </button>
        ))}
      </div>

      <div className="f3-circuit__micro-stats">
        <span>{Math.min(step, round.targetCount)} / {round.targetCount} found</span>
        <span>{mistakes} mistakes</span>
        <span>{bank} banked</span>
      </div>

      {roundScore != null && (
        <div className="f3-circuit__result-callout">
          <span>Round score</span>
          <strong>+{roundScore}</strong>
          <button type="button" onClick={nextRound}>
            {roundIndex < 2 ? 'Next round' : 'See standings'}
          </button>
        </div>
      )}
    </section>
  )
}
