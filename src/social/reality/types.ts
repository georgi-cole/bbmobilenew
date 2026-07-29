export type RealityActorId = string
export type RealityPhase = string
export type RealityGameMode = 'CLASSIC' | 'SURVIVAL'
export type RealityIntensity = 'NORMAL' | 'REALITY'
export type RealityAudienceMode = 'OFF' | 'PUBLIC'
export type RealityDirection = 'AI_TO_AI' | 'AI_TO_HUMAN' | 'HUMAN_TO_AI' | 'GROUP' | 'SELF'

export type RealityVisibility =
  | 'PRIVATE'
  | 'PAIR_ONLY'
  | 'GROUP_VISIBLE'
  | 'HOUSE_PUBLIC'
  | 'CEREMONY_PUBLIC'
  | 'VIEWER_ONLY'
  | 'JURY_ONLY'

export interface RealityClock {
  day: number
  phase: RealityPhase
}

export interface RealityContext extends RealityClock {
  gameMode: RealityGameMode
  socialIntensity: RealityIntensity
  audienceMode: RealityAudienceMode
  feedPerspective: 'PLAYER_LIMITED' | 'BROADCAST'
  activeActorIds: RealityActorId[]
  rolesByActor: Record<RealityActorId, string[]>
  atRiskActorIds: RealityActorId[]
  powerHolderIds: RealityActorId[]
  /** Defaults to true for migrated saves and callers that predate this setting. */
  romanceEnabled?: boolean
  blockingUiState?: string
}

export type RelationshipDimension =
  | 'warmth'
  | 'trust'
  | 'loyalty'
  | 'respect'
  | 'attraction'
  | 'intimacy'
  | 'gratitude'
  | 'resentment'
  | 'fear'
  | 'envy'
  | 'suspicion'
  | 'strategicValue'
  | 'perceivedThreat'
  | 'reliability'
  | 'familiarity'
  | 'publicCloseness'
  | 'secretCloseness'

export type RealityRelationshipLabel =
  | 'UNKNOWN'
  | 'ACQUAINTANCE'
  | 'FRIENDLY'
  | 'FRIEND'
  | 'CLOSE_FRIEND'
  | 'TRANSACTIONAL'
  | 'ALLY'
  | 'CORE_ALLY'
  | 'FAKE_ALLY'
  | 'ROMANCE'
  | 'POWER_PAIR'
  | 'ONE_SIDED_CRUSH'
  | 'EX_ROMANCE'
  | 'RIVAL'
  | 'ENEMY'
  | 'UNEASY_TRUCE'
  | 'ESTRANGED'

export interface DirectedRelationship {
  fromId: RealityActorId
  toId: RealityActorId
  warmth: number
  trust: number
  loyalty: number
  respect: number
  attraction: number
  intimacy: number
  gratitude: number
  resentment: number
  fear: number
  envy: number
  suspicion: number
  strategicValue: number
  perceivedThreat: number
  reliability: number
  familiarity: number
  publicCloseness: number
  secretCloseness: number
  trend: number
  positiveAnchorEventIds: string[]
  negativeAnchorEventIds: string[]
  unresolvedGrievanceIds: string[]
  activePromiseIds: string[]
  activeDebtIds: string[]
  perceivedLabel: RealityRelationshipLabel
  publicLabel: RealityRelationshipLabel
  labelConfidence: number
  lastMeaningfulInteraction?: RealityClock & { eventId: string }
}

export type RealityRelationshipMap = Record<
  RealityActorId,
  Record<RealityActorId, DirectedRelationship>
>

export type RealityMemorySource = 'DIRECT' | 'WITNESSED' | 'HEARSAY' | 'INFERRED' | 'OFFICIAL'

export interface RealityMemory {
  id: string
  ownerId: RealityActorId
  eventId: string
  day: number
  phase: RealityPhase
  participantIds: RealityActorId[]
  sourceType: RealityMemorySource
  sourceChain: RealityActorId[]
  confidence: number
  importance: number
  surprise: number
  emotionalValence: number
  emotionalIntensity: number
  secrecy: number
  strategicRelevance: number
  visibility: RealityVisibility
  tags: string[]
  relatedPromiseIds: string[]
  relatedSecretIds: string[]
  recallStrength: number
}

export type RealityBeliefStatus = 'ACTIVE' | 'DOUBTED' | 'DISPROVEN' | 'STALE'

