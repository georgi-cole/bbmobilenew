/**
 * ConfessionalDecisionPanel
 *
 * Renders chat-native decision controls for all non-endgame ceremony choices
 * that have been rerouted into the Confessional.
 */

import { useState, type CSSProperties } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  commitNominees,
  submitHumanVote,
  submitHumanDoubleVote,
  activateDoubleVoteReward,
  declineDoubleVoteReward,
  activateMissionImmunityReward,
  declineMissionImmunityReward,
  submitPovDecision,
  submitVipSecondUseDecision,
  submitPovSaveTarget,
  submitVipSecondSaveTarget,
  setReplacementNominee,
  submitDiamondReplacement,
  submitCoupReplacement,
  submitTieBreak,
  submitPosTieBreak,
  submitDoubleEvictionTieBreak,
  selectAlivePlayers,
} from '../../store/gameSlice'
import { calculateRequiredDoubleEvictionSlots } from '../../features/twists/doubleEvictionTieUtils'
import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import type { Player } from '../../types'
import PlayerAvatar from '../../components/PlayerAvatar/PlayerAvatar'
import { expandCupidIds, isCupidArrowActive } from '../../features/twists/cupidArrow'
import { getConfessionalPowerName } from './confessionalDecisionPresentation'
import { buildConfessionalDecisionUnits, type ConfessionalDecisionUnit } from './cupidDecisionUnits'
import './ConfessionalDecisionPanel.css'

interface DecisionPanelProps {
  onDecisionCommitted?: (summary: string) => void
}

function formatNameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function PlayerRow({
  player,
  selected,
  onClick,
  danger = false,
  label,
  disabled = false,
}: {
  player: Player
  selected: boolean
  onClick: () => void
  danger?: boolean
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      className={[
        'cdp-option',
        selected ? 'cdp-option--selected' : '',
        danger ? 'cdp-option--danger' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
    >
      <PlayerAvatar player={player} selected={selected} size="md" />
      <span className="cdp-option__name">{player.name}</span>
      {label && <span className="cdp-option__tag">{label}</span>}
    </button>
  )
}

function DecisionUnitRow({
  unit,
  selected,
  onClick,
  danger = false,
  label,
  disabled = false,
}: {
  unit: ConfessionalDecisionUnit
  selected: boolean
  onClick: () => void
  danger?: boolean
  label?: string
  disabled?: boolean
}) {
  if (unit.players.length === 1) {
    return (
      <PlayerRow
        player={unit.players[0]}
        selected={selected}
        onClick={onClick}
        danger={danger}
        label={label}
        disabled={disabled}
      />
    )
  }

  return (
    <button
      className={[
        'cdp-option',
        'cdp-option--pair',
        selected ? 'cdp-option--selected' : '',
        danger ? 'cdp-option--danger' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      type="button"
      onClick={onClick}
      aria-label={`${unit.label}, Pair ${unit.pairNumber}`}
      aria-pressed={selected}
      disabled={disabled}
      style={{ '--cdp-pair-color': unit.pairColor } as CSSProperties}
    >
      <span className="cdp-option__pair-avatars" aria-hidden="true">
        {unit.players.map((player) => (
          <PlayerAvatar key={player.id} player={player} selected={selected} size="md" />
        ))}
      </span>
      <span className="cdp-option__name">{unit.label}</span>
      <span className="cdp-option__pair-dot" aria-hidden="true">
        {unit.pairNumber}
      </span>
      {label && <span className="cdp-option__tag">{label}</span>}
    </button>
  )
}

function NominationsPanel({ onDecisionCommitted }: DecisionPanelProps) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const isDoubleEviction = Boolean(game.doubleEviction?.weekActive)
  const required = isDoubleEviction ? 3 : 2
  const lohIds = new Set(expandCupidIds(game, game.lohId ? [game.lohId] : []))
  const options = alivePlayers.filter((p) => !lohIds.has(p.id))
  const optionUnits = buildConfessionalDecisionUnits(game, options)
  const canUsePublicNomineeRule = (game.publicModeEnabled ?? false) && !isDoubleEviction
  const autoNomineeId = canUsePublicNomineeRule ? (game.lastHohCompFinisherId ?? null) : null

  const [selected, setSelected] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  function toggle(id: string) {
    if (submitting || id === autoNomineeId) return
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length < required) return [...prev, id]
      return [...prev.slice(1), id]
    })
  }

  const canConfirm = selected.length === required

  function handleConfirm() {
    if (!canConfirm || submitting) return
    setSubmitting(true)
    const selectedNames = selected
      .map((id) => optionUnits.find((unit) => unit.id === id)?.label)
      .filter((name): name is string => Boolean(name))
    const autoNomineeName = autoNomineeId
      ? (optionUnits.find((unit) => unit.memberIds.includes(autoNomineeId))?.label ?? null)
      : null
    const nominationSummary = autoNomineeName
      ? `I nominate ${formatNameList(selectedNames)}. ${autoNomineeName} is automatically added as the public auto-nominee.`
      : `I nominate ${formatNameList(selectedNames)}.`
    onDecisionCommitted?.(nominationSummary)
    dispatch(commitNominees(selected))
  }

  return (
    <div className="cdp-shell" data-testid="confessional-decision-options">
      <div className="cdp-option-grid" role="group" aria-label="Nomination choices">
        {optionUnits.map((unit) => {
          const isAuto = autoNomineeId ? unit.memberIds.includes(autoNomineeId) : false
          return (
            <DecisionUnitRow
              key={unit.id}
              unit={unit}
              selected={selected.includes(unit.id) || isAuto}
              onClick={() => toggle(unit.id)}
              label={isAuto ? 'Auto-Nominee' : undefined}
              disabled={submitting || isAuto}
            />
          )
        })}
      </div>
      <p className="cdp-hint">
        {canConfirm
          ? `Ready to confirm ${required} nomination${required > 1 ? 's' : ''}.`
          : `Choose ${required - selected.length} more player${required - selected.length === 1 ? '' : 's'}.`}
      </p>
      {canConfirm && (
        <button
          className="cdp-confirm-btn"
          type="button"
          disabled={submitting}
          onClick={handleConfirm}
        >
          Confirm nominations
        </button>
      )}
    </div>
  )
}

