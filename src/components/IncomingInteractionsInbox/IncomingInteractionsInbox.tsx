import { useEffect, useMemo, useRef } from 'react'
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
} from '../../social/incomingInteractionPresentation'
import {
  getSocialModuleAvailability,
  logBlockedSocialModuleOpen,
} from '../../social/socialModuleAvailability'
import {
  getSocialCommitmentDueCopy,
  getSocialCommitmentLabel,
  getSocialCredibility,
} from '../../social/socialCommitments'
import { getInteractionSocialMode } from '../../social/socialMode'
import {
  getIncomingInteractionResponsePolicy,
  type IncomingInteractionResponsePolicy,
} from '../../social/socialRuntimeConfig'
import type {
  IncomingInteraction,
  IncomingInteractionPriority,
  IncomingInteractionResponseType,
  RelationshipsMap,
  SocialCommitment,
  SocialMemoryMap,
} from '../../social/types'
import type { Player } from '../../types'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import IncomingInteractionIcon from './IncomingInteractionIcon'
import './IncomingInteractionsInbox.css'

const PRIORITY_ORDER: Record<IncomingInteractionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const PRIORITY_LABELS: Record<IncomingInteractionPriority, string> = {
  high: 'Important',
  medium: 'Priority',
  low: 'Low stakes',
}

function formatResponseLabel(interaction: IncomingInteraction): string {
  if (interaction.resolvedLabel) return `Resolved · ${interaction.resolvedLabel}`
  if (!interaction.resolvedWith) return 'Resolved'
  return `Resolved · ${getIncomingInteractionResponseLabel(
    interaction.type,
    interaction.resolvedWith
  )}`
}

function isExpiringThisWeek(interaction: IncomingInteraction, currentWeek: number): boolean {
  return !interaction.resolved && interaction.expiresAtWeek <= currentWeek
}

function getExpiryLabel(
  interaction: IncomingInteraction,
  currentWeek: number,
  priority: IncomingInteractionPriority,
  policy: IncomingInteractionResponsePolicy
): string | null {
  if (interaction.resolved || !isExpiringThisWeek(interaction, currentWeek)) return null
  if (policy === 'readOnly') return null
  if (policy === 'optional') return 'Optional · closes this week'
  return priority === 'high' ? 'Urgent this week' : 'Needs response this week'
}

