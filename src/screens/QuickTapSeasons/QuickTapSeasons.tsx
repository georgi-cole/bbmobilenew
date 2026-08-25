import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SEASON_BOX_TIMES,
  SEASONS,
  SEASONS_DURATION,
  buildSeasonSchedule,
  rerollSeason,
  simulateSeasonsAiField,
  type TapSeason,
} from '../../experiments/quickTapSeasons/quickTapSeasons'
import './QuickTapSeasons.css'
import type { GenericMinigameProps } from '../../minigames/reactComponents'

type Phase = 'ready' | 'playing' | 'results'
type Leaf = { id: number; x: number; glyph: string }
const scoreText = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '')

export default function QuickTapSeasons({
  seed: competitionSeed,
  autoStart = false,
  participants,
  onFinish,
}: GenericMinigameProps = {}) {
  const [seed, setSeed] = useState(competitionSeed ?? 20260802)
  const [phase, setPhase] = useState<Phase>('ready')
  const [season, setSeason] = useState<TapSeason>('spring')
  const [timeLeft, setTimeLeft] = useState(SEASONS_DURATION)
  const [rawTaps, setRawTaps] = useState(0)
  const [score, setScore] = useState(0)
  const [visibleBox, setVisibleBox] = useState<number | null>(null)
  const [leaves, setLeaves] = useState<Leaf[]>([])
  const seasonRef = useRef<TapSeason>('spring')
  const phaseRef = useRef<Phase>('ready')
  const startAt = useRef(0)
  const timer = useRef<ReturnType<typeof window.setInterval> | null>(null)
  const seasonIndex = useRef(1)
  const usedBoxes = useRef(new Set<number>())
  const leafId = useRef(0)
  const scoreRef = useRef(0)
  const schedule = useMemo(() => buildSeasonSchedule(seed), [seed])
  const aiResults = useMemo(() => simulateSeasonsAiField(seed), [seed])
  const details = SEASONS[season]

  const changeSeason = useCallback((next: TapSeason) => {
    seasonRef.current = next
    setSeason(next)
  }, [])

  const finish = useCallback(() => {
    phaseRef.current = 'results'
    setPhase('results')
    setTimeLeft(0)
    setVisibleBox(null)
    if (timer.current !== null) {
      window.clearInterval(timer.current)
      timer.current = null
    }
    onFinish?.(scoreRef.current)
  }, [onFinish])

  const tick = useCallback(
    (now: number) => {
      if (phaseRef.current !== 'playing') return
      const elapsed = (now - startAt.current) / 1000
      if (elapsed >= SEASONS_DURATION) return finish()
      setTimeLeft(SEASONS_DURATION - elapsed)
      while (seasonIndex.current < schedule.length && schedule[seasonIndex.current].at <= elapsed) {
        changeSeason(schedule[seasonIndex.current++].season)
      }
      const nextBox = SEASON_BOX_TIMES.findIndex(
        (at, index) => !usedBoxes.current.has(index) && elapsed >= at && elapsed < at + 4
      )
      setVisibleBox(nextBox < 0 ? null : nextBox)
    },
    [changeSeason, finish, schedule]
  )

  const armTimer = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = window.setInterval(() => tick(Date.now()), 50)
  }, [tick])

  const start = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current)
      timer.current = null
    }
    phaseRef.current = 'playing'
    seasonIndex.current = 1
    usedBoxes.current = new Set()
    changeSeason(schedule[0].season)
    setRawTaps(0)
    setScore(0)
    scoreRef.current = 0
    setLeaves([])
    setVisibleBox(null)
    setTimeLeft(SEASONS_DURATION)
    setPhase('playing')
    // Date.now() is the most reliable shared clock across browsers and native
    // WebViews. Some embedded runtimes pause or freeze performance.now() while
    // still accepting taps, which previously left this HUD at 40 seconds.
    startAt.current = Date.now()
    tick(startAt.current)
    armTimer()
  }, [armTimer, changeSeason, schedule, tick])

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearInterval(timer.current)
        timer.current = null
      }
    },
    []
  )

  useEffect(() => {
    if (!autoStart) return
    // Defer auto-start until after Strict Mode's immediate effect replay. Its
    // first pass is cancelled below, and only the surviving pass starts the
    // race, so the interval cannot be cleaned up underneath an active game.
    const autoStartTask = window.setTimeout(() => {
      if (phaseRef.current === 'ready') {
        start()
      } else if (phaseRef.current === 'playing' && timer.current === null) {
        armTimer()
      }
    }, 0)
    return () => window.clearTimeout(autoStartTask)
  }, [armTimer, autoStart, start])

  const tap = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (phaseRef.current !== 'playing') return
    // Some mobile WebViews can defer interval callbacks while dispatching a
    // rapid stream of pointer events. Advance from the same wall clock on
    // every tap as a backstop, so active play can never pin the HUD at 40s.
    tick(Date.now())
    if (phaseRef.current !== 'playing') return
    setRawTaps((value) => value + 1)
    const nextScore = scoreRef.current + SEASONS[seasonRef.current].multiplier
    scoreRef.current = nextScore
    setScore(nextScore)
    if (seasonRef.current !== 'autumn') return
    const rect = event.currentTarget.getBoundingClientRect()
    const leaf = {
      id: leafId.current++,
      x: Math.max(8, Math.min(92, ((event.clientX - rect.left) / rect.width) * 100)),
      glyph: Math.random() > 0.5 ? '🍂' : '🍁',
    }
    setLeaves((items) => [...items.slice(-20), leaf])
    setTimeout(() => setLeaves((items) => items.filter((item) => item.id !== leaf.id)), 900)
  }

  const useBox = () => {
    if (visibleBox === null) return
    usedBoxes.current.add(visibleBox)
    changeSeason(rerollSeason(seed, visibleBox, seasonRef.current))
    setVisibleBox(null)
  }

  const hostedAiResults = useMemo(
    () =>
      participants
        ?.filter((participant) => !participant.isHuman)
        .map((participant) => ({
          id: participant.id,
          name: participant.name,
          score: participant.precomputedScore,
          rawTaps: Math.max(0, Math.round(participant.precomputedScore)),
        })),
    [participants]
  )
  const humanName = participants?.find((participant) => participant.isHuman)?.name ?? 'You'
  const standings = useMemo(
    () =>
      [
        { id: 'you', name: humanName, score, rawTaps, human: true },
        ...(hostedAiResults ?? aiResults).map((result) => ({ ...result, human: false })),
      ].sort((a, b) => b.score - a.score),
    [aiResults, hostedAiResults, humanName, rawTaps, score]
  )

  return (
    <main className={`qts qts--${season}`}>
      <div className="qts__weather" aria-hidden="true">
        {season === 'winter'
          ? '❄️ ✦ ❄️'
          : season === 'summer'
            ? '☀️ 〰️ ☀️'
            : season === 'autumn'
              ? '🍁 🍂 🍁'
              : '🌸 🐦 🌼'}
      </div>
      <section className="qts__card">
        {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
        <p className="qts__eyebrow">Experimental spin-off</p>
        {/* i18n-ignore: The minigame title is a fixed product name. */}
        <h1>Quick Tap Race 2: Seasons</h1>
        {phase === 'ready' && (
          <>
            {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
            <p className="qts__intro">
              {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
              Tap through a shifting year of seasonal surprises. Each season changes the value and
              feel of your taps, and mystery boxes can transform the conditions without warning.
            </p>
            <div className="qts__rules">
              {Object.entries(SEASONS).map(([key, item]) => (
                <div key={key}>
                  <span>{item.emoji}</span>
                  <strong>{item.label}</strong>
                  <small>{item.effect}</small>
                </div>
              ))}
            </div>
            {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
            <label className="qts__seed">
              {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
              Seed
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Math.max(0, e.currentTarget.valueAsNumber || 0))}
              />
            </label>
            <div className="qts__actions">
              {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
              <button onClick={() => setSeed(Math.floor(Math.random() * 2e9))}>New seed</button>
              {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
              <button className="qts__primary" onClick={start}>
                {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
                Start 40s race
              </button>
            </div>
          </>
        )}
        {phase === 'playing' && (
          <>
            <div className="qts__hud">
              <div>
                {/* i18n-ignore: Compact arcade HUD label remains English with the current minigame host. */}
                <small>Score</small>
                <strong>{scoreText(score)}</strong>
              </div>
              <div>
                <span>{details.emoji}</span>
                <strong>{details.label}</strong>
                <small>{details.effect}</small>
              </div>
              <div>
                {/* i18n-ignore: Compact arcade HUD label remains English with the current minigame host. */}
                <small>Time</small>
                {/* i18n-ignore: Seconds is a language-neutral abbreviated unit in this arcade HUD. */}
                <strong>{timeLeft.toFixed(1)}s</strong>
              </div>
            </div>
            <div className="qts__progress">
              <span style={{ width: `${(timeLeft / 40) * 100}%` }} />
            </div>
            <div className="qts__arena">
              {leaves.map((leaf) => (
                <span key={leaf.id} className="qts__leaf" style={{ left: `${leaf.x}%` }}>
                  {leaf.glyph}
                </span>
              ))}
              {visibleBox !== null && (
                /* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */
                <button className="qts__mystery" onClick={useBox}>
                  {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
                  🎁 Change season
                </button>
              )}
              <button className="qts__tap" onPointerDown={tap}>
                <span>{details.emoji}</span>TAP<small>{details.multiplier}×</small>
              </button>
            </div>
            {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
            <p className="qts__raw">{rawTaps} raw taps</p>
          </>
        )}
        {phase === 'results' && (
          <>
            {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
            <h2>{standings[0]?.human ? 'You won the seasons' : `${standings[0]?.name} won`}</h2>
            <ol className="qts__standings">
              {standings.map((entry, index) => (
                <li key={entry.id} className={entry.human ? 'qts__human' : ''}>
                  <span>
                    {index + 1}. {entry.name}
                  </span>
                  {/* i18n-ignore: Compact result units remain English with the current minigame host. */}
                  <strong>{scoreText(entry.score)} pts</strong>
                  {/* i18n-ignore: Compact result units remain English with the current minigame host. */}
                  <small>{entry.rawTaps} raw taps</small>
                </li>
              ))}
            </ol>
            <div className="qts__actions">
              {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
              <button onClick={() => setPhase('ready')}>Configure</button>
              {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
              <button className="qts__primary" onClick={start}>
                {/* i18n-ignore: This experimental minigame UI remains English until the minigame host exposes localized game copy. */}
                Replay seed
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