function EvictionVotePanel({ onDecisionCommitted }: DecisionPanelProps) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))
  const optionUnits = buildConfessionalDecisionUnits(game, options)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleSelect(id: string) {
    if (submitting) return
    setSelectedId(id)
    setSubmitting(true)
    const name = optionUnits.find((unit) => unit.id === id)?.label ?? 'that pair'
    onDecisionCommitted?.(
      isCupidArrowActive(game) ? `Our pair casts both votes against ${name}.` : `I choose ${name}.`
    )
    dispatch(submitHumanVote(id))
  }

  return (
    <div className="cdp-shell" data-testid="confessional-decision-options">
      <div className="cdp-option-grid" role="group" aria-label="Eviction vote choices">
        {optionUnits.map((unit) => (
          <DecisionUnitRow
            key={unit.id}
            unit={unit}
            selected={unit.id === selectedId}
            onClick={() => handleSelect(unit.id)}
            danger
            disabled={submitting}
          />
        ))}
      </div>
    </div>
  )
}

function DoubleVoteOfferPanel({ onDecisionCommitted }: DecisionPanelProps) {
  const dispatch = useAppDispatch()
  const [choice, setChoice] = useState<'yes' | 'no' | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function submitChoice(nextChoice: 'yes' | 'no') {
    if (submitting) return
    setChoice(nextChoice)
    setSubmitting(true)
    onDecisionCommitted?.(
      nextChoice === 'yes' ? 'I will use my Double Vote.' : 'I will not use my Double Vote.'
    )
    if (nextChoice === 'yes') dispatch(activateDoubleVoteReward())
    else dispatch(declineDoubleVoteReward())
  }

  return (
    <div className="cdp-shell" data-testid="confessional-decision-options">
      <div className="cdp-choice-row" role="group" aria-label="Double Vote choice">
        <button
          className={`cdp-binary-btn${choice === 'yes' ? ' cdp-binary-btn--selected' : ''}`}
          type="button"
          onClick={() => submitChoice('yes')}
          aria-pressed={choice === 'yes'}
          disabled={submitting}
        >
          🗳️ Use power
        </button>
        <button
          className={`cdp-binary-btn${choice === 'no' ? ' cdp-binary-btn--selected' : ''}`}
          type="button"
          onClick={() => submitChoice('no')}
          aria-pressed={choice === 'no'}
          disabled={submitting}
        >
          ✋ Do not use
        </button>
      </div>
    </div>
  )
}