export interface RealityBelief {
  id: string
  ownerId: RealityActorId
  propositionType: string
  subjectIds: RealityActorId[]
  objectId?: string
  value: string | number | boolean
  confidence: number
  supportingMemoryIds: string[]
  contradictingBeliefIds: string[]
  sourceChain: RealityActorId[]
  lastUpdatedDay: number
  status: RealityBeliefStatus
}

export interface RealityFact {
  id: string
  propositionType: string
  subjectIds: RealityActorId[]
  objectId?: string
  value: string | number | boolean
  day: number
  phase: RealityPhase
  visibility: RealityVisibility
  participantIds: RealityActorId[]
  witnessIds: RealityActorId[]
  viewerVisible: boolean
  publicVisible: boolean
  juryVisible: boolean
  sourceEventId: string
}

export type RealityPromiseStatus = 'PROPOSED' | 'ACTIVE' | 'KEPT' | 'BROKEN' | 'VOID'

export interface RealityPromise {
  id: string
  kind: string
  promisorId: RealityActorId
  beneficiaryIds: RealityActorId[]
  witnessIds: RealityActorId[]
  createdAt: RealityClock
  deadline?: RealityClock
  stakes: number
  scope: Record<string, string | number | boolean>
  status: RealityPromiseStatus
  resolvedAt?: RealityClock
  resolutionEventId?: string
}

export interface RealityDebt {
  id: string
  debtorId: RealityActorId
  creditorId: RealityActorId
  reasonEventId: string
  magnitude: number
  createdAt: RealityClock
  status: 'OPEN' | 'PARTIALLY_REPAID' | 'REPAID' | 'FORGIVEN' | 'DEFAULTED'
  repaymentEventIds: string[]
}

export interface RealitySecret {
  id: string
  kind: string
  truthFactId: string
  ownerIds: RealityActorId[]
  knowerIds: RealityActorId[]
  suspectedByIds: RealityActorId[]
  exposure: number
  createdAt: RealityClock
  status: 'SECRET' | 'LEAKED' | 'EXPOSED' | 'OBSOLETE'
}

export interface RealityGrievance {
  id: string
  holderId: RealityActorId
  againstId: RealityActorId
  causeEventId: string
  severity: number
  repairDebt: number
  createdAt: RealityClock
  status: 'OPEN' | 'ACKNOWLEDGED' | 'REPAIRING' | 'RESOLVED'
  apologyEventIds: string[]
}

export interface RealityThread {
  id: string
  type: string
  participantIds: RealityActorId[]
  observerIds: RealityActorId[]
  triggerEventId: string
  stage: string
  importance: number
  urgency: number
  earliest?: RealityClock
  deadline?: RealityClock
  continuationActionIds: string[]
  relatedPromiseIds: string[]
  relatedSecretIds: string[]
  status: 'OPEN' | 'DORMANT' | 'RESOLVED' | 'EXPIRED'
}

export type RealityAllianceStatus =
  | 'PROBATIONARY'
  | 'ACTIVE'
  | 'DORMANT'
  | 'FRACTURED'
  | 'DISSOLVED'

export interface RealityAlliance {
  id: string
  name?: string
  memberIds: RealityActorId[]
  founderIds: RealityActorId[]
  leaderIds: RealityActorId[]
  secrecy: number
  cohesion: number
  fractureRisk: number
  purpose: string
  currentTargetIds: RealityActorId[]
  fallbackTargetIds: RealityActorId[]
  sharedPromiseIds: string[]
  memberCommitment: Record<RealityActorId, number>
  memberPerceivedStatus: Record<RealityActorId, 'CORE' | 'REGULAR' | 'PERIPHERAL'>
  memberPlanBeliefs: Record<RealityActorId, string[]>
  operationalRoles: Record<RealityActorId, string[]>
  suspectedByIds: RealityActorId[]
  knownLeakEventIds: string[]
  overlapAllianceIds: string[]
  lastMeeting?: RealityClock
  nextCheckpoint?: RealityClock
  status: RealityAllianceStatus
  genuine: boolean
  infiltratorIds: RealityActorId[]
}

export interface RealityRomance {
  id: string
  participantIds: [RealityActorId, RealityActorId]
  initiatedById: RealityActorId
  signalledInterest: Record<RealityActorId, boolean>
  acceptedEscalation: Record<RealityActorId, boolean>
  genuineIntent: Record<RealityActorId, number>
  strategicIntent: Record<RealityActorId, number>
  exclusivity: Record<RealityActorId, boolean>
  public: boolean
  startedAt: RealityClock
  lastUpdatedAt: RealityClock
  anchorEventIds: string[]
  strainEventIds: string[]
  status: 'SIGNALLED' | 'MUTUAL' | 'ACTIVE' | 'STRAINED' | 'ENDED'
}

