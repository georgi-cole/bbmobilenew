import { getIncomingInteractionValidityRule } from './incomingInteractionValidityBank'
import type { IncomingInteraction, ScheduledIncomingInteraction } from './types'

interface InteractionValidityPlayer {
  id: string
  status: string
  isUser?: boolean
}

export interface InteractionValidityGameState {
  phase?: string
  lohId?: string | null
  posWinnerId?: string | null
  nomineeIds?: string[]
  awaitingPovDecision?: boolean
  awaitingPovSaveTarget?: boolean
  povProtectedIds?: string[]
  players?: InteractionValidityPlayer[]
}

function getScenarioKey(interaction: IncomingInteraction): string | null {
  return typeof interaction.payload?.scenarioKey === 'string'
    ? interaction.payload.scenarioKey
    : null
}

function getPlayer(
  game: InteractionValidityGameState,
  playerId: string
): InteractionValidityPlayer | null {
  return game.players?.find((player) => player.id === playerId) ?? null
}

function isEvictedOrGone(player: InteractionValidityPlayer | null): boolean {
  if (!player) return false
  return player.status === 'evicted' || player.status === 'jury'
}

function isNominee(game: InteractionValidityGameState, playerId: string): boolean {
  const player = getPlayer(game, playerId)
  return (
    (game.nomineeIds ?? []).includes(playerId) || player?.status.includes('nominated') === true
  )
}

function holdsSafety(game: InteractionValidityGameState, playerId: string): boolean {
  const player = getPlayer(game, playerId)
  return game.posWinnerId === playerId || player?.status.includes('pos') === true
}

function humanPlayer(game: InteractionValidityGameState): InteractionValidityPlayer | null {
  return game.players?.find((player) => player.isUser) ?? null
}

function isHumanHoh(game: InteractionValidityGameState): boolean {
  const human = humanPlayer(game)
  if (!human) return false
  return game.lohId === human.id || human.status.includes('loh')
}

function isHumanVetoActionable(game: InteractionValidityGameState): boolean {
  const human = humanPlayer(game)
  if (!human || !holdsSafety(game, human.id)) return false
  return Boolean(game.awaitingPovDecision || game.awaitingPovSaveTarget)
}

function violatesDeclarativeRule(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState
): boolean {
  const rule = getIncomingInteractionValidityRule(getScenarioKey(interaction))
  if (!rule) return false

  const phase = game.phase ?? ''
  if (rule.allowedPhases && !rule.allowedPhases.includes(phase)) return true
  if (rule.invalidPhases?.includes(phase)) return true

  if (
    rule.senderMustBeNominee !== undefined &&
    isNominee(game, interaction.fromId) !== rule.senderMustBeNominee
  ) {
    return true
  }
  if (rule.senderMustHoldSafety && !holdsSafety(game, interaction.fromId)) return true
  if (rule.humanMustBeHoh && !isHumanHoh(game)) return true
  if (rule.humanMustHoldSafety && !isHumanVetoActionable(game)) return true

  if (rule.subjectMustBeInHouse) {
    const subjectId = interaction.payload?.subjectId
    if (typeof subjectId !== 'string') return true
    const subject = getPlayer(game, subjectId)
    if (!subject || isEvictedOrGone(subject)) return true
  }

  return false
}

export function isIncomingInteractionInvalidated(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState
): boolean {
  const sender = getPlayer(game, interaction.fromId)
  if (isEvictedOrGone(sender)) return true

  const human = humanPlayer(game)
  if (
    interaction.payload?.originActionId === 'nominate' &&
    human &&
    (game.posWinnerId === human.id ||
      game.povProtectedIds?.includes(human.id) ||
      human.status.includes('pos'))
  ) {
    return true
  }

  return violatesDeclarativeRule(interaction, game)
}

export function collectInvalidIncomingInteractionIds({
  incomingInteractions,
  scheduledIncomingInteractions,
  game,
}: {
  incomingInteractions: IncomingInteraction[]
  scheduledIncomingInteractions: ScheduledIncomingInteraction[]
  game: InteractionValidityGameState
}): string[] {
  const ids = new Set<string>()

  for (const interaction of incomingInteractions) {
    if (!interaction.resolved && isIncomingInteractionInvalidated(interaction, game)) {
      ids.add(interaction.id)
    }
  }

  for (const entry of scheduledIncomingInteractions) {
    if (isIncomingInteractionInvalidated(entry.interaction, game)) {
      ids.add(entry.interaction.id)
    }
  }

  return [...ids]
}