function MissionImmunityOfferPanel({ onDecisionCommitted }: DecisionPanelProps) {
  const dispatch = useAppDispatch()
  const duration = useAppSelector((state) => state.game.secretMission?.reward?.durationDays ?? 1)
  const [choice, setChoice] = useState<'yes' | 'no' | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function submitChoice(nextChoice: 'yes' | 'no') {
    if (submitting) return
    setChoice(nextChoice)
    setSubmitting(true)
    onDecisionCommitted?.(
      nextChoice === 'yes'
        ? `I will use my ${duration}-day secret immunity now.`
        : 'I will hold my secret immunity for later.'
    )
    if (nextChoice === 'yes') dispatch(activateMissionImmunityReward())
    else dispatch(declineMissionImmunityReward())
  }

  return (
    <div className="cdp-shell" data-testid="confessional-decision-options">
      <div className="cdp-choice-row" role="group" aria-label="Secret immunity choice">
        <button
          className={`cdp-binary-btn${choice === 'yes' ? ' cdp-binary-btn--selected' : ''}`}
          type="button"
          onClick={() => submitChoice('yes')}
          aria-pressed={choice === 'yes'}
          disabled={submitting}
        >
          🛡️ Use immunity
        </button>
        <button
          className={`cdp-binary-btn${choice === 'no' ? ' cdp-binary-btn--selected' : ''}`}
          type="button"
          onClick={() => submitChoice('no')}
          aria-pressed={choice === 'no'}
          disabled={submitting}
        >
          ✋ Save it
        </button>
      </div>
    </div>
  )
}

function DoubleVotePanel({ onDecisionCommitted }: DecisionPanelProps) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  const [vote1, setVote1] = useState<string | null>(null)
  const [vote2, setVote2] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canConfirm = vote1 !== null && vote2 !== null

  function handleConfirm() {
    if (!canConfirm || submitting || !vote1 || !vote2) return
    setSubmitting(true)
    const vote1Name = options.find((player) => player.id === vote1)?.name ?? 'that nominee'
    const vote2Name = options.find((player) => player.id === vote2)?.name ?? 'that nominee'
    onDecisionCommitted?.(
      vote1 === vote2
        ? `I cast both votes against ${vote1Name}.`
        : `I cast my votes against ${formatNameList([vote1Name, vote2Name])}.`
    )
    dispatch(submitHumanDoubleVote([vote1, vote2]))
  }

  return (
    <div className="cdp-shell" data-testid="confessional-decision-options">
      <div className="cdp-section">
        <p className="cdp-section__label">Vote 1</p>
        <div className="cdp-option-grid" role="group" aria-label="First eviction vote choice">
          {options.map((p) => (
            <PlayerRow
              key={`v1-${p.id}`}
              player={p}
              selected={vote1 === p.id}
              onClick={() => setVote1(p.id)}
              danger
              disabled={submitting}
            />
          ))}
        </div>
      </div>
      <div className="cdp-section">
        <p className="cdp-section__label">Vote 2</p>
        <div className="cdp-option-grid" role="group" aria-label="Second eviction vote choice">
          {options.map((p) => (
            <PlayerRow
              key={`v2-${p.id}`}
              player={p}
              selected={vote2 === p.id}
              onClick={() => setVote2(p.id)}
              danger
              disabled={submitting}
            />
          ))}
        </div>
      </div>
      <p className="cdp-hint">
        {!vote1
          ? 'Choose your first vote.'
          : !vote2
            ? 'Choose your second vote.'
            : 'Both votes are ready.'}
      </p>
      {canConfirm && (
        <button
          className="cdp-confirm-btn cdp-confirm-btn--danger"
          type="button"
          disabled={submitting}
          onClick={handleConfirm}
        >
          Confirm both votes
        </button>
      )}
    </div>
  )
}