interface InteractionItemProps {
  interaction: IncomingInteraction
  priority: IncomingInteractionPriority
  policy: IncomingInteractionResponsePolicy
  showActions: boolean
  showExpiry: boolean
  playerById: Map<string, Player>
  currentWeek: number
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
  showExpiry,
  playerById,
  currentWeek,
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
  const isUrgent = policy === 'required' && isExpiringThisWeek(interaction, currentWeek)
  const expiryLabel = showExpiry ? getExpiryLabel(interaction, currentWeek, priority, policy) : null
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
        ? getIncomingInteractionResponseOptions(
            interaction.type,
            interaction,
            tone,
            interactionDramaMode
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
  const expiryClass =
    expiryLabel && policy === 'required' && priority === 'high' ? ' inbox-item__expiry--urgent' : ''

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
              <span className={`inbox-item__priority inbox-item__priority--${priority}`}>
                {PRIORITY_LABELS[priority]}
              </span>
            )}
          </div>

          <div className="inbox-item__type-row">
            <span className="inbox-item__type-icon">
              <IncomingInteractionIcon name={interaction.type} />
            </span>
            <span className="inbox-item__type">{typeLabel}</span>
            {tone && (
              <span className="inbox-item__tone" aria-label={`Tone: ${tone}`}>
                {tone}
              </span>
            )}
            {expiryLabel && (
              <span className={`inbox-item__expiry${expiryClass}`}>{expiryLabel}</span>
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

      {interaction.outcomeText && (
        <p className="inbox-item__outcome">
          <strong>What happened:</strong> {interaction.outcomeText}
        </p>
      )}

      {interactionDramaMode && commitment && (
        <div className={`inbox-item__promise inbox-item__promise--${commitment.status}`}>
          <strong>
            {commitment.status === 'pending' ? 'Promise active' : `Promise ${commitment.status}`}
          </strong>
          <span>{getSocialCommitmentLabel(commitment.kind)}</span>
          {commitment.status === 'pending' && (
            <small>{getSocialCommitmentDueCopy(commitment.kind)}</small>
          )}
        </div>
      )}

      {shouldShowActions && (
        <div
          className={`inbox-item__actions${
            interactionDramaMode ? ' inbox-item__actions--drama' : ''
          }`}
        >
          {responseOptions.map((option) => (
            <button
              key={`${interaction.id}-${option.responseType}`}
              type="button"
              aria-label={option.label}
              data-response-type={option.responseType}
              className={`inbox-action inbox-action--${option.style}`}
              onClick={() => onRespond(interaction.id, option.responseType, option.label)}
            >
              <span>{option.label}</span>
              {option.description && <small>{option.description}</small>}
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
  const globalDramaMode = useAppSelector((state) => state.settings?.gameUX?.dramaMode === true)

  const players = game.players
  const currentWeek = game.week ?? 1
  const humanPlayer = players.find((player) => player.isUser)
  const socialModuleAvailability = useMemo(() => getSocialModuleAvailability(game), [game])
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])

  const interactionEntries = useMemo(
    () =>
      interactions.map((interaction) => ({
        interaction,
        priority: getIncomingInteractionPriority(interaction.type),
        policy: getIncomingInteractionResponsePolicy(interaction),
      })),
    [interactions]
  )

  const sortedInteractions = useMemo(
    () =>
      [...interactionEntries].sort((left, right) => {
        const resolvedDiff = Number(left.interaction.resolved) - Number(right.interaction.resolved)
        if (resolvedDiff !== 0) return resolvedDiff
        const policyOrder = { required: 0, optional: 1, readOnly: 2 }
        const policyDiff = policyOrder[left.policy] - policyOrder[right.policy]
        if (policyDiff !== 0) return policyDiff
        const priorityDiff = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
        if (priorityDiff !== 0) return priorityDiff
        const expiryDiff = left.interaction.expiresAtWeek - right.interaction.expiresAtWeek
        if (expiryDiff !== 0) return expiryDiff
        return right.interaction.createdAt - left.interaction.createdAt
      }),
    [interactionEntries]
  )

  const pending = useMemo(
    () => sortedInteractions.filter((entry) => !entry.interaction.resolved),
    [sortedInteractions]
  )
  const requiredInteractions = useMemo(
    () => pending.filter((entry) => entry.policy === 'required'),
    [pending]
  )
  const optionalInteractions = useMemo(
    () => pending.filter((entry) => entry.policy === 'optional'),
    [pending]
  )
  const readOnlyInteractions = useMemo(
    () => pending.filter((entry) => entry.policy === 'readOnly'),
    [pending]
  )
  const resolvedInteractions = useMemo(
    () =>
      sortedInteractions.filter(
        (entry) => entry.interaction.resolved && entry.interaction.resolvedWeek === currentWeek
      ),
    [sortedInteractions, currentWeek]
  )
  const urgentCount = useMemo(
    () =>
      requiredInteractions.filter(
        (entry) => entry.priority === 'high' || isExpiringThisWeek(entry.interaction, currentWeek)
      ).length,
    [requiredInteractions, currentWeek]
  )
  const pendingCommitments = useMemo(
    () => commitments.filter((commitment) => commitment.status === 'pending'),
    [commitments]
  )

  const credibility = useMemo(() => {
    const base = getSocialCredibility(commitments)
    if (!globalDramaMode || !humanPlayer) return base
    const houseBeliefs = dramaNetwork.beliefs.filter(
      (belief) => belief.subjectId === humanPlayer.id && belief.holderId !== humanPlayer.id
    )
    if (houseBeliefs.length === 0) return base
    const weight = houseBeliefs.reduce((sum, belief) => sum + belief.confidence, 0) || 1
    const signal =
      houseBeliefs.reduce((sum, belief) => sum + belief.sentiment * belief.confidence, 0) / weight
    const score = Math.max(0, Math.min(100, Math.round(base.score + signal * 35)))
    return {
      ...base,
      score,
      label: score >= 70 ? 'Trusted' : score <= 35 ? 'Questioned' : 'Mixed',
    }
  }, [commitments, globalDramaMode, dramaNetwork.beliefs, humanPlayer])

  const headerSummary =
    pending.length === 0
      ? 'All caught up'
      : `${requiredInteractions.length} decisions${
          urgentCount > 0 ? ` • ${urgentCount} urgent` : ''
        }${optionalInteractions.length > 0 ? ` • ${optionalInteractions.length} conversations` : ''}`
  const credibilityCopy =
    credibility.kept + credibility.broken === 0
      ? 'Your reputation · no promises judged yet'
      : `Your reputation ${credibility.score}% · ${credibility.label}`

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
    showActions: boolean,
    showExpiry: boolean
  ) => {
    const interactionDramaMode =
      getInteractionSocialMode(interaction, { game, settings, vip }) === 'drama'
    return (
      <InteractionItem
        key={interaction.id}
        interaction={interaction}
        priority={priority}
        policy={policy}
        showActions={showActions}
        showExpiry={showExpiry}
        playerById={playerById}
        currentWeek={currentWeek}
        onRead={(interactionId) => dispatch(markIncomingInteractionRead(interactionId))}
        onRespond={(interactionId, responseType, responseLabel) =>
          dispatch(respondToIncomingInteraction({ interactionId, responseType, responseLabel }))
        }
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
              {globalDramaMode && <span className="inbox-header__mode">Drama</span>}
            </div>
            <button
              className="inbox-header__close"
              type="button"
              aria-label="Close inbox"
              onClick={() => dispatch(closeIncomingInbox())}
            >
              <IncomingInteractionIcon name="close" />
            </button>
          </div>
          <div className="inbox-header__meta">
            {globalDramaMode && (
              <span
                className="inbox-header__credibility"
                title="Promise-keeping reputation, adjusted by what the house currently believes."
              >
                {credibilityCopy}
              </span>
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
                    Active Promises · {pendingCommitments.length}
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

              {requiredInteractions.length > 0 && (
                <section className="inbox-section" aria-label="Needs Decision">
                  <h3 className="inbox-section__title">Needs Decision</h3>
                  <div className="inbox-section__list" role="list">
                    {requiredInteractions.map(({ interaction, priority, policy }) =>
                      renderInteraction(interaction, priority, policy, true, true)
                    )}
                  </div>
                </section>
              )}

              {optionalInteractions.length > 0 && (
                <section className="inbox-section" aria-label="Conversations">
                  <h3 className="inbox-section__title inbox-section__title--updates">
                    Conversations
                  </h3>
                  <div className="inbox-section__list" role="list">
                    {optionalInteractions.map(({ interaction, priority, policy }) =>
                      renderInteraction(interaction, priority, policy, true, true)
                    )}
                  </div>
                </section>
              )}

              {readOnlyInteractions.length > 0 && (
                <section className="inbox-section" aria-label="House Updates">
                  <h3 className="inbox-section__title inbox-section__title--updates">
                    House Updates
                  </h3>
                  <div className="inbox-section__list" role="list">
                    {readOnlyInteractions.map(({ interaction, priority, policy }) =>
                      renderInteraction(interaction, priority, policy, false, false)
                    )}
                  </div>
                </section>
              )}

              {resolvedInteractions.length > 0 && (
                <section className="inbox-section" aria-label="Resolved This Week">
                  <h3 className="inbox-section__title inbox-section__title--resolved">
                    Resolved This Week
                  </h3>
                  <div className="inbox-section__list" role="list">
                    {resolvedInteractions.map(({ interaction, priority, policy }) =>
                      renderInteraction(interaction, priority, policy, false, false)
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
