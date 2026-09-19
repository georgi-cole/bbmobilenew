import type { DramaAlliance } from '../types'
import { maybeExposeRealityAlliance, recordRealityAllianceLeakDiscovery } from './allianceKnowledge'
import { appendRealityEvent } from './events'
import { remember } from './memory'
import { applyRealityRelationshipChange, getRealityRelationship } from './relationships'
import { recordGroundedJealousy } from './relationshipAutonomy'
import type {
  RealityAlliance,
  RealityClock,
  RealityDomainState,
  RealityGrievance,
  RealityRomance,
  RealityVoteIntent,
} from './types'

function pairId(left: string, right: string): string {
  return [left, right].sort().join('~')
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function allianceNameHash(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const ALLIANCE_NAME_POOLS = {
  endgame: [
    'Final Cut',
    'Last Light',
    'The Finish Line',
    'Endgame',
    'The Last Word',
    'Closing Time',
  ],
  protection: ['Safe Harbor', 'The Shield', 'The Guard', 'The Cover', 'Home Base', 'The Anchor'],
  numbers: ['The Numbers', 'The Bloc', 'The Majority', 'The Line', 'The Vote', 'The Board'],
  generic: [
    'The Circle',
    'The Core',
    'The Collective',
    'The Quiet Pact',
    'The Table',
    'The Network',
  ],
} as const

function isEndgameAlliancePurpose(purpose: string): boolean {
  return /final\s*(two|2)|endgame|ride.?or.?die|last\s*two/i.test(purpose)
}

function allianceNamePool(alliance: RealityAlliance): readonly string[] {
  const purpose = alliance.purpose.toLowerCase()
  if (isEndgameAlliancePurpose(purpose)) {
    return ALLIANCE_NAME_POOLS.endgame
  }
  if (/protect|safe|shield|cover/.test(purpose)) return ALLIANCE_NAME_POOLS.protection
  if (/vote|target|control|numbers|majority|middle/.test(purpose)) {
    return ALLIANCE_NAME_POOLS.numbers
  }
  return ALLIANCE_NAME_POOLS.generic
}

function shouldNameRealityAlliance(alliance: RealityAlliance): boolean {
  if (alliance.memberIds.length >= 3) return true
  if (alliance.memberIds.length !== 2) return false
  return isEndgameAlliancePurpose(alliance.purpose)
}

export function ensureRealityAllianceName(
  state: RealityDomainState,
  alliance: RealityAlliance
): RealityAlliance {
  if (alliance.name?.trim() || !shouldNameRealityAlliance(alliance)) return alliance
  const pool = allianceNamePool(alliance)
  const used = new Set(
    Object.values(state.alliances)
      .filter((candidate) => candidate.id !== alliance.id && candidate.name)
      .map((candidate) => candidate.name)
  )
  const start = allianceNameHash(`${alliance.id}:${alliance.purpose}`) % pool.length
  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(start + offset) % pool.length]
    if (!used.has(candidate)) {
      alliance.name = candidate
      return alliance
    }
  }
  alliance.name = `${pool[start]} ${(allianceNameHash(alliance.id) % 90) + 10}`
  return alliance
}

export function renameRealityAlliance(
  state: RealityDomainState,
  input: {
    allianceId: string
    actorId: string
    name: string
    at: RealityClock
  }
): RealityAlliance {
  const alliance = state.alliances[input.allianceId]
  if (!alliance || alliance.status === 'DISSOLVED') throw new Error('Alliance is not active')
  if (!alliance.memberIds.includes(input.actorId))
    throw new Error('Only a member can name the alliance')

  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 28)
  if (name.length < 2) throw new Error('Alliance name is too short')
  if (alliance.name === name) return alliance

  alliance.name = name
  appendRealityEvent(state, {
    ...input.at,
    type: 'ALLIANCE_RENAMED',
    actorId: input.actorId,
    targetIds: [],
    participantIds: [...alliance.memberIds],
    witnessIds: [],
    visibility: 'GROUP_VISIBLE',
    outcome: 'SUCCESS',
    reason: `renamed:${alliance.id}:${name}`,
    tags: ['ALLIANCE', 'IDENTITY'],
    relatedFactIds: [],
    relatedPromiseIds: [...alliance.sharedPromiseIds],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: false,
  })
  return alliance
}

type RealityAllianceMemberStatus = 'CORE' | 'REGULAR' | 'PERIPHERAL'

function nextAllianceMemberStatus(
  current: RealityAllianceMemberStatus,
  commitment: number
): RealityAllianceMemberStatus {
  if (current === 'CORE') {
    if (commitment <= 0.28) return 'PERIPHERAL'
    if (commitment < 0.44) return 'REGULAR'
    return 'CORE'
  }
  if (current === 'REGULAR') {
    if (commitment >= 0.74) return 'CORE'
    if (commitment <= 0.3) return 'PERIPHERAL'
    return 'REGULAR'
  }
  return commitment >= 0.5 ? 'REGULAR' : 'PERIPHERAL'
}

function alliancePlanDisagreement(alliance: RealityAlliance): number {
  const plans = alliance.memberIds
    .map((id) => [...(alliance.memberPlanBeliefs[id] ?? [])].sort().join('|'))
    .filter(Boolean)
  if (plans.length < 2) return 0
  const counts = new Map<string, number>()
  for (const plan of plans) counts.set(plan, (counts.get(plan) ?? 0) + 1)
  const largestBloc = Math.max(...counts.values())
  return 1 - largestBloc / plans.length
}

/**
 * Recompute hierarchy and health from durable member commitment rather than
 * treating the raw average as coalition cohesion. Hysteresis keeps members
 * from bouncing between tiers after a single positive or negative beat.
 */
export function refreshRealityAllianceDynamics(alliance: RealityAlliance): RealityAlliance {
  if (alliance.memberIds.length === 0) return alliance

  alliance.memberCommitment ??= {}
  alliance.memberPerceivedStatus ??= {}
  alliance.memberPlanBeliefs ??= {}
  alliance.knownLeakEventIds ??= []
  alliance.leaderIds ??= []
  alliance.founderIds ??= []

  const commitments = alliance.memberIds.map((id) => clamp01(alliance.memberCommitment[id] ?? 0.5))
  for (const [index, memberId] of alliance.memberIds.entries()) {
    const commitment = commitments[index]
    alliance.memberCommitment[memberId] = commitment
    alliance.memberPerceivedStatus[memberId] = nextAllianceMemberStatus(
      alliance.memberPerceivedStatus[memberId] ?? 'REGULAR',
      commitment
    )
  }

  const mean = commitments.reduce((sum, value) => sum + value, 0) / commitments.length
  const variance =
    commitments.reduce((sum, value) => sum + (value - mean) ** 2, 0) / commitments.length
  const dispersion = Math.sqrt(variance)
  const lowCommitmentShare = commitments.filter((value) => value <= 0.3).length / commitments.length
  const planDisagreement = alliancePlanDisagreement(alliance)
  const leakPenalty = Math.min(0.66, alliance.knownLeakEventIds.length * 0.22)

  alliance.cohesion = clamp01(mean - dispersion * 0.55 - planDisagreement * 0.18)
  alliance.fractureRisk = clamp01(
    (1 - mean) * 0.38 +
      dispersion * 1.1 +
      lowCommitmentShare * 0.22 +
      planDisagreement * 0.22 +
      leakPenalty
  )

  const previousLeaderIds = new Set(alliance.leaderIds)
  alliance.leaderIds = alliance.memberIds
    .filter((id) => alliance.memberPerceivedStatus[id] === 'CORE')
    .sort(
      (left, right) =>
        (alliance.memberCommitment[right] ?? 0) - (alliance.memberCommitment[left] ?? 0) ||
        Number(alliance.founderIds.includes(right)) - Number(alliance.founderIds.includes(left)) ||
        Number(previousLeaderIds.has(right)) - Number(previousLeaderIds.has(left)) ||
        left.localeCompare(right)
    )
    .slice(0, 2)

  return alliance
}

