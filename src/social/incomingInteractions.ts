import { addTvEvent } from '../store/gameSlice';
import type { AppDispatch, RootState } from '../store/store';
import { socialConfig } from './socialConfig';
import { logIncomingInteractionDecision } from './incomingInteractionLogging';
import {
  dismissIncomingInteraction,
  resolveExpiredIncomingInteractionsForWeek,
  resolveIncomingInteraction,
  updateRelationship,
  updateSocialMemory,
} from './socialSlice';
import { isIncomingInteractionInvalidated } from './incomingInteractionValidity';
import {
  buildSocialMemoryDeltaForResponse,
  buildSocialMemoryEvent,
} from './socialMemory';
import { ALLIANCE_TAG } from './socialAlliance';
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

const IGNORED_INTERACTION_SUMMARY_LABELS: Record<IncomingInteractionType, { singular: string; plural: string }> = {
  compliment: { singular: 'compliment', plural: 'compliments' },
  gossip: { singular: 'gossip drop', plural: 'gossip drops' },
  warning: { singular: 'warning', plural: 'warnings' },
  alliance_proposal: { singular: 'alliance proposal', plural: 'alliance proposals' },
  deal_offer: { singular: 'deal offer', plural: 'deal offers' },
  nomination_plea: { singular: 'nomination plea', plural: 'nomination pleas' },
  check_in: { singular: 'check-in', plural: 'check-ins' },
  snide_remark: { singular: 'snide remark', plural: 'snide remarks' },
  other: { singular: 'message', plural: 'messages' },
};

const IGNORED_INTERACTION_TYPE_PRIORITY: Record<IncomingInteractionType, number> = {
  deal_offer: 0,
  nomination_plea: 1,
  alliance_proposal: 2,
  warning: 3,
  check_in: 4,
  gossip: 5,
  compliment: 6,
  snide_remark: 7,
  other: 8,
};

const DEFAULT_IGNORED_INTERACTION_LABEL = 'messages';

export function getIncomingInteractionTypeLabel(type: IncomingInteractionType): string {
  return TYPE_LABELS[type];
}

function formatList(items: string[]): string {
  if (items.length === 0) return DEFAULT_IGNORED_INTERACTION_LABEL;
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function buildIgnoredIncomingInteractionsSummary(interactions: IncomingInteraction[]): string {
  const counts = new Map<IncomingInteractionType, number>();
  interactions.forEach((interaction) => {
    counts.set(interaction.type, (counts.get(interaction.type) ?? 0) + 1);
  });
  const uniqueSenderCount = new Set(interactions.map((interaction) => interaction.fromId)).size;
  const typeFragments = Array.from(counts.entries())
    .sort(([leftType], [rightType]) =>
      IGNORED_INTERACTION_TYPE_PRIORITY[leftType] - IGNORED_INTERACTION_TYPE_PRIORITY[rightType],
    )
    .map(([type, count]) => {
      const labels = IGNORED_INTERACTION_SUMMARY_LABELS[type];
      return count === 1 ? labels.singular : labels.plural;
    });

  if (uniqueSenderCount === 1) {
    return `One player's ${formatList(typeFragments)} went unanswered yesterday. It was a tough one, but maybe you will be more talkative today.`;
  }

  return `Several players' ${formatList(typeFragments)} went unanswered yesterday. It was a tough day, but maybe you will be more talkative today.`;
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
    const currentWeek = state.game.week ?? 1;
    const resolvedAt = Date.now();

    if (isIncomingInteractionInvalidated(interaction, state.game)) {
      dispatch(
        dismissIncomingInteraction({
          interactionId,
          resolvedAt,
          resolvedWeek: currentWeek,
        }),
      );
      return;
    }

    const fromPlayer = state.game.players.find((player) => player.id === interaction.fromId);
    const fromName = fromPlayer?.name ?? interaction.fromId;

    dispatch(
      resolveIncomingInteraction({
        interactionId,
        resolvedWith: responseType,
        resolvedAt,
        resolvedWeek: currentWeek,
      }),
    );

    const delta = getResponseDelta(responseType);
    const acceptedAlliance =
      interaction.type === 'alliance_proposal' && responseType === 'accept';
    if (delta !== 0 && interaction.fromId !== humanPlayer.id) {
      dispatch(
        updateRelationship({
          source: interaction.fromId,
          target: humanPlayer.id,
          delta,
          tags: acceptedAlliance ? [ALLIANCE_TAG] : undefined,
          actionSource: 'manual',
        }),
      );
      if (acceptedAlliance) {
        dispatch(
          updateRelationship({
            source: humanPlayer.id,
            target: interaction.fromId,
            delta,
            tags: [ALLIANCE_TAG],
            actionSource: 'system',
          }),
        );
      }
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

    });

    dispatch(
      addTvEvent({
        text: buildIgnoredIncomingInteractionsSummary(interactions),
        type: 'social',
        source: 'system',
        channels: ['tv', 'mainLog'],
      }),
    );

    dispatch(resolveExpiredIncomingInteractionsForWeek({ week, resolvedAt }));
  };
}
