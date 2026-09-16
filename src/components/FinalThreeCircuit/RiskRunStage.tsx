import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FINAL_PUSH_STAKES,
  RISK_TIER_MAX_POINTS,
  applyFinalPush,
  scoreRiskAttempt,
  type RiskTier,
} from './finalThreeCircuitLogic'

interface RiskRunStageProps {
  seed: number
  onComplete: (score: number) => void
}

type RiskView = 'choice' | 'needle' | 'path' | 'meter' | 'stake' | 'final'
interface PathBoard { size: number; start: number; end: number; blocked: Set<number>; moveBudget: number }

const TASKS = ['Needle Drop', 'Path Choice', 'Stop the Meter'] as const
const LABELS: Record<RiskTier, string> = { safe: 'Safe', standard: 'Standard', risky: 'Risky' }
const COPY: Record<RiskTier, string> = {
  safe: 'Wider window · lower ceiling',
  standard: 'Balanced difficulty and reward',
  risky: 'Tight window · highest ceiling',
}

function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619) }
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

function shortestPath(board: Omit<PathBoard, 'moveBudget'>): number {
  const queue: Array<[number, number]> = [[board.start, 0]]
  const seen = new Set([board.start])
  while (queue.length) {
    const [cell, distance] = queue.shift()!
    if (cell === board.end) return distance
    const row = Math.floor(cell / board.size)
    const col = cell % board.size
    for (const [r, c] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
      if (r < 0 || r >= board.size || c < 0 || c >= board.size) continue
      const next = r * board.size + c
      if (board.blocked.has(next) || seen.has(next)) continue
      seen.add(next)
      queue.push([next, distance + 1])
    }
  }
  return board.size * board.size
}

function pathBoard(tier: RiskTier): PathBoard {
  const configs: Record<RiskTier, Omit<PathBoard, 'moveBudget'>> = {
    safe: { size: 4, start: 0, end: 15, blocked: new Set([5, 6, 9]) },
    standard: { size: 5, start: 0, end: 24, blocked: new Set([1, 6, 8, 13, 15, 16, 23]) },
    risky: { size: 6, start: 0, end: 35, blocked: new Set([1, 7, 9, 10, 16, 18, 19, 21, 27, 29, 31]) },
  }
  const base = configs[tier]
  const allowance = tier === 'safe' ? 3 : tier === 'standard' ? 1 : 0
  return { ...base, moveBudget: shortestPath(base) + allowance }
}

function adjacent(left: number, right: number, size: number): boolean {
  const lr = Math.floor(left / size), lc = left % size
  const rr = Math.floor(right / size), rc = right % size
  return Math.abs(lr - rr) + Math.abs(lc - rc) === 1
}

