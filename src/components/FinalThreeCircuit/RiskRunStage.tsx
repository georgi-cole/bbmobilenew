import { useState } from 'react'
import {
  FINAL_PUSH_STAKES,
  RISK_TIER_MAX_POINTS,
  applyFinalPush,
  scoreRiskAttempt,
  type RiskTier,
} from './finalThreeCircuitLogic'
import CircuitTutorial from './CircuitTutorial'
import FinalOverrideChallenge from './FinalOverrideChallenge'
import PowerBalanceChallenge from './PowerBalanceChallenge'
import WardenEscapeChallenge from './WardenEscapeChallenge'

interface RiskRunStageProps {
  seed: number
  onComplete: (score: number) => void
}

type RiskView = 'tutorial' | 'choice' | 'playing' | 'result' | 'stake' | 'overrideTutorial' | 'final'
type FinalStake = (typeof FINAL_PUSH_STAKES)[number]

const TASKS = [
  { title: 'Warden Escape', tutorial: 'warden' as const },
  { title: 'Power Balance', tutorial: 'power' as const },
] as const

const LABELS: Record<RiskTier, string> = {
  safe: 'Safe',
  standard: 'Standard',
  risky: 'Risky',
}

const COPY: Record<RiskTier, string> = {
  safe: 'More margin · lower ceiling',
  standard: 'Balanced difficulty and reward',
  risky: 'Tightest rules · highest ceiling',
}

export default function RiskRunStage({ seed, onComplete }: RiskRunStageProps) {
  const [view, setView] = useState<RiskView>('tutorial')
  const [task, setTask] = useState(0)
  const [tier, setTier] = useState<RiskTier | null>(null)
  const [bank, setBank] = useState(0)
  const [lastScore, setLastScore] = useState(0)
  const [stake, setStake] = useState<FinalStake | null>(null)

  const chooseTier = (nextTier: RiskTier) => {
    setTier(nextTier)
    setView('playing')
  }

  const finishChallenge = (accuracy: number) => {
    if (!tier) return
    const score = scoreRiskAttempt(tier, accuracy)
    setLastScore(score)
    setBank((current) => current + score)
    setView('result')
  }

  const continueFromResult = () => {
    if (task < TASKS.length - 1) {
      setTask((current) => current + 1)
      setTier(null)
      setView('tutorial')
      return
    }
    setTier(null)
    setView('stake')
  }

  if (view === 'tutorial') {
    return (
      <CircuitTutorial
        key={`risk-tutorial-${task}`}
        kind={TASKS[task].tutorial}
        onComplete={() => setView('choice')}
      />
    )
  }

  if (view === 'choice') {
    return (
      <section className="f3-circuit__arena-card f3-circuit__arena-card--risk">
        <div className="f3-circuit__section-heading">
          <div>
            <p className="f3-circuit__eyebrow">Risk Run</p>
            <h2>{TASKS[task].title}</h2>
          </div>
          <span>Bank {bank}</span>
        </div>

        <div className="f3-circuit__risk-tiers">
          {(Object.keys(LABELS) as RiskTier[]).map((item) => (
            <button type="button" key={item} className={`is-${item}`} onClick={() => chooseTier(item)}>
              <span>{LABELS[item]}</span>
              <strong>up to {RISK_TIER_MAX_POINTS[item]}</strong>
              <small>{COPY[item]}</small>
            </button>
          ))}
        </div>
      </section>
    )
  }

  if (view === 'playing' && tier) {
    return (
      <section className="f3-circuit__arena-card f3-circuit__arena-card--risk">
        <div className="f3-circuit__section-heading">
          <div>
            <p className="f3-circuit__eyebrow">Risk Run · {LABELS[tier]}</p>
            <h2>{TASKS[task].title}</h2>
          </div>
          <span>Max {RISK_TIER_MAX_POINTS[tier]}</span>
        </div>
        {task === 0 && <WardenEscapeChallenge seed={seed} tier={tier} onFinish={finishChallenge} />}
        {task === 1 && <PowerBalanceChallenge seed={seed} tier={tier} onFinish={finishChallenge} />}
      </section>
    )
  }

  if (view === 'result') {
    return (
      <section className="f3-circuit__arena-card f3-circuit__arena-card--result">
        <p className="f3-circuit__eyebrow">Challenge complete</p>
        <h2>{TASKS[task].title}</h2>
        <div className="f3-circuit__big-score">+{lastScore}</div>
        <p className="f3-circuit__copy">Bank: {bank}</p>
        <button type="button" className="f3-circuit__primary" onClick={continueFromResult}>
          {task < TASKS.length - 1 ? `Next: ${TASKS[task + 1].title}` : 'Final Push'}
        </button>
      </section>
    )
  }

  if (view === 'stake') {
    return (
      <section className="f3-circuit__arena-card f3-circuit__arena-card--stake">
        <p className="f3-circuit__eyebrow">Final Push</p>
        <h2>Choose your stake</h2>
        <div className="f3-circuit__stake-options">
          {FINAL_PUSH_STAKES.map((item) => {
            const points = Math.max(1, Math.round(bank * item))
            const required = item === 0.1 ? 3 : item === 0.25 ? 4 : 5
            return (
              <button
                type="button"
                key={item}
                onClick={() => {
                  setStake(item)
                  setView('overrideTutorial')
                }}
              >
                <strong>{Math.round(item * 100)}%</strong>
                <span>±{points} pts</span>
                <small>Need {required} / 5</small>
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  if (view === 'overrideTutorial') {
    return <CircuitTutorial kind="override" onComplete={() => setView('final')} />
  }

  if (stake == null) return null

  return (
    <section className="f3-circuit__arena-card f3-circuit__arena-card--final">
      <div className="f3-circuit__section-heading">
        <div>
          <p className="f3-circuit__eyebrow">Final Push</p>
          <h2>Final Override</h2>
        </div>
        <span>{Math.round(stake * 100)}% stake</span>
      </div>
      <FinalOverrideChallenge
        seed={seed}
        stake={stake}
        onFinish={(success) => onComplete(applyFinalPush(bank, stake, success))}
      />
    </section>
  )
}
