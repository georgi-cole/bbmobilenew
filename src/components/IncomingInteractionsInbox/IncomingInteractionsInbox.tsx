import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  closeIncomingInbox,
  markAllIncomingInteractionsRead,
  selectDramaNetwork,
  selectIncomingInboxOpen,
  selectIncomingInteractions,
  selectSocialCommitments,
  selectUnreadIncomingInteractionCount,
} from '../../social/socialSlice';
import { getIncomingInteractionPriority } from '../../social/incomingInteractionScheduler';
import {
  getIncomingInteractionTypeLabel,
  respondToIncomingInteraction,
} from '../../social/incomingInteractions';
import {
  getSocialModuleAvailability,
  logBlockedSocialModuleOpen,
} from '../../social/socialModuleAvailability';
import {
  getIncomingInteractionResponseLabel,
  getIncomingInteractionResponseOptions,
  getIncomingInteractionTone,
} from '../../social/incomingInteractionPresentation';
import {
  getSocialCommitmentDueCopy,
  getSocialCommitmentLabel,
  getSocialCredibility,
} from '../../social/socialCommitments';
import type {
  IncomingInteraction,
  IncomingInteractionPriority,
  IncomingInteractionResponseType,
  RelationshipsMap,
  SocialCommitment,
  SocialMemoryMap,
} from '../../social/types';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import IncomingInteractionIcon from './IncomingInteractionIcon';
import './IncomingInteractionsInbox.css';

const PRIORITY_ORDER: Record<IncomingInteractionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const PRIORITY_LABELS: Record<IncomingInteractionPriority, string> = {
  high: 'Important',
  medium: 'Priority',
  low: 'Low stakes',
};

function formatResponseLabel(
  interaction: IncomingInteraction,
): string {
  if (interaction.resolvedLabel) {
    return `Resolved · ${interaction.resolvedLabel}`;
  }

  if (!interaction.resolvedWith) {
    return 'Resolved';
  }

  return `Resolved · ${getIncomingInteractionResponseLabel(
    interaction.type,
    interaction.resolvedWith,
  )}`;
}

function isExpiringThisWeek(
  interaction: IncomingInteraction,
  currentWeek: number,
): boolean {
  if (interaction.resolved) return false;
  return interaction.expiresAtWeek <= currentWeek;
}

function getExpiryLabel(
  interaction: IncomingInteraction,
  currentWeek: number,
  priority: IncomingInteractionPriority,
): string | null {
  if (interaction.resolved) return null;

  if (!isExpiringThisWeek(interaction, currentWeek)) {
    return null;
  }

  if (!interaction.requiresResponse) {
    return 'Expires this week';
  }

  return priority === 'high' ? 'Urgent this week' : 'Needs response this week';
}

interface InteractionItemProps {
  interaction: IncomingInteraction;
  priority: IncomingInteractionPriority;
  showActions: boolean;
  showExpiry: boolean;
  playerById: Map<string, Player>;
  currentWeek: number;
  onRespond: (
    interactionId: string,
    responseType: IncomingInteractionResponseType,
    responseLabel: string,
  ) => void;
  relationships: RelationshipsMap;
  socialMemory: SocialMemoryMap;
  humanId: string;
  commitment?: SocialCommitment;
  dramaMode: boolean;
}

