import { useMemo, useState } from 'react'
import {
  activateDoubleVoteReward,
  activateMissionImmunityReward,
  commitNominees,
  declineDoubleVoteReward,
  declineMissionImmunityReward,
  selectAlivePlayers,
  setReplacementNominee,
  submitCoupReplacement,
  submitDiamondReplacement,
  submitDoubleEvictionTieBreak,
  submitHumanDoubleVote,
  submitHumanVote,
  submitPosTieBreak,
  submitPovDecision,
  submitPovSaveTarget,
  submitTieBreak,
  submitVipSecondSaveTarget,
  submitVipSecondUseDecision,
} from '../../store/gameSlice'
import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { calculateRequiredDoubleEvictionSlots } from '../../features/twists/doubleEvictionTieUtils'
import PlayerAvatar from '../../components/PlayerAvatar/PlayerAvatar'
import type { Player } from '../../types'
import type { RequiredConfessionalPresentation } from './requiredConfessionalPresentation'

interface Props {
  decision: ActiveConfessionalDecision
  presentation: RequiredConfessionalPresentation
  onDecisionCommitted: (summary: string) => void
}

interface PlayerCardProps {
  player: Player
  selected: boolean
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  tag?: string
}

function PlayerCard({
  player,
  selected,
  onSelect,
  danger = false,
  disabled = false,
  tag,
}: PlayerCardProps) {
  return (
    <button
      className={`rcd-player${selected ? ' rcd-player--selected' : ''}${danger ? ' rcd-player--danger' : ''}`}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      disabled={disabled}
    >
      <PlayerAvatar player={player} selected={selected} size="md" />
      <span className="rcd-player__copy">
        <strong>{player.name}</strong>
        {tag && <small>{tag}</small>}
      </span>
      <span className="rcd-player__check" aria-hidden="true">
        {selected ? '✓' : ''}
      </span>
    </button>
  )
}

interface ConfirmTrayProps {
  review: string
  consequence: string
  confirmLabel: string
  disabled: boolean
  danger?: boolean
  committing: boolean
  onConfirm: () => void
}

function ConfirmTray({
  review,
  consequence,
  confirmLabel,
  disabled,
  danger = false,
  committing,
  onConfirm,
}: ConfirmTrayProps) {
  return (
    <div className={`rcd-confirm${danger ? ' rcd-confirm--danger' : ''}`}>
      <div className="rcd-confirm__copy" aria-live="polite">
        <span>Review</span>
        <strong>{review}</strong>
        <small>{consequence}</small>
      </div>
      <button
        className="rcd-confirm__button"
        type="button"
        disabled={disabled || committing}
        onClick={onConfirm}
      >
        {committing ? 'Sealing…' : confirmLabel}
      </button>
    </div>
  )
}

function formatNameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function NominationsDecision({ presentation, onDecisionCommitted }: Omit<Props, 'decision'>) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const isDoubleEviction = game.doubleEviction?.weekActive === true
  const required = isDoubleEviction ? 3 : 2
  const options = alivePlayers.filter((player) => player.id !== game.lohId)
  const autoNomineeId =
    game.publicModeEnabled === true && !isDoubleEviction
      ? (game.lastHohCompFinisherId ?? null)
      : null
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [committing, setCommitting] = useState(false)

  const selectedNames = selectedIds
    .map((id) => options.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  const autoNomineeName = autoNomineeId
    ? (options.find((player) => player.id === autoNomineeId)?.name ?? null)
    : null
  const ready = selectedIds.length === required
  const review = ready
    ? autoNomineeName
      ? `${formatNameList(selectedNames)} · ${autoNomineeName} is automatically added`
      : formatNameList(selectedNames)
    : `Choose ${required - selectedIds.length} more`

  function togglePlayer(id: string) {
    if (committing || id === autoNomineeId) return
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id)
      if (current.length < required) return [...current, id]
      return [...current.slice(1), id]
    })
  }

  function confirm() {
    if (!ready || committing) return
    setCommitting(true)
    dispatch(commitNominees(selectedIds))
    onDecisionCommitted(
      autoNomineeName
        ? `Nominated ${formatNameList(selectedNames)}; ${autoNomineeName} was added automatically.`
        : `Nominated ${formatNameList(selectedNames)}.`
    )
  }

  return (
    <div className="rcd-layout" data-testid="required-confessional-decision">
      <div className="rcd-grid" role="group" aria-label="Nomination choices">
        {options.map((player) => {
          const isAutoNominee = player.id === autoNomineeId
          return (
            <PlayerCard
              key={player.id}
              player={player}
              selected={selectedIds.includes(player.id) || isAutoNominee}
              onSelect={() => togglePlayer(player.id)}
              disabled={committing || isAutoNominee}
              danger
              tag={isAutoNominee ? 'Automatic nominee' : undefined}
            />
          )
        })}
      </div>
      <ConfirmTray
        review={review}
        consequence={presentation.consequence}
        confirmLabel={presentation.confirmLabel}
        disabled={!ready}
        danger
        committing={committing}
        onConfirm={confirm}
      />
    </div>
  )
}

