import type { Phase, PlayerStatus } from '../types'
import type { GameMode } from '../modes/modeTypes'

const OUTGOING_SOCIAL_BLOCKED_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'live_vote',
  'eviction_results',
])

const SURVIVAL_SOCIAL_BLOCK_REASON = 'Surveyeval Mode disables social modules.'

export type SocialModuleKind = 'outgoing' | 'incoming'

interface HumanPlayerLike {
  id: string
  isUser?: boolean
  status: PlayerStatus
}

interface GameLike {
  mode?: GameMode | null
  phase?: Phase | null
  players?: ReadonlyArray<HumanPlayerLike>
}

export interface SocialModuleAvailability {
  canOpen: boolean
  reason: string | null
  phase: Phase | null
  humanPlayerId: string | null
  humanStatus: PlayerStatus | null
  moduleKind?: SocialModuleKind
}

export const SOCIAL_MODULE_BLOCKED_IN_GAME_MESSAGE =
  'The house is in a locked ceremony, so you cannot start a new conversation right now.'
export const SOCIAL_MODULE_BLOCKED_DURING_LIVE_VOTE_MESSAGE =
  'Everybody is currently waiting to vote or be voted, so no time for chit-chat now.'
export const SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE =
  'You are no longer in the house. But maybe try telepathy?'
export const SURVIVOR_SOCIAL_BLOCKED_MESSAGES = [
  'The AI players do not feel the need to socialize. They are only after the win.',
  'Nobody replied to you. You should improve your AI hacking skills and program some friends.',
  'The AI players are in standby mode for the next challenge. Nobody seems to react to your social attempts.',
] as const

function pickSurvivorSocialBlockedMessage(): string {
  const index = Math.floor(Math.random() * SURVIVOR_SOCIAL_BLOCKED_MESSAGES.length)
  return SURVIVOR_SOCIAL_BLOCKED_MESSAGES[index]
}

export function getSocialModuleAvailability(
  game: GameLike,
  moduleKind: SocialModuleKind = 'outgoing'
): SocialModuleAvailability {
  const phase = game.phase ?? null
  const humanPlayer = game.players?.find((player) => player.isUser) ?? null

  if (!humanPlayer) {
    return {
      canOpen: false,
      reason: 'No human player found.',
      phase,
      humanPlayerId: null,
      humanStatus: null,
      moduleKind,
    }
  }

  if (humanPlayer.status === 'evicted' || humanPlayer.status === 'jury') {
    return {
      canOpen: false,
      reason: `Human player is out of the house (status: ${humanPlayer.status}).`,
      phase,
      humanPlayerId: humanPlayer.id,
      humanStatus: humanPlayer.status,
      moduleKind,
    }
  }

  if (game.mode === 'survival') {
    return {
      canOpen: false,
      reason: SURVIVAL_SOCIAL_BLOCK_REASON,
      phase,
      humanPlayerId: humanPlayer.id,
      humanStatus: humanPlayer.status,
      moduleKind,
    }
  }

  if (moduleKind === 'outgoing' && phase && OUTGOING_SOCIAL_BLOCKED_PHASES.has(phase)) {
    return {
      canOpen: false,
      reason: `Outgoing social actions are blocked during the ${phase} phase.`,
      phase,
      humanPlayerId: humanPlayer.id,
      humanStatus: humanPlayer.status,
      moduleKind,
    }
  }

  return {
    canOpen: true,
    reason: null,
    phase,
    humanPlayerId: humanPlayer.id,
    humanStatus: humanPlayer.status,
    moduleKind,
  }
}

/**
 * Incoming messages remain available during voting and result phases. Those are
 * precisely the windows in which vote pitches, reactions and urgent pleas are
 * authored; blocking the inbox made valid interactions impossible to read.
 */
export function getIncomingSocialModuleAvailability(game: GameLike): SocialModuleAvailability {
  return getSocialModuleAvailability(game, 'incoming')
}

export function logBlockedSocialModuleOpen(
  moduleName: string,
  availability: SocialModuleAvailability,
  context?: string
) {
  if (availability.canOpen || !availability.reason) return
  console.warn(`[SocialModules] ${moduleName} did not open: ${availability.reason}`, {
    moduleName,
    context,
    ...availability,
  })
}

export function getBlockedSocialModuleAnnouncementMessage(
  availability: SocialModuleAvailability
): string | null {
  if (availability.canOpen) return null

  if (availability.reason === SURVIVAL_SOCIAL_BLOCK_REASON) {
    return pickSurvivorSocialBlockedMessage()
  }

  if (
    availability.humanStatus === 'evicted' ||
    availability.humanStatus === 'jury' ||
    availability.humanPlayerId === null
  ) {
    return SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE
  }

  if (availability.phase === 'live_vote') {
    return SOCIAL_MODULE_BLOCKED_DURING_LIVE_VOTE_MESSAGE
  }

  return SOCIAL_MODULE_BLOCKED_IN_GAME_MESSAGE
}
