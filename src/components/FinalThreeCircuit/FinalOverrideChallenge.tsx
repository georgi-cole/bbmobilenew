import { useCallback, useEffect, useMemo, useState } from 'react'
import { FINAL_PUSH_STAKES } from './finalThreeCircuitLogic'
import { buildFinalOverrideRounds } from './finalOverrideQuestionBank'

type FinalStake = (typeof FINAL_PUSH_STAKES)[number]

interface FinalOverrideChallengeProps {
  seed: number
  stake: FinalStake
  onFinish: (success: boolean) => void
}

interface OverrideResult {
  success: boolean
  correct: number
}

export default function FinalOverrideChallenge({ seed, stake, onFinish }: FinalOverrideChallengeProps) {
  const rounds = useMemo(() => buildFinalOverrideRounds(seed), [seed])
  const required = stake === 0.1 ? 3 : stake === 0.25 ? 4 : 5
  // One extra second on every stake level after mobile playtesting.
  const roundTimeMs = stake === 0.1 ? 5_200 : stake === 0.25 ? 4_200 : 3_500
  const [roundIndex, setRoundIndex] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [remainingMs, setRemainingMs] = useState(roundTimeMs)
  const [locked, setLocked] = useState(false)
  const [feedback, setFeedback] = useState<'good' | 'bad' | null>(null)
  const [result, setResult] = useState<OverrideResult | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const round = rounds[roundIndex]

  const advance = useCallback(
    (wasCorrect: boolean) => {
      if (locked || result) return
      setLocked(true)
      setFeedback(wasCorrect ? 'good' : 'bad')
      const nextCorrect = correct + (wasCorrect ? 1 : 0)
      setCorrect(nextCorrect)

      window.setTimeout(() => {
        if (roundIndex >= rounds.length - 1) {
          setResult({ success: nextCorrect >= required, correct: nextCorrect })
          return
        }
        setRoundIndex((current) => current + 1)
        setRemainingMs(roundTimeMs)
        setLocked(false)
        setFeedback(null)
      }, 260)
    },
    [correct, locked, required, result, roundIndex, roundTimeMs, rounds.length]
  )

  useEffect(() => {
    if (locked || result) return
    const timer = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 100))
    }, 100)
    return () => window.clearInterval(timer)
  }, [locked, result, roundIndex])

  useEffect(() => {
    if (remainingMs > 0 || locked || result) return
    advance(false)
  }, [advance, locked, remainingMs, result])

  if (result) {
    return (
      <div className={`f3-circuit__risk-game f3-circuit__override ${result.success ? 'is-good' : 'is-bad'}`}>
        <div className="f3-circuit__challenge-meter">
          <span>5 / 5</span>
          <span>{result.correct} correct</span>
          <span>Need {required}</span>
        </div>

        <div className="f3-circuit__override-result">
          <span>{result.success ? 'Override accepted' : 'Override rejected'}</span>
          <strong>{result.correct} / 5</strong>
          <p>{result.success ? 'Stake added.' : 'Stake deducted.'}</p>
        </div>

        <button
          type="button"
          className="f3-circuit__primary"
          disabled={submitted}
          onClick={() => {
            if (submitted) return
            setSubmitted(true)
            onFinish(result.success)
          }}
        >
          {submitted ? 'Locking result…' : 'Lock in result'}
        </button>
      </div>
    )
  }

  return (
    <div className={`f3-circuit__risk-game f3-circuit__override ${feedback ? `is-${feedback}` : ''}`}>
      <div className="f3-circuit__challenge-meter">
        <span>{roundIndex + 1} / {rounds.length}</span>
        <span>{correct} correct</span>
        <span>Need {required}</span>
      </div>

      <div className="f3-circuit__override-timer" aria-label="Override time remaining">
        <span style={{ width: `${Math.max(0, Math.min(100, remainingMs / roundTimeMs * 100))}%` }} />
      </div>

      <div className="f3-circuit__override-prompt">
        <span>Protocol {roundIndex + 1}</span>
        <strong>{round.prompt}</strong>
      </div>

      <div className="f3-circuit__override-options">
        {round.options.map((option) => (
          <button
            type="button"
            key={option}
            disabled={locked}
            onClick={() => advance(option === round.correct)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