function PosDecisionPanel({ onDecisionCommitted }: DecisionPanelProps) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const powerName = getConfessionalPowerName(game)
  const [choice, setChoice] = useState<'yes' | 'no' | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function submitChoice(nextChoice: 'yes' | 'no') {
    if (submitting) return
    setChoice(nextChoice)
    setSubmitting(true)
    onDecisionCommitted?.(
      nextChoice === 'yes' ? `I will use ${powerName}.` : `I will not use ${powerName}.`
    )
    dispatch(submitPovDecision(nextChoice === 'yes'))
  }

  return (
    <div className="cdp-shell" data-testid="confessional-decision-options">
      <div className="cdp-choice-row" role="group" aria-label={`${powerName} choice`}>
        <button
          className={`cdp-binary-btn${choice === 'yes' ? ' cdp-binary-btn--selected' : ''}`}
          type="button"
          onClick={() => submitChoice('yes')}
          aria-pressed={choice === 'yes'}
          disabled={submitting}
        >
          ✅ Use power
        </button>
        <button
          className={`cdp-binary-btn${choice === 'no' ? ' cdp-binary-btn--selected' : ''}`}
          type="button"
          onClick={() => submitChoice('no')}
          aria-pressed={choice === 'no'}
          disabled={submitting}
        >
          ✋ Do not use
        </button>
      </div>
    </div>
  )
}

function VipSecondUsePanel({ onDecisionCommitted }: DecisionPanelProps) {
  const dispatch = useAppDispatch()
  const [choice, setChoice] = useState<'yes' | 'no' | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function submitChoice(nextChoice: 'yes' | 'no') {
    if (submitting) return
    setChoice(nextChoice)
    setSubmitting(true)
    onDecisionCommitted?.(
      nextChoice === 'yes'
        ? 'I will use Double Trouble again.'
        : 'I will not use Double Trouble again.'
    )
    dispatch(submitVipSecondUseDecision(nextChoice === 'yes'))
  }

  return (
    <div className="cdp-shell" data-testid="confessional-decision-options">
      <div className="cdp-choice-row" role="group" aria-label="Double Trouble second-use choice">
        <button
          className={`cdp-binary-btn${choice === 'yes' ? ' cdp-binary-btn--selected' : ''}`}
          type="button"
          onClick={() => submitChoice('yes')}
          aria-pressed={choice === 'yes'}
          disabled={submitting}
        >
          👑 Use power
        </button>
        <button
          className={`cdp-binary-btn${choice === 'no' ? ' cdp-binary-btn--selected' : ''}`}
          type="button"
          onClick={() => submitChoice('no')}
          aria-pressed={choice === 'no'}
          disabled={submitting}
        >
          ✋ Do not use
        </button>
      </div>
    </div>
  )
}

