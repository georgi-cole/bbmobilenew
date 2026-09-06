import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  closeIncomingInbox,
  markIncomingInteractionRead,
  selectDramaNetwork,
  selectIncomingInboxOpen,
  selectIncomingInteractions,
  selectSocialCommitments,
} from '../../social/socialSlice'
import { getIncomingInteractionPriority } from '../../social/incomingInteractionScheduler'
import {
  getIncomingInteractionTypeLabel,
  respondToIncomingInteraction,
} from '../../social/incomingInteractions'
import {
  getIncomingInteractionResponseLabel,
  getIncomingInteractionResponseOptions,
  getIncomingInteractionTone,
  orderIncomingInteractionResponseOptions,
} from '../../social/incomingInteractionPresentation'
import GameBackButton from '../ui/GameBackButton/GameBackButton'
import {
  getIncomingSocialModuleAvailability,
  logBlockedSocialModuleOpen,
} from '../../social/socialModuleAvailability'
import {
  getSocialCommitmentDueCopy,
  getSocialCommitmentLabel,
  getSocialCredibility,
} from '../../social/socialCommitments'
import { getEffectiveSocialMode } from '../../social/socialMode'
import {
  getIncomingInteractionResponsePolicy,
  type IncomingInteractionResponsePolicy,
} from '../../social/socialRuntimeConfig'
import type {
  DramaBelief,
  IncomingInteraction,
  IncomingInteractionPriority,
  IncomingInteractionResponseType,
  RelationshipsMap,
  SocialCommitment,
  SocialMemoryMap,
} from '../../social/types'
import type { Player } from '../../types'
import {
  formatIncomingDeadline,
  isIncomingInteractionUrgent,
} from '../../social/incomingInteractionDeadline'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import IncomingInteractionIcon from './IncomingInteractionIcon'
import './IncomingInteractionsInbox.css'

function formatResponseLabel(interaction: IncomingInteraction): string {
  if (interaction.resolvedLabel) return `Resolved · ${interaction.resolvedLabel}`
  if (!interaction.resolvedWith) return 'Resolved'
  return `Resolved · ${getIncomingInteractionResponseLabel(
    interaction.type,
    interaction.resolvedWith
  )}`
}

function getExpiryLabel(
  interaction: IncomingInteraction,
  currentWeek: number,
  currentPhase: string,
  policy: IncomingInteractionResponsePolicy
): string | null {
  if (
    interaction.resolved ||
    policy !== 'required' ||
    !isIncomingInteractionUrgent(interaction, { day: currentWeek, phase: currentPhase })
  ) {
    return null
  }
  return formatIncomingDeadline(interaction)
}

function getHouseRead(
  beliefs: readonly DramaBelief[],
  humanId: string
): { label: string; explanation: string } {
  const relevant = beliefs.filter(
    (belief) => belief.subjectId === humanId && belief.holderId !== humanId
  )
  if (relevant.length === 0) {
    return {
      label: 'Still forming',
      explanation: 'The house has not settled on a clear read of you yet.',
    }
  }
  const weight = relevant.reduce((sum, belief) => sum + belief.confidence, 0) || 1
  const sentiment =
    relevant.reduce((sum, belief) => sum + belief.sentiment * belief.confidence, 0) / weight

  if (sentiment >= 0.28) {
    return {
      label: 'Mostly positive',
      explanation: 'The strongest current beliefs about you lean loyal or dependable.',
    }
  }
  if (sentiment <= -0.28) {
    return {
      label: 'Under suspicion',
      explanation:
        'Recent choices, rumours or broken expectations are making the house more cautious around you.',
    }
  }
  return {
    label: 'Mixed',
    explanation: 'Different housemates currently read your game in different ways.',
  }
}

function formatResolutionReason(reason?: string): string {
  switch (reason) {
    case 'protected_at_nominations':
      return 'You kept them off the block.'
    case 'nominated_after_promise':
      return 'They were nominated after you promised protection.'
    case 'saved_with_safety':
    case 'protected_by_multi_save':
      return 'You used Safety to protect them.'
    case 'declined_to_use_safety':
      return 'You chose not to use Safety.'
    case 'saved_someone_else':
      return 'You used Safety on somebody else.'
    case 'voted_to_keep':
    case 'double_vote_kept_them_safe':
      return 'Your vote matched the promise.'
    case 'voted_against_promise':
    case 'double_vote_targeted_them':
      return 'Your vote went against the promise.'
    case 'decision_window_passed':
      return 'The decision window closed without a valid test.'
    default:
      return reason
        ? reason.replaceAll('_', ' ')
        : 'The promise was judged by a later game decision.'
  }
}

