import { useMemo, useState } from 'react'
import QuickTapRace from '../../components/QuickTapRace/QuickTapRace'
import type { QTRTimingDiagnostics } from '../../minigames/quickTapRace/engine/types'
import { selectBoosterPrompts } from '../../ai/competition/quickTapSimulation'
import {
  QUICK_TAP_PHONE_BASELINE,
  simulateHumanlikeQuickTapField,
  type QuickTapExperimentDifficulty,
  type QuickTapHumanAiResult,
} from '../../experiments/quickTapHumanAi/quickTapHumanAi'
import './QuickTapExperiment.css'

interface HumanResult {
  effectiveScore: number
  rawTaps: number
  modifiers: string[]
  timing: QTRTimingDiagnostics
}

const DIFFICULTY_COPY: Record<QuickTapExperimentDifficulty, string> = {
  friendly: 'Uses 85% of the existing fixed-band target.',
  balanced: 'Uses 110% of the existing fixed-band target.',
  competitive: 'Uses 123% of the existing fixed-band target.',
}

function freshSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000)
}

export default function QuickTapExperiment() {
  const [seed, setSeed] = useState(424242)
  const [difficulty, setDifficulty] = useState<QuickTapExperimentDifficulty>('balanced')
  const [forceAllBoosters, setForceAllBoosters] = useState(true)
  const [phase, setPhase] = useState<'setup' | 'playing' | 'results'>('setup')
  const [runKey, setRunKey] = useState(0)
  const [aiResults, setAiResults] = useState<QuickTapHumanAiResult[]>([])
  const [humanResult, setHumanResult] = useState<HumanResult | null>(null)

  const boosters = useMemo(() => selectBoosterPrompts(seed), [seed])

  const startRun = () => {
    setAiResults(simulateHumanlikeQuickTapField(seed, difficulty, { forceAllBoosters }))
    setHumanResult(null)
    setRunKey((current) => current + 1)
    setPhase('playing')
  }

  const standings = useMemo(() => {
    if (!humanResult) return []
    return [
      {
        id: 'human',
        name: 'You',
        score: humanResult.effectiveScore,
        rawTaps: humanResult.rawTaps,
        isHuman: true,
      },
      ...aiResults.map((result) => ({
        id: result.id,
        name: result.name,
        score: result.effectiveScore,
        rawTaps: result.rawTaps,
        isHuman: false,
      })),
    ].sort((left, right) => right.score - left.score)
  }, [aiResults, humanResult])

  if (phase === 'playing') {
    return (
      <QuickTapRace
        key={runKey}
        seed={seed}
        onFinish={() => {}}
        experimental={{
          seed,
          onFinish: ({ effectiveScore, rawTaps, modifiers, timing }) => {
            setHumanResult({ effectiveScore, rawTaps, modifiers, timing })
            setPhase('results')
          },
        }}
      />
    )
  }

  return (
    <main className="qtr-experiment" data-testid="quick-tap-experiment">
      <section className="qtr-experiment__hero">
        <p className="qtr-experiment__eyebrow">Dev-only sandbox · production unchanged</p>
        <h1>Quick Tap: Human AI Lab</h1>
        <p>
          Existing fixed bands set each opponent&apos;s target. The lab then checks whether
          human-like taps, pauses, fatigue, and booster decisions can honestly reproduce it. Human
          input uses a low-lag measurement path and a strict wall-clock deadline.
        </p>
      </section>

      {phase === 'setup' ? (
        <section className="qtr-experiment__panel" aria-label="Experiment setup">
          <label>
            <span>Shared seed</span>
            <input
              aria-label="Shared seed"
              type="number"
              value={seed}
              onChange={(event) =>
                setSeed(Math.max(0, Math.trunc(event.currentTarget.valueAsNumber || 0)))
              }
            />
          </label>
          <button
            type="button"
            className="qtr-experiment__secondary"
            onClick={() => setSeed(freshSeed())}
          >
            New seed
          </button>

          <label>
            <span>AI field</span>
            <select
              aria-label="AI field"
              value={difficulty}
              onChange={(event) =>
                setDifficulty(event.currentTarget.value as QuickTapExperimentDifficulty)
              }
            >
              <option value="friendly">Friendly</option>
              <option value="balanced">Balanced</option>
              <option value="competitive">Competitive</option>
            </select>
          </label>
          <p className="qtr-experiment__hint">{DIFFICULTY_COPY[difficulty]}</p>

          <label>
            <input
              type="checkbox"
              checked={forceAllBoosters}
              onChange={(event) => setForceAllBoosters(event.currentTarget.checked)}
            />
            <span>AIs take all three mystery boxes</span>
          </label>
          {forceAllBoosters && (
            <p className="qtr-experiment__hint">
              Controlled booster test: collect all three boxes yourself for an equal comparison.
            </p>
          )}

          <div className="qtr-experiment__boosters" aria-label="Shared mystery sequence">
            <strong>Shared mystery sequence</strong>
            <span>All four racers receive prompts at 6s, 15s, and 23s from this seed.</span>
          </div>

          <div className="qtr-experiment__boosters" aria-label="Phone calibration anchor">
            <strong>Strong-phone anchor</strong>
            <span>
              {QUICK_TAP_PHONE_BASELINE.sustainedTapsPerSecond} sustained taps/s ·{' '}
              {QUICK_TAP_PHONE_BASELINE.peakOneSecondTaps} peak taps in 1s ·{' '}
              {QUICK_TAP_PHONE_BASELINE.medianInterTapMs}ms median gap
            </span>
          </div>

          <button type="button" className="qtr-experiment__start" onClick={startRun}>
            Start experimental race
          </button>
        </section>
      ) : (
        <>
          <section className="qtr-experiment__panel" aria-label="Experiment results">
            <p className="qtr-experiment__eyebrow">
              Seed {seed} · {difficulty}
              {forceAllBoosters ? ' · all boxes controlled' : ''}
            </p>
            <h2>
              {standings[0]?.isHuman ? 'You won the experiment' : `${standings[0]?.name} won`}
            </h2>
            <ol className="qtr-experiment__standings">
              {standings.map((entry, index) => (
                <li key={entry.id} className={entry.isHuman ? 'qtr-experiment__human' : ''}>
                  <span>
                    {index + 1}. {entry.name}
                  </span>
                  <strong>{entry.score} pts</strong>
                  <small>{entry.rawTaps} raw taps</small>
                </li>
              ))}
            </ol>
            {humanResult && (
              <div className="qtr-experiment__human-audit">
                <p className="qtr-experiment__hint">
                  Your revealed effects:{' '}
                  {humanResult.modifiers.length > 0
                    ? humanResult.modifiers.join(', ')
                    : 'none taken'}
                </p>
                <p className="qtr-experiment__hint">
                  Input timing audit: {(humanResult.timing.wallClockElapsedMs / 1000).toFixed(2)}s
                  elapsed · longest frame {humanResult.timing.longestFrameMs.toFixed(0)}ms ·{' '}
                  {humanResult.timing.staleTapsRejected} queued taps rejected ·{' '}
                  {humanResult.timing.afterDeadlineTapsRejected} late taps rejected
                </p>
                <p className="qtr-experiment__hint">
                  Input profile: {humanResult.timing.averageTapsPerSecond.toFixed(2)} taps/s average
                  · {humanResult.timing.peakOneSecondTaps} peak taps in 1s · median gap{' '}
                  {humanResult.timing.medianInterTapMs?.toFixed(1) ?? '—'}ms · fastest gap{' '}
                  {humanResult.timing.fastestInterTapMs?.toFixed(1) ?? '—'}ms
                </p>
                <p className="qtr-experiment__hint">
                  Pointer profile: {humanResult.timing.uniquePointerCount} pointer IDs · max{' '}
                  {humanResult.timing.maxConcurrentPointers} simultaneous ·{' '}
                  {Object.entries(humanResult.timing.pointerTypeCounts)
                    .map(([type, count]) => `${type}: ${count}`)
                    .join(', ') || 'unknown'}{' '}
                  ·{' '}
                  {humanResult.timing.inputRateFlag === 'typical'
                    ? 'typical rate'
                    : 'high rate — review only'}
                </p>
              </div>
            )}
            <div className="qtr-experiment__actions">
              <button type="button" className="qtr-experiment__start" onClick={startRun}>
                Replay same seed
              </button>
              <button
                type="button"
                className="qtr-experiment__secondary"
                onClick={() => {
                  setSeed(freshSeed())
                  setPhase('setup')
                }}
              >
                Configure new race
              </button>
            </div>
          </section>

          <section className="qtr-experiment__traces" aria-label="AI behavior report">
            <h2>AI behavior report</h2>
            {aiResults.map((result) => (
              <article key={result.id}>
                <h3>{result.name}</h3>
                <dl>
                  <div>
                    <dt>Opening reaction</dt>
                    <dd>{result.openingReactionMs} ms</dd>
                  </div>
                  <div>
                    <dt>Average rhythm</dt>
                    <dd>{result.averageTapsPerSecond} taps/s</dd>
                  </div>
                  <div>
                    <dt>Fixed-band target</dt>
                    <dd>{result.bandTargetScore} pts</dd>
                  </div>
                  <div>
                    <dt>Simulation audit</dt>
                    <dd>
                      {result.targetReached
                        ? `credible (${result.scoreGap >= 0 ? '+' : ''}${result.scoreGap})`
                        : `unreachable (${result.scoreGap >= 0 ? '+' : ''}${result.scoreGap})`}
                    </dd>
                  </div>
                  <div>
                    <dt>Race time</dt>
                    <dd>{(result.elapsedMs / 1000).toFixed(0)} s</dd>
                  </div>
                  <div>
                    <dt>Trace actions</dt>
                    <dd>{result.actions.length}</dd>
                  </div>
                </dl>
                <ul>
                  {result.boosters.map((booster, index) => (
                    <li key={`${booster.type}-${index}`}>
                      {index + 1}:{' '}
                      {booster.taken ? `took after ${booster.reactionMs} ms` : 'skipped'} — revealed{' '}
                      {booster.type}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          <details className="qtr-experiment__reveal">
            <summary>Reveal the shared booster order</summary>
            <ol>
              {boosters.map((booster) => (
                <li key={`${booster.scheduleAt}-${booster.type}`}>
                  {booster.scheduleAt}s: {booster.label} (
                  {booster.beneficial ? 'beneficial' : 'harmful'})
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </main>
  )
}