interface SinglePlayerDecisionProps {
  options: Player[]
  presentation: RequiredConfessionalPresentation
  reviewPrefix: string
  danger?: boolean
  tagForPlayer?: (player: Player) => string | undefined
  onCommit: (player: Player) => void
}

function SinglePlayerDecision({
  options,
  presentation,
  reviewPrefix,
  danger = false,
  tagForPlayer,
  onCommit,
}: SinglePlayerDecisionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const selectedPlayer = options.find((player) => player.id === selectedId) ?? null

  function confirm() {
    if (!selectedPlayer || committing) return
    setCommitting(true)
    onCommit(selectedPlayer)
  }

  return (
    <div className="rcd-layout" data-testid="required-confessional-decision">
      <div className="rcd-grid" role="group" aria-label={presentation.title}>
        {options.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            selected={selectedId === player.id}
            onSelect={() => setSelectedId(player.id)}
            disabled={committing}
            danger={danger}
            tag={tagForPlayer?.(player)}
          />
        ))}
      </div>
      <ConfirmTray
        review={selectedPlayer ? `${reviewPrefix} ${selectedPlayer.name}` : 'Select a contestant'}
        consequence={presentation.consequence}
        confirmLabel={presentation.confirmLabel}
        disabled={!selectedPlayer}
        danger={danger}
        committing={committing}
        onConfirm={confirm}
      />
    </div>
  )
}

interface BinaryDecisionProps {
  presentation: RequiredConfessionalPresentation
  yesLabel: string
  noLabel: string
  yesReview: string
  noReview: string
  onCommit: (choice: boolean) => void
}

function BinaryDecision({
  presentation,
  yesLabel,
  noLabel,
  yesReview,
  noReview,
  onCommit,
}: BinaryDecisionProps) {
  const [choice, setChoice] = useState<boolean | null>(null)
  const [committing, setCommitting] = useState(false)

  function confirm() {
    if (choice === null || committing) return
    setCommitting(true)
    onCommit(choice)
  }

  return (
    <div className="rcd-layout" data-testid="required-confessional-decision">
      <div className="rcd-binary" role="group" aria-label={presentation.title}>
        <button
          type="button"
          className={`rcd-binary__option${choice === true ? ' rcd-binary__option--selected' : ''}`}
          aria-pressed={choice === true}
          disabled={committing}
          onClick={() => setChoice(true)}
        >
          <span className="rcd-binary__mark" aria-hidden="true">
            ✓
          </span>
          <strong>{yesLabel}</strong>
        </button>
        <button
          type="button"
          className={`rcd-binary__option${choice === false ? ' rcd-binary__option--selected' : ''}`}
          aria-pressed={choice === false}
          disabled={committing}
          onClick={() => setChoice(false)}
        >
          <span className="rcd-binary__mark" aria-hidden="true">
            —
          </span>
          <strong>{noLabel}</strong>
        </button>
      </div>
      <ConfirmTray
        review={choice === null ? 'Choose one option' : choice ? yesReview : noReview}
        consequence={presentation.consequence}
        confirmLabel={presentation.confirmLabel}
        disabled={choice === null}
        committing={committing}
        onConfirm={confirm}
      />
    </div>
  )
}

