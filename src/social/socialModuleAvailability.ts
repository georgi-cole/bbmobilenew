import type { Phase, PlayerStatus } from '../types';
import type { GameMode } from '../modes/modeTypes';

const SOCIAL_MODULE_BLOCKED_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'live_vote',
  'eviction_results',
]);

const SURVIVOR_SOCIAL_BLOCK_REASON = 'Surveyeval Mode disables social modules.';

interface HumanPlayerLike {
  id: string;
  isUser?: boolean;
  status: PlayerStatus;
}

interface GameLike {
  mode?: GameMode | null;
  phase?: Phase | null;
  players?: ReadonlyArray<HumanPlayerLike>;
}

export interface SocialModuleAvailability {
  canOpen: boolean;
  reason: string | null;
  phase: Phase | null;
  humanPlayerId: string | null;
  humanStatus: PlayerStatus | null;
}

export const SOCIAL_MODULE_BLOCKED_IN_GAME_MESSAGE =
  'Everybody is currently waiting to vote or be voted, so no time for chit-chat now.';
export const SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE =
  'You are no longer in the house. But maybe try telepathy?';
export const SURVIVOR_SOCIAL_BLOCKED_MESSAGES = [
  'The AI players do not feel the need to socialize. They are only after the win.',
  'Nobody replied to you. You should improve your AI hacking skills and program some friends.',
  'The AI players are in standby mode for the next challenge. Nobody seems to react to your social attempts.',
] as const;

function pickSurvivorSocialBlockedMessage(): string {
  const index = Math.floor(Math.random() * SURVIVOR_SOCIAL_BLOCKED_MESSAGES.length);
  return SURVIVOR_SOCIAL_BLOCKED_MESSAGES[index];
}

export function getSocialModuleAvailability(game: GameLike): SocialModuleAvailability {
  const phase = game.phase ?? null;
  const humanPlayer = game.players?.find((player) => player.isUser) ?? null;

  if (!humanPlayer) {
    return {
      canOpen: false,
      reason: 'No human player found.',
      phase,
      humanPlayerId: null,
      humanStatus: null,
    };
  }

  if (humanPlayer.status === 'evicted' || humanPlayer.status === 'jury') {
    return {
      canOpen: false,
      reason: `Human player is out of the house (status: ${humanPlayer.status}).`,
      phase,
      humanPlayerId: humanPlayer.id,
      humanStatus: humanPlayer.status,
    };
  }

  if (game.mode === 'survival') {
    return {
      canOpen: false,
      reason: SURVIVOR_SOCIAL_BLOCK_REASON,
      phase,
      humanPlayerId: humanPlayer.id,
      humanStatus: humanPlayer.status,
    };
  }

  if (phase && SOCIAL_MODULE_BLOCKED_PHASES.has(phase)) {
    return {
      canOpen: false,
      reason: `Social modules are blocked during the ${phase} phase.`,
      phase,
      humanPlayerId: humanPlayer.id,
      humanStatus: humanPlayer.status,
    };
  }

  return {
    canOpen: true,
    reason: null,
    phase,
    humanPlayerId: humanPlayer.id,
    humanStatus: humanPlayer.status,
  };
}

export function logBlockedSocialModuleOpen(
  moduleName: string,
  availability: SocialModuleAvailability,
  context?: string,
) {
  if (availability.canOpen || !availability.reason) {
    return;
  }

  console.warn(
    `[SocialModules] ${moduleName} did not open: ${availability.reason}`,
    {
      moduleName,
      context,
      ...availability,
    },
  );
}

export function getBlockedSocialModuleAnnouncementMessage(
  availability: SocialModuleAvailability,
): string | null {
  if (availability.canOpen) {
    return null;
  }

  if (availability.reason === SURVIVOR_SOCIAL_BLOCK_REASON) {
    return pickSurvivorSocialBlockedMessage();
  }

  if (
    availability.humanStatus === 'evicted' ||
    availability.humanStatus === 'jury' ||
    availability.humanPlayerId === null
  ) {
    return SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE;
  }

  return SOCIAL_MODULE_BLOCKED_IN_GAME_MESSAGE;
}