export function refreshRealityAllianceLifecycle(alliance: RealityAlliance): RealityAlliance {
  if (alliance.status === 'DISSOLVED' || alliance.status === 'PROBATIONARY') return alliance

  const engagedMembers = alliance.memberIds.filter(
    (id) => (alliance.memberCommitment[id] ?? 0) >= 0.35
  ).length

  if (alliance.status === 'FRACTURED') {
    if (alliance.cohesion >= 0.64 && alliance.fractureRisk <= 0.3 && engagedMembers >= 2) {
      alliance.status = 'ACTIVE'
    }
    return alliance
  }

  if (alliance.status === 'DORMANT') {
    if (alliance.cohesion >= 0.5 && engagedMembers >= 2) alliance.status = 'ACTIVE'
    return alliance
  }

  if (alliance.status === 'ACTIVE' && alliance.cohesion < 0.26 && engagedMembers < 2) {
    alliance.status = 'DORMANT'
  }
  return alliance
}

export function adjustRealityAllianceCommitment(
  state: RealityDomainState,
  allianceId: string,
  memberId: string,
  delta: number
): RealityAlliance {
  const alliance = state.alliances[allianceId]
  if (!alliance || alliance.status === 'DISSOLVED') throw new Error('Alliance is not active')
  if (!alliance.memberIds.includes(memberId)) throw new Error('Actor is not an alliance member')
  alliance.memberCommitment[memberId] = clamp01(
    (alliance.memberCommitment[memberId] ?? 0.5) + delta
  )
  refreshRealityAllianceDynamics(alliance)
  return refreshRealityAllianceLifecycle(alliance)
}

export type RealityAllianceMembershipExitKind = 'VOLUNTARY' | 'EXPELLED' | 'DEFECTION'

export function removeRealityAllianceMember(
  state: RealityDomainState,
  input: {
    allianceId: string
    memberId: string
    actorId: string
    kind: RealityAllianceMembershipExitKind
    at: RealityClock
    sourceEventId?: string
  }
): RealityAlliance {
  const alliance = state.alliances[input.allianceId]
  if (!alliance || alliance.status === 'DISSOLVED') throw new Error('Alliance is not active')
  if (!alliance.memberIds.includes(input.memberId))
    throw new Error('Player is not an alliance member')

  if (input.kind === 'EXPELLED') {
    if (input.actorId === input.memberId) throw new Error('A member cannot expel themself')
    if (!alliance.leaderIds.includes(input.actorId)) {
      throw new Error('Only an alliance leader can expel a member')
    }
  } else if (input.actorId !== input.memberId) {
    throw new Error('Only the member can leave or defect')
  }

  const formerMemberIds = [...alliance.memberIds]
  const eventType =
    input.kind === 'EXPELLED'
      ? 'ALLIANCE_MEMBER_EXPELLED'
      : input.kind === 'DEFECTION'
        ? 'ALLIANCE_MEMBER_DEFECTED'
        : 'ALLIANCE_MEMBER_LEFT'
  const event = appendRealityEvent(state, {
    ...input.at,
    type: eventType,
    actorId: input.actorId,
    targetIds: [input.memberId],
    participantIds: formerMemberIds,
    witnessIds: formerMemberIds.filter((id) => id !== input.memberId),
    visibility: 'GROUP_VISIBLE',
    outcome: 'SUCCESS',
    reason: `${input.kind.toLowerCase()}:${alliance.id}:${input.sourceEventId ?? 'manual'}`,
    tags: ['ALLIANCE', 'MEMBERSHIP', input.kind],
    relatedFactIds: [],
    relatedPromiseIds: [...alliance.sharedPromiseIds],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: true,
  })

  alliance.memberIds = alliance.memberIds.filter((id) => id !== input.memberId)
  alliance.leaderIds = alliance.leaderIds.filter((id) => id !== input.memberId)
  alliance.infiltratorIds = alliance.infiltratorIds.filter((id) => id !== input.memberId)
  delete alliance.memberCommitment[input.memberId]
  delete alliance.memberPerceivedStatus[input.memberId]
  delete alliance.memberPlanBeliefs[input.memberId]
  delete alliance.operationalRoles[input.memberId]
  alliance.genuine = alliance.infiltratorIds.length === 0

  for (const memberId of alliance.memberIds) {
    applyRealityRelationshipChange(state, {
      sourceId: memberId,
      targetId: input.memberId,
      eventId: event.id,
      day: input.at.day,
      phase: input.at.phase,
      anchor: 'negative',
      deltas:
        input.kind === 'VOLUNTARY'
          ? { trust: -2, loyalty: -3, familiarity: 2 }
          : input.kind === 'DEFECTION'
            ? { trust: -7, loyalty: -9, resentment: 5, suspicion: 5, reliability: -8 }
            : { trust: -5, loyalty: -7, resentment: 4, suspicion: 4, reliability: -5 },
    })
  }

  if (alliance.memberIds.length < 2) {
    alliance.status = 'DISSOLVED'
    alliance.currentTargetIds = []
    alliance.fallbackTargetIds = []
    alliance.leaderIds = []
  } else {
    refreshRealityAllianceDynamics(alliance)
    refreshRealityAllianceLifecycle(alliance)
  }
  refreshRealityAllianceOverlaps(state)
  return alliance
}

function maybeDefectRealityAllianceMember(
  state: RealityDomainState,
  alliance: RealityAlliance,
  memberId: string,
  at: RealityClock,
  sourceEventId: string
): void {
  const currentCommitment = alliance.memberCommitment[memberId] ?? 0
  if (
    currentCommitment < 0.72 ||
    alliance.infiltratorIds.includes(memberId) ||
    (alliance.status !== 'ACTIVE' && alliance.status !== 'PROBATIONARY')
  ) {
    return
  }

  const weaker = Object.values(state.alliances)
    .filter((candidate) => {
      if (
        candidate.id === alliance.id ||
        candidate.status === 'DISSOLVED' ||
        !candidate.memberIds.includes(memberId)
      ) {
        return false
      }
      const sharedMembers = candidate.memberIds.filter((id) => alliance.memberIds.includes(id))
      if (sharedMembers.length > 1) return false
      const priorCommitment = candidate.memberCommitment[memberId] ?? 0.5
      return priorCommitment <= 0.22 && currentCommitment >= priorCommitment + 0.45
    })
    .sort(
      (left, right) =>
        (left.memberCommitment[memberId] ?? 0.5) - (right.memberCommitment[memberId] ?? 0.5) ||
        left.id.localeCompare(right.id)
    )[0]
  if (!weaker) return

  removeRealityAllianceMember(state, {
    allianceId: weaker.id,
    memberId,
    actorId: memberId,
    kind: 'DEFECTION',
    at,
    sourceEventId,
  })
}

function maybeExpelLowCommitmentMember(
  state: RealityDomainState,
  alliance: RealityAlliance,
  memberId: string,
  at: RealityClock,
  sourceEventId: string
): boolean {
  if (
    alliance.status === 'DISSOLVED' ||
    alliance.memberIds.length < 3 ||
    !alliance.memberIds.includes(memberId) ||
    (alliance.memberCommitment[memberId] ?? 0.5) > 0.1 ||
    (alliance.status !== 'FRACTURED' && alliance.fractureRisk < 0.78)
  ) {
    return false
  }

  const expellerId = alliance.leaderIds
    .filter((id) => id !== memberId)
    .sort(
      (left, right) =>
        (alliance.memberCommitment[right] ?? 0) - (alliance.memberCommitment[left] ?? 0) ||
        left.localeCompare(right)
    )[0]
  if (!expellerId) return false

  removeRealityAllianceMember(state, {
    allianceId: alliance.id,
    memberId,
    actorId: expellerId,
    kind: 'EXPELLED',
    at,
    sourceEventId,
  })
  return true
}