function EvictionVoteDecision({ presentation, onDecisionCommitted }: Omit<Props, 'decision'>) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const options = alivePlayers.filter((player) => game.nomineeIds.includes(player.id))

  return (
    <SinglePlayerDecision
      options={options}
      presentation={presentation}
      reviewPrefix="Vote to eliminate"
      danger
      onCommit={(player) => {
        dispatch(submitHumanVote(player.id))
        onDecisionCommitted(`Voted to eliminate ${player.name}.`)
      }}
    />
  )
}

function DoubleVoteOfferDecision({ presentation, onDecisionCommitted }: Omit<Props, 'decision'>) {
  const dispatch = useAppDispatch()
  return (
    <BinaryDecision
      presentation={presentation}
      yesLabel="Use Double Vote"
      noLabel="Keep the normal vote"
      yesReview="Activate the stored Double Vote"
      noReview="Do not use the stored Double Vote"
      onCommit={(choice) => {
        dispatch(choice ? activateDoubleVoteReward() : declineDoubleVoteReward())
        onDecisionCommitted(choice ? 'Activated Double Vote.' : 'Kept the normal vote.')
      }}
    />
  )
}

function MissionImmunityDecision({ presentation, onDecisionCommitted }: Omit<Props, 'decision'>) {
  const dispatch = useAppDispatch()
  return (
    <BinaryDecision
      presentation={presentation}
      yesLabel="Use immunity now"
      noLabel="Save immunity"
      yesReview="Activate secret immunity"
      noReview="Hold secret immunity for later"
      onCommit={(choice) => {
        dispatch(choice ? activateMissionImmunityReward() : declineMissionImmunityReward())
        onDecisionCommitted(
          choice ? 'Activated secret immunity.' : 'Saved secret immunity for later.'
        )
      }}
    />
  )
}

function PosDecision({ presentation, onDecisionCommitted }: Omit<Props, 'decision'>) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const powerName =
    game.specialVeto?.activeType === 'vip'
      ? 'Double Trouble'
      : game.specialVeto?.activeType === 'diamond'
        ? 'Halo Exchange'
        : game.specialVeto?.activeType === 'coup'
          ? 'Detox'
          : game.specialVeto?.activeType === 'spotlight'
            ? 'Force Majeure'
            : 'Power of Safety'

  return (
    <BinaryDecision
      presentation={presentation}
      yesLabel={`Use ${powerName}`}
      noLabel="Leave nominations unchanged"
      yesReview={`Activate ${powerName}`}
      noReview={`Do not use ${powerName}`}
      onCommit={(choice) => {
        dispatch(submitPovDecision(choice))
        onDecisionCommitted(choice ? `Activated ${powerName}.` : `Did not use ${powerName}.`)
      }}
    />
  )
}

function VipSecondUseDecision({ presentation, onDecisionCommitted }: Omit<Props, 'decision'>) {
  const dispatch = useAppDispatch()
  return (
    <BinaryDecision
      presentation={presentation}
      yesLabel="Use Double Trouble again"
      noLabel="End the power sequence"
      yesReview="Activate the second use"
      noReview="Do not use the power again"
      onCommit={(choice) => {
        dispatch(submitVipSecondUseDecision(choice))
        onDecisionCommitted(
          choice ? 'Activated Double Trouble again.' : 'Ended the Double Trouble sequence.'
        )
      }}
    />
  )
}

function SaveTargetDecision({ presentation, onDecisionCommitted }: Omit<Props, 'decision'>) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const secondSave = game.specialVeto?.awaitingVipSecondSaveTarget === true
  const options = alivePlayers.filter((player) => game.nomineeIds.includes(player.id))

  return (
    <SinglePlayerDecision
      options={options}
      presentation={presentation}
      reviewPrefix="Save"
      onCommit={(player) => {
        dispatch(secondSave ? submitVipSecondSaveTarget(player.id) : submitPovSaveTarget(player.id))
        onDecisionCommitted(`Saved ${player.name}.`)
      }}
    />
  )
}

