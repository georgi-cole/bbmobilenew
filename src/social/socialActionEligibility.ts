import type { PlayerStatus } from '../types'
import { getPublicDramaActionAvailability, isPublicDramaAction } from './dramaPacing'
import type { SocialActionDefinition, SubjectPool } from './socialActions'
import { isRealityExclusiveAction, resolveActionTargetMode } from './socialActions'
import type { DramaSocialNetwork, RelationshipsMap } from './types'

export interface ActionEligibilityPlayer {
  id: string
  status: PlayerStatus | string
}

export interface SocialActionEligibilityContext {
  action: SocialActionDefinition
  actorId?: string
  targetIds?: readonly string[]
  subjectId?: string
  phase?: string
  week?: number
  players?: readonly ActionEligibilityPlayer[]
  primaryTargetStatus?: PlayerStatus | null
  actorStatus?: PlayerStatus | null
  relationships?: RelationshipsMap
  dramaNetwork?: DramaSocialNetwork
  dramaMode?: boolean
  /** Used by Classic upgrade previews to test relevance without unlocking execution. */
  ignoreRealityModeGate?: boolean
  requireCompleteSelection?: boolean
  allowAIOnly?: boolean
}

export interface SocialActionEligibilityResult {
  eligible: boolean
  reason: string
}

function unavailable(reason: string): SocialActionEligibilityResult {
  return { eligible: false, reason }
}

function isInHouse(status: string | undefined): boolean {
  return Boolean(status && status !== 'evicted' && status !== 'jury')
}

function isNominee(status: string | undefined): boolean {
  return Boolean(status?.includes('nominated'))
}

function relationshipTags(
  relationships: RelationshipsMap | undefined,
  actorId: string,
  targetId: string
): Set<string> {
  return new Set(relationships?.[actorId]?.[targetId]?.tags ?? [])
}

function hasActiveRelationshipTag(
  relationships: RelationshipsMap,
  actorId: string,
  targetId: string,
  tag: string
): boolean {
  if (tag === 'alliance') {
    const actorAffinity = relationships[actorId]?.[targetId]?.affinity ?? 0
    const targetAffinity = relationships[targetId]?.[actorId]?.affinity ?? 0
    const tagged =
      relationships[actorId]?.[targetId]?.tags.includes(tag) === true ||
      relationships[targetId]?.[actorId]?.tags.includes(tag) === true
    return tagged && Math.min(actorAffinity, targetAffinity) >= 10
  }
  return relationships[actorId]?.[targetId]?.tags.includes(tag) === true
}

function isValidSubject(
  pool: SubjectPool,
  subjectId: string,
  actorId: string,
  primaryTargetId: string,
  players: readonly ActionEligibilityPlayer[],
  relationships: RelationshipsMap | undefined,
  allowActorAsSubject: boolean
): boolean {
  const subject = players.find((player) => player.id === subjectId)
  if (!subject || !isInHouse(subject.status) || subject.id === primaryTargetId) return false
  if (!allowActorAsSubject && subject.id === actorId) return false

  switch (pool) {
    case 'nominees':
      return isNominee(subject.status)
    case 'non_nominees':
      return !isNominee(subject.status)
    case 'allies': {
      const tags = relationshipTags(relationships, actorId, subject.id)
      return (
        tags.has('alliance') ||
        tags.has('bromance') ||
        tags.has('romance') ||
        (relationships?.[actorId]?.[subject.id]?.affinity ?? 0) > 0
      )
    }
    case 'voters':
      return !isNominee(subject.status) && subject.status !== 'loh' && subject.status !== 'loh+pos'
    case 'houseguests':
    default:
      return true
  }
}

