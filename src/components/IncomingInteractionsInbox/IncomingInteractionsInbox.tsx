import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  closeIncomingInbox,
  markAllIncomingInteractionsRead,
  selectIncomingInboxOpen,
  selectIncomingInteractions,
  selectUnreadIncomingInteractionCount,
} from '../../social/socialSlice';
import { getIncomingInteractionPriority } from '../../social/incomingInteractionScheduler';
import { getIncomingInteractionTypeLabel, respondToIncomingInteraction } from '../../social/incomingInteractions';
import type {
  IncomingInteraction,
  IncomingInteractionPriority,
  IncomingInteractionType,
} from '../../social/types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
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

const TYPE_ICONS: Record<IncomingInteractionType, string> = {
  nomination_plea: '🙏',
  alliance_proposal: '🤝',
  deal_offer: '💼',
  warning: '⚠️',
  gossip: '🗣️',
  check_in: '💬',
  compliment: '💖',
  snide_remark: '😏',
  other: '💌',
};

function formatResponseLabel(response?: string) {
  if (!response) return 'Resolved';
  const cleaned = response.replace(/_/g, ' ');
  return `Resolved · ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

function getExpiryLabel(
  interaction: IncomingInteraction,
  currentWeek: number,
  priority: IncomingInteractionPriority,
): string | null {
  if (interaction.resolved) return null;
  if (interaction.expiresAtWeek <= currentWeek) {
    return priority === 'high' ? 'Urgent this week' : 'Needs response this week';
  }
  return null;
}

export default function IncomingInteractionsInbox() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectIncomingInboxOpen);
  const interactions = useAppSelector(selectIncomingInteractions);
  const unreadCount = useAppSelector(selectUnreadIncomingInteractionCount);
  const players = useAppSelector((s) => s.game.players);
  const currentWeek = useAppSelector((s) => s.game.week ?? 1);

  const humanPlayer = players.find((player) => player.isUser);

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

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
        const resolvedDiff = Number(a.interaction.resolved) - Number(b.interaction.resolved);
        if (resolvedDiff !== 0) return resolvedDiff;
        const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        const expiryDiff = a.interaction.expiresAtWeek - b.interaction.expiresAtWeek;
        if (expiryDiff !== 0) return expiryDiff;
        return b.interaction.createdAt - a.interaction.createdAt;
      }),
    [interactionEntries],
  );

  const pendingInteractions = useMemo(
    () => sortedInteractions.filter((entry) => !entry.interaction.resolved),
    [sortedInteractions],
  );
  const resolvedInteractions = useMemo(
    () =>
      sortedInteractions.filter(
        (entry) => entry.interaction.resolved && entry.interaction.expiresAtWeek >= currentWeek,
      ),
    [sortedInteractions, currentWeek],
  );

  const urgentCount = useMemo(
    () =>
      pendingInteractions.filter(
        (entry) =>
          entry.priority === 'high' || entry.interaction.expiresAtWeek <= currentWeek,
      ).length,
    [pendingInteractions, currentWeek],
  );

  const headerSummary =
    pendingInteractions.length === 0
      ? 'All caught up'
      : `${pendingInteractions.length} pending${urgentCount > 0 ? ` • ${urgentCount} urgent` : ''}`;

  useEffect(() => {
    if (open && unreadCount > 0) {
      dispatch(markAllIncomingInteractionsRead());
    }
  }, [open, unreadCount, dispatch]);

  if (!open || !humanPlayer) return null;

  return (
    <div className="inbox-backdrop" role="dialog" aria-modal="true" aria-label="Incoming interactions">
      <div className="inbox-panel">
        <header className="inbox-header">
          <div className="inbox-header__title">📥 Incoming Interactions</div>
          <div className="inbox-header__meta">
            <span className="inbox-header__summary">{headerSummary}</span>
            <button
              className="inbox-header__close"
              type="button"
              aria-label="Close inbox"
              onClick={() => dispatch(closeIncomingInbox())}
            >
              ✕
            </button>
          </div>
        </header>

        <div className="inbox-list">
          {sortedInteractions.length === 0 ? (
            <div className="inbox-empty">No incoming interactions yet.</div>
          ) : (
            <div className="inbox-sections">
              <section className="inbox-section" aria-label="Needs Response">
                <h3 className="inbox-section__title">Needs Response</h3>
                {pendingInteractions.length === 0 ? (
                  <div className="inbox-empty inbox-empty--compact">No pending interactions.</div>
                ) : (
                  <div className="inbox-section__list" role="list">
                    {pendingInteractions.map(({ interaction, priority }) => {
                      const fromPlayer = playerById.get(interaction.fromId);
                      const fromName = fromPlayer?.name ?? interaction.fromId;
                      const typeLabel = getIncomingInteractionTypeLabel(interaction.type);
                      const typeIcon = TYPE_ICONS[interaction.type] ?? '💌';
                      const isUnread = !interaction.read && !interaction.resolved;
                      const resolvedLabel = interaction.resolved
                        ? formatResponseLabel(interaction.resolvedWith)
                        : isUnread
                          ? 'New'
                          : 'Read';
                      const priorityLabel = PRIORITY_LABELS[priority];
                      const expiryLabel = getExpiryLabel(interaction, currentWeek, priority);
                      const expiryClass =
                        expiryLabel && priority === 'high' ? ' inbox-item__expiry--urgent' : '';

                      return (
                        <div
                          key={interaction.id}
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
                              <span className="inbox-item__avatar-fallback" aria-hidden="true">
                                👤
                              </span>
                            )}
                            <div className="inbox-item__title">
                              <div className="inbox-item__from-row">
                                <span className="inbox-item__from">{fromName}</span>
                                <span className={`inbox-item__priority inbox-item__priority--${priority}`}>
                                  {priorityLabel}
                                </span>
                              </div>
                              <div className="inbox-item__type-row">
                                <span className="inbox-item__type-icon" aria-hidden="true">
                                  {typeIcon}
                                </span>
                                <span className="inbox-item__type">{typeLabel}</span>
                                {expiryLabel && (
                                  <span className={`inbox-item__expiry${expiryClass}`}>
                                    {expiryLabel}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span
                              className={`inbox-item__status${isUnread ? ' inbox-item__status--new' : ''}`}
                            >
                              {resolvedLabel}
                            </span>
                          </div>

                          <p className="inbox-item__text">{interaction.text}</p>

                          {!interaction.resolved && (
                            <div className="inbox-item__actions">
                              <button
                                type="button"
                                className="inbox-action inbox-action--positive"
                                onClick={() =>
                                  dispatch(
                                    respondToIncomingInteraction({
                                      interactionId: interaction.id,
                                      responseType: 'positive',
                                    }),
                                  )
                                }
                              >
                                Positive
                              </button>
                              <button
                                type="button"
                                className="inbox-action inbox-action--neutral"
                                onClick={() =>
                                  dispatch(
                                    respondToIncomingInteraction({
                                      interactionId: interaction.id,
                                      responseType: 'neutral',
                                    }),
                                  )
                                }
                              >
                                Neutral
                              </button>
                              <button
                                type="button"
                                className="inbox-action inbox-action--negative"
                                onClick={() =>
                                  dispatch(
                                    respondToIncomingInteraction({
                                      interactionId: interaction.id,
                                      responseType: 'negative',
                                    }),
                                  )
                                }
                              >
                                Negative
                              </button>
                              <button
                                type="button"
                                className="inbox-action inbox-action--dismiss"
                                onClick={() =>
                                  dispatch(
                                    respondToIncomingInteraction({
                                      interactionId: interaction.id,
                                      responseType: 'dismiss',
                                    }),
                                  )
                                }
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              {resolvedInteractions.length > 0 && (
                <section className="inbox-section" aria-label="Resolved This Week">
                  <h3 className="inbox-section__title inbox-section__title--resolved">
                    Resolved This Week
                  </h3>
                  <div className="inbox-section__list" role="list">
                    {resolvedInteractions.map(({ interaction, priority }) => {
                      const fromPlayer = playerById.get(interaction.fromId);
                      const fromName = fromPlayer?.name ?? interaction.fromId;
                      const typeLabel = getIncomingInteractionTypeLabel(interaction.type);
                      const typeIcon = TYPE_ICONS[interaction.type] ?? '💌';
                      const isUnread = !interaction.read && !interaction.resolved;
                      const resolvedLabel = interaction.resolved
                        ? formatResponseLabel(interaction.resolvedWith)
                        : isUnread
                          ? 'New'
                          : 'Read';
                      const priorityLabel = PRIORITY_LABELS[priority];

                      return (
                        <div
                          key={interaction.id}
                          className={`inbox-item inbox-item--priority-${priority}${
                            isUnread ? ' inbox-item--unread' : ''
                          } inbox-item--resolved`}
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
                              <span className="inbox-item__avatar-fallback" aria-hidden="true">
                                👤
                              </span>
                            )}
                            <div className="inbox-item__title">
                              <div className="inbox-item__from-row">
                                <span className="inbox-item__from">{fromName}</span>
                                <span className={`inbox-item__priority inbox-item__priority--${priority}`}>
                                  {priorityLabel}
                                </span>
                              </div>
                              <div className="inbox-item__type-row">
                                <span className="inbox-item__type-icon" aria-hidden="true">
                                  {typeIcon}
                                </span>
                                <span className="inbox-item__type">{typeLabel}</span>
                              </div>
                            </div>
                            <span
                              className={`inbox-item__status${isUnread ? ' inbox-item__status--new' : ''}`}
                            >
                              {resolvedLabel}
                            </span>
                          </div>

                          <p className="inbox-item__text">{interaction.text}</p>
                        </div>
                      );
                    })}
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
