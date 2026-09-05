import type { Player } from '../types'
import { mulberry32, seededPick, seededPickN } from '../store/rng'
import { publicOpinionConfig } from './publicOpinionConfig'
import type { PublicDirection, DirectionType } from './types'
import type { RelationshipsMap } from '../social/types'
import type { DramaAlliance } from '../social/types'
import type { RealityAlliance } from '../social/reality/types'
import {
  getEligibleDirectionCandidates,
  type DirectionCandidate,
} from './publicDirectionContracts'

function buildDescription(
  type: DirectionType,
  playerName: string,
  relatedName?: string,
  targetName?: string,
  voxPopuliActive = false,
): string {
  if (voxPopuliActive) {
    switch (type) {
      case 'get_closer':
        return `Win viewers over by building a real connection with ${relatedName ?? 'someone'}`
      case 'align_with':
        return `Make a visible pact with ${relatedName ?? 'someone'} that viewers can trust`
      case 'repair_relationship':
        return `Repair things with ${relatedName ?? 'someone'} before the audience turns on you`
      case 'reinforce_alliance':
        return `Prove your loyalty to ${relatedName ?? 'an ally'} in front of the viewers`
      case 'win_competition':
        return `${playerName}, win immunity and give the audience a reason to back you!`
      case 'win_veto':
        return `${playerName}, win safety and change your public story!`
    }
  }
  switch (type) {
    case 'get_closer':
      return `Get closer to ${relatedName ?? 'a player'}`
    case 'target_player':
      return `Target ${relatedName ?? 'a rival'} for elimination`
    case 'protect_player':
      return `Protect ${relatedName ?? 'an ally'} from elimination`
    case 'win_competition':
      return `${playerName}, win the next competition!`
    case 'make_bold_move':
      return `${playerName}, make a bold move this week!`
    case 'apologize':
      return `Apologize to ${relatedName ?? 'someone'}`
    case 'expose_player':
      return `Expose ${relatedName ?? 'a rival'}'s game`
    case 'align_with':
      return `Form an alliance with ${relatedName ?? 'someone'}`
    case 'confront_player':
      return `Confront ${relatedName ?? 'a rival'} publicly`
    case 'show_loyalty':
      return `Show loyalty to ${relatedName ?? 'your allies'}`
    case 'start_drama':
      return `Start drama with ${relatedName ?? 'a player'}`
    case 'win_veto':
      return `${playerName}, win the Power of Safety!`
    case 'flip_vote':
      return `${playerName}, flip your vote and shake up the house!`
    case 'influence_hoh':
      return `Convince ${relatedName ?? 'the LOH'} to nominate ${targetName ?? 'a specific housemate'}`
    case 'break_alliance':
      return `Break up your alliance with ${relatedName ?? 'an ally'}`
    case 'reinforce_alliance':
      return `Strengthen your bond with ${relatedName ?? 'an ally'}`
    case 'repair_relationship':
      return `Repair your relationship with ${relatedName ?? 'a player'}`
    case 'create_chaos':
      return `${playerName}, stir up chaos in the house this week!`
    default:
      return `Complete a public challenge`
  }
}

export function generateDirectionsForCycle(params: {
  players: Player[]
  week: number
  seed: number
  count?: number
  relationships?: RelationshipsMap
  realityAlliances?: Record<string, RealityAlliance>
  dramaAlliances?: readonly DramaAlliance[]
  /** The actor's Cupid partner cannot be the target of a break-alliance ask. */
  cupidPartnersByPlayerId?: Record<string, string>
  /** Removes LOH/house-vote missions when the audience controls the format. */
  voxPopuliActive?: boolean
  /** Public Mode gives the human a primary request whenever they are still active. */
  prioritizeHuman?: boolean
  dramaMode?: boolean
}): PublicDirection[] {
  const {
    players,
    week,
    seed,
    count = publicOpinionConfig.directionsPerCycle,
    relationships,
    realityAlliances,
    dramaAlliances,
    cupidPartnersByPlayerId = {},
    voxPopuliActive = false,
    prioritizeHuman = false,
    dramaMode = false,
  } = params

  const activePlayers = players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')

  if (activePlayers.length === 0) return []

  const rng = mulberry32((seed ^ (week * 0x9e3779b9)) >>> 0)
  const directions: PublicDirection[] = []

  const selectedPlayers = seededPickN(rng, activePlayers, Math.min(count, activePlayers.length))
  const humanPlayer = prioritizeHuman || voxPopuliActive
    ? activePlayers.find((player) => player.isUser)
    : undefined
  if (humanPlayer && !selectedPlayers.some((player) => player.id === humanPlayer.id)) {
    if (selectedPlayers.length === 0) selectedPlayers.push(humanPlayer)
    else selectedPlayers[selectedPlayers.length - 1] = humanPlayer
  }

  for (const player of selectedPlayers) {
    const eligible = getEligibleDirectionCandidates(player, {
      players: activePlayers,
      relationships,
      realityAlliances,
      dramaAlliances,
      cupidPairIds: cupidPartnersByPlayerId[player.id] ? [cupidPartnersByPlayerId[player.id]] : [],
      voxPopuliActive,
      dramaMode,
    })
    // The solo competition route is intentionally retained as the final safe
    // fallback, but every selected candidate has a concrete completion path.
    const candidate: DirectionCandidate = seededPick(rng, eligible)
    const dirType: DirectionType = candidate.type
    const relatedPlayerId = candidate.relatedPlayer?.id
    const relatedName = candidate.relatedPlayer?.name
    const targetPlayerId = candidate.targetPlayer?.id
    const targetName = candidate.targetPlayer?.name

    const direction: PublicDirection = {
      id: `dir-${week}-${player.id}-${dirType}-${Math.floor(rng() * 10000)}`,
      type: dirType,
      playerId: player.id,
      relatedPlayerId,
      targetPlayerId,
      description: buildDescription(dirType, player.name, relatedName, targetName, voxPopuliActive),
      status: 'active',
      createdWeek: week,
      expiresAtWeek: week + 1,
      // approvalDelta reflects the success reward; actual delta applied on resolution
      // is derived from the outcome status via publicOpinionConfig.directionRewards
      approvalDelta: publicOpinionConfig.directionRewards.success,
      progressPercent: 0,
      actionHint: candidate.actionHint,
      rationale: candidate.rationale,
      completionLabel: candidate.completionLabel,
    }

    directions.push(direction)
  }

  return directions
}