export type RealityAllianceBetrayalKind =
  | 'NOMINATION'
  | 'VOTE'
  | 'SAFETY_ABANDON'
  | 'SOCIAL_BETRAYAL'

export function recordRealityAllianceBetrayal(
  state: RealityDomainState,
  input: {
    actorId: string
    targetId: string
    kind: RealityAllianceBetrayalKind
    at: RealityClock
    sourceEventId: string
  }
): RealityAlliance[] {
  const affected: RealityAlliance[] = []
  const baseSeverity =
    input.kind === 'NOMINATION'
      ? 0.3
      : input.kind === 'SOCIAL_BETRAYAL'
        ? 0.34
        : input.kind === 'VOTE'
          ? 0.22
          : 0.12

  for (const alliance of Object.values(state.alliances)) {
    if (
      alliance.status === 'DISSOLVED' ||
      !alliance.memberIds.includes(input.actorId) ||
      !alliance.memberIds.includes(input.targetId)
    ) {
      continue
    }

    const eventReason = `${input.kind.toLowerCase()}:${alliance.id}:${input.sourceEventId}`
    const officialDecision =
      input.kind === 'VOTE' || input.kind === 'NOMINATION' || input.kind === 'SAFETY_ABANDON'
    const duplicate = state.events.some(
      (event) =>
        event.type === 'ALLIANCE_BETRAYAL' &&
        event.actorId === input.actorId &&
        event.targetIds.includes(input.targetId) &&
        event.reason.startsWith(`${input.kind.toLowerCase()}:${alliance.id}:`) &&
        (officialDecision ? event.day === input.at.day : event.reason === eventReason)
    )
    if (duplicate) continue

    const actorWasCore = alliance.memberPerceivedStatus[input.actorId] === 'CORE'
    const targetWasCore = alliance.memberPerceivedStatus[input.targetId] === 'CORE'
    const pairSeverity = alliance.memberIds.length === 2 ? 0.06 : 0
    const severity = clamp01(
      baseSeverity + (actorWasCore ? 0.06 : 0) + (targetWasCore ? 0.05 : 0) + pairSeverity
    )
    const wasFractured = alliance.status === 'FRACTURED'

    alliance.memberCommitment[input.actorId] = clamp01(
      (alliance.memberCommitment[input.actorId] ?? 0.5) - severity
    )
    alliance.memberCommitment[input.targetId] = clamp01(
      (alliance.memberCommitment[input.targetId] ?? 0.5) - severity * 0.42
    )
    for (const memberId of alliance.memberIds) {
      if (memberId === input.actorId || memberId === input.targetId) continue
      alliance.memberCommitment[memberId] = clamp01(
        (alliance.memberCommitment[memberId] ?? 0.5) - severity * 0.1
      )
    }
    refreshRealityAllianceDynamics(alliance)

    const betrayalEvent = appendRealityEvent(state, {
      ...input.at,
      type: 'ALLIANCE_BETRAYAL',
      actorId: input.actorId,
      targetIds: [input.targetId],
      participantIds: [...alliance.memberIds],
      witnessIds: [],
      visibility: 'GROUP_VISIBLE',
      outcome: 'SUCCESS',
      reason: eventReason,
      tags: ['ALLIANCE', 'BETRAYAL', input.kind],
      relatedFactIds: [],
      relatedPromiseIds: [...alliance.sharedPromiseIds],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: true,
    })

    applyRealityRelationshipChange(state, {
      sourceId: input.targetId,
      targetId: input.actorId,
      eventId: betrayalEvent.id,
      day: input.at.day,
      phase: input.at.phase,
      anchor: 'negative',
      deltas: {
        warmth: -severity * 28,
        trust: -severity * 55,
        loyalty: -severity * 60,
        resentment: severity * 65,
        suspicion: severity * 35,
        reliability: -severity * 45,
      },
    })

    for (const ownerId of alliance.memberIds) {
      remember(state, {
        id: `memory:${ownerId}:${betrayalEvent.id}`,
        ownerId,
        eventId: betrayalEvent.id,
        day: input.at.day,
        phase: input.at.phase,
        participantIds: [...alliance.memberIds],
        sourceType:
          ownerId === input.actorId || ownerId === input.targetId ? 'DIRECT' : 'WITNESSED',
        sourceChain: [input.actorId],
        confidence: 1,
        importance: 0.92,
        surprise: 0.75,
        emotionalValence: ownerId === input.actorId ? -0.2 : -0.78,
        emotionalIntensity: ownerId === input.actorId ? 0.55 : 0.88,
        secrecy: 0.55,
        strategicRelevance: 1,
        visibility: 'GROUP_VISIBLE',
        tags: [...betrayalEvent.tags],
        relatedPromiseIds: [...betrayalEvent.relatedPromiseIds],
        relatedSecretIds: [],
        recallStrength: 1,
      })
    }

    const grievanceId = `grievance:alliance:${alliance.id}:${input.sourceEventId}:${input.targetId}`
    if (!state.grievances[grievanceId]) {
      createRealityGrievance(state, {
        id: grievanceId,
        holderId: input.targetId,
        againstId: input.actorId,
        causeEventId: input.sourceEventId,
        severity: Math.round(35 + severity * 115),
        at: input.at,
      })
    }

    const repeatedSevereBreach =
      wasFractured && (severity >= 0.28 || (alliance.memberCommitment[input.actorId] ?? 0) <= 0.12)
    if (repeatedSevereBreach || severity >= 0.38 || alliance.fractureRisk >= 0.72) {
      alliance.status = 'FRACTURED'
    } else {
      refreshRealityAllianceLifecycle(alliance)
    }

    const expelled = maybeExpelLowCommitmentMember(
      state,
      alliance,
      input.actorId,
      input.at,
      input.sourceEventId
    )
    if (repeatedSevereBreach && !expelled) {
      alliance.status = 'DISSOLVED'
      alliance.currentTargetIds = []
      alliance.fallbackTargetIds = []
    }
    affected.push(alliance)
  }

  if (affected.length > 0) refreshRealityAllianceOverlaps(state)
  return affected
}

function hasStrongerRealityPact(
  state: RealityDomainState,
  memberId: string,
  allianceId: string,
  currentCommitment: number
): boolean {
  return Object.values(state.alliances).some(
    (candidate) =>
      candidate.id !== allianceId &&
      (candidate.status === 'ACTIVE' || candidate.status === 'PROBATIONARY') &&
      candidate.memberIds.includes(memberId) &&
      (candidate.memberCommitment[memberId] ?? 0) >= 0.68 &&
      (candidate.memberCommitment[memberId] ?? 0) >= currentCommitment + 0.12
  )
}

/**
 * A player who accepts a much weaker secondary pact while already anchored in
 * a strong alliance can outwardly join without internally treating both deals
 * as equal. This mirrors the existing Drama false-pretense behavior but keeps
 * the durable truth in RealityAlliance.
 */
export function markRealityAllianceInfiltratorIfSecondary(
  state: RealityDomainState,
  allianceId: string,
  memberId: string,
  at: RealityClock
): boolean {
  const alliance = state.alliances[allianceId]
  if (
    !alliance ||
    alliance.status === 'DISSOLVED' ||
    !alliance.memberIds.includes(memberId) ||
    alliance.infiltratorIds.includes(memberId)
  ) {
    return false
  }
  const commitment = alliance.memberCommitment[memberId] ?? 0.5
  if (!hasStrongerRealityPact(state, memberId, allianceId, commitment)) return false

  alliance.infiltratorIds = [...new Set([...alliance.infiltratorIds, memberId])]
  alliance.genuine = false
  alliance.memberCommitment[memberId] = Math.min(commitment, 0.3)
  refreshRealityAllianceDynamics(alliance)

  appendRealityEvent(state, {
    ...at,
    type: 'ALLIANCE_FALSE_PRETENSE_ESTABLISHED',
    actorId: memberId,
    targetIds: alliance.memberIds.filter((id) => id !== memberId),
    participantIds: [memberId],
    witnessIds: [],
    visibility: 'PRIVATE',
    outcome: 'SYSTEM',
    reason: `secondary_to_stronger_pact:${alliance.id}`,
    tags: ['ALLIANCE', 'FALSE_PRETENSE'],
    relatedFactIds: [],
    relatedPromiseIds: [...alliance.sharedPromiseIds],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: true,
  })
  return true
}

