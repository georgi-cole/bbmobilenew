import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useBlocker } from 'react-router'
import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { useAppSelector } from '../../store/hooks'
import RequiredConfessionalDecision from './RequiredConfessionalDecision'
import { getRequiredConfessionalPresentation } from './requiredConfessionalPresentation'
import './DiaryRoom.css'
import './RequiredConfessionalSession.css'

interface Props {
  decision: ActiveConfessionalDecision | null
  onReturnToGame: (returnCue: string) => void
}

const CLASSIC_ENTRY_MS = 1320
const SURVIVAL_ENTRY_MS = 900
const CLASSIC_RETURN_MS = 1050
const SURVIVAL_RETURN_MS = 560
const CONFESSIONAL_DOOR_SRC = `${import.meta.env.BASE_URL}assets/diary-room/confessional-locked-door.png`

export default function RequiredConfessionalSession({ decision, onReturnToGame }: Props) {
  const game = useAppSelector((state) => state.game)
  const survival = game.mode === 'survival'
  const [entryActive, setEntryActive] = useState(true)
  const [lastReturnCue, setLastReturnCue] = useState('game')
  const [lastDecisionType, setLastDecisionType] = useState<
    ActiveConfessionalDecision['type'] | null
  >(decision?.type ?? null)
  const navigationBlocker = useBlocker(decision !== null)

  const presentation = useMemo(
    () => (decision ? getRequiredConfessionalPresentation(decision, game) : null),
    [decision, game]
  )

  const entryDuration = survival ? SURVIVAL_ENTRY_MS : CLASSIC_ENTRY_MS

  useEffect(() => {
    const timeout = window.setTimeout(() => setEntryActive(false), entryDuration)
    return () => window.clearTimeout(timeout)
  }, [entryDuration])

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

  return (
    <main
      className="diary-room required-confessional"
      data-testid="required-confessional-session"
      data-decision-type={decision?.type ?? lastDecisionType ?? undefined}
    >
      {entryActive && (
        <div
          className="diary-room__entry-overlay required-confessional__entry-overlay"
          aria-hidden="true"
          style={
            {
              '--diary-room-entry-overlay-ms': `${entryDuration}ms`,
            } as CSSProperties
          }
        >
          <div className="diary-room__entry-stage">
            <div className="diary-room__entry-light" />
            <div className="diary-room__entry-threshold" />
            <div className="diary-room__entry-doorway">
              <div className="diary-room__entry-header-ornament" />
              <div className="diary-room__entry-seam" />
              <div className="diary-room__entry-door diary-room__entry-door--left">
                <img
                  className="diary-room__entry-door-image diary-room__entry-door-image--left"
                  src={CONFESSIONAL_DOOR_SRC}
                  alt=""
                />
              </div>
              <div className="diary-room__entry-door diary-room__entry-door--right">
                <img
                  className="diary-room__entry-door-image diary-room__entry-door-image--right"
                  src={CONFESSIONAL_DOOR_SRC}
                  alt=""
                />
              </div>
            </div>
          </div>
          <div className="diary-room__entry-copy">
            <span className="diary-room__entry-eyebrow">Confessional</span>
            <strong>The Big Eye is ready for you.</strong>
          </div>
        </div>
      )}

      <div
        className={`diary-room__shell${entryActive ? ' diary-room__shell--masked' : ''}`}
        data-testid="required-confessional-shell"
      >
        <header className="diary-room__header required-confessional__header">
          <span className="required-confessional__header-spacer" aria-hidden="true" />
          <h1 className="diary-room__title">🚪 Confessional</h1>
        </header>

        <div className="diary-room__body required-confessional__body">
          <div className="diary-room__confess required-confessional__confess">
            <p className="diary-room__prompt">
              &quot;You are now in the Confessional. No one can hear you. Speak freely.&quot;
            </p>

            <div className="diary-room__chat required-confessional__chat" aria-live="polite">
              {decision && presentation ? (
                <div className="diary-room__bubble diary-room__bubble--bb diary-room__bubble--decision required-confessional__decision-bubble">
                  <span className="diary-room__bubble-author">📺 The Big Eye</span>
                  <strong className="required-confessional__decision-title">
                    {presentation.title}
                  </strong>
                  <span className="diary-room__bubble-text">{presentation.prompt}</span>

                  <RequiredConfessionalDecision
                    key={presentation.key}
                    decision={decision}
                    presentation={presentation}
                    onDecisionCommitted={() => {
                      setLastReturnCue(presentation.returnCue)
                      setLastDecisionType(decision.type)
                    }}
                  />
                </div>
              ) : (
                <div className="diary-room__bubble diary-room__bubble--bb required-confessional__complete">
                  <span className="diary-room__bubble-author">📺 The Big Eye</span>
                  <span className="diary-room__bubble-text">
                    Your decision has been recorded. Return to the house.
                  </span>
                  <button
                    className="diary-room__submit required-confessional__return"
                    type="button"
                    onClick={() => onReturnToGame(lastReturnCue)}
                  >
                    Return to the House
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
