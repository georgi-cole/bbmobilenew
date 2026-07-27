import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import type { Player } from '../../types'
import { store } from '../../store/store'
import { normalisePublicSaveVoteShares } from '../../publicOpinion/PublicSaveService'
import { completeDramaPublicSave } from '../../publicOpinion/DramaPublicSaveIntegration'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './PublicSaveReveal.css'

export interface PublicSaveRevealProps {
  nominees: Player[]
  /** Raw approval values are converted to save-vote shares totalling exactly 100%. */
  approvals: Record<string, number>
  savedId: string
  onDone: () => void
}

type AnimPhase = 'entering' | 'revealing' | 'saved' | 'exiting'

const ENTER_TO_REVEAL_MS = 900
const REVEAL_VALUES_MS = 5000
const SHOW_SAVED_MS = 7600
const EXIT_MS = 9300
const DONE_MS = 10000

function formatShare(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`
}

function NormalPublicSaveReveal({
  nominees,
  voteShares,
  savedId,
  onDone,
}: {
  nominees: Player[]
  voteShares: Record<string, number>
  savedId: string
  onDone: () => void
}) {
  const [phase, setPhase] = useState<AnimPhase>('entering')
  const [valuesRevealed, setValuesRevealed] = useState(false)
  const timersRef = useRef<number[]>([])
  const doneRef = useRef(false)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  const fireDone = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    clearTimers()
    onDone()
  }, [clearTimers, onDone])

  useEffect(() => {
    doneRef.current = false

    if (document.body.classList.contains('no-animations')) {
      fireDone()
      return
    }

    timersRef.current = [
      window.setTimeout(() => setPhase('revealing'), ENTER_TO_REVEAL_MS),
      window.setTimeout(() => setValuesRevealed(true), REVEAL_VALUES_MS),
      window.setTimeout(() => setPhase('saved'), SHOW_SAVED_MS),
      window.setTimeout(() => setPhase('exiting'), EXIT_MS),
      window.setTimeout(() => fireDone(), DONE_MS),
    ]

    return clearTimers
  }, [clearTimers, fireDone])

  return (
    <div
      className={`psr psr--${phase}`}
      role="status"
      aria-live="assertive"
      aria-label={`Public Save: ${nominees.find((nominee) => nominee.id === savedId)?.name ?? ''} is saved`}
    >
      <div className="psr__panel">
        <div className="psr__heading">
          <span className="psr__heading-eyebrow">Public Save</span>
          <p className="psr__heading-sub">
            Before safety battle, the player with highest public support is saved.
          </p>
        </div>

        <div className="psr__nominees">
          {nominees.map((player, index) => {
            const isSaved = player.id === savedId
            const voteShare = voteShares[player.id] ?? 0
            const formattedShare = formatShare(voteShare)
            return (
              <div
                key={player.id}
                className={[
                  'psr__nominee',
                  isSaved && (phase === 'saved' || phase === 'exiting')
                    ? 'psr__nominee--saved'
                    : '',
                  !isSaved && (phase === 'saved' || phase === 'exiting')
                    ? 'psr__nominee--nominated'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    '--stagger': index,
                    '--pending-width': `${32 + index * 6}%`,
                    '--pending-delay': `${index * 140}ms`,
                  } as CSSProperties
                }
              >
                <div className="psr__avatar-wrap">
                  <PlayerAvatar player={player} size="sm" />
                </div>
                <span className="psr__name">{player.name}</span>
                <div className="psr__bar-track">
                  <div
                    className={`psr__bar-motion${!valuesRevealed ? ' psr__bar-motion--pending' : ''}`}
                  >
                    <div
                      className="psr__bar-fill"
                      style={{
                        width:
                          phase === 'entering'
                            ? '0%'
                            : valuesRevealed
                              ? `${voteShare}%`
                              : 'var(--pending-width)',
                      }}
                      aria-label={`${player.name} save vote: ${valuesRevealed ? formattedShare : 'pending reveal'}`}
                    />
                  </div>
                </div>
                <span className="psr__approval-value">
                  {valuesRevealed ? formattedShare : '?? %'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Public Save uses the established Normal Mode presentation in every mode.
 * Drama Mode keeps its premium relationship and story consequences behind the
 * scenes, but it no longer replaces the reveal with Audience Verdict UI.
 */
export default function PublicSaveReveal({
  nominees,
  approvals,
  savedId,
  onDone,
}: PublicSaveRevealProps) {
  const currentState = store.getState()
  const dramaModeEnabled =
    currentState.settings.gameUX.dramaMode === true && currentState.game.publicModeEnabled === true
  const nomineeIds = nominees.map((nominee) => nominee.id)
  const voteShares = normalisePublicSaveVoteShares(nomineeIds, approvals)

  const handleDone = () => {
    // The established result announcement reads this same object. Mutating it
    // preserves that flow while replacing absolute approval with vote shares.
    Object.assign(approvals, voteShares)

    if (dramaModeEnabled) {
      const winningShare = voteShares[savedId] ?? 0
      const runnerUpShare = Math.max(
        0,
        ...nomineeIds
          .filter((nomineeId) => nomineeId !== savedId)
          .map((nomineeId) => voteShares[nomineeId] ?? 0)
      )
      completeDramaPublicSave(
        nomineeIds,
        {
          savedId,
          winningShare,
          winningMargin: Math.max(0, winningShare - runnerUpShare),
        },
        { commitGameplay: false }
      )
    }

    onDone()
  }

  return (
    <NormalPublicSaveReveal
      nominees={nominees}
      voteShares={voteShares}
      savedId={savedId}
      onDone={handleDone}
    />
  )
}
