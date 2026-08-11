import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useBlocker } from 'react-router'
import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { setConfessionalMusicMode } from '../../store/uiSlice'
import {
  selectDramaNetwork,
  selectPersistentSocialHistory,
  selectWeekStartRelSnapshot,
} from '../../social/socialSlice'
import { getEffectiveSocialMode } from '../../social/socialMode'
import HousePulse from '../../components/HousePulse/HousePulse'
import RequiredConfessionalDecision from './RequiredConfessionalDecision'
import {
  getRequiredConfessionalPresentation,
  type RequiredConfessionalPresentation,
} from './requiredConfessionalPresentation'
import './DiaryRoom.css'
import './RequiredConfessionalSession.css'
import './RequiredConfessionalSessionFixes.css'

interface Props {
  decision: ActiveConfessionalDecision | null
  onReturnToGame: (returnCue: string) => void
}

const CLASSIC_ENTRY_MS = 1320
const SURVIVAL_ENTRY_MS = 900
const CONFESSIONAL_DOOR_SRC = `${import.meta.env.BASE_URL}assets/diary-room/confessional-locked-door.png`
const VOTE_DECISION_TYPES = new Set<ActiveConfessionalDecision['type']>([
  'eviction_vote',
  'double_vote',
  'tie_break',
])

export default function RequiredConfessionalSession({ decision, onReturnToGame }: Props) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const settings = useAppSelector((state) => state.settings)
  const vip = useAppSelector((state) => state.vip)
  const socialState = useAppSelector((state) => state.social)
  const dramaNetwork = useAppSelector(selectDramaNetwork)
  const actionHistory = useAppSelector(selectPersistentSocialHistory)
  const weekStartRelSnapshot = useAppSelector(selectWeekStartRelSnapshot)
  const survival = game.mode === 'survival'
  const humanPlayer = game.players.find((player) => player.isUser)
  const cupidPairsActive = game.cupidArrow?.status === 'active'
  const showVoxMyGame =
    decision?.type === 'nominations' &&
    game.voxPopuli?.status === 'active' &&
    humanPlayer != null &&
    getEffectiveSocialMode({ game, settings, vip }) === 'drama'
  const [entryActive, setEntryActive] = useState(true)
  const [lastReturnCue, setLastReturnCue] = useState('game')
  const [lastDecisionType, setLastDecisionType] = useState<
    ActiveConfessionalDecision['type'] | null
  >(decision?.type ?? null)
  const [completedDecision, setCompletedDecision] = useState<ActiveConfessionalDecision | null>(null)
  const [completedPresentation, setCompletedPresentation] =
    useState<RequiredConfessionalPresentation | null>(null)
  const [decisionComplete, setDecisionComplete] = useState(false)
  const navigationBlocker = useBlocker(decision !== null)
  const presentation = useMemo(
    () => (decision ? getRequiredConfessionalPresentation(decision, game) : null),
    [decision, game]
  )
  const displayDecision = decision ?? completedDecision
  const displayPresentation = presentation ?? completedPresentation

  const entryDuration = survival ? SURVIVAL_ENTRY_MS : CLASSIC_ENTRY_MS

  useEffect(() => {
    dispatch(setConfessionalMusicMode('normal'))
    return () => {
      dispatch(setConfessionalMusicMode('normal'))
    }
  }, [dispatch])

  useEffect(() => {
    const timeout = window.setTimeout(() => setEntryActive(false), entryDuration)
    return () => window.clearTimeout(timeout)
  }, [entryDuration])

  useEffect(() => {
    if (navigationBlocker.state === 'blocked') navigationBlocker.reset()
  }, [navigationBlocker])

  useEffect(() => {
    if (!decision) return
    setDecisionComplete(false)
    setCompletedDecision(null)
    setCompletedPresentation(null)
    setLastDecisionType(decision.type)
    dispatch(setConfessionalMusicMode('normal'))
  }, [decision, dispatch])

  const handleReturnToGame = () => {
    dispatch(setConfessionalMusicMode('normal'))
    onReturnToGame(lastReturnCue)
  }

  return (
    <main
      className="diary-room required-confessional"
      data-testid="required-confessional-session"
      data-decision-type={displayDecision?.type ?? lastDecisionType ?? undefined}
      data-cupid-pairs={cupidPairsActive ? 'true' : 'false'}
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

            {showVoxMyGame && humanPlayer && (
              <aside className="required-confessional__my-game" aria-label="My Game">
                <p>Review your relationships before locking in your secret nominations.</p>
                <HousePulse
                  network={dramaNetwork}
                  players={game.players}
                  humanId={humanPlayer.id}
                  actionHistory={actionHistory}
                  relationships={socialState.relationships ?? {}}
                  weekStartRelSnapshot={weekStartRelSnapshot}
                  currentWeek={game.week}
                  reality={socialState.reality}
                />
              </aside>
            )}

            <div className="diary-room__chat required-confessional__chat" aria-live="polite">
              {displayDecision && displayPresentation ? (
                <div className="diary-room__bubble diary-room__bubble--bb diary-room__bubble--decision required-confessional__decision-bubble">
                  <span className="diary-room__bubble-author">📺 The Big Eye</span>
                  <strong className="required-confessional__decision-title">
                    {displayPresentation.title}
                  </strong>
                  <span className="diary-room__bubble-text">{displayPresentation.prompt}</span>

                  <RequiredConfessionalDecision
                    key={displayPresentation.key}
                    decision={displayDecision}
                    presentation={displayPresentation}
                    onDecisionCommitted={() => {
                      setLastReturnCue(displayPresentation.returnCue)
                      setLastDecisionType(displayDecision.type)
                      setCompletedDecision(displayDecision)
                      setCompletedPresentation(displayPresentation)
                      setDecisionComplete(true)
                      if (VOTE_DECISION_TYPES.has(displayDecision.type)) {
                        dispatch(setConfessionalMusicMode('vote-committed'))
                      }
                    }}
                  />

                  {decisionComplete && (
                    <div className="required-confessional__complete">
                      <span className="diary-room__bubble-text">
                        Your decision has been recorded. Return to the house when you are ready.
                      </span>
                      <button
                        className="diary-room__submit required-confessional__return"
                        type="button"
                        onClick={handleReturnToGame}
                      >
                        Return to the House
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="diary-room__bubble diary-room__bubble--bb required-confessional__complete">
                  <span className="diary-room__bubble-author">📺 The Big Eye</span>
                  <span className="diary-room__bubble-text">
                    Your decision has been recorded. Return to the house when you are ready.
                  </span>
                  <button
                    className="diary-room__submit required-confessional__return"
                    type="button"
                    onClick={handleReturnToGame}
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
