import { addRealityFact, learnRealityFact } from './knowledge'
import { resolveRealityPromise } from './commitments'
import { appendRealityEvent } from './events'
import { remember } from './memory'
import { applyRealityRelationshipChange, getRealityRelationship } from './relationships'
import { createRealityContestantState, createRealityPerception } from './state'
import type {
  RealityClock,
  RealityDomainState,
  RealityJuryEvaluation,
  RealityPerception,
  RealitySocialEvent,
  RealityVoteIntent,
} from './types'

const clamp = (value: number, minimum = -100, maximum = 100) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0))

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export type RealityCeremonyKind =
  | 'POWER_WON'
  | 'NOMINATIONS_LOCKED'
  | 'SAFETY_USED'
  | 'SAFETY_DECLINED'
  | 'VOTE_CAST'
  | 'VOTES_REVEALED'
  | 'EVICTION'
  | 'JURY_VOTE'

export interface RealityCeremonyInput extends RealityClock {
  kind: RealityCeremonyKind
  actorId?: string
  targetIds: string[]
  participantIds?: string[]
  witnessIds: string[]
  reason?: string
  tags?: string[]
  publicEligible: boolean
}

function contestant(state: RealityDomainState, actorId: string) {
  state.contestants[actorId] ??= createRealityContestantState(actorId)
  return state.contestants[actorId]
}

function perception(state: RealityDomainState, actorId: string): RealityPerception {
  state.publicPerception[actorId] ??= createRealityPerception()
  return state.publicPerception[actorId]
}

function updatePerception(
  state: RealityDomainState,
  actorId: string,
  eventId: string,
  deltas: Partial<Omit<RealityPerception, 'sourceEventIds'>>
): void {
  const current = perception(state, actorId)
  for (const [key, value] of Object.entries(deltas) as Array<
    [keyof Omit<RealityPerception, 'sourceEventIds'>, number]
  >) {
    current[key] = clamp(current[key] + value)
  }
  current.sourceEventIds = [...new Set([...current.sourceEventIds, eventId])].slice(-80)
}

function projectPublicCeremony(
  state: RealityDomainState,
  event: RealitySocialEvent,
  kind: RealityCeremonyKind
): void {
  if (!event.publicEligible) return
  const actorId = event.actorId
  if (actorId) {
    if (kind === 'POWER_WON') {
      updatePerception(state, actorId, event.id, {
        competitionRespect: 8,
        strategicRespect: 2,
        entertainment: 2,
      })
    } else if (kind === 'SAFETY_USED') {
      updatePerception(state, actorId, event.id, {
        strategicRespect: 5,
        loyalty: event.tags.includes('protected_ally') ? 8 : 2,
        entertainment: 3,
      })
    } else if (kind === 'SAFETY_DECLINED') {
      updatePerception(state, actorId, event.id, {
        strategicRespect: 1,
        loyalty: -3,
        controversy: 3,
      })
    } else if (kind === 'NOMINATIONS_LOCKED') {
      updatePerception(state, actorId, event.id, {
        strategicRespect: 4,
        controversy: event.tags.includes('betrayal') ? 10 : 2,
        loyalty: event.tags.includes('betrayal') ? -8 : 0,
      })
    } else if (kind === 'JURY_VOTE') {
      updatePerception(state, actorId, event.id, { authenticity: 2 })
    }
  }
  if (kind === 'EVICTION') {
    for (const targetId of event.targetIds) {
      updatePerception(state, targetId, event.id, {
        underdog: 8,
        likability: 2,
      })
    }
  }
}

