import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  closeIncomingInbox,
  markAllIncomingInteractionsRead,
  selectIncomingInboxOpen,
  selectIncomingInteractions,
  selectUnreadIncomingInteractionCount,
} from '../../social/socialSlice';
import { getIncomingInteractionTypeLabel, respondToIncomingInteraction } from '../../social/incomingInteractions';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './IncomingInteractionsInbox.css';

function formatResponseLabel(response?: string) {
  if (!response) return 'Resolved';
  const cleaned = response.replace(/_/g, ' ');
  return `Resolved · ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

export default function IncomingInteractionsInbox() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectIncomingInboxOpen);
  const interactions = useAppSelector(selectIncomingInteractions);
  const unreadCount = useAppSelector(selectUnreadIncomingInteractionCount);
  const players = useAppSelector((s) => s.game.players);

  const humanPlayer = players.find((player) => player.isUser);

  const sortedInteractions = useMemo(
    () => [...interactions].sort((a, b) => b.createdAt - a.createdAt),
    [interactions],
  );

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
            <span className="inbox-header__count">
              {sortedInteractions.length} total
            </span>
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

        <div className="inbox-list" role="list">
          {sortedInteractions.length === 0 ? (
            <div className="inbox-empty">No incoming interactions yet.</div>
          ) : (
            sortedInteractions.map((interaction) => {
              const fromPlayer = players.find((player) => player.id === interaction.fromId);
              const fromName = fromPlayer?.name ?? interaction.fromId;
              const typeLabel = getIncomingInteractionTypeLabel(interaction.type);
              const isUnread = !interaction.read && !interaction.resolved;
              const resolvedLabel = interaction.resolved
                ? formatResponseLabel(interaction.resolvedWith)
                : isUnread
                  ? 'New'
                  : 'Read';

              return (
                <div
                  key={interaction.id}
                  className={`inbox-item${isUnread ? ' inbox-item--unread' : ''}`}
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
                      <span className="inbox-item__from">{fromName}</span>
                      <span className="inbox-item__type">{typeLabel}</span>
                    </div>
                    <span className={`inbox-item__status${isUnread ? ' inbox-item__status--new' : ''}`}>
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
            })
          )}
        </div>
      </div>
    </div>
  );
}
