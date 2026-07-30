import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import type { CupidArrowPair, Player } from '../../types'
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
  /** Active Cupid pairs are rendered as one compact, shared-vote TV unit. */
  pairs?: CupidArrowPair[]
  onDone: () => void
}

type PublicSaveDisplayUnit = {
  id: string
  members: Player[]
  label: string
  voteShare: number
  color?: string
}

function buildPublicSaveDisplayUnits(
  nominees: Player[],
  voteShares: Record<string, number>,
  pairs: CupidArrowPair[] = []
): PublicSaveDisplayUnit[] {
  if (pairs.length === 0) {
    return nominees.map((player) => ({
      id: player.id,
      members: [player],
      label: player.name,
      voteShare: voteShares[player.id] ?? 0,
    }))
  }

  const nomineeById = new Map(nominees.map((player) => [player.id, player]))
  const consumedIds = new Set<string>()
  const units: PublicSaveDisplayUnit[] = []
  nominees.forEach((player) => {
    if (consumedIds.has(player.id)) return
    const pair = pairs.find((candidate) => candidate.memberIds.includes(player.id))
    const members = pair
      ? pair.memberIds
          .map((id) => nomineeById.get(id))
          .filter((member): member is Player => Boolean(member))
      : [player]
    members.forEach((member) => consumedIds.add(member.id))
    units.push({
      id: pair?.id ?? player.id,
      members,
      label: members.map((member) => member.name).join(' & '),
      voteShare: members.reduce((sum, member) => sum + (voteShares[member.id] ?? 0), 0),
      color: pair?.color,
    })
  })
  return units
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
  pairs,
  onDone,
}: {
  nominees: Player[]
  voteShares: Record<string, number>
  savedId: string
  pairs?: CupidArrowPair[]
  onDone: () => void
}) {
  const [phase, setPhase] = useState<AnimPhase>('entering')
  const [valuesRevealed, setValuesRevealed] = useState(false)
  const timersRef = useRef<number[]>([])
  const doneRef = useRef(false)
  const displayUnits = buildPublicSaveDisplayUnits(nominees, voteShares, pairs)
  const savedUnit = displayUnits.find((unit) =>
    unit.members.some((member) => member.id === savedId)
  )
  const hasPairedUnits = displayUnits.some((unit) => unit.members.length > 1)

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
      aria-label={`Public Save: ${savedUnit?.label ?? ''} ${savedUnit?.members.length === 2 ? 'are' : 'is'} saved`}
    >
      <div className="psr__panel">
        <div className="psr__heading">
          <span className="psr__heading-eyebrow">Public Save</span>
          <p className="psr__heading-sub">
            Before the safety battle, the {hasPairedUnits ? 'pair' : 'player'} with the highest
            public support is saved.
          </p>
        </div>

        <div className="psr__nominees">
          {displayUnits.map((unit, index) => {
            const isSaved = unit.members.some((member) => member.id === savedId)
            const voteShare = unit.voteShare
            const formattedShare = formatShare(voteShare)
            return (
              <div
                key={unit.id}
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
                    '--pair-color': unit.color,
                  } as CSSProperties
                }
              >
                <div
                  className={`psr__avatar-wrap${unit.members.length > 1 ? ' psr__avatar-wrap--pair' : ''}`}
                >
                  {unit.members.map((member) => (
                    <div className="psr__avatar-member" key={member.id}>
                      <PlayerAvatar player={member} size="sm" />
                    </div>
                  ))}
                </div>
                <span className="psr__name">{unit.label}</span>
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
                      aria-label={`${unit.label} save vote: ${valuesRevealed ? formattedShare : 'pending reveal'}`}
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
  pairs,
  onDone,
}: PublicSaveRevealProps) {
  const currentState = store.getState()
  const dramaModeEnabled =
    currentState.settings.gameUX.dramaMode === true && currentState.game.publicModeEnabled === true
  const nomineeIds = nominees.map((nominee) => nominee.id)
  const voteShares = normalisePublicSaveVoteShares(nomineeIds, approvals)
  const displayUnits = buildPublicSaveDisplayUnits(nominees, voteShares, pairs)

  const handleDone = () => {
    // The established result announcement reads this same object. Mutating it
    // preserves that flow while replacing absolute approval with vote shares.
    Object.assign(approvals, voteShares)

    if (dramaModeEnabled) {
      const winningUnit = displayUnits.find((unit) =>
        unit.members.some((member) => member.id === savedId)
      )
      const winningShare = winningUnit?.voteShare ?? voteShares[savedId] ?? 0
      const runnerUpShare = Math.max(
        0,
        ...displayUnits.filter((unit) => unit.id !== winningUnit?.id).map((unit) => unit.voteShare)
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
      pairs={pairs}
      onDone={handleDone}
    />
  )
}
