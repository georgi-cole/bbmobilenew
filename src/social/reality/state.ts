import type { RelationshipsMap } from '../types'
import type {
  DirectedRelationship,
  RealityContestantState,
  RealityDomainState,
  RealityPerception,
  RealityRelationshipLabel,
  RealityRelationshipMap,
} from './types'

const clamp = (value: number, minimum = -100, maximum = 100) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0))

export function createRealityContestantState(actorId: string): RealityContestantState {
  return {
    actorId,
    mood: { valence: 0, arousal: 0, control: 0 },
    emotions: {
      joy: 0,
      anger: 0,
      fear: 0,
      sadness: 0,
      guilt: 0,
      shame: 0,
      gratitude: 0,
      attraction: 0,
      jealousy: 0,
      humiliation: 0,
    },
    stress: 0,
    fatigue: 0,
    boredom: 0,
    loneliness: 0,
    confidence: 0,
    socialEnergy: 0,
    secondaryGoalIds: [],
    openness: 0.5,
    recentActionFamilies: [],
    actionExperience: {},
  }
}

export function createRealityPerception(): RealityPerception {
  return {
    authenticity: 0,
    entertainment: 0,
    likability: 0,
    underdog: 0,
    strategicRespect: 0,
    competitionRespect: 0,
    loyalty: 0,
    controversy: 0,
    fatigue: 0,
    sourceEventIds: [],
  }
}

export function createDirectedRelationship(
  fromId: string,
  toId: string,
  affinity = 0,
  tags: readonly string[] = []
): DirectedRelationship {
  const safeAffinity = clamp(affinity)
  const isAlliance = tags.includes('alliance')
  const isRomance = tags.includes('romance')
  const isBromance = tags.includes('bromance')
  const isBetrayal = tags.includes('betrayal')
  const isRivalry = tags.includes('rivalry')
  const anchorIds = tags.map((tag) => `legacy:${fromId}:${toId}:${tag}`)
  return {
    fromId,
    toId,
    warmth: safeAffinity,
    trust: clamp(safeAffinity * 0.7 + (isAlliance ? 15 : 0) - (isBetrayal ? 45 : 0)),
    loyalty: clamp(safeAffinity * 0.35 + (isAlliance ? 35 : 0) + (isBromance ? 15 : 0)),
    respect: clamp(safeAffinity * 0.35),
    attraction: clamp(isRomance ? Math.max(35, safeAffinity) : 0),
    intimacy: clamp(safeAffinity * 0.25 + (isRomance ? 35 : 0) + (isBromance ? 25 : 0)),
    gratitude: 0,
    resentment: clamp(
      Math.max(0, -safeAffinity * 0.45) + (isBetrayal ? 55 : 0) + (isRivalry ? 25 : 0),
      0,
      100
    ),
    fear: clamp(Math.max(0, -safeAffinity * 0.2), 0, 100),
    envy: 0,
    suspicion: clamp(Math.max(0, -safeAffinity * 0.4) + (isBetrayal ? 35 : 0), 0, 100),
    strategicValue: clamp(Math.max(0, safeAffinity * 0.35), 0, 100),
    perceivedThreat: clamp(Math.max(0, -safeAffinity * 0.35), 0, 100),
    reliability: clamp(safeAffinity * 0.55 + (isAlliance ? 20 : 0)),
    familiarity: clamp(Math.abs(safeAffinity) + tags.length * 8, 0, 100),
    publicCloseness: clamp(isAlliance || isRomance || isBromance ? 25 : safeAffinity * 0.15),
    secretCloseness: clamp(isAlliance || isRomance || isBromance ? 40 : safeAffinity * 0.2),
    trend: 0,
    positiveAnchorEventIds: isBetrayal || isRivalry ? [] : anchorIds,
    negativeAnchorEventIds: isBetrayal || isRivalry ? anchorIds : [],
    unresolvedGrievanceIds: [],
    activePromiseIds: [],
    activeDebtIds: [],
    perceivedLabel: legacyLabel(safeAffinity, tags),
    publicLabel: tags.includes('romance') ? 'ROMANCE' : 'ACQUAINTANCE',
    labelConfidence: tags.length > 0 ? 0.7 : Math.min(0.55, Math.abs(safeAffinity) / 100),
  }
}

