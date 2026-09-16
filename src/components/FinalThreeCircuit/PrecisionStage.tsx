import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clampCircuitScore, scorePrecisionAttempt } from './finalThreeCircuitLogic'

interface PrecisionStageProps {
  seed: number
  onComplete: (score: number) => void
}

const WIDTHS = [0.16, 0.125, 0.095, 0.07, 0.05]
const SPEEDS = [0.46, 0.57, 0.7, 0.84, 0.98]

function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seededUnit(seed: number, label: string): number {
  let state = (seed ^ hash(label)) >>> 0
  state += 0x6d2b79f5
  let value = state
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

function triangleWave(value: number): number {
  const wrapped = ((value % 2) + 2) % 2
  return wrapped <= 1 ? wrapped : 2 - wrapped
}

export default function PrecisionStage({ seed, onComplete }: PrecisionStageProps) {
  const configs = useMemo(
    () =>
      WIDTHS.map((halfWidth, index) => ({
        halfWidth,
        speed: SPEEDS[index],
        target: 0.24 + seededUnit(seed, `precision:${index}`) * 0.52,
        wobble: index < 2 ? 0 : 0.025 + index * 0.008,
      })),
    [seed]
  )
  const [attempt, setAttempt] = useState(0)
  const [position, setPosition] = useState(0.5)
  const [scores, setScores] = useState<number[]>([])
  const [locked, setLocked] = useState<number | null>(null)
  const startRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const config = configs[attempt]

  useEffect(() => {
    if (locked != null) return
    startRef.current = performance.now()
    const tick = (now: number) => {
      const elapsed = (now - startRef.current) / 1000
      const base = triangleWave(elapsed * config.speed + attempt * 0.17)
      const wobble = Math.sin(elapsed * (2.4 + attempt * 0.3)) * config.wobble
      setPosition(Math.max(0, Math.min(1, base + wobble)))
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [attempt, config, locked])

  const lock = useCallback(() => {
    if (locked != null) return
    const score = scorePrecisionAttempt(position, config.target, config.halfWidth)
    setLocked(score)
  }, [config, locked, position])

  const next = useCallback(() => {
    if (locked == null) return
    const nextScores = [...scores, locked]
    if (attempt < configs.length - 1) {
      setScores(nextScores)
      setAttempt((current) => current + 1)
      setLocked(null)
      return
    }
    onComplete(clampCircuitScore(nextScores.reduce((sum, score) => sum + score, 0)))
  }, [attempt, configs.length, locked, onComplete, scores])

  return (
    <section className="f3-circuit__panel">
      <div className="f3-circuit__section-heading">
        <div><p className="f3-circuit__eyebrow">Stage 1 · Precision Lock</p><h2>Lock the marker</h2></div>
        <span>Attempt {attempt + 1} / 5</span>
      </div>
      <p className="f3-circuit__copy">Five locks. The target shrinks and movement becomes less predictable every attempt.</p>
      <div className="f3-circuit__precision-rail" aria-label="Precision marker">
        <div className="f3-circuit__target" style={{ left: `${(config.target - config.halfWidth) * 100}%`, width: `${config.halfWidth * 200}%` }} />
        <div className="f3-circuit__bullseye" style={{ left: `${config.target * 100}%` }} />
        <div className="f3-circuit__marker" style={{ left: `${position * 100}%` }} />
      </div>
      {locked == null ? (
        <button type="button" className="f3-circuit__primary" onClick={lock}>Lock</button>
      ) : (
        <div className="f3-circuit__result-callout"><span>Attempt score</span><strong>+{locked}</strong><button type="button" onClick={next}>{attempt < 4 ? 'Next lock' : 'See standings'}</button></div>
      )}
      <div className="f3-circuit__attempt-dots" aria-label="Precision attempts">
        {configs.map((_item, index) => <span key={index} className={index < scores.length ? 'is-complete' : index === attempt ? 'is-current' : ''} />)}
      </div>
    </section>
  )
}