function rememberOfficialCeremony(
  state: RealityDomainState,
  event: RealitySocialEvent,
  factId: string
): void {
  const owners = [...new Set([...event.participantIds, ...event.witnessIds])]
  for (const ownerId of owners) {
    const memory = {
      id: `memory:${ownerId}:${event.id}`,
      ownerId,
      eventId: event.id,
      day: event.day,
      phase: event.phase,
      participantIds: [...event.participantIds],
      sourceType: 'OFFICIAL' as const,
      sourceChain: [],
      confidence: 1,
      importance: event.type.includes('EVICTION') ? 1 : 0.82,
      surprise: event.tags.includes('blindside') ? 0.9 : 0.35,
      emotionalValence: event.outcome === 'FAILURE' ? -0.55 : 0,
      emotionalIntensity: event.type.includes('EVICTION') ? 0.9 : 0.68,
      secrecy: 0,
      strategicRelevance: 1,
      visibility: event.visibility,
      tags: [...event.tags, 'official', 'ceremony'],
      relatedPromiseIds: [...event.relatedPromiseIds],
      relatedSecretIds: [],
      recallStrength: 1,
    }
    remember(state, memory)
    learnRealityFact(state, { ownerId, factId, memory, confidence: 1 })
  }
}

function applyCeremonyAftermath(
  state: RealityDomainState,
  event: RealitySocialEvent,
  kind: RealityCeremonyKind
): void {
  const actorId = event.actorId
  if (kind === 'POWER_WON' && actorId) {
    const winner = contestant(state, actorId)
    winner.confidence = clamp(winner.confidence + 14)
    winner.emotions.joy = clamp(winner.emotions.joy + 18, 0, 100)
    winner.primaryGoalId = 'USE_POWER_WITHOUT_CREATING_UNNECESSARY_ENEMIES'
  }

  if (kind === 'NOMINATIONS_LOCKED' && actorId) {
    contestant(state, actorId).primaryGoalId = 'MANAGE_NOMINATION_FALLOUT'
    for (const targetId of event.targetIds) {
      const nominee = contestant(state, targetId)
      nominee.stress = clamp(nominee.stress + 24, 0, 100)
      nominee.emotions.fear = clamp(nominee.emotions.fear + 20, 0, 100)
      nominee.primaryGoalId = 'SURVIVE_THE_VOTE'
      applyRealityRelationshipChange(state, {
        sourceId: targetId,
        targetId: actorId,
        day: event.day,
        phase: event.phase,
        eventId: event.id,
        anchor: event.tags.includes('betrayal') ? 'negative' : undefined,
        deltas: {
          warmth: -8,
          trust: event.tags.includes('betrayal') ? -25 : -10,
          resentment: event.tags.includes('betrayal') ? 28 : 12,
          suspicion: 10,
          perceivedThreat: 12,
        },
      })
    }
  }

  if (kind === 'SAFETY_USED' && actorId) {
    contestant(state, actorId).primaryGoalId = 'MANAGE_SAFETY_FALLOUT'
    for (const savedId of event.targetIds) {
      const saved = contestant(state, savedId)
      saved.stress = clamp(saved.stress - 22, 0, 100)
      saved.emotions.gratitude = clamp(saved.emotions.gratitude + 25, 0, 100)
      saved.primaryGoalId = 'REPAY_SAFETY_DEBT'
      applyRealityRelationshipChange(state, {
        sourceId: savedId,
        targetId: actorId,
        day: event.day,
        phase: event.phase,
        eventId: event.id,
        anchor: 'positive',
        deltas: {
          warmth: 10,
          trust: 13,
          loyalty: 12,
          gratitude: 30,
          reliability: 8,
        },
      })
    }
  }

  if (kind === 'SAFETY_DECLINED' && actorId) {
    contestant(state, actorId).primaryGoalId = 'DEFEND_SAFETY_DECISION'
    for (const targetId of event.targetIds) {
      contestant(state, targetId).primaryGoalId = 'FIND_LAST_MINUTE_VOTES'
      applyRealityRelationshipChange(state, {
        sourceId: targetId,
        targetId: actorId,
        day: event.day,
        phase: event.phase,
        eventId: event.id,
        deltas: { warmth: -4, trust: -7, resentment: 8 },
      })
    }
  }

  if (kind === 'VOTES_REVEALED') {
    for (const actor of Object.values(state.contestants)) {
      actor.primaryGoalId = event.targetIds.includes(actor.actorId)
        ? 'PROCESS_VOTE_OUTCOME'
        : 'REASSESS_HOUSE_AFTER_VOTE'
    }
  }

  if (kind === 'EVICTION') {
    for (const targetId of event.targetIds) {
      const evictee = contestant(state, targetId)
      evictee.stress = clamp(evictee.stress + 28, 0, 100)
      evictee.emotions.sadness = clamp(evictee.emotions.sadness + 35, 0, 100)
      evictee.primaryGoalId = 'EVALUATE_JURY_VOTE'
    }
    for (const witnessId of event.witnessIds) {
      if (event.targetIds.includes(witnessId)) continue
      contestant(state, witnessId).primaryGoalId = 'REPLAN_AFTER_EVICTION'
    }
  }
}