function legacyLabel(affinity: number, tags: readonly string[]): RealityRelationshipLabel {
  if (tags.includes('betrayal')) return 'ENEMY'
  if (tags.includes('rivalry')) return 'RIVAL'
  if (tags.includes('romance')) return 'ROMANCE'
  if (tags.includes('alliance')) return affinity >= 60 ? 'CORE_ALLY' : 'ALLY'
  if (tags.includes('bromance')) return 'CLOSE_FRIEND'
  if (affinity <= -55) return 'ENEMY'
  if (affinity <= -25) return 'RIVAL'
  if (affinity >= 60) return 'CLOSE_FRIEND'
  if (affinity >= 35) return 'FRIEND'
  if (affinity >= 12) return 'FRIENDLY'
  return affinity === 0 ? 'UNKNOWN' : 'ACQUAINTANCE'
}

export function projectLegacyRelationships(
  relationships: RelationshipsMap
): RealityRelationshipMap {
  return Object.fromEntries(
    Object.entries(relationships).map(([fromId, targets]) => [
      fromId,
      Object.fromEntries(
        Object.entries(targets).map(([toId, relationship]) => [
          toId,
          createDirectedRelationship(fromId, toId, relationship.affinity, relationship.tags),
        ])
      ),
    ])
  )
}

export function createInitialRealityDomainState(
  legacyRelationships: RelationshipsMap = {}
): RealityDomainState {
  return {
    version: 1,
    nextSequence: 0,
    relationships: projectLegacyRelationships(legacyRelationships),
    memoriesByOwner: {},
    beliefsByOwner: {},
    facts: {},
    promises: {},
    debts: {},
    secrets: {},
    grievances: {},
    threads: {},
    alliances: {},
    romances: {},
    contestants: {},
    interactions: {},
    events: [],
    cooldowns: {},
    voteIntents: {},
    publicPerception: {},
    juryEvaluations: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function normalizeRealityDomainState(
  value: unknown,
  legacyRelationships: RelationshipsMap = {}
): RealityDomainState {
  const base = createInitialRealityDomainState(legacyRelationships)
  if (!isRecord(value) || value.version !== 1) return base
  const input = value as unknown as Partial<RealityDomainState>
  const inputRelationships =
    input.relationships && isRecord(input.relationships) ? input.relationships : {}
  const relationships = { ...base.relationships }
  for (const [sourceId, targets] of Object.entries(inputRelationships)) {
    relationships[sourceId] = {
      ...(relationships[sourceId] ?? {}),
      ...targets,
    }
  }
  return {
    ...base,
    ...input,
    version: 1,
    nextSequence: Math.max(0, Math.round(Number(input.nextSequence) || 0)),
    relationships,
    memoriesByOwner:
      input.memoriesByOwner && isRecord(input.memoriesByOwner) ? input.memoriesByOwner : {},
    beliefsByOwner:
      input.beliefsByOwner && isRecord(input.beliefsByOwner) ? input.beliefsByOwner : {},
    facts: input.facts && isRecord(input.facts) ? input.facts : {},
    promises: input.promises && isRecord(input.promises) ? input.promises : {},
    debts: input.debts && isRecord(input.debts) ? input.debts : {},
    secrets: input.secrets && isRecord(input.secrets) ? input.secrets : {},
    grievances: input.grievances && isRecord(input.grievances) ? input.grievances : {},
    threads: input.threads && isRecord(input.threads) ? input.threads : {},
    alliances: input.alliances && isRecord(input.alliances) ? input.alliances : {},
    romances: input.romances && isRecord(input.romances) ? input.romances : {},
    contestants: input.contestants && isRecord(input.contestants) ? input.contestants : {},
    interactions: input.interactions && isRecord(input.interactions) ? input.interactions : {},
    events: Array.isArray(input.events) ? input.events.slice(-500) : [],
    cooldowns: input.cooldowns && isRecord(input.cooldowns) ? input.cooldowns : {},
    voteIntents: input.voteIntents && isRecord(input.voteIntents) ? input.voteIntents : {},
    publicPerception:
      input.publicPerception && isRecord(input.publicPerception) ? input.publicPerception : {},
    juryEvaluations: Array.isArray(input.juryEvaluations) ? input.juryEvaluations.slice(-500) : [],
  }
}

export function ensureRealityActors(state: RealityDomainState, actorIds: readonly string[]): void {
  for (const actorId of actorIds) {
    if (!state.contestants[actorId]) {
      state.contestants[actorId] = createRealityContestantState(actorId)
    }
    if (!state.publicPerception[actorId]) {
      state.publicPerception[actorId] = createRealityPerception()
    }
  }
}