function ReplacementDecision({ presentation, onDecisionCommitted }: Omit<Props, 'decision'>) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const isDiamond = game.specialVeto?.awaitingHolderReplacement === true
  const isCoup1 = game.specialVeto?.awaitingCoupReplacement1 === true
  const isCoup2 = game.specialVeto?.awaitingCoupReplacement2 === true
  const protectedIds = useMemo(() => new Set(game.povProtectedIds ?? []), [game.povProtectedIds])

  const standardBase = alivePlayers.filter(
    (player) =>
      player.id !== game.lohId &&
      player.id !== game.posWinnerId &&
      !game.nomineeIds.includes(player.id)
  )
  const standardUnprotected = standardBase.filter((player) => !protectedIds.has(player.id))
  const standardOptions = standardUnprotected.length > 0 ? standardUnprotected : standardBase

  const coupBase = alivePlayers.filter(
    (player) =>
      player.id !== game.lohId &&
      player.id !== game.posWinnerId &&
      !game.nomineeIds.includes(player.id) &&
      player.id !== game.specialVeto?.coupReplacement1Id
  )
  const coupUnprotected = coupBase.filter((player) => !protectedIds.has(player.id))
  const coupRequired = isCoup1 ? 2 : 1
  const coupOptions = coupUnprotected.length >= coupRequired ? coupUnprotected : coupBase
  const options = isDiamond ? standardOptions : isCoup1 || isCoup2 ? coupOptions : standardOptions

  return (
    <SinglePlayerDecision
      options={options}
      presentation={presentation}
      reviewPrefix="Name as replacement:"
      danger
      tagForPlayer={(player) =>
        protectedIds.has(player.id) ? 'Protection override fallback' : undefined
      }
      onCommit={(player) => {
        if (isDiamond) dispatch(submitDiamondReplacement(player.id))
        else if (isCoup1 || isCoup2) dispatch(submitCoupReplacement(player.id))
        else dispatch(setReplacementNominee(player.id))
        onDecisionCommitted(`Named ${player.name} as the replacement nominee.`)
      }}
    />
  )
}

function DoubleVoteDecision({ presentation, onDecisionCommitted }: Omit<Props, 'decision'>) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const options = alivePlayers.filter((player) => game.nomineeIds.includes(player.id))
  const [vote1, setVote1] = useState<string | null>(null)
  const [vote2, setVote2] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const first = options.find((player) => player.id === vote1) ?? null
  const second = options.find((player) => player.id === vote2) ?? null
  const ready = first !== null && second !== null

  function confirm() {
    if (!first || !second || committing) return
    setCommitting(true)
    dispatch(submitHumanDoubleVote([first.id, second.id]))
    onDecisionCommitted(
      first.id === second.id
        ? `Cast both votes against ${first.name}.`
        : `Cast votes against ${first.name} and ${second.name}.`
    )
  }

  return (
    <div className="rcd-layout" data-testid="required-confessional-decision">
      <section className="rcd-vote-step" aria-labelledby="double-vote-one">
        <h3 id="double-vote-one">Vote 1</h3>
        <div className="rcd-grid" role="group" aria-label="First eviction vote">
          {options.map((player) => (
            <PlayerCard
              key={`first-${player.id}`}
              player={player}
              selected={vote1 === player.id}
              onSelect={() => setVote1(player.id)}
              danger
              disabled={committing}
            />
          ))}
        </div>
      </section>
      <section className="rcd-vote-step" aria-labelledby="double-vote-two">
        <h3 id="double-vote-two">Vote 2</h3>
        <div className="rcd-grid" role="group" aria-label="Second eviction vote">
          {options.map((player) => (
            <PlayerCard
              key={`second-${player.id}`}
              player={player}
              selected={vote2 === player.id}
              onSelect={() => setVote2(player.id)}
              danger
              disabled={committing}
            />
          ))}
        </div>
      </section>
      <ConfirmTray
        review={
          ready ? `${first.name} · ${second.name}` : !first ? 'Choose Vote 1' : 'Choose Vote 2'
        }
        consequence={presentation.consequence}
        confirmLabel={presentation.confirmLabel}
        disabled={!ready}
        danger
        committing={committing}
        onConfirm={confirm}
      />
    </div>
  )
}

