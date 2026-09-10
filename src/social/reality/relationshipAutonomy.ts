import type {
  RealityBoundaryCategory,
  RealityClock,
  RealityDomainState,
  RealityNemesisObjective,
  RealityRelationshipEvidence,
  RealityRelationshipIntent,
  RealityRelationshipIntentKind,
} from './types'
import { appendRealityEvent } from './events'

export interface RelationshipStoryBeat {
  intent: RealityRelationshipIntentKind
  storyFamily: 'friendship' | 'alliance' | 'romance' | 'confidant' | 'conflict' | 'repair'
  stage: RealityRelationshipIntent['stage']
  scenarioKey:
    | 'relationship_friendship_check_in'
    | 'relationship_alliance_follow_up'
    | 'relationship_romance_check_in'
    | 'relationship_confidant_check_in'
    | 'relationship_frustration_follow_up'
    | 'relationship_repair_follow_up'
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function intentId(ownerId: string, targetId: string, kind: RealityRelationshipIntentKind): string {
  return `relationship-intent:${ownerId}:${targetId}:${kind}`
}

function boundaryId(ownerId: string, targetId: string, category: RealityBoundaryCategory): string {
  return `relationship-boundary:${ownerId}:${targetId}:${category}`
}

function nemesisId(ownerId: string, targetId: string): string {
  return `nemesis:${ownerId}:${targetId}`
}

function clockReached(at: RealityClock, threshold: RealityClock | undefined): boolean {
  if (!threshold) return true
  return at.day > threshold.day || (at.day === threshold.day && at.phase >= threshold.phase)
}

export function hasRelationshipBoundary(
  domain: RealityDomainState,
  ownerId: string,
  targetId: string,
  category: RealityBoundaryCategory
): boolean {
  return Object.values(domain.relationshipAutonomy.boundaries).some(
    (boundary) =>
      boundary.ownerId === ownerId &&
      boundary.targetId === targetId &&
      boundary.category === category &&
      boundary.status === 'ACTIVE'
  )
}

export function createRelationshipBoundary(
  domain: RealityDomainState,
  input: {
    ownerId: string
    targetId: string
    category: RealityBoundaryCategory
    at: RealityClock
    sourceEventId: string
  }
): void {
  const id = boundaryId(input.ownerId, input.targetId, input.category)
  domain.relationshipAutonomy.boundaries[id] = {
    id,
    ownerId: input.ownerId,
    targetId: input.targetId,
    category: input.category,
    createdAt: input.at,
    sourceEventId: input.sourceEventId,
    status: 'ACTIVE',
  }
  for (const intent of Object.values(domain.relationshipAutonomy.intents)) {
    if (intent.ownerId !== input.targetId || intent.targetId !== input.ownerId) continue
    if (
      (input.category === 'NO_ROMANTIC_PURSUIT' &&
        ['EXPLORE_ROMANCE', 'MAINTAIN_ROMANCE'].includes(intent.kind)) ||
      (input.category === 'NO_ALLIANCE_PITCHES' && intent.kind === 'RECRUIT') ||
      (input.category === 'NO_PERSONAL_CONFIDING' && intent.kind === 'CONFIDE') ||
      (input.category === 'MINIMIZE_CONTACT' && intent.kind !== 'UNDERMINE')
    ) {
      intent.status = 'CLOSED'
      intent.continuationPressure = 0
    }
  }
}

export function reopenRelationshipBoundary(
  domain: RealityDomainState,
  ownerId: string,
  targetId: string,
  category: RealityBoundaryCategory
): void {
  const boundary = domain.relationshipAutonomy.boundaries[boundaryId(ownerId, targetId, category)]
  if (boundary) boundary.status = 'REOPENED'
}

function deriveIntent(
  domain: RealityDomainState,
  ownerId: string,
  targetId: string
): RealityRelationshipIntentKind | null {
  const edge = domain.relationships[ownerId]?.[targetId]
  if (!edge) return null
  if (edge.resentment >= 34 || edge.suspicion >= 45) return 'CONFRONT'
  if (
    edge.attraction >= 28 &&
    !hasRelationshipBoundary(domain, targetId, ownerId, 'NO_ROMANTIC_PURSUIT')
  ) {
    return 'EXPLORE_ROMANCE'
  }
  if (edge.perceivedLabel === 'ALLY' || edge.perceivedLabel === 'CORE_ALLY')
    return 'MAINTAIN_COMMITMENT'
  if (edge.strategicValue >= 28 && edge.trust >= 5) return 'RECRUIT'
  if (edge.trust >= 28 && edge.warmth >= 25) return 'CONFIDE'
  if (edge.warmth >= 12 || edge.familiarity >= 8) return 'DEEPEN_BOND'
  return 'CONNECT'
}

function storyBeatFor(intent: RealityRelationshipIntent): RelationshipStoryBeat | null {
  switch (intent.kind) {
    case 'CONNECT':
    case 'DEEPEN_BOND':
    case 'MAINTAIN_COMMITMENT':
      return {
        intent: intent.kind,
        storyFamily: intent.kind === 'MAINTAIN_COMMITMENT' ? 'alliance' : 'friendship',
        stage: intent.stage,
        scenarioKey:
          intent.kind === 'MAINTAIN_COMMITMENT'
            ? 'relationship_alliance_follow_up'
            : 'relationship_friendship_check_in',
      }
    case 'RECRUIT':
      return {
        intent: intent.kind,
        storyFamily: 'alliance',
        stage: intent.stage,
        scenarioKey: 'relationship_alliance_follow_up',
      }
    case 'EXPLORE_ROMANCE':
    case 'MAINTAIN_ROMANCE':
      return {
        intent: intent.kind,
        storyFamily: 'romance',
        stage: intent.stage,
        scenarioKey: 'relationship_romance_check_in',
      }
    case 'CONFIDE':
      return {
        intent: intent.kind,
        storyFamily: 'confidant',
        stage: intent.stage,
        scenarioKey: 'relationship_confidant_check_in',
      }
    case 'CONFRONT':
    case 'SEEK_REASSURANCE':
    case 'UNDERMINE':
      return {
        intent: intent.kind,
        storyFamily: 'conflict',
        stage: intent.stage,
        scenarioKey: 'relationship_frustration_follow_up',
      }
    case 'REPAIR':
      return {
        intent: intent.kind,
        storyFamily: 'repair',
        stage: intent.stage,
        scenarioKey: 'relationship_repair_follow_up',
      }
    default:
      return null
  }
}

/** Returns a legal, non-spammy story beat without mutating the domain. */
export function planRelationshipStoryBeat(
  domain: RealityDomainState,
  input: { ownerId: string; targetId: string; at: RealityClock; romanceEnabled?: boolean }
): RelationshipStoryBeat | null {
  if (hasRelationshipBoundary(domain, input.targetId, input.ownerId, 'MINIMIZE_CONTACT'))
    return null
  if (getActiveRealityNemesis(domain, input.ownerId, input.targetId)) {
    return {
      intent: 'UNDERMINE',
      storyFamily: 'conflict',
      stage: 'STRAINED',
      scenarioKey: 'relationship_frustration_follow_up',
    }
  }
  const active = Object.values(domain.relationshipAutonomy.intents)
    .filter(
      (intent) =>
        intent.ownerId === input.ownerId &&
        intent.targetId === input.targetId &&
        intent.status === 'ACTIVE' &&
        clockReached(input.at, intent.nextEligibleAt)
    )
    .sort(
      (left, right) =>
        right.continuationPressure - left.continuationPressure || left.id.localeCompare(right.id)
    )[0]
  const kind = active?.kind ?? deriveIntent(domain, input.ownerId, input.targetId)
  if (!kind) return null
  if (
    input.romanceEnabled === false &&
    (kind === 'EXPLORE_ROMANCE' || kind === 'MAINTAIN_ROMANCE')
  ) {
    return null
  }
  const candidate = active ?? {
    kind,
    stage: 'SPARK' as const,
  }
  if (
    kind === 'RECRUIT' &&
    hasRelationshipBoundary(domain, input.targetId, input.ownerId, 'NO_ALLIANCE_PITCHES')
  )
    return null
  if (
    kind === 'CONFIDE' &&
    hasRelationshipBoundary(domain, input.targetId, input.ownerId, 'NO_PERSONAL_CONFIDING')
  )
    return null
  return storyBeatFor(candidate as RealityRelationshipIntent)
}

export function getActiveRealityNemesis(
  domain: RealityDomainState,
  ownerId: string,
  targetId?: string
): RealityNemesisObjective | null {
  return (
    Object.values(domain.relationshipAutonomy.nemeses).find(
      (nemesis) =>
        nemesis.ownerId === ownerId &&
        nemesis.status === 'ACTIVE' &&
        (targetId === undefined || nemesis.targetId === targetId)
    ) ?? null
  )
}

/** Starts one specialised, persistent anti-player objective after a real
 * escalated conflict. A target may have only one active Nemesis at a time. */
export function createRealityNemesisObjective(
  domain: RealityDomainState,
  input: {
    ownerId: string
    targetId: string
    sourceEventId: string
    at: RealityClock
    reason?: RealityNemesisObjective['reason']
  }
): RealityNemesisObjective {
  const existingForTarget = Object.values(domain.relationshipAutonomy.nemeses).find(
    (nemesis) => nemesis.targetId === input.targetId && nemesis.status === 'ACTIVE'
  )
  if (existingForTarget) return existingForTarget
  const id = nemesisId(input.ownerId, input.targetId)
  const objective: RealityNemesisObjective = {
    id,
    ownerId: input.ownerId,
    targetId: input.targetId,
    sourceEventId: input.sourceEventId,
    reason: input.reason ?? 'PERSONAL_FRICTION',
    createdAt: input.at,
    status: 'ACTIVE',
  }
  domain.relationshipAutonomy.nemeses[id] = objective
  const intent = advanceRelationshipAutonomy(domain, {
    ownerId: input.ownerId,
    targetId: input.targetId,
    kind: 'UNDERMINE',
    at: input.at,
    eventId: input.sourceEventId,
    accepted: true,
  })
  intent.importance = 1
  intent.continuationPressure = 1
  intent.stage = 'STRAINED'
  intent.nextEligibleAt = input.at
  const threadId = `nemesis-thread:${input.ownerId}:${input.targetId}`
  domain.threads[threadId] = {
    id: threadId,
    type: 'PLAYER_NEMESIS',
    participantIds: [input.ownerId, input.targetId],
    observerIds: [],
    triggerEventId: input.sourceEventId,
    stage: 'ESCALATING',
    importance: 1,
    urgency: 1,
    earliest: input.at,
    continuationActionIds: ['UNDERMINE', 'ELIMINATE_TARGET'],
    relatedPromiseIds: [],
    relatedSecretIds: [],
    status: 'OPEN',
  }
  return objective
}

function deterministicUnit(seed: string): number {
  let hash = 2166136261
  for (const character of seed) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 0xffffffff
}

/** Selects at most one Nemesis for a player over the whole season. The choice
 * is deterministic for a seed but grows out of the actual social world. */
export function startAutonomousNemesisIfReady(
  domain: RealityDomainState,
  input: {
    targetId: string
    candidateIds: readonly string[]
    seed: number
    at: RealityClock
    humanHasPower?: boolean
  }
): RealityNemesisObjective | null {
  if (
    input.at.day < 2 ||
    Object.values(domain.relationshipAutonomy.nemeses).some(
      (nemesis) => nemesis.targetId === input.targetId
    )
  ) {
    return null
  }
  const humanPerception = domain.publicPerception[input.targetId]
  const humanReach =
    Object.values(domain.alliances).filter(
      (alliance) => alliance.status !== 'DISSOLVED' && alliance.memberIds.includes(input.targetId)
    ).length *
      9 +
    Object.values(domain.romances).filter(
      (romance) => romance.status === 'ACTIVE' && romance.participantIds.includes(input.targetId)
    ).length *
      8
  const candidates = [...new Set(input.candidateIds)]
    .filter((candidateId) => candidateId !== input.targetId)
    .map((candidateId) => {
      const edge = domain.relationships[candidateId]?.[input.targetId]
      const attraction = edge?.attraction ?? 0
      const personalFriction =
        (edge?.resentment ?? 0) * 0.52 +
        (edge?.suspicion ?? 0) * 0.3 +
        (edge?.perceivedThreat ?? 0) * 0.34
      const performance =
        (humanPerception?.competitionRespect ?? 0) * 0.32 +
        (humanPerception?.strategicRespect ?? 0) * 0.28 +
        (input.humanHasPower ? 12 : 0)
      const jealousy = attraction >= 20 ? 12 + (attraction - 20) * 0.25 : 0
      const volatility =
        deterministicUnit(
          `${input.seed}:nemesis:${input.targetId}:${candidateId}:${input.at.day}`
        ) * 30
      const score = 14 + personalFriction + performance + humanReach + jealousy + volatility
      const reason: RealityNemesisObjective['reason'] =
        jealousy >= 12
          ? 'JEALOUSY'
          : personalFriction >= Math.max(performance, humanReach)
            ? 'PERSONAL_FRICTION'
            : performance >= humanReach
              ? 'COMPETITION_THREAT'
              : humanReach >= 12
                ? 'SOCIAL_REACH'
                : 'VOLATILE_READ'
      return { candidateId, score, reason }
    })
    .sort(
      (left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId)
    )
  const selected = candidates[0]
  if (!selected || selected.score < 46) return null
  const event = appendRealityEvent(domain, {
    day: input.at.day,
    phase: input.at.phase,
    type: 'NEMESIS_OBJECTIVE_FORMED',
    actorId: selected.candidateId,
    targetIds: [input.targetId],
    participantIds: [selected.candidateId, input.targetId],
    witnessIds: [],
    visibility: 'PRIVATE',
    outcome: 'SYSTEM',
    reason: selected.reason.toLowerCase(),
    tags: ['NEMESIS', selected.reason],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: false,
  })
  return createRealityNemesisObjective(domain, {
    ownerId: selected.candidateId,
    targetId: input.targetId,
    sourceEventId: event.id,
    at: input.at,
    reason: selected.reason,
  })
}

/** The reconciliation is intentionally exact: the Nemesis target must be the
 * voluntary Safety holder and must save the Nemesis, never themselves. */
export function reconcileNemesisWithVoluntarySafety(
  domain: RealityDomainState,
  input: { actorId?: string; savedIds: readonly string[]; eventId: string; at: RealityClock }
): RealityNemesisObjective[] {
  if (!input.actorId) return []
  const reconciled: RealityNemesisObjective[] = []
  for (const nemesis of Object.values(domain.relationshipAutonomy.nemeses)) {
    if (
      nemesis.status !== 'ACTIVE' ||
      nemesis.targetId !== input.actorId ||
      nemesis.ownerId === input.actorId ||
      !input.savedIds.includes(nemesis.ownerId)
    ) {
      continue
    }
    nemesis.status = 'RECONCILED'
    nemesis.reconciledAt = input.at
    nemesis.reconciliationEventId = input.eventId
    const intent =
      domain.relationshipAutonomy.intents[intentId(nemesis.ownerId, nemesis.targetId, 'UNDERMINE')]
    if (intent) {
      intent.status = 'RESOLVED'
      intent.continuationPressure = 0
      intent.lastAdvancedAt = input.at
      intent.supportingEventIds = [...new Set([...intent.supportingEventIds, input.eventId])]
    }
    const thread = domain.threads[`nemesis-thread:${nemesis.ownerId}:${nemesis.targetId}`]
    if (thread) {
      thread.status = 'RESOLVED'
      thread.stage = 'RECONCILED_BY_SAFETY'
      thread.urgency = 0
    }
    recordRelationshipEvidence(domain, {
      id: `relationship-evidence:${input.eventId}:${nemesis.ownerId}:${nemesis.targetId}:safety`,
      ownerId: nemesis.ownerId,
      targetId: nemesis.targetId,
      family: 'PROTECTION',
      eventId: input.eventId,
      day: input.at.day,
      reciprocal: true,
      significance: 1,
    })
    reconciled.push(nemesis)
  }
  return reconciled
}

function threadIdFor(type: string, ids: readonly string[]): string {
  return `${type.toLowerCase()}:${[...ids].sort().join('~')}`
}

function upsertFalloutThread(
  domain: RealityDomainState,
  input: {
    type: 'JEALOUSY' | 'SCANDAL'
    idParts: string[]
    participantIds: string[]
    observerIds: string[]
    eventId: string
    at: RealityClock
    stage: string
    importance: number
    relatedSecretIds?: string[]
  }
): void {
  const id = threadIdFor(input.type, input.idParts)
  const existing = domain.threads[id]
  domain.threads[id] = {
    id,
    type: input.type,
    participantIds: [...new Set(input.participantIds)],
    observerIds: [...new Set(input.observerIds)],
    triggerEventId: existing?.triggerEventId ?? input.eventId,
    stage: input.stage,
    importance: Math.max(existing?.importance ?? 0, input.importance),
    urgency: Math.min(1, Math.max(existing?.urgency ?? 0, input.importance)),
    earliest: existing?.earliest ?? input.at,
    continuationActionIds: [
      ...new Set([...(existing?.continuationActionIds ?? []), 'CONFRONT', 'SEEK_REASSURANCE']),
    ],
    relatedPromiseIds: existing?.relatedPromiseIds ?? [],
    relatedSecretIds: [
      ...new Set([...(existing?.relatedSecretIds ?? []), ...(input.relatedSecretIds ?? [])]),
    ],
    status: 'OPEN',
  }
}

/** Creates jealousy only when the third party has a real prior bond and is
 * entitled to know about the new closeness through a witness or public event. */
export function recordGroundedJealousy(
  domain: RealityDomainState,
  input: {
    actorId: string
    targetId: string
    eventId: string
    at: RealityClock
    witnessIds: readonly string[]
    publicEligible: boolean
  }
): void {
  const visibleTo = new Set(input.witnessIds)
  const pair = new Set([input.actorId, input.targetId])
  for (const romance of Object.values(domain.romances)) {
    if (romance.status !== 'ACTIVE') continue
    const jealousId = romance.participantIds.find((id) => !pair.has(id))
    const bondedId = romance.participantIds.find((id) => pair.has(id))
    if (!jealousId || !bondedId || (!input.publicEligible && !visibleTo.has(jealousId))) continue
    upsertFalloutThread(domain, {
      type: 'JEALOUSY',
      idParts: [jealousId, input.actorId, input.targetId],
      participantIds: [jealousId, input.actorId, input.targetId],
      observerIds: input.publicEligible ? [...visibleTo] : [jealousId],
      eventId: input.eventId,
      at: input.at,
      stage: 'ROMANTIC_INSECURITY',
      importance: 0.72,
    })
  }
  for (const alliance of Object.values(domain.alliances)) {
    if (alliance.status === 'DISSOLVED' || !alliance.memberIds.includes(input.actorId)) continue
    for (const jealousId of alliance.memberIds) {
      if (pair.has(jealousId) || (!input.publicEligible && !visibleTo.has(jealousId))) continue
      upsertFalloutThread(domain, {
        type: 'JEALOUSY',
        idParts: [jealousId, input.actorId, input.targetId],
        participantIds: [jealousId, input.actorId, input.targetId],
        observerIds: input.publicEligible ? [...visibleTo] : [jealousId],
        eventId: input.eventId,
        at: input.at,
        stage: 'LOYALTY_INSECURITY',
        importance: 0.58,
      })
    }
  }
}

/** A scandal is a consequence of an exposed causal secret, never free-floating
 * flavour text. Its observers are only people entitled to the exposed fact. */
export function recordGroundedScandalFromSecret(
  domain: RealityDomainState,
  secretId: string
): void {
  const secret = domain.secrets[secretId]
  const fact = secret ? domain.facts[secret.truthFactId] : undefined
  if (!secret || !fact || (secret.status !== 'LEAKED' && secret.status !== 'EXPOSED')) return
  const visibleIds = fact.publicVisible
    ? [...new Set([...fact.participantIds, ...fact.witnessIds, ...secret.knowerIds])]
    : [...new Set([...fact.participantIds, ...fact.witnessIds, ...secret.knowerIds])]
  upsertFalloutThread(domain, {
    type: 'SCANDAL',
    idParts: [secret.id],
    participantIds: [...new Set([...secret.ownerIds, ...fact.subjectIds])],
    observerIds: visibleIds,
    eventId: fact.sourceEventId,
    at: fact ? { day: fact.day, phase: fact.phase } : secret.createdAt,
    stage: secret.status === 'EXPOSED' ? 'PUBLIC_EXPOSURE' : 'LEAKED',
    importance: secret.status === 'EXPOSED' ? 0.9 : 0.7,
    relatedSecretIds: [secret.id],
  })
}

export function advanceRelationshipAutonomy(
  domain: RealityDomainState,
  input: {
    ownerId: string
    targetId: string
    kind: RealityRelationshipIntentKind
    at: RealityClock
    eventId: string
    accepted: boolean
    deferred?: boolean
  }
): RealityRelationshipIntent {
  const id = intentId(input.ownerId, input.targetId, input.kind)
  const existing = domain.relationshipAutonomy.intents[id]
  const threadId =
    existing?.threadId ?? `relationship-thread:${input.ownerId}:${input.targetId}:${input.kind}`
  const pressure = clamp(
    (existing?.continuationPressure ?? 0.35) +
      (input.accepted ? 0.2 : input.deferred ? -0.03 : -0.12)
  )
  const stage = input.accepted
    ? existing?.stage === 'SPARK'
      ? 'DEVELOPING'
      : existing?.stage === 'DEVELOPING'
        ? 'ESTABLISHED'
        : (existing?.stage ?? 'DEVELOPING')
    : pressure < 0.14
      ? 'COOLING'
      : (existing?.stage ?? 'SPARK')
  const intent: RealityRelationshipIntent = {
    id,
    ownerId: input.ownerId,
    targetId: input.targetId,
    kind: input.kind,
    status: pressure < 0.08 ? 'COOLING' : 'ACTIVE',
    threadId,
    importance: clamp((existing?.importance ?? 0.35) + (input.accepted ? 0.1 : 0)),
    continuationPressure: pressure,
    stage,
    createdAt: existing?.createdAt ?? input.at,
    lastAdvancedAt: input.at,
    nextEligibleAt: { day: input.at.day + (input.accepted ? 2 : 1), phase: input.at.phase },
    supportingEventIds: [
      ...new Set([...(existing?.supportingEventIds ?? []), input.eventId]),
    ].slice(-12),
    lastBeatId: input.eventId,
  }
  domain.relationshipAutonomy.intents[id] = intent
  const thread = domain.threads[threadId]
  domain.threads[threadId] = {
    id: threadId,
    type: `RELATIONSHIP_${input.kind}`,
    participantIds: [input.ownerId, input.targetId],
    observerIds: [],
    triggerEventId: thread?.triggerEventId ?? input.eventId,
    stage: intent.stage,
    importance: intent.importance,
    urgency: intent.continuationPressure,
    earliest: thread?.earliest ?? input.at,
    continuationActionIds: thread?.continuationActionIds ?? [],
    relatedPromiseIds: thread?.relatedPromiseIds ?? [],
    relatedSecretIds: thread?.relatedSecretIds ?? [],
    status: intent.status === 'COOLING' ? 'DORMANT' : 'OPEN',
  }
  return intent
}

export function recordRelationshipEvidence(
  domain: RealityDomainState,
  evidence: RealityRelationshipEvidence
): void {
  if (domain.relationshipAutonomy.evidence[evidence.id]) return
  domain.relationshipAutonomy.evidence[evidence.id] = evidence
}

export function reserveRelationshipBeat(domain: RealityDomainState, beatId: string): boolean {
  if (domain.relationshipAutonomy.reservedBeatIds.includes(beatId)) return false
  domain.relationshipAutonomy.reservedBeatIds = [
    ...domain.relationshipAutonomy.reservedBeatIds,
    beatId,
  ].slice(-240)
  return true
}

export function getRelationshipStoryLabel(intent: RealityRelationshipIntentKind): string {
  return {
    CONNECT: 'Getting to know each other',
    DEEPEN_BOND: 'Growing closer',
    RECRUIT: 'Building a working relationship',
    MAINTAIN_COMMITMENT: 'Keeping a commitment',
    CONFIDE: 'Building trust',
    EXPLORE_ROMANCE: 'Something more may be developing',
    MAINTAIN_ROMANCE: 'A relationship under pressure',
    SEEK_REASSURANCE: 'Looking for reassurance',
    REPAIR: 'Trying to repair things',
    DISTANCE: 'Creating distance',
    CONFRONT: 'Unresolved tension',
    UNDERMINE: 'A strategic conflict',
  }[intent]
}

const INTENT_KINDS = new Set<RealityRelationshipIntentKind>([
  'CONNECT',
  'DEEPEN_BOND',
  'RECRUIT',
  'MAINTAIN_COMMITMENT',
  'CONFIDE',
  'EXPLORE_ROMANCE',
  'MAINTAIN_ROMANCE',
  'SEEK_REASSURANCE',
  'REPAIR',
  'DISTANCE',
  'CONFRONT',
  'UNDERMINE',
])

function evidenceFamily(
  kind: RealityRelationshipIntentKind
): RealityRelationshipEvidence['family'] {
  if (kind === 'RECRUIT' || kind === 'MAINTAIN_COMMITMENT') return 'STRATEGY'
  if (kind === 'EXPLORE_ROMANCE' || kind === 'MAINTAIN_ROMANCE') return 'ROMANCE'
  if (kind === 'CONFRONT' || kind === 'UNDERMINE') return 'CONFLICT'
  if (kind === 'REPAIR') return 'REPAIR'
  if (kind === 'CONFIDE') return 'TRUST'
  return 'BOND'
}

/** Applies an inbox answer to its persistent storyline. Kept here so the
 * inbox, an AI response, and a future presentation can all use one lifecycle. */
export function resolveRelationshipStoryResponse(
  domain: RealityDomainState,
  input: {
    ownerId: string
    targetId: string
    intent: unknown
    responseType: string
    eventId: string
    at: RealityClock
  }
): boolean {
  if (
    typeof input.intent !== 'string' ||
    !INTENT_KINDS.has(input.intent as RealityRelationshipIntentKind)
  ) {
    return false
  }
  const kind = input.intent as RealityRelationshipIntentKind
  const accepted = input.responseType === 'accept' || input.responseType === 'positive'
  const deferred = input.responseType === 'neutral'
  advanceRelationshipAutonomy(domain, {
    ownerId: input.ownerId,
    targetId: input.targetId,
    kind,
    at: input.at,
    eventId: input.eventId,
    accepted,
    deferred,
  })
  recordRelationshipEvidence(domain, {
    id: `relationship-evidence:${input.eventId}:${input.ownerId}:${input.targetId}`,
    ownerId: input.ownerId,
    targetId: input.targetId,
    family: evidenceFamily(kind),
    eventId: input.eventId,
    day: input.at.day,
    reciprocal: accepted,
    significance: accepted ? 0.6 : deferred ? 0.3 : 0.45,
  })
  if (input.responseType === 'decline' || input.responseType === 'negative') {
    const category =
      kind === 'EXPLORE_ROMANCE' || kind === 'MAINTAIN_ROMANCE'
        ? 'NO_ROMANTIC_PURSUIT'
        : kind === 'RECRUIT'
          ? 'NO_ALLIANCE_PITCHES'
          : kind === 'CONFIDE'
            ? 'NO_PERSONAL_CONFIDING'
            : kind === 'CONFRONT'
              ? 'NO_CONFLICT_DISCUSSION'
              : null
    if (category) {
      createRelationshipBoundary(domain, {
        ownerId: input.targetId,
        targetId: input.ownerId,
        category,
        at: input.at,
        sourceEventId: input.eventId,
      })
    }
  }
  return true
}
