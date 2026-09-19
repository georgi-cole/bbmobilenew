import { getIncomingInteractionValidityRule } from './incomingInteractionValidityBank'
import type { IncomingInteraction, ScheduledIncomingInteraction } from './types'
import type { RealityDomainState } from './reality/types'

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
  replacementNomineeIds?: string[]
  awaitingPovDecision?: boolean
  awaitingPovSaveTarget?: boolean
  povProtectedIds?: string[]
  cupidArrow?: {
    status?: 'inactive' | 'scheduled' | 'active' | 'broken'
    pairs?: Array<{ memberIds: [string, string] }>
  }
  players?: InteractionValidityPlayer[]
}

function getScenarioKey(interaction: IncomingInteraction): string | null {
  return typeof interaction.payload?.scenarioKey === 'string'
    ? interaction.payload.scenarioKey
    : null
}

const ALLIANCE_STRATEGY_SCENARIOS = new Set([
  'alliance_nomination_pitch',
  'alliance_vox_ballot_pitch',
  'alliance_safety_pitch',
  'alliance_vote_pitch',
  'alliance_power_nomination_huddle',
  'alliance_power_safety_huddle',
])

function isAllianceProtectedGameUnit(
  game: InteractionValidityGameState,
  allianceMemberIds: readonly string[],
  playerId: string
): boolean {
  if (allianceMemberIds.includes(playerId)) return true
  if (game.cupidArrow?.status !== 'active') return false
  const pair = game.cupidArrow.pairs?.find((entry) => entry.memberIds.includes(playerId))
  const partnerId = pair?.memberIds.find((id) => id !== playerId)
  return partnerId !== undefined && allianceMemberIds.includes(partnerId)
}

function violatesRealityAllianceContext(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState,
  reality?: RealityDomainState
): boolean {
  if (!reality || !ALLIANCE_STRATEGY_SCENARIOS.has(getScenarioKey(interaction) ?? '')) return false

  const allianceId =
    typeof interaction.payload?.allianceId === 'string' ? interaction.payload.allianceId : null
  const human = humanPlayer(game)
  if (!allianceId || !human) return true

  const alliance = reality.alliances[allianceId]
  if (
    !alliance ||
    (alliance.status !== 'ACTIVE' && alliance.status !== 'PROBATIONARY') ||
    !alliance.memberIds.includes(interaction.fromId) ||
    !alliance.memberIds.includes(human.id)
  ) {
    return true
  }

  const subjectIds = [interaction.payload?.subjectId, interaction.payload?.secondarySubjectId].filter(
    (value): value is string => typeof value === 'string'
  )
  return subjectIds.some((subjectId) =>
    isAllianceProtectedGameUnit(game, alliance.memberIds, subjectId)
  )
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
  return (game.nomineeIds ?? []).includes(playerId) || player?.status.includes('nominated') === true
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
  if (
    rule.senderMustBeReplacementNominee !== undefined &&
    (game.replacementNomineeIds ?? []).includes(interaction.fromId) !==
      rule.senderMustBeReplacementNominee
  ) {
    return true
  }
  if (rule.senderMustBeHoh) {
    const sender = getPlayer(game, interaction.fromId)
    if (game.lohId !== interaction.fromId && sender?.status.includes('loh') !== true) return true
  }
  if (rule.senderMustHoldSafety && !holdsSafety(game, interaction.fromId)) return true
  if (rule.humanMustBeHoh && !isHumanHoh(game)) return true
  if (rule.humanMustHoldSafety && !isHumanVetoActionable(game)) return true
  if (rule.humanMustBeOffBlock) {
    const human = humanPlayer(game)
    if (!human || isNominee(game, human.id)) return true
  }
  if (rule.humanMustBeEligibleVoter) {
    const human = humanPlayer(game)
    if (
      !human ||
      isNominee(game, human.id) ||
      game.lohId === human.id ||
      human.status.includes('loh')
    ) {
      return true
    }
  }

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
  game: InteractionValidityGameState,
  reality?: RealityDomainState
): boolean {
  const sender = getPlayer(game, interaction.fromId)
  const human = humanPlayer(game)
  const activePlayers = (game.players ?? []).filter((player) => !isEvictedOrGone(player))
  // Production interactions always have a roster sender, but scheduler tests
  // and migrated saves can contain legacy/unknown IDs. Do not discard those
  // solely because the current roster cannot resolve the sender.
  if (sender && isEvictedOrGone(sender)) return true
  if (human && interaction.fromId === human.id) return true
  if (activePlayers.length <= 2) return true

  if (
    interaction.payload?.originActionId === 'nominate' &&
    human &&
    (game.posWinnerId === human.id ||
      game.povProtectedIds?.includes(human.id) ||
      human.status.includes('pos'))
  ) {
    return true
  }

  return (
    violatesDeclarativeRule(interaction, game) ||
    violatesRealityAllianceContext(interaction, game, reality)
  )
}

export function collectInvalidIncomingInteractionIds({
  incomingInteractions,
  scheduledIncomingInteractions,
  game,
  reality,
}: {
  incomingInteractions: IncomingInteraction[]
  scheduledIncomingInteractions: ScheduledIncomingInteraction[]
  game: InteractionValidityGameState
  reality?: RealityDomainState
}): string[] {
  const ids = new Set<string>()

  for (const interaction of incomingInteractions) {
    if (!interaction.resolved && isIncomingInteractionInvalidated(interaction, game, reality)) {
      ids.add(interaction.id)
    }
  }

  for (const entry of scheduledIncomingInteractions) {
    if (isIncomingInteractionInvalidated(entry.interaction, game, reality)) {
      ids.add(entry.interaction.id)
    }
  }

  return [...ids]
}