export function recordRealityCeremonyOutcome(
  state: RealityDomainState,
  input: RealityCeremonyInput
): RealitySocialEvent {
  const expectedType = `CEREMONY_${input.kind}`
  const targetKey = [...new Set(input.targetIds)].sort().join('|')
  const duplicate = [...state.events]
    .reverse()
    .find(
      (event) =>
        event.day === input.day &&
        event.type === expectedType &&
        event.actorId === input.actorId &&
        [...event.targetIds].sort().join('|') === targetKey
    )
  if (duplicate) return duplicate
  const sequence = state.nextSequence
  const eventId = `reality-event-${sequence}`
  const factId = `fact:ceremony:${sequence}`
  const participants = [
    ...(input.participantIds ?? []),
    ...(input.actorId ? [input.actorId] : []),
    ...input.targetIds,
  ]
  const event = appendRealityEvent(state, {
    day: input.day,
    phase: input.phase,
    type: expectedType,
    actorId: input.actorId,
    targetIds: input.targetIds,
    participantIds: participants,
    witnessIds: input.witnessIds,
    visibility: 'CEREMONY_PUBLIC',
    outcome: 'SYSTEM',
    reason: input.reason ?? input.kind.toLowerCase().replaceAll('_', ' '),
    tags: [...(input.tags ?? []), 'ceremony', input.kind.toLowerCase()],
    relatedFactIds: [factId],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: input.publicEligible,
    juryEligible: true,
  })
  addRealityFact(state, {
    id: factId,
    propositionType: `CEREMONY_${input.kind}`,
    subjectIds: input.actorId ? [input.actorId, ...input.targetIds] : input.targetIds,
    value: input.reason ?? true,
    day: input.day,
    phase: input.phase,
    visibility: 'CEREMONY_PUBLIC',
    participantIds: event.participantIds,
    witnessIds: event.witnessIds,
    viewerVisible: true,
    publicVisible: input.publicEligible,
    juryVisible: true,
    sourceEventId: eventId,
  })
  rememberOfficialCeremony(state, event, factId)
  applyCeremonyAftermath(state, event, input.kind)
  projectPublicCeremony(state, event, input.kind)
  return event
}

function voteIntent(state: RealityDomainState, actorId: string, day: number): RealityVoteIntent {
  state.voteIntents[actorId] ??= {
    actorId,
    confidence: 0,
    reasonEventIds: [],
    day,
  }
  return state.voteIntents[actorId]
}

export function setRealityStatedVote(
  state: RealityDomainState,
  actorId: string,
  targetId: string,
  day: number,
  reasonEventId?: string
): RealityVoteIntent {
  const intent = voteIntent(state, actorId, day)
  intent.statedTargetId = targetId
  intent.day = day
  if (reasonEventId) intent.reasonEventIds = [...new Set([...intent.reasonEventIds, reasonEventId])]
  return intent
}

