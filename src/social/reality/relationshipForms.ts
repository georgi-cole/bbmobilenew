import type { DramaAlliance } from '../types'
import { appendRealityEvent } from './events'
import { applyRealityRelationshipChange, getRealityRelationship } from './relationships'
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
    alliance.memberCommitment[attendeeId] = Math.min(
      1,
      (alliance.memberCommitment[attendeeId] ?? 0.5) + 0.08
    )
  }
  for (const absentId of alliance.memberIds.filter((id) => !attendees.includes(id))) {
    alliance.memberCommitment[absentId] = Math.max(
      0,
      (alliance.memberCommitment[absentId] ?? 0.5) - 0.05
    )
  }
  alliance.cohesion = Math.max(
    0,
    Math.min(
      1,
      alliance.memberIds.reduce((sum, id) => sum + (alliance.memberCommitment[id] ?? 0), 0) /
        alliance.memberIds.length
    )
  )
  alliance.fractureRisk = Math.max(0, 1 - alliance.cohesion - attendees.length * 0.03)
  return alliance
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
  alliance.fractureRisk = Math.min(1, alliance.fractureRisk + 0.22)
  if (alliance.fractureRisk >= 0.72) alliance.status = 'FRACTURED'
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
}
