import { addTvEvent } from '../store/gameSlice';
import type { AppDispatch, RootState } from '../store/store';
import { socialConfig } from './socialConfig';
import { logIncomingInteractionDecision } from './incomingInteractionLogging';
import {
  resolveExpiredIncomingInteractionsForWeek,
  resolveIncomingInteraction,
  updateRelationship,
  updateSocialMemory,
} from './socialSlice';
import {
  buildSocialMemoryDeltaForResponse,
  buildSocialMemoryEvent,
} from './socialMemory';
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
    const currentWeek = state.game.week ?? 1;

    dispatch(
      resolveIncomingInteraction({
        interactionId,
        resolvedWith: responseType,
        resolvedAt,
        resolvedWeek: currentWeek,
      }),
    );

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

    if (interaction.fromId !== humanPlayer.id) {
      const memoryDelta = buildSocialMemoryDeltaForResponse(responseType);
      const memoryEvent = buildSocialMemoryEvent(
        interaction,
        responseType,
        interaction.fromId,
        humanPlayer.id,
        currentWeek,
        resolvedAt,
      );
      dispatch(
        updateSocialMemory({
          actorId: interaction.fromId,
          targetId: humanPlayer.id,
          deltas: memoryDelta,
          event: memoryEvent,
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
      (entry) => !entry.resolved && entry.expiresAtWeek < week,
    );
    if (interactions.length === 0) return;
    const humanPlayer = state.game.players.find((player) => player.isUser);
    if (!humanPlayer) return;

    const resolvedAt = Date.now();
    const ignoreDelta = getResponseDelta('ignore');

    interactions.forEach((interaction) => {
      logIncomingInteractionDecision(dispatch, {
        stage: 'auto_resolution',
        reason: 'auto_resolved_ignored',
        interactionId: interaction.id,
        actorId: interaction.fromId,
        type: interaction.type,
        week,
        detail: 'week_end',
      });
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

      if (interaction.fromId !== humanPlayer.id) {
        const memoryDelta = buildSocialMemoryDeltaForResponse('ignore');
        const memoryEvent = buildSocialMemoryEvent(
          interaction,
          'ignore',
          interaction.fromId,
          humanPlayer.id,
          week,
          resolvedAt,
        );
        dispatch(
          updateSocialMemory({
            actorId: interaction.fromId,
            targetId: humanPlayer.id,
            deltas: memoryDelta,
            event: memoryEvent,
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