function refreshRealityAllianceInfiltratorIntent(
  state: RealityDomainState,
  alliance: RealityAlliance,
  memberId: string
): void {
  if (!alliance.infiltratorIds.includes(memberId)) return
  const commitment = alliance.memberCommitment[memberId] ?? 0
  if (commitment >= 0.58 && !hasStrongerRealityPact(state, memberId, alliance.id, commitment)) {
    alliance.infiltratorIds = alliance.infiltratorIds.filter((id) => id !== memberId)
    alliance.genuine = alliance.infiltratorIds.length === 0
  }
}

function allianceCoordinationRank(
  alliance: RealityAlliance,
  actorId: string,
  partnerId: string
): [number, number, number, number, string] {
  const statusRank = alliance.status === 'ACTIVE' ? 2 : 1
  const actorRole =
    alliance.memberPerceivedStatus[actorId] === 'CORE'
      ? 2
      : alliance.memberPerceivedStatus[actorId] === 'REGULAR'
        ? 1
        : 0
  const partnerRole =
    alliance.memberPerceivedStatus[partnerId] === 'CORE'
      ? 2
      : alliance.memberPerceivedStatus[partnerId] === 'REGULAR'
        ? 1
        : 0
  const mutualCommitment = Math.min(
    alliance.memberCommitment[actorId] ?? 0,
    alliance.memberCommitment[partnerId] ?? 0
  )
  // A tight inner pact should own a private agreement before a looser outer
  // coalition does. Size is therefore only a final tiebreak after live health,
  // member standing and mutual commitment.
  return [
    statusRank,
    actorRole + partnerRole,
    mutualCommitment + alliance.cohesion * 0.35,
    -alliance.memberIds.length,
    alliance.id,
  ]
}

