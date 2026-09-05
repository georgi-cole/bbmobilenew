import type { Player } from '../types'
import { hasAllianceBetween } from '../social/socialAlliance'
import type { DramaAlliance, RelationshipsMap } from '../social/types'
import type { RealityAlliance } from '../social/reality/types'
import type { DirectionType } from './types'

export interface RelationshipFacts {
  affinity: number
  mutualAffinity: number
  activeAlliance: boolean
  fracturedAlliance: boolean
  rivalry: boolean
  betrayal: boolean
}

export interface DirectionCandidate {
  type: DirectionType
  relatedPlayer?: Player
  targetPlayer?: Player
  actionHint: string
  rationale: string
  completionLabel: string
}

export interface DirectionContractContext {
  players: readonly Player[]
  relationships?: RelationshipsMap
  realityAlliances?: Record<string, RealityAlliance>
  dramaAlliances?: readonly DramaAlliance[]
  cupidPairIds?: readonly string[]
  voxPopuliActive?: boolean
  dramaMode?: boolean
}

function hasRealityAlliance(
  alliances: Record<string, RealityAlliance> | undefined,
  actorId: string,
  targetId: string,
): { active: boolean; fractured: boolean } {
  const match = Object.values(alliances ?? {}).find((alliance) =>
    alliance.memberIds.includes(actorId) && alliance.memberIds.includes(targetId),
  )
  return {
    active: match?.status === 'ACTIVE' || match?.status === 'DORMANT',
    fractured: match?.status === 'FRACTURED',
  }
}

function hasDramaAlliance(
  alliances: readonly DramaAlliance[] | undefined,
  actorId: string,
  targetId: string,
): { active: boolean; fractured: boolean } {
  const match = alliances?.find((alliance) =>
    alliance.participantIds.includes(actorId) && alliance.participantIds.includes(targetId),
  )
  return { active: match?.status === 'active', fractured: match?.status === 'strained' }
}

/**
 * Shared relationship truth for Public Mode. This deliberately reconciles the
 * legacy relationship map with the Reality and Drama alliance records, so a
 * request can never ask for an action that Social Mode considers impossible.
 */
export function getRelationshipFacts(
  context: DirectionContractContext,
  actorId: string,
  targetId: string,
): RelationshipFacts {
  const outward = context.relationships?.[actorId]?.[targetId]
  const inward = context.relationships?.[targetId]?.[actorId]
  const legacyAlliance = context.relationships
    ? hasAllianceBetween(context.relationships, actorId, targetId)
    : false
  const reality = hasRealityAlliance(context.realityAlliances, actorId, targetId)
  const drama = hasDramaAlliance(context.dramaAlliances, actorId, targetId)
  const tags = new Set([...(outward?.tags ?? []), ...(inward?.tags ?? [])])
  const affinity = outward?.affinity ?? 0
  const mutualAffinity = Math.min(affinity, inward?.affinity ?? 0)

  return {
    affinity,
    mutualAffinity,
    activeAlliance: legacyAlliance || reality.active || drama.active,
    fracturedAlliance: reality.fractured || drama.fractured,
    rivalry: affinity < 0 || (inward?.affinity ?? 0) < 0 || tags.has('rival'),
    betrayal: tags.has('betrayal'),
  }
}

function isActive(player: Player): boolean {
  return player.status !== 'evicted' && player.status !== 'jury'
}

/** Build only requests that have a current, named route to completion. */
export function getEligibleDirectionCandidates(
  actor: Player,
  context: DirectionContractContext,
): DirectionCandidate[] {
  const others = context.players.filter((player) => isActive(player) && player.id !== actor.id)
  const candidates: DirectionCandidate[] = [
    {
      type: 'win_competition',
      actionHint: 'Win your next eligible competition.',
      rationale: 'A visible competition win is always a clear audience moment.',
      completionLabel: 'Win a competition',
    },
    {
      type: 'win_veto',
      actionHint: 'Win the next Power of Safety competition.',
      rationale: 'Safety wins create a visible change in the house.',
      completionLabel: 'Win Power of Safety',
    },
  ]

  for (const relatedPlayer of others) {
    const facts = getRelationshipFacts(context, actor.id, relatedPlayer.id)
    const isCupidPair = context.cupidPairIds?.includes(relatedPlayer.id) ?? false

    if (facts.activeAlliance) {
      candidates.push({
        type: 'reinforce_alliance',
        relatedPlayer,
        actionHint: `Use Social to show loyalty to ${relatedPlayer.name}.`,
        rationale: `You and ${relatedPlayer.name} are currently allied.`,
        completionLabel: `Show loyalty to ${relatedPlayer.name}`,
      })
      if (!isCupidPair) {
        candidates.push({
          type: 'break_alliance',
          relatedPlayer,
          actionHint: context.dramaMode
            ? `Use Social → Break Alliance with ${relatedPlayer.name}.`
            : `Use Social → Betray ${relatedPlayer.name}.`,
          rationale: `You and ${relatedPlayer.name} are currently allied.`,
          completionLabel: `Break your alliance with ${relatedPlayer.name}`,
        })
      }
      continue
    }

    if (facts.mutualAffinity > 0 && !facts.betrayal) {
      candidates.push({
        type: 'align_with',
        relatedPlayer,
        actionHint: `Use Social → Propose Alliance with ${relatedPlayer.name}.`,
        rationale: `You and ${relatedPlayer.name} are not currently allied.`,
        completionLabel: `Form an alliance with ${relatedPlayer.name}`,
      })
    }

    if (facts.rivalry || facts.betrayal || facts.mutualAffinity < 0) {
      candidates.push({
        type: 'repair_relationship',
        relatedPlayer,
        actionHint: `Use Social → Clear the Air or Apologize to ${relatedPlayer.name}.`,
        rationale: `Your relationship with ${relatedPlayer.name} is strained.`,
        completionLabel: `Repair things with ${relatedPlayer.name}`,
      })
      candidates.push({
        type: 'confront_player',
        relatedPlayer,
        actionHint: `Use a confrontational Social action against ${relatedPlayer.name}.`,
        rationale: `${relatedPlayer.name} is a current rival.`,
        completionLabel: `Confront ${relatedPlayer.name}`,
      })
    } else {
      candidates.push({
        type: 'get_closer',
        relatedPlayer,
        actionHint: `Use a positive Social action with ${relatedPlayer.name}.`,
        rationale: `${relatedPlayer.name} is available for a new social connection.`,
        completionLabel: `Build rapport with ${relatedPlayer.name}`,
      })
    }
  }

  // Vox is audience-led: omit role- and house-vote-dependent asks entirely.
  return context.voxPopuliActive
    ? candidates.filter((candidate) =>
        ['win_competition', 'win_veto', 'get_closer', 'align_with', 'repair_relationship', 'reinforce_alliance'].includes(candidate.type),
      )
    : candidates
}

export function isDirectionStillValid(
  direction: { type: DirectionType; playerId: string; relatedPlayerId?: string },
  context: DirectionContractContext,
): boolean {
  const actor = context.players.find((player) => player.id === direction.playerId)
  if (!actor || !isActive(actor)) return false
  const relationshipBoundTypes: DirectionType[] = [
    'get_closer',
    'align_with',
    'break_alliance',
    'reinforce_alliance',
    'repair_relationship',
    'apologize',
    'confront_player',
  ]
  if (!relationshipBoundTypes.includes(direction.type)) return true
  if (!direction.relatedPlayerId) return true
  return getEligibleDirectionCandidates(actor, context).some(
    (candidate) => candidate.type === direction.type && candidate.relatedPlayer?.id === direction.relatedPlayerId,
  )
}
