import { useEffect, useMemo, useState } from 'react'
import { useBlocker } from 'react-router'
import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { selectAlivePlayers } from '../../store/gameSlice'
import { useAppSelector } from '../../store/hooks'
import RequiredConfessionalDecision from './RequiredConfessionalDecision'
import { getRequiredConfessionalPresentation } from './requiredConfessionalPresentation'
import './RequiredConfessionalSession.css'

interface Props {
  decision: ActiveConfessionalDecision | null
  onReturnToGame: (returnCue: string) => void
}

const CLASSIC_ENTRY_MS = 620
const SURVIVAL_ENTRY_MS = 300
const CLASSIC_RETURN_MS = 1050
const SURVIVAL_RETURN_MS = 560

export default function RequiredConfessionalSession({ decision, onReturnToGame }: Props) {
  const game = useAppSelector((state) => state.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const survival = game.mode === 'survival'
  const [entryActive, setEntryActive] = useState(true)
  const [lastCommitSummary, setLastCommitSummary] = useState<string | null>(null)
  const [lastReturnCue, setLastReturnCue] = useState('game')
  const [lastDecisionType, setLastDecisionType] = useState<
    ActiveConfessionalDecision['type'] | null
  >(decision?.type ?? null)
  const navigationBlocker = useBlocker(decision !== null)

  const presentation = useMemo(
    () => (decision ? getRequiredConfessionalPresentation(decision, game) : null),
    [decision, game]
  )

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setEntryActive(false),
      survival ? SURVIVAL_ENTRY_MS : CLASSIC_ENTRY_MS
    )
    return () => window.clearTimeout(timeout)
  }, [survival])

  useEffect(() => {
    if (navigationBlocker.state === 'blocked') navigationBlocker.reset()
  }, [navigationBlocker])

  useEffect(() => {
    if (decision !== null) return
    const timeout = window.setTimeout(
      () => onReturnToGame(lastReturnCue),
      survival ? SURVIVAL_RETURN_MS : CLASSIC_RETURN_MS
    )
    return () => window.clearTimeout(timeout)
  }, [decision, lastReturnCue, onReturnToGame, survival])

  const completedTitle = survival ? 'Protocol Complete' : 'Decision Sealed'
  const completedCopy = survival
    ? 'The run is resuming with your decision applied.'
    : 'The Big Eye has recorded your decision. You are returning to the house.'

  return (
    <main
      className={`required-confessional${survival ? ' required-confessional--survival' : ''}`}
      data-testid="required-confessional-session"
      data-decision-type={decision?.type ?? lastDecisionType ?? undefined}
    >
      {entryActive && (
        <div className="required-confessional__entry" aria-hidden="true">
          <div className="required-confessional__entry-eye">◉</div>
          <span>{survival ? 'PRIVATE PROTOCOL' : 'CONFESSIONAL CALL'}</span>
          <strong>{survival ? `Day ${game.week}` : 'The Big Eye is ready for you'}</strong>
        </div>
      )}

      <header className="required-confessional__header">
        <div>
          <span className="required-confessional__privacy">● PRIVATE · DECISION REQUIRED</span>
          <h1>{survival ? 'Survival Confessional' : 'The Confessional'}</h1>
        </div>
        <div
          className="required-confessional__lock"
          aria-label="Exit locked until the decision is complete"
        >
          <span aria-hidden="true">▣</span>
          Locked
        </div>
      </header>

      <section className="required-confessional__stage" aria-live="polite">
        {decision && presentation ? (
          <>
            <div
              className={`required-confessional__brief required-confessional__brief--${presentation.tone}`}
            >
              <div className="required-confessional__brief-topline">
                <span>{presentation.eyebrow}</span>
                {presentation.stepLabel && <strong>{presentation.stepLabel}</strong>}
              </div>
              <div className="required-confessional__eye" aria-hidden="true">
                ◉
              </div>
              <h2>{presentation.title}</h2>
              <p>{presentation.prompt}</p>
              <div className="required-confessional__privacy-note">
                Your selection stays private until the public ceremony resumes.
              </div>
            </div>

            {lastCommitSummary && (
              <div className="required-confessional__chain-notice" role="status">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Previous step recorded</strong>
                  <small>{lastCommitSummary}</small>
                </div>
              </div>
            )}

            <RequiredConfessionalDecision
              key={presentation.key}
              decision={decision}
              presentation={presentation}
              onDecisionCommitted={(summary) => {
                setLastCommitSummary(summary)
                setLastReturnCue(presentation.returnCue)
                setLastDecisionType(decision.type)
              }}
            />
          </>
        ) : (
          <div className="required-confessional__complete" role="status">
            <div className="required-confessional__seal" aria-hidden="true">
              ✓
            </div>
            <span>{survival ? `DAY ${game.week}` : 'THE BIG EYE'}</span>
            <h2>{completedTitle}</h2>
            <p>{lastCommitSummary ?? completedCopy}</p>
            <small>{completedCopy}</small>
            <button type="button" onClick={() => onReturnToGame(lastReturnCue)}>
              Return to game
            </button>
          </div>
        )}
      </section>

      <footer className="required-confessional__footer">
        <span>Other Confessional features are paused during required decisions.</span>
        <span>{alivePlayers.length} contestants remain</span>
      </footer>
    </main>
  )
}
