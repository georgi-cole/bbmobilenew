import { addTvEvent } from '../store/gameSlice';
import type { AppDispatch, RootState } from '../store/store';
import { socialConfig } from './socialConfig';
import {
  resolveExpiredIncomingInteractionsForWeek,
  resolveIncomingInteraction,
  updateRelationship,
} from './socialSlice';
import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  IncomingInteractionType,
} from './types';

const TYPE_LABELS: Record<IncomingInteractionType, string> = {
  compliment: 'compliment',
  gossip: 'gossip',
  warning: 'warning',
  alliance_proposal: 'alliance proposal',
  deal_offer: 'deal offer',
  nomination_plea: 'nomination plea',
  check_in: 'check-in',
  snide_remark: 'snide remark',
  other: 'message',
};

const RESPONSE_VERBS: Record<IncomingInteractionResponseType, string> = {
  positive: 'encouraged',
  neutral: 'acknowledged',
  negative: 'pushed back on',
  accept: 'accepted',
  decline: 'declined',
  dismiss: 'dismissed',
  ignore: 'ignored',
};

export function getIncomingInteractionTypeLabel(type: IncomingInteractionType): string {
  return TYPE_LABELS[type];
}

function getResponseDelta(responseType: IncomingInteractionResponseType): number {
  const deltas = socialConfig.incomingInteractionAffinityDeltas;
  if (responseType === 'accept') return deltas.positive;
  if (responseType === 'decline') return deltas.negative;
  return deltas[responseType] ?? 0;
}

function buildResponseLogText(
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType,
  fromName: string,
): string {
  const typeLabel = getIncomingInteractionTypeLabel(interaction.type);
  if (responseType === 'ignore') {
    return `You ignored ${fromName}'s ${typeLabel} at week end.`;
  }
  const verb = RESPONSE_VERBS[responseType] ?? 'responded to';
  return `You ${verb} ${fromName}'s ${typeLabel}.`;
}

export function respondToIncomingInteraction({
  interactionId,
  responseType,
}: {
  interactionId: string;
  responseType: IncomingInteractionResponseType;
}) {
  return (dispatch: AppDispatch, getState: () => RootState): void => {
    const state = getState();
    const interaction = state.social.incomingInteractions.find((entry) => entry.id === interactionId);
    if (!interaction || interaction.resolved) return;
    const humanPlayer = state.game.players.find((player) => player.isUser);
    if (!humanPlayer) return;

    const fromPlayer = state.game.players.find((player) => player.id === interaction.fromId);
    const fromName = fromPlayer?.name ?? interaction.fromId;
    const resolvedAt = Date.now();

    dispatch(resolveIncomingInteraction({ interactionId, resolvedWith: responseType, resolvedAt }));

    const delta = getResponseDelta(responseType);
    if (delta !== 0 && interaction.fromId !== humanPlayer.id) {
      dispatch(
        updateRelationship({
          source: interaction.fromId,
          target: humanPlayer.id,
          delta,
          actionSource: 'manual',
        }),
      );
    }

    const text = buildResponseLogText(interaction, responseType, fromName);
    dispatch(
      addTvEvent({
        text,
        type: 'social',
        source: 'manual',
        channels: ['tv', 'mainLog', 'dr'],
      }),
    );
  };
}

export function autoResolveExpiredIncomingInteractionsForWeek(week: number) {
  return (dispatch: AppDispatch, getState: () => RootState): void => {
    const state = getState();
    const interactions = state.social.incomingInteractions.filter(
      (entry) => !entry.resolved && entry.expiresAtWeek <= week,
    );
    if (interactions.length === 0) return;
    const humanPlayer = state.game.players.find((player) => player.isUser);
    if (!humanPlayer) return;

    const resolvedAt = Date.now();
    const ignoreDelta = getResponseDelta('ignore');

    interactions.forEach((interaction) => {
      const fromPlayer = state.game.players.find((player) => player.id === interaction.fromId);
      const fromName = fromPlayer?.name ?? interaction.fromId;

      if (ignoreDelta !== 0 && interaction.fromId !== humanPlayer.id) {
        dispatch(
          updateRelationship({
            source: interaction.fromId,
            target: humanPlayer.id,
            delta: ignoreDelta,
            actionSource: 'system',
          }),
        );
      }

      const text = buildResponseLogText(interaction, 'ignore', fromName);
      dispatch(
        addTvEvent({
          text,
          type: 'social',
          source: 'system',
          channels: ['tv', 'mainLog'],
        }),
      );
    });

    dispatch(resolveExpiredIncomingInteractionsForWeek({ week, resolvedAt }));
  };
}