interface InteractionItemProps {
  interaction: IncomingInteraction
  priority: IncomingInteractionPriority
  policy: IncomingInteractionResponsePolicy
  showActions: boolean
  playerById: Map<string, Player>
  currentWeek: number
  currentPhase: string
  onRead: (interactionId: string) => void
  onRespond: (
    interactionId: string,
    responseType: IncomingInteractionResponseType,
    responseLabel: string
  ) => void
  relationships: RelationshipsMap
  socialMemory: SocialMemoryMap
  humanId: string
  commitment?: SocialCommitment
  interactionDramaMode: boolean
}

function InteractionItem({
  interaction,
  priority,
  policy,
  showActions,
  playerById,
  currentWeek,
  currentPhase,
  onRead,
  onRespond,
  relationships,
  socialMemory,
  humanId,
  commitment,
  interactionDramaMode,
}: InteractionItemProps) {
  const itemRef = useRef<HTMLDivElement>(null)
  const fromPlayer = playerById.get(interaction.fromId)
  const fromName = fromPlayer?.name ?? interaction.fromId
  const typeLabel = getIncomingInteractionTypeLabel(interaction.type)
  const isUnread = !interaction.read && !interaction.resolved
  const isUrgent =
    policy === 'required' &&
    isIncomingInteractionUrgent(interaction, { day: currentWeek, phase: currentPhase })
  const expiryLabel = getExpiryLabel(interaction, currentWeek, currentPhase, policy)
  const shouldShowActions = showActions && policy !== 'readOnly' && !interaction.resolved

  useEffect(() => {
    if (!isUnread || !itemRef.current) return
    const element = itemRef.current
    if (typeof IntersectionObserver === 'undefined') {
      onRead(interaction.id)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.55)) {
          onRead(interaction.id)
          observer.disconnect()
        }
      },
      { threshold: [0.55] }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [interaction.id, isUnread, onRead])

  const tone = useMemo(
    () =>
      interactionDramaMode
        ? getIncomingInteractionTone({
            interaction,
            relationships,
            socialMemory,
            humanId,
            isUrgent,
          })
        : undefined,
    [interactionDramaMode, interaction, relationships, socialMemory, humanId, isUrgent]
  )

  const responseOptions = useMemo(
    () =>
      shouldShowActions
        ? orderIncomingInteractionResponseOptions(
            interaction,
            getIncomingInteractionResponseOptions(
              interaction.type,
              interaction,
              tone,
              interactionDramaMode
            )
          )
        : [],
    [shouldShowActions, interaction, tone, interactionDramaMode]
  )

  const resolvedLabel = interaction.resolved
    ? formatResponseLabel(interaction)
    : isUnread
      ? 'New'
      : policy === 'readOnly'
        ? 'Update'
        : null

  return (
    <div
      ref={itemRef}
      className={`inbox-item inbox-item--priority-${priority} inbox-item--policy-${policy}${
        isUnread ? ' inbox-item--unread' : ''
      }${interaction.resolved ? ' inbox-item--resolved' : ''}`}
      role="listitem"
    >
      <div className="inbox-item__header">
        {fromPlayer ? (
          <PlayerAvatar
            player={fromPlayer}
            size="sm"
            showRelationshipOutline={false}
            showEvictedStyle={false}
          />
        ) : (
          <span className="inbox-item__avatar-fallback" aria-label="Unknown housemate">
            <IncomingInteractionIcon name="person" />
          </span>
        )}

        <div className="inbox-item__title">
          <div className="inbox-item__from-row">
            <span className="inbox-item__from">{fromName}</span>
            {priority === 'high' && policy === 'required' && (
              <span className="inbox-item__priority inbox-item__priority--high">Important</span>
            )}
          </div>
          <div className="inbox-item__type-row">
            <span className="inbox-item__type-icon">
              <IncomingInteractionIcon name={interaction.type} />
            </span>
            <span className="inbox-item__type">{typeLabel}</span>
            {interactionDramaMode && policy === 'required' && tone && (
              <span className="inbox-item__tone">{tone}</span>
            )}
            {expiryLabel && (
              <span className="inbox-item__expiry inbox-item__expiry--urgent">{expiryLabel}</span>
            )}
          </div>
        </div>

        {resolvedLabel && (
          <span className={`inbox-item__status${isUnread ? ' inbox-item__status--new' : ''}`}>
            {resolvedLabel}
          </span>
        )}
      </div>

      <p className="inbox-item__text">{interaction.text}</p>

      {interaction.outcomeText && <p className="inbox-item__outcome">{interaction.outcomeText}</p>}

      {interactionDramaMode && commitment && (
        <div className={`inbox-item__promise inbox-item__promise--${commitment.status}`}>
          <strong>
            {commitment.status === 'pending' ? 'Promise active' : `Promise ${commitment.status}`}
          </strong>
          <span>{getSocialCommitmentLabel(commitment.kind)}</span>
        </div>
      )}

      {shouldShowActions && (
        <div className="inbox-item__actions">
          {responseOptions.map((option) => (
            <button
              key={`${interaction.id}-${option.responseType}`}
              type="button"
              aria-label={option.label}
              data-response-type={option.responseType}
              className={`inbox-action inbox-action--${option.style}`}
              onClick={() => onRespond(interaction.id, option.responseType, option.label)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function IncomingInteractionsInbox() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const open = useAppSelector(selectIncomingInboxOpen)
  const interactions = useAppSelector(selectIncomingInteractions)
  const relationships = useAppSelector((state) => state.social?.relationships ?? {})
  const socialMemory = useAppSelector((state) => state.social?.socialMemory ?? {})
  const commitments = useAppSelector(selectSocialCommitments)
  const dramaNetwork = useAppSelector(selectDramaNetwork)
  const settings = useAppSelector((state) => state.settings)
  const vip = useAppSelector((state) => state.vip)
  const globalDramaMode = getEffectiveSocialMode({ game, settings, vip }) === 'drama'
  const [recentlyResolvedIds, setRecentlyResolvedIds] = useState<Set<string>>(() => new Set())

  const players = game.players
  const currentWeek = game.week ?? 1
  const humanPlayer = players.find((player) => player.isUser)
  const socialModuleAvailability = useMemo(() => getIncomingSocialModuleAvailability(game), [game])
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])

  const interactionEntries = useMemo(
    () =>
      interactions.map((interaction) => ({
        interaction,
        priority: getIncomingInteractionPriority(
          interaction.type,
          typeof interaction.payload?.scenarioKey === 'string'
            ? interaction.payload.scenarioKey
            : undefined
        ),
        policy: getIncomingInteractionResponsePolicy(interaction),
      })),
    [interactions]
  )

  const sortedInteractions = useMemo(
    () =>
      [...interactionEntries].sort(
        (left, right) =>
          left.interaction.createdAt - right.interaction.createdAt ||
          left.interaction.id.localeCompare(right.interaction.id)
      ),
    [interactionEntries]
  )
  const openInteractions = useMemo(
    () => sortedInteractions.filter((entry) => !entry.interaction.resolved),
    [sortedInteractions]
  )
  const visibleConversationInteractions = useMemo(
    () =>
      sortedInteractions.filter(
        (entry) => !entry.interaction.resolved || recentlyResolvedIds.has(entry.interaction.id)
      ),
    [sortedInteractions, recentlyResolvedIds]
  )
  const resolvedInteractions = useMemo(
    () =>
      sortedInteractions.filter(
        (entry) =>
          entry.interaction.resolved &&
          !recentlyResolvedIds.has(entry.interaction.id) &&
          entry.interaction.resolvedWeek === currentWeek
      ),
    [sortedInteractions, currentWeek, recentlyResolvedIds]
  )
  const pendingCommitments = useMemo(
    () => commitments.filter((commitment) => commitment.status === 'pending'),
    [commitments]
  )
  const judgedCommitments = useMemo(
    () =>
      commitments
        .filter((commitment) => commitment.status === 'kept' || commitment.status === 'broken')
        .sort(
          (left, right) =>
            (right.resolvedWeek ?? right.createdWeek) - (left.resolvedWeek ?? left.createdWeek)
        ),
    [commitments]
  )
  const credibility = useMemo(() => getSocialCredibility(commitments), [commitments])
  const houseRead = useMemo(
    () => (humanPlayer ? getHouseRead(dramaNetwork.beliefs, humanPlayer.id) : null),
    [dramaNetwork.beliefs, humanPlayer]
  )

  const headerSummary =
    openInteractions.length === 0
      ? 'All caught up'
      : `${openInteractions.length} open conversation${openInteractions.length === 1 ? '' : 's'}`

  useEffect(() => {
    if (!open || socialModuleAvailability.canOpen) return
    logBlockedSocialModuleOpen(
      'Incoming social module',
      socialModuleAvailability,
      'IncomingInteractionsInbox visibility guard'
    )
    dispatch(closeIncomingInbox())
  }, [dispatch, open, socialModuleAvailability])

  if (!open || !socialModuleAvailability.canOpen || !humanPlayer) return null

  const renderInteraction = (
    interaction: IncomingInteraction,
    priority: IncomingInteractionPriority,
    policy: IncomingInteractionResponsePolicy,
    showActions: boolean
  ) => {
    const interactionDramaMode = globalDramaMode
    return (
      <InteractionItem
        key={interaction.id}
        interaction={interaction}
        priority={priority}
        policy={policy}
        showActions={showActions}
        playerById={playerById}
        currentWeek={currentWeek}
        currentPhase={game.phase ?? 'week_start'}
        onRead={(interactionId) => dispatch(markIncomingInteractionRead(interactionId))}
        onRespond={(interactionId, responseType, responseLabel) => {
          setRecentlyResolvedIds((current) => {
            const nextIds = new Set(current)
            nextIds.add(interactionId)
            return nextIds
          })
          dispatch(respondToIncomingInteraction({ interactionId, responseType, responseLabel }))
        }}
        relationships={relationships}
        socialMemory={socialMemory}
        humanId={humanPlayer.id}
        commitment={commitments.find((entry) => entry.interactionId === interaction.id)}
        interactionDramaMode={interactionDramaMode}
      />
    )
  }

  return (
    <div
      className="inbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Incoming interactions"
    >
      <div className={`inbox-panel${globalDramaMode ? ' inbox-panel--drama' : ''}`}>
        <header className="inbox-header">
          <div className="inbox-header__top">
            <div className="inbox-header__title">
              <IncomingInteractionIcon name="inbox" className="inbox-header__title-icon" />
              <span className="inbox-header__title-text">Incoming Interactions</span>
              {globalDramaMode && <span className="inbox-header__mode">Reality</span>}
            </div>
            <GameBackButton
              className="inbox-header__close"
              label="Close inbox"
              onClick={() => {
                setRecentlyResolvedIds(new Set())
                dispatch(closeIncomingInbox())
              }}
            />
          </div>

          <div className="inbox-header__meta">
            {globalDramaMode && (
              <details className="inbox-header__reputation">
                <summary>
                  {credibility.kept + credibility.broken === 0
                    ? 'Promise reliability · unproven'
                    : `Promise reliability ${credibility.score}% · ${credibility.label}`}
                </summary>
                <div className="inbox-header__reputation-body">
                  <p>
                    <strong>{credibility.kept}</strong> kept · <strong>{credibility.broken}</strong>{' '}
                    broken
                  </p>
                  <p>
                    Reliability changes only when a promise reaches the decision it referred to. It
                    improves by making fewer promises and keeping the next ones you do make.
                  </p>
                  {houseRead && (
                    <p>
                      <strong>House read: {houseRead.label}.</strong> {houseRead.explanation}
                    </p>
                  )}
                  {judgedCommitments.slice(0, 3).map((commitment) => (
                    <p key={commitment.id} className="inbox-header__reputation-event">
                      {commitment.status === 'kept' ? '✓' : '✕'}{' '}
                      {getSocialCommitmentLabel(commitment.kind)} ·{' '}
                      {formatResolutionReason(commitment.resolutionReason)}
                    </p>
                  ))}
                </div>
              </details>
            )}
            <span className="inbox-header__summary">{headerSummary}</span>
          </div>
        </header>

        <div className="inbox-list">
          {sortedInteractions.length === 0 ? (
            <div className="inbox-empty">No incoming interactions yet.</div>
          ) : (
            <div className="inbox-sections">
              {globalDramaMode && pendingCommitments.length > 0 && (
                <details className="inbox-section inbox-section--promises">
                  <summary className="inbox-section__title inbox-section__title--promises">
                    Active promises · {pendingCommitments.length}
                  </summary>
                  <div className="inbox-promises">
                    {pendingCommitments.map((commitment) => (
                      <div className="inbox-promise" key={commitment.id}>
                        <strong>{getSocialCommitmentLabel(commitment.kind)}</strong>
                        <span>
                          {playerById.get(commitment.beneficiaryId)?.name ??
                            commitment.beneficiaryId}
                          {' · '}
                          {getSocialCommitmentDueCopy(commitment.kind)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {visibleConversationInteractions.length > 0 && (
                <section className="inbox-section" aria-label="Messages">
                  <h3 className="inbox-section__title">Messages</h3>
                  <div className="inbox-section__list" role="list">
                    {visibleConversationInteractions.map(({ interaction, priority, policy }) =>
                      renderInteraction(interaction, priority, policy, !interaction.resolved)
                    )}
                  </div>
                </section>
              )}

              {resolvedInteractions.length > 0 && (
                <details className="inbox-section inbox-section--history">
                  <summary className="inbox-section__title inbox-section__title--resolved">
                    History · {resolvedInteractions.length}
                  </summary>
                  <div className="inbox-section__list" role="list">
                    {resolvedInteractions.map(({ interaction, priority, policy }) =>
                      renderInteraction(interaction, priority, policy, false)
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