export interface RealityContestantState {
  actorId: RealityActorId
  mood: {
    valence: number
    arousal: number
    control: number
  }
  emotions: {
    joy: number
    anger: number
    fear: number
    sadness: number
    guilt: number
    shame: number
    gratitude: number
    attraction: number
    jealousy: number
    humiliation: number
  }
  stress: number
  fatigue: number
  boredom: number
  loneliness: number
  confidence: number
  socialEnergy: number
  primaryGoalId?: string
  secondaryGoalIds: string[]
  desiredInteraction?: string
  openness: number
  recentActionFamilies: string[]
  actionExperience: Record<string, { attempts: number; successes: number; lastDay: number }>
}

export interface RealityDeadline extends RealityClock {
  policy: 'AUTO_DECLINE' | 'AUTO_IGNORE' | 'AUTO_DEFER' | 'CUSTOM'
}

export type RealityInteractionStatus =
  | 'PENDING'
  | 'AWAITING_HUMAN'
  | 'RESOLVED'
  | 'EXPIRED'
  | 'INVALIDATED'

export interface RealityInteraction {
  id: string
  actionId: string
  actorId: RealityActorId
  targetIds: RealityActorId[]
  direction: RealityDirection
  contextSnapshot: RealityContext
  intentTags: string[]
  visibility: RealityVisibility
  witnessIds: RealityActorId[]
  status: RealityInteractionStatus
  deadline?: RealityDeadline
  responseOptions: string[]
  selectedResponseId?: string
  outcomeEventIds: string[]
  createdSequence: number
}

export interface RealitySocialEvent extends RealityClock {
  id: string
  sequence: number
  type: string
  actionId?: string
  interactionId?: string
  actorId?: RealityActorId
  targetIds: RealityActorId[]
  participantIds: RealityActorId[]
  witnessIds: RealityActorId[]
  visibility: RealityVisibility
  outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL' | 'COUNTERED' | 'IGNORED' | 'SYSTEM'
  reason: string
  tags: string[]
  relationshipDeltas?: Record<
    RealityActorId,
    Record<RealityActorId, Partial<Record<RelationshipDimension, number>>>
  >
  relatedFactIds: string[]
  relatedPromiseIds: string[]
  relatedThreadIds: string[]
  publicEligible: boolean
  juryEligible: boolean
}

export interface RealityVoteIntent {
  actorId: RealityActorId
  statedTargetId?: RealityActorId
  intendedTargetId?: RealityActorId
  actualTargetId?: RealityActorId
  confidence: number
  reasonEventIds: string[]
  day: number
}

export interface RealityPerception {
  authenticity: number
  entertainment: number
  likability: number
  underdog: number
  strategicRespect: number
  competitionRespect: number
  loyalty: number
  controversy: number
  fatigue: number
  sourceEventIds: string[]
}

export interface RealityJuryEvaluation {
  jurorId: RealityActorId
  finalistId: RealityActorId
  personalAffinity: number
  strategicRespect: number
  competitionRespect: number
  betrayalResentment: number
  fairness: number
  ownership: number
  goodbyeQuality: number
  finalAnswerQuality: number
  sourceEventIds: string[]
}

export interface RealityDomainState {
  version: 1
  nextSequence: number
  relationships: RealityRelationshipMap
  memoriesByOwner: Record<RealityActorId, RealityMemory[]>
  beliefsByOwner: Record<RealityActorId, Record<string, RealityBelief>>
  facts: Record<string, RealityFact>
  promises: Record<string, RealityPromise>
  debts: Record<string, RealityDebt>
  secrets: Record<string, RealitySecret>
  grievances: Record<string, RealityGrievance>
  threads: Record<string, RealityThread>
  alliances: Record<string, RealityAlliance>
  romances: Record<string, RealityRomance>
  contestants: Record<RealityActorId, RealityContestantState>
  interactions: Record<string, RealityInteraction>
  events: RealitySocialEvent[]
  cooldowns: Record<RealityActorId, Record<string, RealityClock>>
  voteIntents: Record<RealityActorId, RealityVoteIntent>
  publicPerception: Record<RealityActorId, RealityPerception>
  juryEvaluations: RealityJuryEvaluation[]
}