function TieBreakDecision({ presentation, onDecisionCommitted }: Omit<Props, 'decision'>) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const tiedIds = game.tiedNomineeIds ?? game.nomineeIds
  const options = alivePlayers.filter((player) => tiedIds.includes(player.id))
  const required = game.doubleEviction?.weekActive
    ? calculateRequiredDoubleEvictionSlots(tiedIds.length, Boolean(game.pendingEviction))
    : 1
  const isMulti = required > 1
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [committing, setCommitting] = useState(false)
  const selectedPlayers = selectedIds
    .map((id) => options.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player))
  const ready = selectedPlayers.length === required

  function toggle(id: string) {
    if (committing) return
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id)
      if (current.length < required) return [...current, id]
      return [...current.slice(1), id]
    })
  }

  function confirm() {
    if (!ready || committing) return
    setCommitting(true)
    if (isMulti) dispatch(submitDoubleEvictionTieBreak(selectedIds))
    else if (game.awaitingPosTieBreak) dispatch(submitPosTieBreak(selectedIds[0]))
    else dispatch(submitTieBreak(selectedIds[0]))
    onDecisionCommitted(
      `Chose to eliminate ${formatNameList(selectedPlayers.map((player) => player.name))}.`
    )
  }

  return (
    <div className="rcd-layout" data-testid="required-confessional-decision">
      <div className="rcd-grid" role="group" aria-label="Tie-break choices">
        {options.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            selected={selectedIds.includes(player.id)}
            onSelect={() => toggle(player.id)}
            danger
            disabled={committing}
          />
        ))}
      </div>
      <ConfirmTray
        review={
          ready
            ? formatNameList(selectedPlayers.map((player) => player.name))
            : `Choose ${required - selectedPlayers.length} more`
        }
        consequence={presentation.consequence}
        confirmLabel={presentation.confirmLabel}
        disabled={!ready}
        danger
        committing={committing}
        onConfirm={confirm}
      />
    </div>
  )
}

export default function RequiredConfessionalDecision({
  decision,
  presentation,
  onDecisionCommitted,
}: Props) {
  switch (decision.type) {
    case 'nominations':
      return (
        <NominationsDecision
          presentation={presentation}
          onDecisionCommitted={onDecisionCommitted}
        />
      )
    case 'eviction_vote':
      return (
        <EvictionVoteDecision
          presentation={presentation}
          onDecisionCommitted={onDecisionCommitted}
        />
      )
    case 'double_vote_offer':
      return (
        <DoubleVoteOfferDecision
          presentation={presentation}
          onDecisionCommitted={onDecisionCommitted}
        />
      )
    case 'double_vote':
      return (
        <DoubleVoteDecision presentation={presentation} onDecisionCommitted={onDecisionCommitted} />
      )
    case 'mission_immunity_offer':
      return (
        <MissionImmunityDecision
          presentation={presentation}
          onDecisionCommitted={onDecisionCommitted}
        />
      )
    case 'pos_decision':
      return <PosDecision presentation={presentation} onDecisionCommitted={onDecisionCommitted} />
    case 'vip_second_use':
      return (
        <VipSecondUseDecision
          presentation={presentation}
          onDecisionCommitted={onDecisionCommitted}
        />
      )
    case 'pos_save_target':
      return (
        <SaveTargetDecision presentation={presentation} onDecisionCommitted={onDecisionCommitted} />
      )
    case 'replacement_nominee':
      return (
        <ReplacementDecision
          presentation={presentation}
          onDecisionCommitted={onDecisionCommitted}
        />
      )
    case 'tie_break':
      return (
        <TieBreakDecision presentation={presentation} onDecisionCommitted={onDecisionCommitted} />
      )
    default:
      return null
  }
}