function InteractionItem({
  interaction,
  priority,
  showActions,
  showExpiry,
  playerById,
  currentWeek,
  onRespond,
  relationships,
  socialMemory,
  humanId,
  commitment,
  dramaMode,
}: InteractionItemProps) {
  const fromPlayer = playerById.get(interaction.fromId);
  const fromName = fromPlayer?.name ?? interaction.fromId;
  const typeLabel = getIncomingInteractionTypeLabel(interaction.type);
  const isUnread = !interaction.read && !interaction.resolved;
  const isUrgent = isExpiringThisWeek(interaction, currentWeek);
  const expiryLabel = showExpiry
    ? getExpiryLabel(interaction, currentWeek, priority)
    : null;
  const shouldShowActions = showActions && !interaction.resolved;

  const tone = useMemo(
    () =>
      dramaMode
        ? getIncomingInteractionTone({
            interaction,
            relationships,
            socialMemory,
            humanId,
            isUrgent,
          })
        : undefined,
    [dramaMode, interaction, relationships, socialMemory, humanId, isUrgent],
  );

  const responseOptions = useMemo(
    () =>
      shouldShowActions
        ? getIncomingInteractionResponseOptions(
            interaction.type,
            interaction,
            tone,
            dramaMode,
          )
        : [],
    [shouldShowActions, interaction, tone, dramaMode],
  );

  const resolvedLabel = interaction.resolved
    ? formatResponseLabel(interaction)
    : isUnread
      ? 'New'
      : null;

  const expiryClass =
    expiryLabel && priority === 'high' ? ' inbox-item__expiry--urgent' : '';

  return (
    <div
      className={`inbox-item inbox-item--priority-${priority}${
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
          <span
            className="inbox-item__avatar-fallback"
            aria-label="Unknown housemate"
          >
            <IncomingInteractionIcon name="person" />
          </span>
        )}

        <div className="inbox-item__title">
          <div className="inbox-item__from-row">
            <span className="inbox-item__from">{fromName}</span>
            {priority === 'high' && (
              <span
                className={`inbox-item__priority inbox-item__priority--${priority}`}
              >
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
              <span className={`inbox-item__expiry${expiryClass}`}>
                {expiryLabel}
              </span>
            )}
          </div>
        </div>

        {resolvedLabel && (
          <span
            className={`inbox-item__status${
              isUnread ? ' inbox-item__status--new' : ''
            }`}
          >
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

      {dramaMode && commitment && (
        <div
          className={`inbox-item__promise inbox-item__promise--${commitment.status}`}
        >
          <strong>
            {commitment.status === 'pending'
              ? 'Promise active'
              : `Promise ${commitment.status}`}
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
            dramaMode ? ' inbox-item__actions--drama' : ''
          }`}
        >
          {responseOptions.map((option) => (
            <button
              key={`${interaction.id}-${option.responseType}`}
              type="button"
              aria-label={option.label}
              title={option.description}
              data-response-type={option.responseType}
              className={`inbox-action inbox-action--${option.style}`}
              onClick={() =>
                onRespond(interaction.id, option.responseType, option.label)
              }
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IncomingInteractionsInbox() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((state) => state.game);
  const open = useAppSelector(selectIncomingInboxOpen);
  const interactions = useAppSelector(selectIncomingInteractions);
  const unreadCount = useAppSelector(selectUnreadIncomingInteractionCount);
  const relationships = useAppSelector(
    (state) => state.social?.relationships ?? {},
  );
  const socialMemory = useAppSelector(
    (state) => state.social?.socialMemory ?? {},
  );
  const commitments = useAppSelector(selectSocialCommitments);
  const dramaNetwork = useAppSelector(selectDramaNetwork);
  const dramaMode = useAppSelector(
    (state) => state.settings?.gameUX?.dramaMode === true,
  );

  const players = game.players;
  const currentWeek = game.week ?? 1;
  const humanPlayer = players.find((player) => player.isUser);
  const socialModuleAvailability = useMemo(
    () => getSocialModuleAvailability(game),
    [game],
  );

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  const interactionEntries = useMemo(
    () =>
      interactions.map((interaction) => ({
        interaction,
        priority: getIncomingInteractionPriority(interaction.type),
      })),
    [interactions],
  );

  const sortedInteractions = useMemo(
    () =>
      [...interactionEntries].sort((a, b) => {
        const resolvedDiff =
          Number(a.interaction.resolved) - Number(b.interaction.resolved);
        if (resolvedDiff !== 0) return resolvedDiff;

        const priorityDiff =
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        const expiryDiff =
          a.interaction.expiresAtWeek - b.interaction.expiresAtWeek;
        if (expiryDiff !== 0) return expiryDiff;

        return b.interaction.createdAt - a.interaction.createdAt;
      }),
    [interactionEntries],
  );

  const pendingInteractions = useMemo(
    () => sortedInteractions.filter((entry) => !entry.interaction.resolved),
    [sortedInteractions],
  );

  const needsResponseInteractions = useMemo(
    () =>
      pendingInteractions.filter((entry) => entry.interaction.requiresResponse),
    [pendingInteractions],
  );

  const updateInteractions = useMemo(
    () =>
      pendingInteractions.filter(
        (entry) => !entry.interaction.requiresResponse,
      ),
    [pendingInteractions],
  );

  const resolvedInteractions = useMemo(
    () =>
      sortedInteractions.filter(
        (entry) =>
          entry.interaction.resolved &&
          entry.interaction.resolvedWeek === currentWeek,
      ),
    [sortedInteractions, currentWeek],
  );

  const urgentCount = useMemo(
    () =>
      pendingInteractions.filter(
        (entry) =>
          entry.priority === 'high' ||
          isExpiringThisWeek(entry.interaction, currentWeek),
      ).length,
    [pendingInteractions, currentWeek],
  );

  const pendingCommitments = useMemo(
    () => commitments.filter((commitment) => commitment.status === 'pending'),
    [commitments],
  );

  const credibility = useMemo(() => {
    const base = getSocialCredibility(commitments);
    if (!dramaMode || !humanPlayer) return base;

    const houseBeliefs = dramaNetwork.beliefs.filter(
      (belief) =>
        belief.subjectId === humanPlayer.id &&
        belief.holderId !== humanPlayer.id,
    );
    if (houseBeliefs.length === 0) return base;

    const weight =
      houseBeliefs.reduce((sum, belief) => sum + belief.confidence, 0) || 1;
    const signal =
      houseBeliefs.reduce(
        (sum, belief) => sum + belief.sentiment * belief.confidence,
        0,
      ) / weight;
    const score = Math.max(
      0,
      Math.min(100, Math.round(base.score + signal * 35)),
    );

    return {
      ...base,
      score,
      label: score >= 70 ? 'Trusted' : score <= 35 ? 'Questioned' : 'Mixed',
    };
  }, [commitments, dramaMode, dramaNetwork.beliefs, humanPlayer]);

  const headerSummary =
    pendingInteractions.length === 0
      ? 'All caught up'
      : `${pendingInteractions.length} pending${
          urgentCount > 0 ? ` · ${urgentCount} urgent` : ''
        }`;

  const credibilityCopy =
    credibility.kept + credibility.broken === 0
      ? 'Your reputation · no promises judged yet'
      : `Your reputation ${credibility.score}% · ${credibility.label}`;

  useEffect(() => {
    if (!open || socialModuleAvailability.canOpen) return;

    logBlockedSocialModuleOpen(
      'Incoming social module',
      socialModuleAvailability,
      'IncomingInteractionsInbox visibility guard',
    );
    dispatch(closeIncomingInbox());
  }, [dispatch, open, socialModuleAvailability]);

  useEffect(() => {
    if (open && unreadCount > 0) {
      dispatch(markAllIncomingInteractionsRead());
    }
  }, [open, unreadCount, dispatch]);

  if (!open || !socialModuleAvailability.canOpen || !humanPlayer) {
    return null;
  }

  const renderInteraction = (
    interaction: IncomingInteraction,
    priority: IncomingInteractionPriority,
    showActions: boolean,
    showExpiry: boolean,
  ) => (
    <InteractionItem
      key={interaction.id}
      interaction={interaction}
      priority={priority}
      showActions={showActions}
      showExpiry={showExpiry}
      playerById={playerById}
      currentWeek={currentWeek}
      onRespond={(interactionId, responseType, responseLabel) =>
        dispatch(
          respondToIncomingInteraction({
            interactionId,
            responseType,
            responseLabel,
          }),
        )
      }
      relationships={relationships}
      socialMemory={socialMemory}
      humanId={humanPlayer.id}
      commitment={commitments.find(
        (entry) => entry.interactionId === interaction.id,
      )}
      dramaMode={dramaMode}
    />
  );

  return (
    <div
      className="inbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Incoming interactions"
    >
      <div className="inbox-panel">
        <header className="inbox-header">
          <div className="inbox-header__top">
            <div className="inbox-header__title">
              <IncomingInteractionIcon
                name="inbox"
                className="inbox-header__title-icon"
              />
              <span className="inbox-header__title-text">
                Incoming Interactions
              </span>
              {dramaMode && (
                <span className="inbox-header__mode">Drama</span>
              )}
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
            <span
              className="inbox-header__credibility"
              title="Your promise-keeping reputation. It changes only when a promise is later kept or broken."
            >
              {credibilityCopy}
            </span>
            <span className="inbox-header__summary">{headerSummary}</span>
          </div>
        </header>

        <div className="inbox-list">
          {sortedInteractions.length === 0 ? (
            <div className="inbox-empty">No incoming interactions yet.</div>
          ) : (
            <div className="inbox-sections">
              {dramaMode && pendingCommitments.length > 0 && (
                <section
                  className="inbox-section inbox-section--promises"
                  aria-label="Active Promises"
                >
                  <h3 className="inbox-section__title inbox-section__title--promises">
                    Active Promises
                  </h3>
                  <div className="inbox-promises">
                    {pendingCommitments.map((commitment) => (
                      <div className="inbox-promise" key={commitment.id}>
                        <strong>
                          {getSocialCommitmentLabel(commitment.kind)}
                        </strong>
                        <span>
                          {playerById.get(commitment.beneficiaryId)?.name ??
                            commitment.beneficiaryId}
                          {' · '}
                          {getSocialCommitmentDueCopy(commitment.kind)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {needsResponseInteractions.length > 0 && (
                <section className="inbox-section" aria-label="Needs Response">
                  <h3 className="inbox-section__title">Needs Response</h3>
                  <div className="inbox-section__list" role="list">
                    {needsResponseInteractions.map(({ interaction, priority }) =>
                      renderInteraction(interaction, priority, true, true),
                    )}
                  </div>
                </section>
              )}

              {updateInteractions.length > 0 && (
                <section className="inbox-section" aria-label="Updates">
                  <h3 className="inbox-section__title inbox-section__title--updates">
                    Updates
                  </h3>
                  <div className="inbox-section__list" role="list">
                    {updateInteractions.map(({ interaction, priority }) =>
                      renderInteraction(interaction, priority, true, true),
                    )}
                  </div>
                </section>
              )}

              {resolvedInteractions.length > 0 && (
                <section className="inbox-section" aria-label="Resolved Today">
                  <h3 className="inbox-section__title inbox-section__title--resolved">
                    Resolved Today
                  </h3>
                  <div className="inbox-section__list" role="list">
                    {resolvedInteractions.map(({ interaction, priority }) =>
                      renderInteraction(interaction, priority, false, false),
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