export function evaluateSocialActionEligibility({
  action,
  actorId = '',
  targetIds = [],
  subjectId,
  phase,
  week,
  players = [],
  primaryTargetStatus,
  actorStatus,
  relationships,
  dramaNetwork,
  dramaMode = false,
  ignoreRealityModeGate = false,
  requireCompleteSelection = false,
  allowAIOnly = false,
}: SocialActionEligibilityContext): SocialActionEligibilityResult {
  if (action.aiOnly && !allowAIOnly) return unavailable('AI-only action')
  if (isRealityExclusiveAction(action) && !dramaMode && !ignoreRealityModeGate) {
    return unavailable('Reality Mode required')
  }

  if (dramaMode && isPublicDramaAction(action.id)) {
    const pacing = getPublicDramaActionAvailability(dramaNetwork, week)
    if (!pacing.available) return unavailable(pacing.reason)
  }

  const allowedPhases = dramaMode
    ? (action.dramaAllowedPhases ?? action.allowedPhases)
    : action.allowedPhases
  if (allowedPhases && (!phase || !allowedPhases.includes(phase))) {
    return unavailable('Not available at this point in the week')
  }

  const targetMode = resolveActionTargetMode(action, dramaMode)
  const targets = [...new Set(targetIds.filter(Boolean))]
  if (targetMode === 'none') {
    if (requireCompleteSelection && subjectId) return unavailable('This action has no subject')
  } else if (requireCompleteSelection) {
    if (targetMode === 'multi') {
      const minimum = Math.max(2, action.minTargets ?? 2)
      if (targets.length < minimum) {
        return unavailable(`Select at least ${minimum} housemates`)
      }
      if (action.maxTargets !== undefined && targets.length > action.maxTargets) {
        return unavailable(`Select no more than ${action.maxTargets} housemates`)
      }
    } else if (targets.length !== 1) {
      return unavailable('Select one housemate')
    }
  }
  if (requireCompleteSelection && targetMode === 'primaryPlusSubject' && !subjectId) {
    return unavailable('Choose who the conversation is about')
  }
  if (targets.some((targetId) => targetId === actorId)) {
    return unavailable('You cannot target yourself')
  }

  const playerById = new Map(players.map((player) => [player.id, player]))
  if (
    requireCompleteSelection &&
    players.length > 0 &&
    targetMode !== 'none' &&
    targets.some((targetId) => !isInHouse(playerById.get(targetId)?.status))
  ) {
    return unavailable('That housemate is no longer available')
  }

  const requiredActorStatus = dramaMode
    ? (action.dramaRequiredActorStatus ?? action.requiredActorStatus)
    : action.requiredActorStatus
  if (requiredActorStatus) {
    const resolvedActorStatus =
      actorStatus ?? (playerById.get(actorId)?.status as PlayerStatus | undefined)
    if (players.length === 0 && actorStatus === undefined && !requireCompleteSelection) {
      return unavailable('Select the required role holder')
    }
    if (
      (players.length > 0 || actorStatus !== undefined) &&
      (!resolvedActorStatus || !requiredActorStatus.includes(resolvedActorStatus))
    ) {
      return unavailable('Your current role cannot use this action')
    }
  }

  const requiredTargetStatus = dramaMode
    ? (action.dramaRequiredTargetStatus ?? action.requiredTargetStatus)
    : action.requiredTargetStatus
  if (requiredTargetStatus) {
    if (players.length === 0 && primaryTargetStatus === undefined && !requireCompleteSelection) {
      return unavailable('Select the required role holder')
    }
    if (players.length > 0 || primaryTargetStatus !== undefined) {
      if (targets.length === 0 && !primaryTargetStatus) {
        return unavailable('Select the required role holder')
      }
      const statuses =
        targets.length > 0
          ? targets.map(
              (targetId, index) =>
                playerById.get(targetId)?.status ?? (index === 0 ? primaryTargetStatus : null)
            )
          : [primaryTargetStatus]
      if (
        statuses.some((status) => !status || !requiredTargetStatus.includes(status as PlayerStatus))
      ) {
        return unavailable('This action requires a different role holder')
      }
    }
  }

  const requiredRelationshipTags = dramaMode
    ? (action.dramaRequiredRelationshipTags ?? action.requiredRelationshipTags)
    : action.requiredRelationshipTags
  const excludedRelationshipTags = dramaMode
    ? (action.dramaExcludedRelationshipTags ?? action.excludedRelationshipTags)
    : action.excludedRelationshipTags
  const minAffinity = dramaMode
    ? (action.dramaMinAffinity ?? action.minAffinity)
    : action.minAffinity
  const maxAffinity = dramaMode
    ? (action.dramaMaxAffinity ?? action.maxAffinity)
    : action.maxAffinity
  const needsRelationshipContext =
    Boolean(requiredRelationshipTags) ||
    Boolean(excludedRelationshipTags) ||
    minAffinity !== undefined ||
    maxAffinity !== undefined
  if (needsRelationshipContext) {
    if (!actorId || targets.length === 0 || !relationships) {
      return unavailable('Select a compatible relationship')
    }
    for (const targetId of targets) {
      const affinity = relationships[actorId]?.[targetId]?.affinity ?? 0
      if (minAffinity !== undefined && affinity < minAffinity) {
        return unavailable(`Requires relationship ${minAffinity}% or higher`)
      }
      if (maxAffinity !== undefined && affinity > maxAffinity) {
        return unavailable(`Only available while the relationship is ${maxAffinity}% or lower`)
      }
      if (
        requiredRelationshipTags &&
        !requiredRelationshipTags.some((tag) =>
          hasActiveRelationshipTag(relationships, actorId, targetId, tag)
        )
      ) {
        return unavailable('The required relationship is not active')
      }
      if (
        excludedRelationshipTags?.some((tag) =>
          hasActiveRelationshipTag(relationships, actorId, targetId, tag)
        )
      ) {
        return unavailable('This relationship has already moved past that action')
      }
    }
  }

  const needsArcContext =
    Boolean(action.requiredArcTypes) ||
    Boolean(action.excludedArcTypes) ||
    Boolean(action.requiredArcStages) ||
    action.requiredArcPublic !== undefined
  if (needsArcContext) {
    const needsExistingArc =
      Boolean(action.requiredArcTypes) ||
      Boolean(action.requiredArcStages) ||
      action.requiredArcPublic !== undefined
    if (!actorId || targets.length === 0 || (needsExistingArc && !dramaNetwork)) {
      return unavailable('This action needs an active story')
    }
    for (const targetId of targets) {
      const pairArcs = (dramaNetwork?.arcs ?? []).filter(
        (arc) =>
          arc.status === 'active' &&
          arc.participantIds.includes(actorId) &&
          arc.participantIds.includes(targetId)
      )
      if (action.excludedArcTypes?.some((type) => pairArcs.some((arc) => arc.type === type))) {
        return unavailable('That story is already active')
      }
      const activeArc = pairArcs
        .filter((arc) => !action.requiredArcTypes || action.requiredArcTypes.includes(arc.type))
        .sort((left, right) => right.lastAdvancedWeek - left.lastAdvancedWeek)[0]
      if (action.requiredArcTypes && !activeArc) {
        return unavailable('The required story is not active')
      }
      if (
        action.requiredArcStages &&
        !action.requiredArcStages.includes(activeArc?.stage ?? 'resolved')
      ) {
        return unavailable('That story has not reached the right stage')
      }
      if (
        action.requiredArcPublic !== undefined &&
        activeArc?.public !== action.requiredArcPublic
      ) {
        return unavailable(
          action.requiredArcPublic ? 'That story is still secret' : 'That story is already public'
        )
      }
    }
  }

  if (action.requiresKnownSecret) {
    if (!actorId || targets.length === 0 || !dramaNetwork) {
      return unavailable('You do not have a secret to expose')
    }
    const knowsTargetSecret = targets.every((targetId) =>
      dramaNetwork.rumours.some(
        (rumour) =>
          rumour.status === 'circulating' &&
          rumour.subjectId === targetId &&
          (rumour.originatorId === actorId ||
            rumour.listeners.some((listener) => listener.playerId === actorId))
      )
    )
    if (!knowsTargetSecret) return unavailable('You do not know a secret about this housemate')
  }

  if (requireCompleteSelection && targetMode === 'primaryPlusSubject' && subjectId) {
    const primaryTargetId = targets[0] ?? ''
    const invalidWithoutRoster =
      players.length === 0 &&
      (subjectId === primaryTargetId || (!action.allowActorAsSubject && subjectId === actorId))
    if (
      invalidWithoutRoster ||
      (players.length > 0 &&
        !isValidSubject(
          action.subjectPool ?? 'houseguests',
          subjectId,
          actorId,
          primaryTargetId,
          players,
          relationships,
          action.allowActorAsSubject === true
        ))
    ) {
      return unavailable('That subject does not fit this action')
    }
  }

  return { eligible: true, reason: '' }
}
