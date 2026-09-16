import { useCallback, useEffect, useMemo, useState } from 'react'
import { FINAL_PUSH_STAKES } from './finalThreeCircuitLogic'

type FinalStake = (typeof FINAL_PUSH_STAKES)[number]

interface FinalOverrideChallengeProps {
  seed: number
  stake: FinalStake
  onFinish: (success: boolean) => void
}

interface OverrideRound {
  prompt: string
  options: string[]
  correct: string
}

interface OverrideResult {
  success: boolean
  correct: number
}

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function randomFactory(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

function buildRounds(seed: number): OverrideRound[] {
  const random = randomFactory((seed ^ hash('final-override')) >>> 0)
  const rounds: OverrideRound[] = [
    { prompt: 'Tap the largest value', options: ['18', '41', '27', '35'], correct: '41' },
    { prompt: 'Tap the only even value', options: ['17', '33', '28', '45'], correct: '28' },
    { prompt: 'Tap the shape with four sides', options: ['Triangle', 'Circle', 'Square', 'Star'], correct: 'Square' },
    { prompt: 'Tap the value closest to 50', options: ['31', '47', '64', '78'], correct: '47' },
    { prompt: '9 + 8 = ?', options: ['15', '16', '17', '18'], correct: '17' },
  ]
  return rounds.map((round) => ({ ...round, options: shuffle(round.options, random) }))
}

export default function FinalOverrideChallenge({ seed, stake, onFinish }: FinalOverrideChallengeProps) {
  const rounds = useMemo(() => buildRounds(seed), [seed])
  const required = stake === 0.1 ? 3 : stake === 0.25 ? 4 : 5
  const roundTimeMs = stake === 0.1 ? 4_200 : stake === 0.25 ? 3_200 : 2_500
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
          <span>Override 5 / 5</span>
          <span>{result.correct} correct</span>
          <span>Need {required}</span>
        </div>

        <div className="f3-circuit__override-result">
          <span>{result.success ? 'Override accepted' : 'Override rejected'}</span>
          <strong>{result.correct} / 5</strong>
          <p>
            {result.success
              ? 'Your stake is added to the Risk Run bank.'
              : 'Your stake is deducted from the Risk Run bank.'}
          </p>
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
        <span>Override {roundIndex + 1} / {rounds.length}</span>
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

      <p className="f3-circuit__hint">
        Higher stakes demand a cleaner run: {Math.round(stake * 100)}% stake requires {required} / 5 correct.
      </p>
    </div>
  )
}