function PosSaveTargetPanel({ onDecisionCommitted }: DecisionPanelProps) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const isVipSecondSave = Boolean(game.specialVeto?.awaitingVipSecondSaveTarget)
  const options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))
  const optionUnits = buildConfessionalDecisionUnits(game, options)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleSelect(id: string) {
    if (submitting) return
    setSelectedId(id)
    setSubmitting(true)
    const name = optionUnits.find((unit) => unit.id === id)?.label ?? 'that nominee pair'
    onDecisionCommitted?.(`I save ${name}.`)
    dispatch(isVipSecondSave ? submitVipSecondSaveTarget(id) : submitPovSaveTarget(id))
  }

  return (
    <div className="cdp-shell" data-testid="confessional-decision-options">
      <div className="cdp-option-grid" role="group" aria-label="Save target choices">
        {optionUnits.map((unit) => (
          <DecisionUnitRow
            key={unit.id}
            unit={unit}
            selected={unit.id === selectedId}
            onClick={() => handleSelect(unit.id)}
            disabled={submitting}
          />
        ))}
      </div>
    </div>
  )
}

function ReplacementNomineePanel({ onDecisionCommitted }: DecisionPanelProps) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const isDiamond = Boolean(game.specialVeto?.awaitingHolderReplacement)
  const isCoup1 = Boolean(game.specialVeto?.awaitingCoupReplacement1)
  const isCoup2 = Boolean(game.specialVeto?.awaitingCoupReplacement2)

  const lohUnitIds = new Set(expandCupidIds(game, game.lohId ? [game.lohId] : []))
  const posUnitIds = new Set(expandCupidIds(game, game.posWinnerId ? [game.posWinnerId] : []))
  const replacementBaseOptions = alivePlayers.filter(
    (p) => !lohUnitIds.has(p.id) && !posUnitIds.has(p.id) && !game.nomineeIds.includes(p.id)
  )
  const protectedIds = new Set(game.povProtectedIds ?? [])
  const nonProtected = replacementBaseOptions.filter((p) => !protectedIds.has(p.id))
  const standardOptions = nonProtected.length > 0 ? nonProtected : replacementBaseOptions

  const coupBaseOptions = alivePlayers.filter(
    (p) =>
      !lohUnitIds.has(p.id) &&
      !posUnitIds.has(p.id) &&
      !game.nomineeIds.includes(p.id) &&
      p.id !== game.specialVeto?.coupReplacement1Id
  )
  const coupNonProtected = coupBaseOptions.filter((p) => !protectedIds.has(p.id))
  const neededCount = isCoup1 ? 2 : 1
  const coupOptions = coupNonProtected.length >= neededCount ? coupNonProtected : coupBaseOptions

  const options = isDiamond ? standardOptions : isCoup1 || isCoup2 ? coupOptions : standardOptions
  const optionUnits = buildConfessionalDecisionUnits(game, options)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleSelect(id: string) {
    if (submitting) return
    setSelectedId(id)
    setSubmitting(true)
    const name = optionUnits.find((unit) => unit.id === id)?.label ?? 'that pair'
    onDecisionCommitted?.(`I name ${name} as the backup nominee.`)
    if (isDiamond) dispatch(submitDiamondReplacement(id))
    else if (isCoup1 || isCoup2) dispatch(submitCoupReplacement(id))
    else dispatch(setReplacementNominee(id))
  }

  return (
    <div className="cdp-shell" data-testid="confessional-decision-options">
      <div className="cdp-option-grid" role="group" aria-label="Replacement nominee choices">
        {optionUnits.map((unit) => (
          <DecisionUnitRow
            key={unit.id}
            unit={unit}
            selected={unit.id === selectedId}
            onClick={() => handleSelect(unit.id)}
            disabled={submitting}
          />
        ))}
      </div>
    </div>
  )
}

