import { useEffect, useMemo, useRef, useState } from 'react'
import type { RiskTier } from './finalThreeCircuitLogic'

interface LaserRunChallengeProps {
  seed: number
  tier: RiskTier
  onFinish: (accuracy: number) => void
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

export default function LaserRunChallenge({ seed, tier, onFinish }: LaserRunChallengeProps) {
  const config = {
    safe: { gates: 12, interval: 860, doubleChance: 0.08 },
    standard: { gates: 14, interval: 680, doubleChance: 0.32 },
    risky: { gates: 16, interval: 520, doubleChance: 0.68 },
  }[tier]

  const pattern = useMemo(() => {
    const random = randomFactory((seed ^ hash(`laser:${tier}`)) >>> 0)
    return Array.from({ length: config.gates }, (_unused, gateIndex) => {
      const first = Math.floor(random() * 3)
      const blocked = new Set<number>([first])
      if (gateIndex > 1 && random() < config.doubleChance) {
        let second = Math.floor(random() * 3)
        if (second === first) second = (second + 1) % 3
        blocked.add(second)
      }
      return blocked
    })
  }, [config.doubleChance, config.gates, seed, tier])

  const [lane, setLane] = useState(1)
  const [gateIndex, setGateIndex] = useState(0)
  const [strikes, setStrikes] = useState(0)
  const [finished, setFinished] = useState(false)
  const laneRef = useRef(lane)

  useEffect(() => {
    laneRef.current = lane
  }, [lane])

  useEffect(() => {
    if (finished) return
    const timer = window.setInterval(() => {
      setGateIndex((current) => {
        if (current >= pattern.length) return current
        const hit = pattern[current].has(laneRef.current)
        if (hit) setStrikes((value) => value + 1)
        const next = current + 1
        if (next >= pattern.length) {
          setFinished(true)
          window.clearInterval(timer)
        }
        return next
      })
    }, config.interval)
    return () => window.clearInterval(timer)
  }, [config.interval, finished, pattern])

  useEffect(() => {
    if (!finished) return
    const accuracy = Math.max(0.15, 1 - (strikes / Math.max(1, pattern.length)) * 2.4)
    onFinish(accuracy)
  }, [finished, onFinish, pattern.length, strikes])

  const visibleGates = Array.from(
    { length: 4 },
    (_unused, offset) => pattern[gateIndex + offset]
  ).reverse()

  return (
    <div className="f3-circuit__risk-game f3-circuit__laser-run">
      <div className="f3-circuit__challenge-meter">
        <span>Gate {Math.min(gateIndex + 1, pattern.length)} / {pattern.length}</span>
        <span>{strikes} hits</span>
      </div>

      <div className="f3-circuit__laser-track" aria-label="Laser corridor">
        {visibleGates.map((blocked, rowIndex) => (
          <div className="f3-circuit__laser-row" key={`${gateIndex}:${rowIndex}`}>
            {[0, 1, 2].map((trackLane) => (
              <span
                key={trackLane}
                className={blocked?.has(trackLane) ? 'is-blocked' : 'is-open'}
              >
                {blocked?.has(trackLane) ? '×' : ''}
              </span>
            ))}
          </div>
        ))}
        <div className="f3-circuit__runner-row">
          {[0, 1, 2].map((trackLane) => (
            <button
              type="button"
              key={trackLane}
              onClick={() => setLane(trackLane)}
              className={trackLane === lane ? 'is-runner' : ''}
              aria-label={`Move to lane ${trackLane + 1}`}
            >
              {trackLane === lane ? '▲' : ''}
            </button>
          ))}
        </div>
      </div>

      <p className="f3-circuit__hint">
        Read ahead, switch lanes before each gate reaches you, and avoid the red lasers.
      </p>
    </div>
  )
}
