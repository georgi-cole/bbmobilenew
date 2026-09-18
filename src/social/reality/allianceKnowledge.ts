import { appendRealityEvent } from './events'
import { addRealityFact, canActorKnowFact, learnRealityFact } from './knowledge'
import type {
  RealityAlliance,
  RealityAllianceStatus,
  RealityBelief,
  RealityClock,
  RealityDomainState,
  RealityFact,
  RealityMemory,
  RealityMemorySource,
} from './types'

export type RealityAllianceKnowledgeLevel =
  | 'MEMBER'
  | 'PUBLIC'
  | 'CONFIRMED'
  | 'SUSPECTED'
  | 'UNKNOWN'

export interface RealityAllianceKnowledgeView {
  allianceId: string
  level: RealityAllianceKnowledgeLevel
  confidence: number
  knownMemberIds: string[]
  fullMembershipKnown: boolean
  displayName?: string
  status?: RealityAllianceStatus
  cohesion?: number
  secrecy?: number
  purpose?: string
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function beliefMatchesAlliance(
  belief: RealityBelief,
  alliance: RealityAlliance
): boolean {
  if (!['SECRET_ALLIANCE', 'ALLIANCE_EXPOSED', 'ALLIANCE_FRACTURE'].includes(
    belief.propositionType
  )) {
    return false
  }
  if (belief.objectId) return belief.objectId === alliance.id
  return (
    belief.subjectIds.length >= 2 &&
    belief.subjectIds.every((id) => alliance.memberIds.includes(id))
  )
}

function publicFactMatchesAlliance(
  fact: RealityFact,
  alliance: RealityAlliance,
  observerId: string
): boolean {
  if (fact.propositionType !== 'ALLIANCE_EXPOSED') return false
  if (fact.objectId && fact.objectId !== alliance.id) return false
  if (!canActorKnowFact(fact, observerId)) return false
  return fact.subjectIds.every((id) => alliance.memberIds.includes(id))
}

export function getRealityAllianceKnowledgeView(
  state: RealityDomainState,
  allianceId: string,
  observerId: string
): RealityAllianceKnowledgeView {
  const alliance = state.alliances[allianceId]
  if (!alliance) {
    return {
      allianceId,
      level: 'UNKNOWN',
      confidence: 0,
      knownMemberIds: [],
      fullMembershipKnown: false,
    }
  }

  if (alliance.memberIds.includes(observerId)) {
    return {
      allianceId,
      level: 'MEMBER',
      confidence: 1,
      knownMemberIds: [...alliance.memberIds],
      fullMembershipKnown: true,
      ...(alliance.name ? { displayName: alliance.name } : {}),
      status: alliance.status,
      cohesion: alliance.cohesion,
      secrecy: alliance.secrecy,
      purpose: alliance.purpose,
    }
  }

  const publicFacts = Object.values(state.facts).filter((fact) =>
    publicFactMatchesAlliance(fact, alliance, observerId)
  )
  const beliefs = Object.values(state.beliefsByOwner[observerId] ?? {}).filter(
    (belief) =>
      belief.status !== 'DISPROVEN' &&
      belief.status !== 'STALE' &&
      beliefMatchesAlliance(belief, alliance)
  )

  const knownMemberIds = unique([
    ...publicFacts.flatMap((fact) => fact.subjectIds),
    ...beliefs.filter((belief) => belief.confidence >= 0.35).flatMap((belief) => belief.subjectIds),
  ]).filter((id) => alliance.memberIds.includes(id))
  const confidence = Math.max(
    publicFacts.length > 0 ? 1 : 0,
    ...beliefs.map((belief) => belief.confidence),
    0
  )
  const isPublic = publicFacts.length > 0
  const level: RealityAllianceKnowledgeLevel = isPublic
    ? 'PUBLIC'
    : confidence >= 0.82
      ? 'CONFIRMED'
      : confidence > 0 || alliance.suspectedByIds.includes(observerId)
        ? 'SUSPECTED'
        : 'UNKNOWN'
  const fullMembershipKnown =
    isPublic ||
    (confidence >= 0.82 &&
      knownMemberIds.length > 0 &&
      knownMemberIds.length === alliance.memberIds.length)
  const publicName = publicFacts
    .map((fact) => (typeof fact.value === 'string' ? fact.value : undefined))
    .find((value) => value && value !== 'true')

  return {
    allianceId,
    level,
    confidence,
    knownMemberIds,
    fullMembershipKnown,
    ...(publicName ? { displayName: publicName } : {}),
  }
}

function discoveryMemory(input: {
  ownerId: string
  fact: RealityFact
  sourceType: RealityMemorySource
  sourceChain: string[]
  confidence: number
  at: RealityClock
}): RealityMemory {
  return {
    id: `memory:alliance-discovery:${input.ownerId}:${input.fact.id}`,
    ownerId: input.ownerId,
    eventId: input.fact.sourceEventId,
    day: input.at.day,
    phase: input.at.phase,
    participantIds: [...input.fact.participantIds],
    sourceType: input.sourceType,
    sourceChain: unique(input.sourceChain),
    confidence: input.confidence,
    importance: 0.82,
    surprise: 0.68,
    emotionalValence: -0.08,
    emotionalIntensity: 0.52,
    secrecy: 0.88,
    strategicRelevance: 0.94,
    visibility: input.fact.visibility,
    tags: ['intel', 'secret_alliance'],
    relatedPromiseIds: [],
    relatedSecretIds: [],
    recallStrength: 0.94,
  }
}

export function recordRealityAllianceDiscovery(
  state: RealityDomainState,
  input: {
    allianceId: string
    observerId: string
    revealedMemberIds: string[]
    confidence: number
    at: RealityClock
    sourceEventId: string
    sourceId?: string
    sourceType?: RealityMemorySource
  }
): RealityBelief | null {
  const alliance = state.alliances[input.allianceId]
  if (!alliance || alliance.memberIds.includes(input.observerId)) return null

  const orderedMembers = unique([
    ...input.revealedMemberIds,
    ...alliance.leaderIds,
    ...alliance.memberIds,
  ]).filter((id) => alliance.memberIds.includes(id))
  const revealed = orderedMembers.slice(0, Math.min(alliance.memberIds.length, 3))
  if (revealed.length < 2) return null

  const confidence = Math.max(0.2, Math.min(0.96, input.confidence))
  const factId = `fact:alliance-discovery:${alliance.id}:${input.observerId}:${input.sourceEventId}`
  if (!state.facts[factId]) {
    addRealityFact(state, {
      id: factId,
      propositionType: 'SECRET_ALLIANCE',
      subjectIds: revealed,
      objectId: alliance.id,
      value: true,
      day: input.at.day,
      phase: input.at.phase,
      visibility: input.sourceId ? 'PAIR_ONLY' : 'PRIVATE',
      participantIds: unique([input.observerId, input.sourceId ?? '']),
      witnessIds: [],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: input.sourceEventId,
    })
  }

  const fact = state.facts[factId]
  return learnRealityFact(state, {
    ownerId: input.observerId,
    factId,
    confidence,
    memory: discoveryMemory({
      ownerId: input.observerId,
      fact,
      sourceType: input.sourceType ?? (input.sourceId ? 'HEARSAY' : 'INFERRED'),
      sourceChain: input.sourceId ? [input.sourceId] : [input.observerId],
      confidence,
      at: input.at,
    }),
  })
}

export function recordRealityAllianceLeakDiscovery(
  state: RealityDomainState,
  input: {
    allianceId: string
    leakerId: string
    receiverIds: string[]
    at: RealityClock
    sourceEventId: string
  }
): void {
  const alliance = state.alliances[input.allianceId]
  if (!alliance) return

  for (const receiverId of unique(input.receiverIds)) {
    if (alliance.memberIds.includes(receiverId)) continue
    const current = getRealityAllianceKnowledgeView(state, alliance.id, receiverId)
    const ordered = unique([
      ...current.knownMemberIds,
      input.leakerId,
      ...alliance.leaderIds,
      ...alliance.memberIds.filter(
        (id) => alliance.memberPerceivedStatus[id] === 'CORE'
      ),
      ...alliance.memberIds,
    ]).filter((id) => alliance.memberIds.includes(id))
    const revealCount = Math.min(
      alliance.memberIds.length,
      Math.max(2, current.knownMemberIds.length + 1)
    )
    recordRealityAllianceDiscovery(state, {
      allianceId: alliance.id,
      observerId: receiverId,
      revealedMemberIds: ordered.slice(0, revealCount),
      confidence: Math.min(0.92, 0.72 + alliance.knownLeakEventIds.length * 0.04),
      at: input.at,
      sourceEventId: input.sourceEventId,
      sourceId: input.leakerId,
      sourceType: 'HEARSAY',
    })
  }
}

export function maybeExposeRealityAlliance(
  state: RealityDomainState,
  allianceId: string,
  at: RealityClock,
  sourceEventId: string
): RealityFact | null {
  const alliance = state.alliances[allianceId]
  if (!alliance || alliance.secrecy > 0.2) return null
  const existing = Object.values(state.facts).find(
    (fact) =>
      fact.propositionType === 'ALLIANCE_EXPOSED' &&
      fact.objectId === alliance.id &&
      fact.publicVisible
  )
  if (existing) return existing

  alliance.secrecy = 0
  const factId = `fact:alliance-exposed:${alliance.id}:${at.day}`
  const event = appendRealityEvent(state, {
    ...at,
    type: 'ALLIANCE_PUBLICLY_EXPOSED',
    actorId: alliance.leaderIds[0] ?? alliance.memberIds[0],
    targetIds: [],
    participantIds: [...alliance.memberIds],
    witnessIds: [],
    visibility: 'HOUSE_PUBLIC',
    outcome: 'SYSTEM',
    reason: `alliance_exposed:${alliance.id}:${sourceEventId}`,
    tags: ['ALLIANCE', 'EXPOSURE'],
    relatedFactIds: [factId],
    relatedPromiseIds: [...alliance.sharedPromiseIds],
    relatedThreadIds: [],
    publicEligible: true,
    juryEligible: true,
  })

  const fact: RealityFact = {
    id: factId,
    propositionType: 'ALLIANCE_EXPOSED',
    subjectIds: [...alliance.memberIds],
    objectId: alliance.id,
    value: alliance.name ?? true,
    day: at.day,
    phase: at.phase,
    visibility: 'HOUSE_PUBLIC',
    participantIds: [...alliance.memberIds],
    witnessIds: [],
    viewerVisible: true,
    publicVisible: true,
    juryVisible: true,
    sourceEventId: event.id,
  }
  addRealityFact(state, fact)

  const knownActors = unique([
    ...Object.keys(state.contestants),
    ...Object.keys(state.relationships),
    ...Object.values(state.relationships).flatMap((targets) => Object.keys(targets)),
  ])
  alliance.suspectedByIds = unique([
    ...alliance.suspectedByIds,
    ...knownActors.filter((id) => !alliance.memberIds.includes(id)),
  ])
  return fact
}