function TieBreakPanel({ onDecisionCommitted }: DecisionPanelProps) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const tiedIds = game.tiedNomineeIds ?? game.nomineeIds
  const isDoubleEviction = game.doubleEviction?.weekActive === true
  const isPosTieBreak = game.awaitingPosTieBreak === true
  const options = alivePlayers.filter((p) => tiedIds.includes(p.id))
  const optionUnits = buildConfessionalDecisionUnits(game, options)

  const multiSelectCount = isDoubleEviction
    ? calculateRequiredDoubleEvictionSlots(tiedIds.length, Boolean(game.pendingEviction))
    : 1
  const isMulti = isDoubleEviction && multiSelectCount > 1

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  function toggleMulti(id: string) {
    if (submitting) return
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length < multiSelectCount) return [...prev, id]
      return [...prev.slice(1), id]
    })
  }

  function handleSingle(id: string) {
    if (submitting) return
    setSelectedId(id)
    setSubmitting(true)
    const name = optionUnits.find((unit) => unit.id === id)?.label ?? 'that nominee pair'
    onDecisionCommitted?.(`I choose to eliminate ${name}.`)
    if (isPosTieBreak) dispatch(submitPosTieBreak(id))
    else dispatch(submitTieBreak(id))
  }

  function handleConfirm() {
    if (submitting || selectedIds.length !== multiSelectCount) return
    setSubmitting(true)
    const names = selectedIds
      .map((id) => optionUnits.find((unit) => unit.id === id)?.label)
      .filter((name): name is string => Boolean(name))
    onDecisionCommitted?.(`I choose to eliminate ${formatNameList(names)}.`)
    dispatch(submitDoubleEvictionTieBreak(selectedIds))
  }

  return (
    <div className="cdp-shell" data-testid="confessional-decision-options">
      <div className="cdp-option-grid" role="group" aria-label="Tie-break choices">
        {optionUnits.map((unit) => (
          <DecisionUnitRow
            key={unit.id}
            unit={unit}
            selected={isMulti ? selectedIds.includes(unit.id) : unit.id === selectedId}
            onClick={() => {
              if (isMulti) toggleMulti(unit.id)
              else handleSingle(unit.id)
            }}
            danger
            disabled={submitting}
          />
        ))}
      </div>
      {isMulti && (
        <>
          <p className="cdp-hint">
            {selectedIds.length === multiSelectCount
              ? 'All tie-break eliminations are selected.'
              : `Choose ${multiSelectCount - selectedIds.length} more player${multiSelectCount - selectedIds.length === 1 ? '' : 's'}.`}
          </p>
          {selectedIds.length === multiSelectCount && (
            <button
              className="cdp-confirm-btn cdp-confirm-btn--danger"
              type="button"
              disabled={submitting}
              onClick={handleConfirm}
            >
              Confirm eliminations
            </button>
          )}
        </>
      )}
    </div>
  )
}

interface Props {
  decision: ActiveConfessionalDecision
  onDecisionCommitted?: (summary: string) => void
}

export default function ConfessionalDecisionPanel({ decision, onDecisionCommitted }: Props) {
  switch (decision.type) {
    case 'nominations':
      return <NominationsPanel onDecisionCommitted={onDecisionCommitted} />
    case 'eviction_vote':
      return <EvictionVotePanel onDecisionCommitted={onDecisionCommitted} />
    case 'double_vote_offer':
      return <DoubleVoteOfferPanel onDecisionCommitted={onDecisionCommitted} />
    case 'double_vote':
      return <DoubleVotePanel onDecisionCommitted={onDecisionCommitted} />
    case 'mission_immunity_offer':
      return <MissionImmunityOfferPanel onDecisionCommitted={onDecisionCommitted} />
    case 'pos_decision':
      return <PosDecisionPanel onDecisionCommitted={onDecisionCommitted} />
    case 'vip_second_use':
      return <VipSecondUsePanel onDecisionCommitted={onDecisionCommitted} />
    case 'pos_save_target':
      return <PosSaveTargetPanel onDecisionCommitted={onDecisionCommitted} />
    case 'replacement_nominee':
      return <ReplacementNomineePanel onDecisionCommitted={onDecisionCommitted} />
    case 'tie_break':
      return <TieBreakPanel onDecisionCommitted={onDecisionCommitted} />
    default:
      return null
  }
}
