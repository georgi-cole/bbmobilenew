import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildPowerPuzzle, isPowerPuzzleSolved, type RiskTier } from './finalThreeCircuitLogic'

interface PowerBalanceChallengeProps {
  seed: number
  tier: RiskTier
  onFinish: (accuracy: number) => void
}

export default function PowerBalanceChallenge({
  seed,
  tier,
  onFinish,
}: PowerBalanceChallengeProps) {
  const puzzle = useMemo(() => buildPowerPuzzle(seed, tier), [seed, tier])
  const [selected, setSelected] = useState<number[]>([])
  const [toggles, setToggles] = useState(0)
  const [remainingMs, setRemainingMs] = useState(puzzle.timeLimitMs)
  const [finished, setFinished] = useState(false)
  const selectedRef = useRef<number[]>([])
  const settledRef = useRef(false)
  const sum = selected.reduce((total, index) => total + puzzle.values[index], 0)
  const solved = isPowerPuzzleSolved(sum, puzzle)

  const finish = useCallback(
    (accuracy: number) => {
      if (settledRef.current) return
      settledRef.current = true
      setFinished(true)
      onFinish(accuracy)
    },
    [onFinish]
  )

  useEffect(() => {
    if (finished) return
    const ticker = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 100))
    }, 100)
    const expiry = window.setTimeout(() => {
      const timeoutSum = selectedRef.current.reduce(
        (total, selectedIndex) => total + puzzle.values[selectedIndex],
        0
      )
      const miss = Math.abs(timeoutSum - puzzle.target)
      const scale = Math.max(1, puzzle.target * 0.35)
      setRemainingMs(0)
      finish(Math.max(0.1, 1 - miss / scale) * 0.55)
    }, puzzle.timeLimitMs)
    return () => {
      window.clearInterval(ticker)
      window.clearTimeout(expiry)
    }
  }, [finish, finished, puzzle])

  const toggleCell = (index: number) => {
    if (finished || selected.includes(index) || toggles >= puzzle.maxToggles) return
    const nextSelected = [...selected, index]
    const nextToggles = toggles + 1
    const nextSum = nextSelected.reduce(
      (total, selectedIndex) => total + puzzle.values[selectedIndex],
      0
    )
    selectedRef.current = nextSelected
    setSelected(nextSelected)
    setToggles(nextToggles)

    if (isPowerPuzzleSolved(nextSum, puzzle)) {
      const timeRatio = remainingMs / puzzle.timeLimitMs
      const toggleEfficiency = nextToggles / puzzle.maxToggles
      finish(Math.min(1, 0.76 + timeRatio * 0.16 + toggleEfficiency * 0.08))
      return
    }

    if (nextToggles >= puzzle.maxToggles) {
      const miss = Math.abs(nextSum - puzzle.target)
      const scale = Math.max(1, puzzle.target * 0.35)
      finish(Math.max(0.08, 1 - miss / scale) * 0.6)
    }
  }

  return (
    <div className="f3-circuit__risk-game f3-circuit__power-game">
      <div className="f3-circuit__power-readout">
        <div>
          <span>Target load</span>
          <strong>
            {puzzle.target}
            {puzzle.tolerance > 0 ? ` ±${puzzle.tolerance}` : ' exact'}
          </strong>
        </div>
        <div>
          <span>Current load</span>
          <strong
            className={solved ? 'is-good' : sum > puzzle.target + puzzle.tolerance ? 'is-hot' : ''}
          >
            {sum}
          </strong>
        </div>
        <div>
          <span>Time</span>
          <strong>{Math.ceil(remainingMs / 100) / 10}s</strong>
        </div>
      </div>

      <p className="f3-circuit__copy">
        Activate exactly the right power cells. Once a cell is committed it cannot be switched off,
        so each choice matters.
      </p>

      <div className="f3-circuit__power-cells">
        {puzzle.values.map((value, index) => (
          <button
            type="button"
            key={`${value}:${index}`}
            className={selected.includes(index) ? 'is-selected' : ''}
            onClick={() => toggleCell(index)}
            disabled={finished || selected.includes(index) || toggles >= puzzle.maxToggles}
          >
            <span>Cell {index + 1}</span>
            <strong>+{value}</strong>
          </button>
        ))}
      </div>

      <div className="f3-circuit__micro-stats">
        <span>
          {toggles} / {puzzle.maxToggles} committed
        </span>
        <span>{puzzle.values.length - selected.length} cells available</span>
      </div>
    </div>
  )
}
