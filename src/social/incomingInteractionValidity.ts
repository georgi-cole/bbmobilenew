import type { IncomingInteraction, ScheduledIncomingInteraction } from './types';

interface InteractionValidityPlayer {
  id: string;
  status: string;
  isUser?: boolean;
}

export interface InteractionValidityGameState {
  phase?: string;
  lohId?: string | null;
  posWinnerId?: string | null;
  nomineeIds?: string[];
  awaitingPovDecision?: boolean;
  awaitingPovSaveTarget?: boolean;
  povProtectedIds?: string[];
  players?: InteractionValidityPlayer[];
}

function getScenarioKey(interaction: IncomingInteraction): string | null {
  return typeof interaction.payload?.scenarioKey === 'string' ? interaction.payload.scenarioKey : null;
}

function getPlayer(game: InteractionValidityGameState, playerId: string): InteractionValidityPlayer | null {
  return game.players?.find((player) => player.id === playerId) ?? null;
}

function isEvictedOrGone(player: InteractionValidityPlayer | null): boolean {
  if (!player) return false;
  return player.status === 'evicted' || player.status === 'jury';
}

function isNominee(game: InteractionValidityGameState, playerId: string): boolean {
  const player = getPlayer(game, playerId);
  return (game.nomineeIds ?? []).includes(playerId) || player?.status.includes('nominated') === true;
}

function isHumanHoh(game: InteractionValidityGameState): boolean {
  const human = game.players?.find((player) => player.isUser);
  if (!human) return false;
  return game.lohId === human.id || human.status.includes('loh');
}

function isHumanVetoActionable(game: InteractionValidityGameState): boolean {
  const human = game.players?.find((player) => player.isUser);
  if (!human) return false;
  const humanHasPower = game.posWinnerId === human.id || human.status.includes('pos');
  if (!humanHasPower) return false;
  return Boolean(game.awaitingPovDecision || game.awaitingPovSaveTarget);
}

export function isIncomingInteractionInvalidated(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState,
): boolean {
  const sender = getPlayer(game, interaction.fromId);
  if (isEvictedOrGone(sender)) {
    return true;
  }
  const human = game.players?.find((player) => player.isUser);
  if (
    interaction.payload?.originActionId === 'nominate'
    && human
    && (game.posWinnerId === human.id
      || game.povProtectedIds?.includes(human.id)
      || human.status.includes('pos'))
  ) {
    return true;
  }

  const scenarioKey = getScenarioKey(interaction);
  if (!scenarioKey) {
    return false;
  }

  switch (scenarioKey) {
    case 'nominee_veto_pitch':
      return !isNominee(game, interaction.fromId) || !isHumanVetoActionable(game);
    case 'nominee_hoh_plea':
      return !isNominee(game, interaction.fromId) || !isHumanHoh(game);
    case 'nomination_aftershock':
    case 'nominee_campaign':
    case 'live_vote_pitch':
    case 'post_veto_campaign':
      return !isNominee(game, interaction.fromId);
    case 'hoh_safety_request':
      return isNominee(game, interaction.fromId) || !isHumanHoh(game);
    default:
      return false;
  }
}

export function collectInvalidIncomingInteractionIds({
  incomingInteractions,
  scheduledIncomingInteractions,
  game,
}: {
  incomingInteractions: IncomingInteraction[];
  scheduledIncomingInteractions: ScheduledIncomingInteraction[];
  game: InteractionValidityGameState;
}): string[] {
  const ids = new Set<string>();

  for (const interaction of incomingInteractions) {
    if (!interaction.resolved && isIncomingInteractionInvalidated(interaction, game)) {
      ids.add(interaction.id);
    }
  }

  for (const entry of scheduledIncomingInteractions) {
    if (isIncomingInteractionInvalidated(entry.interaction, game)) {
      ids.add(entry.interaction.id);
    }
  }

  return [...ids];
}