export function setRealityIntendedVote(
  state: RealityDomainState,
  actorId: string,
  targetId: string,
  day: number,
  confidence: number,
  reasonEventId?: string
): RealityVoteIntent {
  const intent = voteIntent(state, actorId, day)
  intent.intendedTargetId = targetId
  intent.confidence = clamp01(confidence)
  intent.day = day
  if (reasonEventId) intent.reasonEventIds = [...new Set([...intent.reasonEventIds, reasonEventId])]
  return intent
}

export function finalizeRealityVote(
  state: RealityDomainState,
  actorId: string,
  targetId: string,
  at: RealityClock,
  eventId: string
): RealityVoteIntent {
  const intent = voteIntent(state, actorId, at.day)
  intent.actualTargetId = targetId
  intent.day = at.day
  intent.reasonEventIds = [...new Set([...intent.reasonEventIds, eventId])]
  for (const promise of Object.values(state.promises)) {
    if (
      promise.promisorId !== actorId ||
      (promise.status !== 'ACTIVE' && promise.status !== 'PROPOSED') ||
      !promise.kind.toLowerCase().includes('vote')
    ) {
      continue
    }
    const promisedTarget =
      typeof promise.scope.targetId === 'string'
        ? promise.scope.targetId
        : typeof promise.scope.voteTargetId === 'string'
          ? promise.scope.voteTargetId
          : undefined
    if (!promisedTarget) continue
    resolveRealityPromise(
      state,
      promise.id,
      promisedTarget === targetId ? 'KEPT' : 'BROKEN',
      at,
      eventId
    )
  }
  return intent
}

export function scoreRealityNominationCandidate(
  state: RealityDomainState,
  actorId: string,
  targetId: string
): number {
  const edge = getRealityRelationship(state, actorId, targetId)
  const reverse = getRealityRelationship(state, targetId, actorId)
  const allianceProtection = Object.values(state.alliances).some(
    (alliance) =>
      alliance.status === 'ACTIVE' &&
      alliance.memberIds.includes(actorId) &&
      alliance.memberIds.includes(targetId)
  )
  const promiseProtection = Object.values(state.promises).some(
    (promise) =>
      promise.promisorId === actorId &&
      promise.beneficiaryIds.includes(targetId) &&
      promise.status === 'ACTIVE'
  )
  const beliefThreat = Object.values(state.beliefsByOwner[actorId] ?? {})
    .filter(
      (belief) =>
        belief.subjectIds.includes(targetId) &&
        belief.status === 'ACTIVE' &&
        /threat|target|power/i.test(belief.propositionType)
    )
    .reduce((sum, belief) => sum + belief.confidence * 12, 0)
  return (
    edge.perceivedThreat * 0.55 +
    edge.suspicion * 0.25 +
    edge.resentment * 0.2 -
    edge.trust * 0.28 -
    edge.loyalty * 0.35 -
    reverse.reliability * 0.08 +
    beliefThreat -
    (allianceProtection ? 32 : 0) -
    (promiseProtection ? 28 : 0)
  )
}

export function scoreRealitySafetyDecision(
  state: RealityDomainState,
  holderId: string,
  nomineeId: string
): number {
  const edge = getRealityRelationship(state, holderId, nomineeId)
  const reciprocal = getRealityRelationship(state, nomineeId, holderId)
  const alliance = Object.values(state.alliances).some(
    (entry) =>
      entry.status === 'ACTIVE' &&
      entry.memberIds.includes(holderId) &&
      entry.memberIds.includes(nomineeId)
  )
  const debt = Object.values(state.debts).some(
    (entry) =>
      entry.status === 'OPEN' && entry.debtorId === holderId && entry.creditorId === nomineeId
  )
  return (
    edge.loyalty * 0.42 +
    edge.trust * 0.25 +
    edge.gratitude * 0.18 +
    reciprocal.strategicValue * 0.12 -
    edge.perceivedThreat * 0.28 -
    edge.resentment * 0.2 +
    (alliance ? 24 : 0) +
    (debt ? 18 : 0)
  )
}