export default function RiskRunStage({ seed, onComplete }: RiskRunStageProps) {
  const [view, setView] = useState<RiskView>('choice')
  const [task, setTask] = useState(0)
  const [tier, setTier] = useState<RiskTier | null>(null)
  const [bank, setBank] = useState(0)
  const [lastScore, setLastScore] = useState<number | null>(null)

  const [needle, setNeedle] = useState(0)
  const needleStart = useRef(0)
  const needleFrame = useRef<number | null>(null)

  const board = useMemo(() => tier ? pathBoard(tier) : null, [tier])
  const [pathCell, setPathCell] = useState(0)
  const [pathMoves, setPathMoves] = useState(0)
  const [pathMistakes, setPathMistakes] = useState(0)

  const [meterTarget, setMeterTarget] = useState(72)
  const [meter, setMeter] = useState(0)
  const [meterRunning, setMeterRunning] = useState(false)
  const meterStart = useRef(0)
  const meterFrame = useRef<number | null>(null)

  const [stake, setStake] = useState<(typeof FINAL_PUSH_STAKES)[number] | null>(null)
  const [dualLeft, setDualLeft] = useState(0.5)
  const [dualRight, setDualRight] = useState(0.5)
  const [finalReady, setFinalReady] = useState(false)
  const dualStart = useRef(0)
  const dualFrame = useRef<number | null>(null)

  useEffect(() => {
    if (view !== 'needle' || !tier || lastScore != null) return
    needleStart.current = performance.now()
    const speed = tier === 'safe' ? 0.44 : tier === 'standard' ? 0.62 : 0.82
    const tick = (now: number) => {
      setNeedle(triangleWave(((now - needleStart.current) / 1000) * speed + 0.08))
      needleFrame.current = requestAnimationFrame(tick)
    }
    needleFrame.current = requestAnimationFrame(tick)
    return () => { if (needleFrame.current != null) cancelAnimationFrame(needleFrame.current) }
  }, [lastScore, tier, view])

  useEffect(() => {
    if (view !== 'meter' || !tier || !meterRunning) return
    meterStart.current = performance.now()
    const seconds = tier === 'safe' ? 3.4 : tier === 'standard' ? 2.7 : 2.15
    const tick = (now: number) => {
      const next = Math.min(100, ((now - meterStart.current) / 1000 / seconds) * 100)
      setMeter(next)
      if (next >= 100) {
        setMeterRunning(false)
        setLastScore(0)
        return
      }
      meterFrame.current = requestAnimationFrame(tick)
    }
    meterFrame.current = requestAnimationFrame(tick)
    return () => { if (meterFrame.current != null) cancelAnimationFrame(meterFrame.current) }
  }, [meterRunning, tier, view])

  useEffect(() => {
    if (view !== 'final' || stake == null) return
    dualStart.current = performance.now()
    setFinalReady(false)
    const ready = window.setTimeout(() => setFinalReady(true), 700)
    const tick = (now: number) => {
      const elapsed = (now - dualStart.current) / 1000
      setDualLeft(0.5 + Math.sin(elapsed * 2.25) * 0.47)
      setDualRight(0.5 + Math.sin(elapsed * 2.82 + 0.68) * 0.47)
      dualFrame.current = requestAnimationFrame(tick)
    }
    dualFrame.current = requestAnimationFrame(tick)
    return () => {
      window.clearTimeout(ready)
      if (dualFrame.current != null) cancelAnimationFrame(dualFrame.current)
    }
  }, [stake, view])

  const finish = useCallback((score: number) => {
    setLastScore(score)
    setBank((current) => current + score)
  }, [])

  const chooseTier = useCallback((nextTier: RiskTier) => {
    setTier(nextTier)
    setLastScore(null)
    if (task === 0) {
      setNeedle(0)
      setView('needle')
    } else if (task === 1) {
      const nextBoard = pathBoard(nextTier)
      setPathCell(nextBoard.start)
      setPathMoves(0)
      setPathMistakes(0)
      setView('path')
    } else {
      setMeterTarget(58 + Math.round(seededUnit(seed, `meter:${nextTier}`) * 28))
      setMeter(0)
      setMeterRunning(false)
      setView('meter')
    }
  }, [seed, task])

  const continueTask = useCallback(() => {
    if (lastScore == null) return
    if (task < 2) {
      setTask((current) => current + 1)
      setTier(null)
      setLastScore(null)
      setView('choice')
    } else {
      setStake(null)
      setView('stake')
    }
  }, [lastScore, task])

  const dropNeedle = useCallback(() => {
    if (!tier || lastScore != null) return
    const tolerance = tier === 'safe' ? 0.2 : tier === 'standard' ? 0.13 : 0.075
    const accuracy = Math.max(0, 1 - Math.abs(needle - 0.72) / (tolerance * 2.2))
    finish(scoreRiskAttempt(tier, accuracy))
  }, [finish, lastScore, needle, tier])

  const chooseCell = useCallback((cell: number) => {
    if (!tier || !board || lastScore != null || !adjacent(pathCell, cell, board.size)) return
    const nextMoves = pathMoves + 1
    setPathMoves(nextMoves)
    if (board.blocked.has(cell)) {
      setPathMistakes((current) => current + 1)
      if (nextMoves >= board.moveBudget) finish(scoreRiskAttempt(tier, 0.18))
      return
    }
    setPathCell(cell)
    if (cell === board.end) {
      const extra = Math.max(0, nextMoves - shortestPath(board))
      finish(scoreRiskAttempt(tier, Math.max(0.3, 1 - pathMistakes * 0.25 - extra * 0.08)))
    } else if (nextMoves >= board.moveBudget) {
      finish(scoreRiskAttempt(tier, 0.2))
    }
  }, [board, finish, lastScore, pathCell, pathMistakes, pathMoves, tier])

  const meterAction = useCallback(() => {
    if (!tier || lastScore != null) return
    if (!meterRunning) { setMeter(0); setMeterRunning(true); return }
    setMeterRunning(false)
    const tolerance = tier === 'safe' ? 20 : tier === 'standard' ? 13 : 8
    const accuracy = Math.max(0, 1 - Math.abs(meter - meterTarget) / (tolerance * 2))
    finish(scoreRiskAttempt(tier, accuracy))
  }, [finish, lastScore, meter, meterRunning, meterTarget, tier])

  const startFinal = useCallback((nextStake: (typeof FINAL_PUSH_STAKES)[number]) => {
    setStake(nextStake)
    setDualLeft(0.5)
    setDualRight(0.5)
    setView('final')
  }, [])

  const lockFinal = useCallback(() => {
    if (stake == null || !finalReady) return
    const half = stake === 0.1 ? 0.2 : stake === 0.25 ? 0.14 : 0.095
    const success = Math.abs(dualLeft - 0.5) <= half && Math.abs(dualRight - 0.5) <= half
    onComplete(applyFinalPush(bank, stake, success))
  }, [bank, dualLeft, dualRight, finalReady, onComplete, stake])

  if (view === 'choice') {
    return <section className="f3-circuit__panel"><div className="f3-circuit__section-heading"><div><p className="f3-circuit__eyebrow">Stage 3 · Risk Run</p><h2>{TASKS[task]}</h2></div><span>Bank {bank}</span></div><p className="f3-circuit__copy">Choose difficulty before the challenge starts. More risk means a tighter window and a higher ceiling.</p><div className="f3-circuit__risk-tiers">{(Object.keys(LABELS) as RiskTier[]).map((item) => <button type="button" key={item} onClick={() => chooseTier(item)}><span>{LABELS[item]}</span><strong>up to {RISK_TIER_MAX_POINTS[item]}</strong><small>{COPY[item]}</small></button>)}</div></section>
  }

  if (view === 'needle' && tier) {
    return <section className="f3-circuit__panel"><div className="f3-circuit__section-heading"><div><p className="f3-circuit__eyebrow">Risk Run · {LABELS[tier]}</p><h2>Needle Drop</h2></div><span>Max {RISK_TIER_MAX_POINTS[tier]}</span></div><p className="f3-circuit__copy">Drop when the needle reaches the catch zone.</p><div className="f3-circuit__needle-track"><div className={`f3-circuit__needle-zone is-${tier}`} /><div className="f3-circuit__falling-needle" style={{ top: `${needle * 100}%` }} /></div>{lastScore == null ? <button type="button" className="f3-circuit__primary" onClick={dropNeedle}>Drop</button> : <Result score={lastScore} onNext={continueTask} />}</section>
  }

  if (view === 'path' && tier && board) {
    return <section className="f3-circuit__panel"><div className="f3-circuit__section-heading"><div><p className="f3-circuit__eyebrow">Risk Run · {LABELS[tier]}</p><h2>Path Choice</h2></div><span>{Math.max(0, board.moveBudget - pathMoves)} moves left</span></div><p className="f3-circuit__copy">Reach the exit without stepping into a blocked cell. Only adjacent moves count.</p><div className="f3-circuit__path-grid" style={{ gridTemplateColumns: `repeat(${board.size}, 1fr)` }}>{Array.from({ length: board.size * board.size }, (_, cell) => { const blocked = board.blocked.has(cell); const current = cell === pathCell; const exit = cell === board.end; return <button type="button" key={cell} className={`${blocked ? 'is-blocked' : ''} ${current ? 'is-current' : ''} ${exit ? 'is-exit' : ''}`} onClick={() => chooseCell(cell)} disabled={lastScore != null || current} aria-label={exit ? 'Exit' : blocked ? 'Blocked cell' : `Path cell ${cell + 1}`}>{current ? '●' : exit ? '◎' : blocked ? '×' : ''}</button> })}</div><p className="f3-circuit__hint">Mistakes: {pathMistakes}</p>{lastScore != null && <Result score={lastScore} onNext={continueTask} />}</section>
  }

  if (view === 'meter' && tier) {
    const width = tier === 'safe' ? 20 : tier === 'standard' ? 13 : 8
    const hidden = tier === 'risky' && meterRunning
    return <section className="f3-circuit__panel"><div className="f3-circuit__section-heading"><div><p className="f3-circuit__eyebrow">Risk Run · {LABELS[tier]}</p><h2>Stop the Meter</h2></div><span>{hidden ? 'Target hidden' : `Target ${meterTarget}`}</span></div><p className="f3-circuit__copy">Start the charge, then stop as close to the target value as you can.</p><div className={`f3-circuit__meter ${hidden ? 'is-hidden-target' : ''}`}><div className="f3-circuit__meter-target" style={{ left: `${Math.max(0, meterTarget - width)}%`, width: `${Math.min(100, width * 2)}%` }} /><div className="f3-circuit__meter-fill" style={{ width: `${meter}%` }} /><div className="f3-circuit__meter-pin" style={{ left: `${meterTarget}%` }} /></div><div className="f3-circuit__meter-value">{Math.round(meter)}</div>{lastScore == null ? <button type="button" className="f3-circuit__primary" onClick={meterAction}>{meterRunning ? 'Stop' : 'Start charge'}</button> : <Result score={lastScore} onNext={continueTask} label="Final Push" />}</section>
  }

  if (view === 'stake') {
    return <section className="f3-circuit__panel f3-circuit__stake-panel"><p className="f3-circuit__eyebrow">Risk Run · Final Push</p><h2>How much do you put on the line?</h2><p className="f3-circuit__copy">You have {bank} points banked. Lock both moving dials inside their centre zones to add your stake. Miss either one and it is deducted.</p><div className="f3-circuit__stake-options">{FINAL_PUSH_STAKES.map((item) => <button type="button" key={item} onClick={() => startFinal(item)}><strong>{Math.round(item * 100)}%</strong><span>±{Math.max(1, Math.round(bank * item))} pts</span></button>)}</div></section>
  }

  const windowSize = stake === 0.1 ? 20 : stake === 0.25 ? 14 : 9.5
  return <section className="f3-circuit__panel"><div className="f3-circuit__section-heading"><div><p className="f3-circuit__eyebrow">Risk Run · Final Push</p><h2>Double Lock</h2></div><span>{Math.round((stake ?? 0) * 100)}% stake</span></div><p className="f3-circuit__copy">Both needles must be inside their centre zones when you lock.</p>{[dualLeft, dualRight].map((value, index) => <div className="f3-circuit__dual-rail" key={index}><div className="f3-circuit__dual-zone" style={{ left: `${50 - windowSize}%`, width: `${windowSize * 2}%` }} /><div className="f3-circuit__dual-marker" style={{ left: `${value * 100}%` }} /></div>)}<button type="button" className="f3-circuit__primary is-danger" onClick={lockFinal} disabled={!finalReady}>{finalReady ? 'Lock both' : 'Stand by…'}</button><p className="f3-circuit__hint">Success: +{Math.max(1, Math.round(bank * (stake ?? 0)))} · Miss: −{Math.max(1, Math.round(bank * (stake ?? 0)))}</p></section>
}

function Result({ score, onNext, label = 'Next challenge' }: { score: number; onNext: () => void; label?: string }) {
  return <div className="f3-circuit__result-callout"><span>Banked</span><strong>+{score}</strong><button type="button" onClick={onNext}>{label}</button></div>
}
