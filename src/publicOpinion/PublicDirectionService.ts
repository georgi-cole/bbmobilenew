import type { Player } from '../types'
import { mulberry32, seededPick, seededPickN } from '../store/rng'
import { publicOpinionConfig } from './publicOpinionConfig'
import type { PublicDirection, DirectionType } from './types'
import type { RelationshipsMap } from '../social/types'

const DIRECTION_TYPES: DirectionType[] = [
  'get_closer',
  'target_player',
  'protect_player',
  'win_competition',
  'make_bold_move',
  'apologize',
  'expose_player',
  'align_with',
  'confront_player',
  'show_loyalty',
  'start_drama',
  'win_veto',
  'flip_vote',
  'influence_hoh',
  'break_alliance',
  'reinforce_alliance',
  'repair_relationship',
  'create_chaos',
]

const SOLO_DIRECTION_TYPES: DirectionType[] = [
  'win_competition',
  'make_bold_move',
  'win_veto',
  'flip_vote',
  'create_chaos',
]

function buildDescription(
  type: DirectionType,
  playerName: string,
  relatedName?: string,
  targetName?: string
): string {
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
}): PublicDirection[] {
  const {
    players,
    week,
    seed,
    count = publicOpinionConfig.directionsPerCycle,
    relationships,
  } = params

  const activePlayers = players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')

  if (activePlayers.length === 0) return []

  const rng = mulberry32((seed ^ (week * 0x9e3779b9)) >>> 0)
  const directions: PublicDirection[] = []

  const selectedPlayers = seededPickN(rng, activePlayers, Math.min(count, activePlayers.length))

  for (const player of selectedPlayers) {
    let dirType: DirectionType = seededPick(rng, DIRECTION_TYPES)
    const repairCandidates = activePlayers.filter(
      (candidate) =>
        candidate.id !== player.id &&
        (relationships?.[player.id]?.[candidate.id]?.affinity ?? 0) < 15
    )
    if (
      (dirType === 'apologize' || dirType === 'repair_relationship') &&
      repairCandidates.length === 0
    ) {
      dirType = 'get_closer'
    }
    // A current LOH cannot meaningfully be asked to influence themselves.
    if (dirType === 'influence_hoh' && player.status.includes('loh')) {
      dirType = 'make_bold_move'
    }
    const isSolo = SOLO_DIRECTION_TYPES.includes(dirType)

    let relatedPlayerId: string | undefined
    let relatedName: string | undefined
    let targetPlayerId: string | undefined
    let targetName: string | undefined

    if (!isSolo && activePlayers.length > 1) {
      const others =
        dirType === 'influence_hoh'
          ? activePlayers.filter(
              (candidate) => candidate.id !== player.id && candidate.status.includes('loh')
            )
          : dirType === 'apologize' || dirType === 'repair_relationship'
            ? repairCandidates
            : activePlayers.filter((candidate) => candidate.id !== player.id)
      const related = seededPick(rng, others)
      relatedPlayerId = related.id
      relatedName = related.name
    }

    if (dirType === 'influence_hoh') {
      const targetCandidates = activePlayers.filter(
        (candidate) => candidate.id !== player.id && candidate.id !== relatedPlayerId
      )
      const fallbackCandidates = activePlayers.filter((candidate) => candidate.id !== player.id)
      const targetPool = targetCandidates.length > 0 ? targetCandidates : fallbackCandidates
      if (targetPool.length > 0) {
        const target = seededPick(rng, targetPool)
        targetPlayerId = target.id
        targetName = target.name
      }
    }

    const direction: PublicDirection = {
      id: `dir-${week}-${player.id}-${dirType}-${Math.floor(rng() * 10000)}`,
      type: dirType,
      playerId: player.id,
      relatedPlayerId,
      targetPlayerId,
      description: buildDescription(dirType, player.name, relatedName, targetName),
      status: 'active',
      createdWeek: week,
      expiresAtWeek: week + 1,
      // approvalDelta reflects the success reward; actual delta applied on resolution
      // is derived from the outcome status via publicOpinionConfig.directionRewards
      approvalDelta: publicOpinionConfig.directionRewards.success,
      progressPercent: 0,
    }

    directions.push(direction)
  }

  return directions
}