export function computeRealityJuryEvaluation(
  state: RealityDomainState,
  jurorId: string,
  finalistId: string,
  persist = true
): RealityJuryEvaluation {
  const relationship = getRealityRelationship(state, jurorId, finalistId)
  const sourceEvents = state.events.filter(
    (event) =>
      event.juryEligible && (event.actorId === finalistId || event.targetIds.includes(finalistId))
  )
  const betrayalEvents = sourceEvents.filter(
    (event) =>
      event.actorId === finalistId &&
      event.targetIds.includes(jurorId) &&
      event.tags.some((tag) => /betray|blindside|lie|broken/i.test(tag))
  )
  const ownedMoves = sourceEvents.filter(
    (event) =>
      event.actorId === finalistId && event.outcome !== 'FAILURE' && event.outcome !== 'IGNORED'
  )
  const competitionWins = sourceEvents.filter(
    (event) => event.actorId === finalistId && event.type === 'CEREMONY_POWER_WON'
  )
  const grievance = Object.values(state.grievances)
    .filter(
      (entry) =>
        entry.holderId === jurorId && entry.againstId === finalistId && entry.status !== 'RESOLVED'
    )
    .reduce((sum, entry) => sum + entry.severity, 0)
  const evaluation: RealityJuryEvaluation = {
    jurorId,
    finalistId,
    personalAffinity: clamp(
      relationship.warmth * 0.45 +
        relationship.trust * 0.35 +
        relationship.respect * 0.2 -
        relationship.resentment * 0.45
    ),
    strategicRespect: clamp(
      relationship.respect * 0.35 + relationship.perceivedThreat * 0.25 + ownedMoves.length * 5
    ),
    competitionRespect: clamp(competitionWins.length * 16),
    betrayalResentment: clamp(
      relationship.resentment * 0.6 + betrayalEvents.length * 16 + grievance * 0.35,
      0,
      100
    ),
    fairness: clamp(
      relationship.reliability * 0.5 + relationship.trust * 0.35 - betrayalEvents.length * 12
    ),
    ownership: clamp(ownedMoves.length * 7),
    goodbyeQuality: 0,
    finalAnswerQuality: 0,
    sourceEventIds: sourceEvents.map((event) => event.id).slice(-80),
  }
  const existingIndex = state.juryEvaluations.findIndex(
    (entry) => entry.jurorId === jurorId && entry.finalistId === finalistId
  )
  if (existingIndex >= 0) {
    const previous = state.juryEvaluations[existingIndex]
    evaluation.goodbyeQuality = previous.goodbyeQuality
    evaluation.finalAnswerQuality = previous.finalAnswerQuality
    if (persist) state.juryEvaluations[existingIndex] = evaluation
  } else if (persist) {
    state.juryEvaluations.push(evaluation)
  }
  return evaluation
}

export function realityJuryEvaluationScore(evaluation: RealityJuryEvaluation): number {
  return (
    evaluation.personalAffinity * 0.24 +
    evaluation.strategicRespect * 0.24 +
    evaluation.competitionRespect * 0.12 +
    evaluation.fairness * 0.12 +
    evaluation.ownership * 0.14 +
    evaluation.goodbyeQuality * 0.06 +
    evaluation.finalAnswerQuality * 0.08 -
    evaluation.betrayalResentment * 0.22
  )
}

export function generateRealityJuryQuestion(evaluation: RealityJuryEvaluation): string {
  const weaknesses = [
    {
      value: evaluation.betrayalResentment,
      text: 'Which betrayal do you regret most, and why should the jury forgive it?',
    },
    {
      value: 100 - evaluation.ownership,
      text: 'Name the move that was truly yours and explain how it changed the season.',
    },
    {
      value: 100 - evaluation.fairness,
      text: 'Why should we reward your game when some of us felt disposable to you?',
    },
    {
      value: 100 - evaluation.strategicRespect,
      text: 'What was your strategy beyond surviving one round at a time?',
    },
  ]
  return weaknesses.sort((left, right) => right.value - left.value)[0].text
}
