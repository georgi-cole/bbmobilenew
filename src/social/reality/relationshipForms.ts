import type { DramaAlliance } from '../types'
import { appendRealityEvent } from './events'
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

  const commitments = alliance.memberIds.map((id) =>
    clamp01(alliance.memberCommitment[id] ?? 0.5)
  )
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
  const lowCommitmentShare =
    commitments.filter((value) => value <= 0.3).length / commitments.length
  const planDisagreement = alliancePlanDisagreement(alliance)
  const leakPenalty = Math.min(0.24, alliance.knownLeakEventIds.length * 0.12)

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

  if (alliance.status !== 'DISSOLVED' && alliance.status !== 'PROBATIONARY') {
    if (alliance.fractureRisk >= 0.72) {
      alliance.status = 'FRACTURED'
    } else if (
      alliance.status === 'FRACTURED' &&
      alliance.fractureRisk <= 0.42 &&
      alliance.cohesion >= 0.52
    ) {
      alliance.status = 'ACTIVE'
    }
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
  return refreshRealityAllianceDynamics(alliance)
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
      memberIds: [...priorMembers, input.targetId],
      founderIds: [...priorMembers],
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
    secrecy?: number
    genuine?: boolean
  }
): RealityAlliance {
  const memberIds = [...new Set([...input.founderIds, ...input.memberIds])]
  if (memberIds.length < 2) throw new Error('A Reality alliance needs at least two members')
  const alliance: RealityAlliance = {
    id: input.id,
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
  for (const absentId of alliance.memberIds.filter((id) => !attendees.includes(id))) {
    alliance.memberCommitment[absentId] = clamp01(
      (alliance.memberCommitment[absentId] ?? 0.5) - 0.025
    )
  }
  return refreshRealityAllianceDynamics(alliance)
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
  const event = appendRealityEvent(state, {
    ...at,
    type: 'ALLIANCE_LEAKED',
    actorId: leakerId,
    targetIds: receiverIds,
    participantIds: [leakerId, ...receiverIds],
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
  alliance.suspectedByIds = [...new Set([...alliance.suspectedByIds, ...receiverIds])]
  alliance.secrecy = Math.max(0, alliance.secrecy - receiverIds.length * 0.16)
  refreshRealityAllianceDynamics(alliance)
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
  }
  refreshRealityAllianceOverlaps(state)
}
