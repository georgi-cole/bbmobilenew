import { useMemo, useState } from 'react'
import CastleRescueGame from '../../minigames/castleRescue/CastleRescueGame'
import {
  simulateHumanlikeFindYourTwinField,
  type FindYourTwinAiResult,
  type FindYourTwinExperimentDifficulty,
  type FindYourTwinHumanTelemetry,
} from '../../experiments/findYourTwinHumanAi/findYourTwinHumanAi'
import './FindYourTwinExperiment.css'

const DIFFICULTY_COPY: Record<FindYourTwinExperimentDifficulty, string> = {
  friendly: 'More hesitation, slower movement, and more human navigation mistakes.',
  balanced: 'Plausible phone movement, blind pipe exploration, pickups, and occasional mistakes.',
  competitive:
    'Faster reactions and cleaner control, still without route knowledge or impossible actions.',
}

function freshSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000)
}

export default function FindYourTwinExperiment() {
  const [seed, setSeed] = useState(424242)
  const [difficulty, setDifficulty] = useState<FindYourTwinExperimentDifficulty>('balanced')
  const [phase, setPhase] = useState<'setup' | 'playing' | 'results'>('setup')
  const [runKey, setRunKey] = useState(0)
  const [aiResults, setAiResults] = useState<FindYourTwinAiResult[]>([])
  const [humanResult, setHumanResult] = useState<FindYourTwinHumanTelemetry | null>(null)

  const startRun = () => {
    setAiResults(simulateHumanlikeFindYourTwinField(seed, difficulty))
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
        score: humanResult.finalScore,
        rescued: humanResult.rescued,
        elapsedMs: humanResult.elapsedMs,
        isHuman: true,
      },
      ...aiResults.map((result) => ({
        id: result.id,
        name: result.name,
        score: result.finalScore,
        rescued: result.rescued,
        elapsedMs: result.elapsedMs,
        isHuman: false,
      })),
    ].sort((left, right) => right.score - left.score || left.elapsedMs - right.elapsedMs)
  }, [aiResults, humanResult])

  if (phase === 'playing') {
    return (
      <CastleRescueGame
        key={runKey}
        seed={seed}
        autoStart
        onFinish={() => {}}
        experimental={{
          onFinish: (result) => {
            setHumanResult(result)
            setPhase('results')
          },
        }}
      />
    )
  }

  return (
    <main className="fyt-experiment" data-testid="find-your-twin-experiment">
      <section className="fyt-experiment__hero">
        <p className="fyt-experiment__eyebrow">Dev-only sandbox · production unchanged</p>
        <h1>Find Your Twin: Human AI Lab</h1>
        <p>
          You and three simulated opponents receive the same hidden pipe layout. The AIs must move,
          jump, explore unknown pipes, survive rooms, collect points, and reach the twin within the
          real 2:30 limit. Their legal action score is audited against today&apos;s fixed AI score
          band.
        </p>
      </section>

      {phase === 'setup' ? (
        <section className="fyt-experiment__panel" aria-label="Experiment setup">
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
            className="fyt-experiment__secondary"
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
                setDifficulty(event.currentTarget.value as FindYourTwinExperimentDifficulty)
              }
            >
              <option value="friendly">Friendly</option>
              <option value="balanced">Balanced</option>
              <option value="competitive">Competitive</option>
            </select>
          </label>
          <p className="fyt-experiment__hint">{DIFFICULTY_COPY[difficulty]}</p>

          <div className="fyt-experiment__note">
            <strong>Fair test rule</strong>
            <span>
              The route remains hidden until the run ends. AIs cannot inspect the seed, know a
              pipe&apos;s type before entering, teleport past terrain, or receive a score they did
              not earn.
            </span>
          </div>

          <button type="button" className="fyt-experiment__start" onClick={startRun}>
            Start experimental run
          </button>
        </section>
      ) : (
        <>
          <section className="fyt-experiment__panel" aria-label="Experiment results">
            <p className="fyt-experiment__eyebrow">
              Seed {seed} · {difficulty}
            </p>
            <h2>
              {standings[0]?.isHuman ? 'You won the experiment' : `${standings[0]?.name} won`}
            </h2>
            <ol className="fyt-experiment__standings">
              {standings.map((entry, index) => (
                <li key={entry.id} className={entry.isHuman ? 'fyt-experiment__human' : ''}>
                  <span>
                    {index + 1}. {entry.name}
                  </span>
                  <strong>{entry.score} pts</strong>
                  <small>
                    {entry.rescued
                      ? `rescued in ${(entry.elapsedMs / 1000).toFixed(1)}s`
                      : 'did not rescue'}
                  </small>
                </li>
              ))}
            </ol>

            {humanResult && (
              <div className="fyt-experiment__audit">
                <strong>Your action audit</strong>
                <p>
                  {humanResult.pipesComplete}/3 route pipes · {humanResult.pipeEntries} entries ·{' '}
                  {humanResult.wrongPipes} wrong · {humanResult.roomsEntered} rooms ·{' '}
                  {humanResult.deaths} deaths
                </p>
                <p>
                  {humanResult.jumps} jumps · {humanResult.coinsCollected} Eyeoleans ·{' '}
                  {humanResult.enemiesStomped} enemies · {humanResult.bricksBroken} bricks · longest
                  frame {humanResult.longestFrameMs.toFixed(0)}ms
                </p>
              </div>
            )}

            <div className="fyt-experiment__route">
              <strong>Route revealed after play</strong>
              <span>
                Slots {aiResults[0]?.correctRoute.map((slot) => slot + 1).join(' → ') || '—'}
                {aiResults[0]?.lockedRouteSlot != null
                  ? ` · slot ${aiResults[0].lockedRouteSlot + 1} began locked`
                  : ' · no locked route pipe'}
              </span>
            </div>
          </section>

          <section className="fyt-experiment__reports" aria-label="AI action reports">
            {aiResults.map((result) => (
              <article key={result.id} className="fyt-experiment__report">
                <h3>{result.name}</h3>
                <p className="fyt-experiment__scoreline">
                  <strong>{result.finalScore} legal-action pts</strong>
                  <span>Production assigned {result.bandTargetScore}</span>
                </p>
                <p
                  className={
                    result.targetReached ? 'fyt-experiment__reachable' : 'fyt-experiment__gap'
                  }
                >
                  {result.targetReached
                    ? `Action trace reproduced the band within ${Math.abs(result.scoreGap)} points.`
                    : `Band was not reproduced: ${result.scoreGap > 0 ? '+' : ''}${result.scoreGap} point gap.`}
                </p>
                <p>
                  {result.rescued
                    ? `Rescued in ${(result.elapsedMs / 1000).toFixed(1)}s`
                    : result.endReason}{' '}
                  · {result.pipesComplete}/3 pipes · {result.wrongPipes} wrong · {result.deaths}{' '}
                  deaths · {result.roomsEntered} rooms
                </p>
                <p>
                  {result.jumps} jumps · {result.coinsCollected} Eyeoleans · {result.enemiesStomped}{' '}
                  enemies · {result.bricksBroken} bricks
                </p>
                <details>
                  <summary>Legal action trace ({result.actions.length} events)</summary>
                  <ol>
                    {result.actions.map((action, index) => (
                      <li key={`${action.atMs}-${index}`}>
                        {(action.atMs / 1000).toFixed(1)}s · {action.type} · {action.detail}
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            ))}
          </section>

          <div className="fyt-experiment__actions">
            <button
              type="button"
              className="fyt-experiment__secondary"
              onClick={() => setPhase('setup')}
            >
              Change setup
            </button>
            <button type="button" className="fyt-experiment__start" onClick={startRun}>
              Replay same seed
            </button>
            <button
              type="button"
              className="fyt-experiment__start"
              onClick={() => {
                setSeed(freshSeed())
                setPhase('setup')
              }}
            >
              New seed
            </button>
          </div>
        </>
      )}
    </main>
  )
}
