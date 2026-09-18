import type {
  RealityBelief,
  RealityDomainState,
  RealityFact,
  RealityMemory,
  RealityVisibility,
} from './types'

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

const ALLIANCE_KNOWLEDGE_PROPOSITIONS = new Set([
  'SECRET_ALLIANCE',
  'ALLIANCE_EXPOSED',
  'ALLIANCE_FRACTURE',
])

export function resolveRealityAllianceIdForFact(
  state: RealityDomainState,
  fact: Pick<RealityFact, 'propositionType' | 'subjectIds' | 'objectId'>
): string | undefined {
  if (!ALLIANCE_KNOWLEDGE_PROPOSITIONS.has(fact.propositionType)) return undefined
  if (fact.objectId && state.alliances[fact.objectId]) return fact.objectId
  const subjects = unique(fact.subjectIds)
  if (subjects.length < 2) return undefined
  return Object.values(state.alliances)
    .filter((alliance) => subjects.every((id) => alliance.memberIds.includes(id)))
    .sort((left, right) => {
      const liveRank = (status: typeof left.status) =>
        status === 'ACTIVE' ? 4 : status === 'PROBATIONARY' ? 3 : status === 'FRACTURED' ? 2 : 1
      return (
        liveRank(right.status) - liveRank(left.status) ||
        left.memberIds.length - right.memberIds.length ||
        right.cohesion - left.cohesion ||
        left.id.localeCompare(right.id)
      )
    })[0]?.id
}

export function canActorKnowFact(fact: RealityFact, actorId: string): boolean {
  if (fact.participantIds.includes(actorId) || fact.witnessIds.includes(actorId)) return true
  return fact.visibility === 'HOUSE_PUBLIC' || fact.visibility === 'CEREMONY_PUBLIC'
}

export function canHumanKnowFact(
  fact: RealityFact,
  humanId: string,
  feedPerspective: 'PLAYER_LIMITED' | 'BROADCAST'
): boolean {
  return canActorKnowFact(fact, humanId) || (feedPerspective === 'BROADCAST' && fact.viewerVisible)
}

export function canViewerKnowFact(fact: RealityFact): boolean {
  return (
    fact.viewerVisible ||
    fact.publicVisible ||
    fact.visibility === 'HOUSE_PUBLIC' ||
    fact.visibility === 'CEREMONY_PUBLIC' ||
    fact.visibility === 'VIEWER_ONLY'
  )
}

export function canPublicKnowFact(fact: RealityFact): boolean {
  return (
    fact.publicVisible ||
    fact.visibility === 'HOUSE_PUBLIC' ||
    fact.visibility === 'CEREMONY_PUBLIC'
  )
}

export function canJuryKnowFact(fact: RealityFact): boolean {
  return (
    fact.juryVisible || fact.visibility === 'JURY_ONLY' || fact.visibility === 'CEREMONY_PUBLIC'
  )
}

export function addRealityFact(state: RealityDomainState, fact: RealityFact): void {
  state.facts[fact.id] = {
    ...fact,
    subjectIds: unique(fact.subjectIds),
    participantIds: unique(fact.participantIds),
    witnessIds: unique(fact.witnessIds),
  }
}

export function learnRealityFact(
  state: RealityDomainState,
  input: {
    ownerId: string
    factId: string
    memory: RealityMemory
    confidence?: number
    status?: RealityBelief['status']
  }
): RealityBelief | null {
  const fact = state.facts[input.factId]
  if (!fact) return null
  const allianceId = resolveRealityAllianceIdForFact(state, fact)
  if (allianceId && !fact.objectId) fact.objectId = allianceId
  const isDirectRoute =
    input.memory.sourceType === 'DIRECT' ||
    input.memory.sourceType === 'WITNESSED' ||
    input.memory.sourceType === 'OFFICIAL'
  if (isDirectRoute && !canActorKnowFact(fact, input.ownerId)) return null
  if (input.memory.sourceType === 'HEARSAY' && input.memory.sourceChain.length === 0) {
    return null
  }
  const beliefId = `belief:${input.ownerId}:${fact.id}`
  const confidence = Math.max(0, Math.min(1, input.confidence ?? input.memory.confidence))
  state.memoriesByOwner[input.ownerId] ??= []
  if (!state.memoriesByOwner[input.ownerId].some((memory) => memory.id === input.memory.id)) {
    state.memoriesByOwner[input.ownerId].push(input.memory)
    state.memoriesByOwner[input.ownerId] = state.memoriesByOwner[input.ownerId]
      .sort((left, right) => left.day - right.day || left.id.localeCompare(right.id))
      .slice(-160)
  }
  state.beliefsByOwner[input.ownerId] ??= {}
  const existing = state.beliefsByOwner[input.ownerId][beliefId]
  const belief: RealityBelief = {
    id: beliefId,
    ownerId: input.ownerId,
    propositionType: fact.propositionType,
    subjectIds: [...fact.subjectIds],
    objectId: fact.objectId,
    value: fact.value,
    confidence: existing ? Math.min(1, existing.confidence * 0.55 + confidence * 0.45) : confidence,
    supportingMemoryIds: unique([...(existing?.supportingMemoryIds ?? []), input.memory.id]).slice(
      -20
    ),
    contradictingBeliefIds: existing?.contradictingBeliefIds ?? [],
    sourceChain: unique(input.memory.sourceChain),
    lastUpdatedDay: input.memory.day,
    status: input.status ?? (confidence < 0.35 ? 'DOUBTED' : 'ACTIVE'),
  }
  state.beliefsByOwner[input.ownerId][beliefId] = belief
  if (allianceId) {
    const alliance = state.alliances[allianceId]
    if (alliance && !alliance.memberIds.includes(input.ownerId)) {
      alliance.suspectedByIds = [...new Set([...alliance.suspectedByIds, input.ownerId])]
    }
  }
  return belief
}

export function actorHasBelief(
  state: RealityDomainState,
  actorId: string,
  predicate: (belief: RealityBelief) => boolean,
  minimumConfidence = 0
): boolean {
  return Object.values(state.beliefsByOwner[actorId] ?? {}).some(
    (belief) =>
      belief.status !== 'DISPROVEN' &&
      belief.status !== 'STALE' &&
      belief.confidence >= minimumConfidence &&
      predicate(belief)
  )
}

export function isVisibilityEntitled(
  visibility: RealityVisibility,
  actorId: string,
  participantIds: readonly string[],
  witnessIds: readonly string[]
): boolean {
  if (participantIds.includes(actorId) || witnessIds.includes(actorId)) return true
  return visibility === 'HOUSE_PUBLIC' || visibility === 'CEREMONY_PUBLIC'
}