export function findRealityAllianceForCoordination(
  state: RealityDomainState,
  actorId: string,
  partnerId: string,
  subjectId?: string
): RealityAlliance | null {
  const candidates = Object.values(state.alliances).filter(
    (alliance) =>
      (alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY') &&
      alliance.memberIds.includes(actorId) &&
      alliance.memberIds.includes(partnerId) &&
      (!subjectId || !alliance.memberIds.includes(subjectId))
  )
  candidates.sort((left, right) => {
    const a = allianceCoordinationRank(left, actorId, partnerId)
    const b = allianceCoordinationRank(right, actorId, partnerId)
    return (
      b[0] - a[0] ||
      b[1] - a[1] ||
      b[2] - a[2] ||
      b[3] - a[3] ||
      String(a[4]).localeCompare(String(b[4]))
    )
  })
  return candidates[0] ?? null
}

export function findRealityAllianceForConsultation(
  state: RealityDomainState,
  actorId: string,
  representativeId: string
): RealityAlliance | null {
  const roleRank = (alliance: RealityAlliance, memberId: string) =>
    alliance.memberPerceivedStatus[memberId] === 'CORE'
      ? 2
      : alliance.memberPerceivedStatus[memberId] === 'REGULAR'
        ? 1
        : 0

  return (
    Object.values(state.alliances)
      .filter(
        (alliance) =>
          (alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY') &&
          alliance.memberIds.includes(actorId) &&
          alliance.memberIds.includes(representativeId)
      )
      .sort(
        (left, right) =>
          Number(right.status === 'ACTIVE') - Number(left.status === 'ACTIVE') ||
          right.memberIds.length - left.memberIds.length ||
          roleRank(right, actorId) - roleRank(left, actorId) ||
          roleRank(right, representativeId) - roleRank(left, representativeId) ||
          (right.memberCommitment[actorId] ?? 0) - (left.memberCommitment[actorId] ?? 0) ||
          right.cohesion - left.cohesion ||
          left.id.localeCompare(right.id)
      )[0] ?? null
  )
}

/**
 * Persist an accepted target conversation into the strongest shared pact only.
 * This deliberately does not call holdRealityAllianceMeeting: two members
 * agreeing privately should not count absent coalition members as skipping a
 * formal meeting. Their differing memberPlanBeliefs instead create natural
 * internal disagreement until the wider group aligns.
 */
export function coordinateRealityAllianceTarget(
  state: RealityDomainState,
  input: {
    actorId: string
    partnerId: string
    subjectId: string
    kind: 'CURRENT' | 'FALLBACK'
    at: RealityClock
    sourceEventId: string
    allianceId?: string
  }
): RealityAlliance | null {
  if (
    input.actorId === input.partnerId ||
    input.actorId === input.subjectId ||
    input.partnerId === input.subjectId
  ) {
    return null
  }
  const requestedAlliance = input.allianceId ? state.alliances[input.allianceId] : undefined
  const alliance = input.allianceId
    ? requestedAlliance &&
      (requestedAlliance.status === 'ACTIVE' || requestedAlliance.status === 'PROBATIONARY') &&
      requestedAlliance.memberIds.includes(input.actorId) &&
      requestedAlliance.memberIds.includes(input.partnerId) &&
      !requestedAlliance.memberIds.includes(input.subjectId)
      ? requestedAlliance
      : null
    : findRealityAllianceForCoordination(
        state,
        input.actorId,
        input.partnerId,
        input.subjectId
      )
  if (!alliance) return null

  const planId =
    input.kind === 'CURRENT' ? `target:${input.subjectId}` : `fallback:${input.subjectId}`
  if (input.kind === 'CURRENT') {
    alliance.currentTargetIds = [input.subjectId]
    alliance.fallbackTargetIds = alliance.fallbackTargetIds.filter(
      (targetId) => targetId !== input.subjectId
    )
  } else {
    alliance.fallbackTargetIds = [input.subjectId]
  }

  for (const memberId of [input.actorId, input.partnerId]) {
    alliance.memberPlanBeliefs[memberId] = [planId]
    const commitmentGain = alliance.infiltratorIds.includes(memberId) ? 0.005 : 0.02
    alliance.memberCommitment[memberId] = clamp01(
      (alliance.memberCommitment[memberId] ?? 0.5) + commitmentGain
    )
  }

  appendRealityEvent(state, {
    ...input.at,
    type: 'ALLIANCE_TARGET_COORDINATED',
    actorId: input.actorId,
    targetIds: [input.subjectId],
    participantIds: [input.actorId, input.partnerId],
    witnessIds: [],
    visibility: 'PAIR_ONLY',
    outcome: 'SUCCESS',
    reason: `${input.kind.toLowerCase()}:${alliance.id}:${input.sourceEventId}`,
    tags: ['ALLIANCE', 'PLAN', input.kind],
    relatedFactIds: [],
    relatedPromiseIds: [...alliance.sharedPromiseIds],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: true,
  })

  refreshRealityAllianceDynamics(alliance)
  refreshRealityAllianceInfiltratorIntent(state, alliance, input.actorId)
  refreshRealityAllianceInfiltratorIntent(state, alliance, input.partnerId)
  return refreshRealityAllianceLifecycle(alliance)
}

function allianceRecruitmentRank(
  alliance: RealityAlliance,
  recruiterId: string
): [number, number, number, number, string] {
  const statusRank = alliance.status === 'ACTIVE' ? 2 : alliance.status === 'PROBATIONARY' ? 1 : 0
  const memberRank =
    alliance.memberPerceivedStatus[recruiterId] === 'CORE'
      ? 2
      : alliance.memberPerceivedStatus[recruiterId] === 'REGULAR'
        ? 1
        : 0
  return [
    alliance.memberIds.length,
    memberRank,
    statusRank,
    alliance.memberCommitment[recruiterId] ?? 0,
    alliance.id,
  ]
}

/**
 * Pick the existing coalition a player is most plausibly recruiting into.
 * Only core/regular members of live coalitions may extend them; peripheral
 * members need to build their own deal instead of silently changing the group.
 */
export function findRealityAllianceForRecruitment(
  state: RealityDomainState,
  recruiterId: string,
  targetId: string
): RealityAlliance | null {
  const candidates = Object.values(state.alliances).filter(
    (alliance) =>
      (alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY') &&
      alliance.memberIds.includes(recruiterId) &&
      !alliance.memberIds.includes(targetId) &&
      alliance.memberPerceivedStatus[recruiterId] !== 'PERIPHERAL'
  )
  candidates.sort((left, right) => {
    const a = allianceRecruitmentRank(left, recruiterId)
    const b = allianceRecruitmentRank(right, recruiterId)
    return (
      b[0] - a[0] ||
      b[1] - a[1] ||
      b[2] - a[2] ||
      b[3] - a[3] ||
      String(a[4]).localeCompare(String(b[4]))
    )
  })
  return candidates[0] ?? null
}

/**
 * Recompute structural overlap links for every non-dissolved alliance.
 * Two alliances overlap when they share at least two members, which covers
 * nested Final-2/core deals without treating a single shared player as a bloc.
 */
export function refreshRealityAllianceOverlaps(state: RealityDomainState): void {
  const allAlliances = Object.values(state.alliances)
  for (const alliance of allAlliances) alliance.overlapAllianceIds = []
  const alliances = allAlliances.filter((alliance) => alliance.status !== 'DISSOLVED')

  for (let leftIndex = 0; leftIndex < alliances.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < alliances.length; rightIndex += 1) {
      const left = alliances[leftIndex]
      const right = alliances[rightIndex]
      const sharedMembers = left.memberIds.filter((id) => right.memberIds.includes(id))
      if (sharedMembers.length < 2) continue
      left.overlapAllianceIds.push(right.id)
      right.overlapAllianceIds.push(left.id)
    }
  }

  for (const alliance of alliances) {
    alliance.overlapAllianceIds = [...new Set(alliance.overlapAllianceIds)].sort()
  }
}

/**
 * Add a recruit to an existing coalition without flattening a two-person core.
 * Expanding a pair creates a wider coalition and keeps the pair as an overlapping
 * inner pact. Once a coalition already has 3+ members, later recruits extend it
 * in place so we do not create a new alliance object for every additional member.
 */
export function recruitRealityAllianceMember(
  state: RealityDomainState,
  input: {
    allianceId: string
    recruiterId: string
    targetId: string
    expandedAllianceId: string
    at: RealityClock
  }
): RealityAlliance {
  const base = state.alliances[input.allianceId]
  if (!base || (base.status !== 'ACTIVE' && base.status !== 'PROBATIONARY')) {
    throw new Error('Alliance is not recruitable')
  }
  if (!base.memberIds.includes(input.recruiterId))
    throw new Error('Recruiter must already belong to the alliance')
  if (base.memberPerceivedStatus[input.recruiterId] === 'PERIPHERAL')
    throw new Error('Peripheral members cannot recruit into the alliance')
  if (base.memberIds.includes(input.targetId)) return base

  const priorMembers = [...base.memberIds]
  let alliance: RealityAlliance

  if (base.memberIds.length === 2) {
    alliance = {
      ...base,
      id: input.expandedAllianceId,
      name: undefined,
      memberIds: [...priorMembers, input.targetId],
      founderIds: [...priorMembers],
      purpose: isEndgameAlliancePurpose(base.purpose) ? 'Wider coalition' : base.purpose,
      leaderIds: [...base.leaderIds],
      secrecy: clamp01(base.secrecy - 0.05),
      cohesion: clamp01((base.cohesion * priorMembers.length + 0.42) / (priorMembers.length + 1)),
      fractureRisk: clamp01(base.fractureRisk + 0.03),
      currentTargetIds: [...base.currentTargetIds],
      fallbackTargetIds: [...base.fallbackTargetIds],
      sharedPromiseIds: [...base.sharedPromiseIds],
      memberCommitment: {
        ...base.memberCommitment,
        [input.targetId]: 0.42,
      },
      memberPerceivedStatus: {
        ...Object.fromEntries(priorMembers.map((id) => [id, 'CORE' as const])),
        [input.targetId]: 'REGULAR',
      },
      memberPlanBeliefs: {
        ...Object.fromEntries(
          priorMembers.map((id) => [id, [...(base.memberPlanBeliefs[id] ?? [])]])
        ),
        [input.targetId]: [],
      },
      operationalRoles: {
        ...Object.fromEntries(
          priorMembers.map((id) => [id, [...(base.operationalRoles[id] ?? [])]])
        ),
        [input.targetId]: [],
      },
      suspectedByIds: [...base.suspectedByIds],
      knownLeakEventIds: [...base.knownLeakEventIds],
      overlapAllianceIds: [],
      lastMeeting: input.at,
      genuine: base.genuine,
      infiltratorIds: [...base.infiltratorIds],
    }
    state.alliances[alliance.id] = alliance
  } else {
    base.memberIds = [...base.memberIds, input.targetId]
    base.memberCommitment[input.targetId] = 0.38
    base.memberPerceivedStatus[input.targetId] = 'PERIPHERAL'
    base.memberPlanBeliefs[input.targetId] = []
    base.operationalRoles[input.targetId] = []
    base.secrecy = clamp01(base.secrecy - 0.04)
    base.cohesion = clamp01(
      (base.cohesion * priorMembers.length + 0.38) / (priorMembers.length + 1)
    )
    base.fractureRisk = clamp01(base.fractureRisk + 0.02)
    base.lastMeeting = input.at
    alliance = base
  }

  const event = appendRealityEvent(state, {
    ...input.at,
    type: 'ALLIANCE_MEMBER_RECRUITED',
    actorId: input.recruiterId,
    targetIds: [input.targetId],
    participantIds: [...alliance.memberIds],
    witnessIds: [],
    visibility: 'GROUP_VISIBLE',
    outcome: 'SUCCESS',
    reason: `recruited_into:${alliance.id}`,
    tags: ['ALLIANCE', 'RECRUITMENT'],
    relatedFactIds: [],
    relatedPromiseIds: [...alliance.sharedPromiseIds],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: true,
  })

  for (const memberId of priorMembers) {
    if (memberId === input.recruiterId) continue
    for (const [fromId, toId] of [
      [memberId, input.targetId],
      [input.targetId, memberId],
    ] as const) {
      applyRealityRelationshipChange(state, {
        sourceId: fromId,
        targetId: toId,
        eventId: event.id,
        day: input.at.day,
        phase: input.at.phase,
        anchor: 'positive',
        deltas: { trust: 3, loyalty: 4, strategicValue: 8, secretCloseness: 6, familiarity: 2 },
      })
    }
  }

  refreshRealityAllianceDynamics(alliance)
  ensureRealityAllianceName(state, alliance)
  markRealityAllianceInfiltratorIfSecondary(state, alliance.id, input.targetId, input.at)
  refreshRealityAllianceOverlaps(state)
  return alliance
}

export function createRealityAlliance(
  state: RealityDomainState,
  input: {
    id: string
    founderIds: string[]
    memberIds: string[]
    purpose: string
    at: RealityClock
    name?: string
    secrecy?: number
    genuine?: boolean
  }
): RealityAlliance {
  const memberIds = [...new Set([...input.founderIds, ...input.memberIds])]
  if (memberIds.length < 2) throw new Error('A Reality alliance needs at least two members')
  const alliance: RealityAlliance = {
    id: input.id,
    ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    memberIds,
    founderIds: [...new Set(input.founderIds)],
    leaderIds: [...new Set(input.founderIds)].slice(0, 2),
    secrecy: Math.max(0, Math.min(1, input.secrecy ?? 0.75)),
    cohesion: 0.45,
    fractureRisk: 0.15,
    purpose: input.purpose,
    currentTargetIds: [],
    fallbackTargetIds: [],
    sharedPromiseIds: [],
    memberCommitment: Object.fromEntries(memberIds.map((id) => [id, 0.5])),
    memberPerceivedStatus: Object.fromEntries(
      memberIds.map((id) => [id, input.founderIds.includes(id) ? 'CORE' : 'REGULAR'])
    ),
    memberPlanBeliefs: Object.fromEntries(memberIds.map((id) => [id, []])),
    operationalRoles: Object.fromEntries(memberIds.map((id) => [id, []])),
    suspectedByIds: [],
    knownLeakEventIds: [],
    overlapAllianceIds: [],
    lastMeeting: input.at,
    status: 'PROBATIONARY',
    genuine: input.genuine ?? true,
    infiltratorIds: [],
  }
  state.alliances[alliance.id] = alliance
  const event = appendRealityEvent(state, {
    ...input.at,
    type: 'ALLIANCE_FORMED',
    actorId: input.founderIds[0],
    targetIds: memberIds.filter((id) => !input.founderIds.includes(id)),
    participantIds: memberIds,
    witnessIds: [],
    visibility: 'GROUP_VISIBLE',
    outcome: 'SUCCESS',
    reason: input.purpose,
    tags: ['ALLIANCE', 'ANCHOR'],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: true,
  })
  for (const fromId of memberIds) {
    for (const toId of memberIds) {
      if (fromId === toId) continue
      applyRealityRelationshipChange(state, {
        sourceId: fromId,
        targetId: toId,
        eventId: event.id,
        day: input.at.day,
        phase: input.at.phase,
        anchor: 'positive',
        deltas: { trust: 8, loyalty: 12, strategicValue: 15, secretCloseness: 10 },
      })
    }
  }
  refreshRealityAllianceDynamics(alliance)
  ensureRealityAllianceName(state, alliance)
  refreshRealityAllianceOverlaps(state)
  return alliance
}

export function holdRealityAllianceMeeting(
  state: RealityDomainState,
  input: {
    allianceId: string
    attendeeIds: string[]
    targetIds: string[]
    fallbackTargetIds?: string[]
    planIds: string[]
    at: RealityClock
    /** Members who could not reasonably attend (for example already evicted) are neutral. */
    excusedAbsentIds?: string[]
  }
): RealityAlliance {
  const alliance = state.alliances[input.allianceId]
  if (!alliance || alliance.status === 'DISSOLVED') throw new Error('Alliance is not active')
  const attendees = input.attendeeIds.filter((id) => alliance.memberIds.includes(id))
  if (attendees.length < 2) throw new Error('An alliance meeting needs two members')
  alliance.currentTargetIds = [...new Set(input.targetIds)]
  alliance.fallbackTargetIds = [...new Set(input.fallbackTargetIds ?? [])]
  alliance.lastMeeting = input.at
  alliance.status = alliance.status === 'PROBATIONARY' ? 'ACTIVE' : alliance.status
  for (const attendeeId of attendees) {
    alliance.memberPlanBeliefs[attendeeId] = [...new Set(input.planIds)]
    alliance.memberCommitment[attendeeId] = clamp01(
      (alliance.memberCommitment[attendeeId] ?? 0.5) + 0.05
    )
  }
  const excusedAbsentIds = new Set(input.excusedAbsentIds ?? [])
  for (const absentId of alliance.memberIds.filter(
    (id) => !attendees.includes(id) && !excusedAbsentIds.has(id)
  )) {
    alliance.memberCommitment[absentId] = clamp01(
      (alliance.memberCommitment[absentId] ?? 0.5) - 0.025
    )
  }
  refreshRealityAllianceDynamics(alliance)
  for (const attendeeId of attendees) {
    refreshRealityAllianceInfiltratorIntent(state, alliance, attendeeId)
  }
  ensureRealityAllianceName(state, alliance)
  refreshRealityAllianceLifecycle(alliance)
  for (const attendeeId of attendees) {
    maybeDefectRealityAllianceMember(
      state,
      alliance,
      attendeeId,
      input.at,
      `meeting:${alliance.id}:${input.at.day}:${input.at.phase}`
    )
  }
  return alliance
}

export function holdRealityAllianceStrategyMeeting(
  state: RealityDomainState,
  input: {
    allianceId: string
    callerId: string
    attendeeIds: string[]
    targetIds: string[]
    fallbackTargetIds?: string[]
    planIds: string[]
    agenda: string
    at: RealityClock
    sourceEventId?: string
    excusedAbsentIds?: string[]
  }
): RealityAlliance {
  const alliance = holdRealityAllianceMeeting(state, {
    allianceId: input.allianceId,
    attendeeIds: input.attendeeIds,
    targetIds: input.targetIds,
    fallbackTargetIds: input.fallbackTargetIds,
    planIds: input.planIds,
    at: input.at,
    excusedAbsentIds: input.excusedAbsentIds,
  })

  appendRealityEvent(state, {
    ...input.at,
    type: 'ALLIANCE_STRATEGY_MEETING',
    actorId: input.callerId,
    targetIds: [...new Set([...input.targetIds, ...(input.fallbackTargetIds ?? [])])],
    participantIds: [...new Set(input.attendeeIds)],
    witnessIds: [],
    visibility: 'GROUP_VISIBLE',
    outcome: 'SUCCESS',
    reason: `strategy_meeting:${alliance.id}:${input.agenda}:${input.sourceEventId ?? 'manual'}`,
    tags: ['ALLIANCE', 'STRATEGY', 'MEETING'],
    relatedFactIds: [],
    relatedPromiseIds: [...alliance.sharedPromiseIds],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: true,
  })
  return alliance
}

export function recordRealityAlliancePlanDefiance(
  state: RealityDomainState,
  input: {
    actorId: string
    actualTargetId: string
    at: RealityClock
    sourceEventId: string
    eligibleTargetIds?: string[]
  }
): RealityAlliance[] {
  const affected: RealityAlliance[] = []

  for (const alliance of Object.values(state.alliances)) {
    if (
      (alliance.status !== 'ACTIVE' && alliance.status !== 'PROBATIONARY') ||
      !alliance.memberIds.includes(input.actorId) ||
      alliance.memberIds.includes(input.actualTargetId) ||
      alliance.currentTargetIds.length === 0
    ) {
      continue
    }

    const planTargetIds = [...alliance.currentTargetIds, ...alliance.fallbackTargetIds]
    if (
      input.eligibleTargetIds &&
      !planTargetIds.some((targetId) => input.eligibleTargetIds!.includes(targetId))
    ) {
      continue
    }

    const knowsPlan =
      alliance.leaderIds.includes(input.actorId) ||
      (alliance.memberPlanBeliefs[input.actorId] ?? []).some((planId) =>
        planTargetIds.some((targetId) => planId.includes(targetId))
      )
    if (!knowsPlan) continue
    if (
      alliance.currentTargetIds.includes(input.actualTargetId) ||
      alliance.fallbackTargetIds.includes(input.actualTargetId)
    ) {
      continue
    }

    const duplicate = state.events.some(
      (event) =>
        event.type === 'ALLIANCE_PLAN_DEFIED' &&
        event.actorId === input.actorId &&
        event.day === input.at.day &&
        event.reason.startsWith(`vote_defiance:${alliance.id}:`)
    )
    if (duplicate) continue

    const severity =
      0.07 +
      (alliance.memberPerceivedStatus[input.actorId] === 'CORE' ? 0.025 : 0) +
      alliance.cohesion * 0.035
    alliance.memberCommitment[input.actorId] = clamp01(
      (alliance.memberCommitment[input.actorId] ?? 0.5) - severity
    )

    const event = appendRealityEvent(state, {
      ...input.at,
      type: 'ALLIANCE_PLAN_DEFIED',
      actorId: input.actorId,
      targetIds: [input.actualTargetId],
      participantIds: [...alliance.memberIds],
      witnessIds: alliance.memberIds.filter((id) => id !== input.actorId),
      visibility: 'GROUP_VISIBLE',
      outcome: 'SUCCESS',
      reason: `vote_defiance:${alliance.id}:${alliance.currentTargetIds[0]}:${input.actualTargetId}`,
      tags: ['ALLIANCE', 'PLAN', 'DEFIANCE', 'VOTE'],
      relatedFactIds: [],
      relatedPromiseIds: [...alliance.sharedPromiseIds],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: true,
    })

    for (const memberId of alliance.memberIds) {
      if (memberId === input.actorId) continue
      applyRealityRelationshipChange(state, {
        sourceId: memberId,
        targetId: input.actorId,
        eventId: event.id,
        day: input.at.day,
        phase: input.at.phase,
        anchor: 'negative',
        deltas: {
          trust: -6,
          loyalty: -8,
          resentment: 4,
          suspicion: 6,
          reliability: -8,
          strategicValue: -3,
        },
      })
    }

    refreshRealityAllianceDynamics(alliance)
    if (alliance.fractureRisk >= 0.72) alliance.status = 'FRACTURED'
    else refreshRealityAllianceLifecycle(alliance)
    maybeExpelLowCommitmentMember(state, alliance, input.actorId, input.at, input.sourceEventId)
    affected.push(alliance)
  }

  if (affected.length > 0) refreshRealityAllianceOverlaps(state)
  return affected
}

export function chooseAllianceMemberVote(
  state: RealityDomainState,
  allianceId: string,
  memberId: string,
  options: {
    candidateIds: string[]
    day: number
    draw: number
  }
): RealityVoteIntent {
  const alliance = state.alliances[allianceId]
  if (!alliance?.memberIds.includes(memberId)) throw new Error('Actor is not an alliance member')
  const commitment = alliance.memberCommitment[memberId] ?? 0
  const preferred = alliance.currentTargetIds.find((id) => options.candidateIds.includes(id))
  const personal = [...options.candidateIds].sort(
    (left, right) =>
      (getRealityRelationship(state, memberId, left).warmth ?? 0) -
        (getRealityRelationship(state, memberId, right).warmth ?? 0) || left.localeCompare(right)
  )[0]
  const followsPlan = Boolean(preferred) && options.draw < Math.min(0.95, commitment)
  const intendedTargetId = followsPlan ? preferred : personal
  const intent: RealityVoteIntent = {
    actorId: memberId,
    statedTargetId: preferred,
    intendedTargetId,
    confidence: followsPlan ? commitment : Math.max(0.35, 1 - commitment),
    reasonEventIds: [],
    day: options.day,
  }
  state.voteIntents[memberId] = intent
  return intent
}

export function leakRealityAlliance(
  state: RealityDomainState,
  allianceId: string,
  leakerId: string,
  receiverIds: string[],
  at: RealityClock
): void {
  const alliance = state.alliances[allianceId]
  if (!alliance?.memberIds.includes(leakerId))
    throw new Error('Only a member can leak the alliance')
  if (alliance.status === 'DISSOLVED') return
  const outsiderReceiverIds = [
    ...new Set(receiverIds.filter((id) => !alliance.memberIds.includes(id))),
  ]
  if (outsiderReceiverIds.length === 0) return
  const event = appendRealityEvent(state, {
    ...at,
    type: 'ALLIANCE_LEAKED',
    actorId: leakerId,
    targetIds: outsiderReceiverIds,
    participantIds: [leakerId, ...outsiderReceiverIds],
    witnessIds: [],
    visibility: 'PAIR_ONLY',
    outcome: 'SUCCESS',
    reason: 'member_disclosed_alliance',
    tags: ['ALLIANCE', 'LEAK'],
    relatedFactIds: [],
    relatedPromiseIds: alliance.sharedPromiseIds,
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: true,
  })
  alliance.knownLeakEventIds.push(event.id)
  alliance.suspectedByIds = [...new Set([...alliance.suspectedByIds, ...outsiderReceiverIds])]
  alliance.secrecy = Math.max(0, alliance.secrecy - outsiderReceiverIds.length * 0.16)
  recordRealityAllianceLeakDiscovery(state, {
    allianceId: alliance.id,
    leakerId,
    receiverIds,
    at,
    sourceEventId: event.id,
  })
  const wasFractured = alliance.status === 'FRACTURED'
  refreshRealityAllianceDynamics(alliance)
  if (wasFractured && alliance.fractureRisk >= 0.9) {
    alliance.status = 'DISSOLVED'
    alliance.currentTargetIds = []
    alliance.fallbackTargetIds = []
    refreshRealityAllianceOverlaps(state)
  } else if (alliance.fractureRisk >= 0.72) {
    alliance.status = 'FRACTURED'
  }
  maybeExposeRealityAlliance(state, alliance.id, at, event.id)
}

export interface RomanceSettings {
  enabled: boolean
  allowedPair?: (leftId: string, rightId: string) => boolean
}

export function signalRealityRomance(
  state: RealityDomainState,
  input: {
    actorId: string
    targetId: string
    at: RealityClock
    acceptedByTarget: boolean
    genuineIntent?: number
    strategicIntent?: number
    settings: RomanceSettings
  }
): RealityRomance | null {
  if (
    !input.settings.enabled ||
    (input.settings.allowedPair && !input.settings.allowedPair(input.actorId, input.targetId))
  ) {
    return null
  }
  const id = `romance:${pairId(input.actorId, input.targetId)}`
  const romance =
    state.romances[id] ??
    ({
      id,
      participantIds: [input.actorId, input.targetId],
      initiatedById: input.actorId,
      signalledInterest: {
        [input.actorId]: true,
        [input.targetId]: false,
      },
      acceptedEscalation: {
        [input.actorId]: true,
        [input.targetId]: false,
      },
      genuineIntent: {
        [input.actorId]: input.genuineIntent ?? 0.7,
        [input.targetId]: 0,
      },
      strategicIntent: {
        [input.actorId]: input.strategicIntent ?? 0.2,
        [input.targetId]: 0,
      },
      exclusivity: { [input.actorId]: false, [input.targetId]: false },
      public: false,
      startedAt: input.at,
      lastUpdatedAt: input.at,
      anchorEventIds: [],
      strainEventIds: [],
      status: 'SIGNALLED',
    } satisfies RealityRomance)
  romance.signalledInterest[input.actorId] = true
  romance.acceptedEscalation[input.targetId] = input.acceptedByTarget
  romance.lastUpdatedAt = input.at
  const mutual =
    romance.signalledInterest[input.actorId] &&
    romance.acceptedEscalation[input.actorId] &&
    romance.acceptedEscalation[input.targetId]
  const event = appendRealityEvent(state, {
    ...input.at,
    type: mutual ? 'ROMANCE_MUTUALLY_ACCEPTED' : 'ROMANCE_SIGNALLED',
    actorId: input.actorId,
    targetIds: [input.targetId],
    participantIds: [input.actorId, input.targetId],
    witnessIds: [],
    visibility: 'PAIR_ONLY',
    outcome: mutual ? 'SUCCESS' : input.acceptedByTarget ? 'PARTIAL' : 'FAILURE',
    reason: mutual ? 'mutual_acceptance' : 'one_sided_signal',
    tags: ['ROMANCE', ...(mutual ? ['ANCHOR'] : [])],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: false,
  })
  if (mutual) {
    romance.status = 'ACTIVE'
    romance.anchorEventIds.push(event.id)
    for (const [fromId, toId] of [
      [input.actorId, input.targetId],
      [input.targetId, input.actorId],
    ] as const) {
      applyRealityRelationshipChange(state, {
        sourceId: fromId,
        targetId: toId,
        eventId: event.id,
        day: input.at.day,
        phase: input.at.phase,
        anchor: 'positive',
        deltas: { attraction: 18, intimacy: 12, warmth: 7, trust: 4 },
      })
    }
  } else {
    romance.status = 'SIGNALLED'
    applyRealityRelationshipChange(state, {
      sourceId: input.actorId,
      targetId: input.targetId,
      eventId: event.id,
      day: input.at.day,
      phase: input.at.phase,
      deltas: { attraction: 10, familiarity: 2 },
    })
  }
  state.romances[id] = romance
  if (input.acceptedByTarget) {
    recordGroundedJealousy(state, {
      actorId: input.actorId,
      targetId: input.targetId,
      eventId: event.id,
      at: input.at,
      witnessIds: event.witnessIds,
      publicEligible: event.publicEligible,
    })
  }
  return romance
}

export function reciprocateRealityRomance(
  state: RealityDomainState,
  romanceId: string,
  actorId: string,
  at: RealityClock
): RealityRomance {
  const romance = state.romances[romanceId]
  if (!romance || !romance.participantIds.includes(actorId)) {
    throw new Error('Romance signal is not available')
  }
  const targetId = romance.participantIds.find((id) => id !== actorId)!
  romance.signalledInterest[actorId] = true
  romance.acceptedEscalation[actorId] = true
  return signalRealityRomance(state, {
    actorId,
    targetId,
    at,
    acceptedByTarget: romance.acceptedEscalation[targetId] === true,
    genuineIntent: romance.genuineIntent[actorId] ?? 0.7,
    strategicIntent: romance.strategicIntent[actorId] ?? 0.2,
    settings: { enabled: true },
  })!
}

export function createRealityGrievance(
  state: RealityDomainState,
  input: {
    id: string
    holderId: string
    againstId: string
    causeEventId: string
    severity: number
    at: RealityClock
  }
): RealityGrievance {
  const severity = Math.max(0, Math.min(100, input.severity))
  const grievance: RealityGrievance = {
    id: input.id,
    holderId: input.holderId,
    againstId: input.againstId,
    causeEventId: input.causeEventId,
    severity,
    repairDebt: severity,
    createdAt: input.at,
    status: 'OPEN',
    apologyEventIds: [],
  }
  state.grievances[grievance.id] = grievance
  const edge = getRealityRelationship(state, input.holderId, input.againstId)
  if (!edge.unresolvedGrievanceIds.includes(grievance.id)) {
    edge.unresolvedGrievanceIds.push(grievance.id)
  }
  return grievance
}

export function applyRealityApology(
  state: RealityDomainState,
  input: {
    grievanceId: string
    apologyEventId: string
    sincerity: number
    accountability: number
    at: RealityClock
  }
): RealityGrievance {
  const grievance = state.grievances[input.grievanceId]
  if (!grievance || grievance.status === 'RESOLVED') throw new Error('Grievance is not open')
  const repair = Math.min(
    grievance.repairDebt * 0.2,
    Math.max(0, input.sincerity) * Math.max(0, input.accountability) * 18
  )
  grievance.repairDebt = Math.max(0, grievance.repairDebt - repair)
  grievance.apologyEventIds.push(input.apologyEventId)
  grievance.status =
    grievance.repairDebt <= 5
      ? 'RESOLVED'
      : grievance.apologyEventIds.length > 0
        ? 'REPAIRING'
        : 'ACKNOWLEDGED'
  applyRealityRelationshipChange(state, {
    sourceId: grievance.holderId,
    targetId: grievance.againstId,
    eventId: input.apologyEventId,
    day: input.at.day,
    phase: input.at.phase,
    anchor: repair >= 8 ? 'positive' : undefined,
    deltas: {
      trust: repair * 0.18,
      warmth: repair * 0.2,
      resentment: -repair,
      suspicion: -repair * 0.25,
    },
  })
  if (grievance.status === 'RESOLVED') {
    const edge = getRealityRelationship(state, grievance.holderId, grievance.againstId)
    edge.unresolvedGrievanceIds = edge.unresolvedGrievanceIds.filter((id) => id !== grievance.id)
  }
  return grievance
}

export function formRealityTruce(
  state: RealityDomainState,
  leftId: string,
  rightId: string,
  sharedThreatId: string,
  at: RealityClock
): void {
  const event = appendRealityEvent(state, {
    ...at,
    type: 'UNEASY_TRUCE_FORMED',
    actorId: leftId,
    targetIds: [rightId],
    participantIds: [leftId, rightId],
    witnessIds: [],
    visibility: 'PAIR_ONLY',
    outcome: 'SUCCESS',
    reason: `shared_threat:${sharedThreatId}`,
    tags: ['TRUCE', 'ANCHOR'],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: true,
  })
  for (const [fromId, toId] of [
    [leftId, rightId],
    [rightId, leftId],
  ] as const) {
    applyRealityRelationshipChange(state, {
      sourceId: fromId,
      targetId: toId,
      eventId: event.id,
      day: at.day,
      phase: at.phase,
      anchor: 'positive',
      deltas: { trust: 12, respect: 8, strategicValue: 18, resentment: -5 },
    })
    getRealityRelationship(state, fromId, toId).perceivedLabel = 'UNEASY_TRUCE'
  }
}

export function migrateDramaAlliances(
  state: RealityDomainState,
  alliances: readonly DramaAlliance[]
): void {
  for (const legacy of alliances) {
    if (state.alliances[legacy.id]) continue
    state.alliances[legacy.id] = {
      id: legacy.id,
      memberIds: [...legacy.participantIds],
      founderIds: [legacy.participantIds[0]],
      leaderIds: [...legacy.primaryForIds],
      secrecy: legacy.secrecy === 'secret' ? 0.8 : 0.1,
      cohesion:
        Object.values(legacy.loyaltyByPlayer).reduce((sum, value) => sum + value, 0) /
        Math.max(1, Object.keys(legacy.loyaltyByPlayer).length) /
        100,
      fractureRisk: legacy.status === 'strained' ? 0.65 : legacy.status === 'broken' ? 1 : 0.2,
      purpose: 'Migrated strategic pact',
      currentTargetIds: [],
      fallbackTargetIds: [],
      sharedPromiseIds: [],
      memberCommitment: Object.fromEntries(
        legacy.participantIds.map((id) => [id, (legacy.loyaltyByPlayer[id] ?? 50) / 100])
      ),
      memberPerceivedStatus: Object.fromEntries(
        legacy.participantIds.map((id) => [
          id,
          legacy.primaryForIds.includes(id) ? 'CORE' : 'REGULAR',
        ])
      ),
      memberPlanBeliefs: Object.fromEntries(legacy.participantIds.map((id) => [id, []])),
      operationalRoles: Object.fromEntries(legacy.participantIds.map((id) => [id, []])),
      suspectedByIds: [...legacy.discoveredByIds],
      knownLeakEventIds: [],
      overlapAllianceIds: [],
      lastMeeting: { day: legacy.lastUpdatedWeek, phase: 'legacy' },
      status:
        legacy.status === 'broken'
          ? 'DISSOLVED'
          : legacy.status === 'strained'
            ? 'FRACTURED'
            : 'ACTIVE',
      genuine: legacy.falsePretenceByIds.length === 0,
      infiltratorIds: [...legacy.falsePretenceByIds],
    }
  }
  for (const alliance of Object.values(state.alliances)) {
    refreshRealityAllianceDynamics(alliance)
    ensureRealityAllianceName(state, alliance)
  }
  refreshRealityAllianceOverlaps(state)
}
