import {
  appendRealitySimulationTrace,
  drawRealityRandom,
  type RealityCandidateTrace,
  type RealitySimulationState,
} from '../realitySimulation'
import {
  evaluateRealityCandidate,
  getRealityActionContract,
  type RealityActionContract,
  type RealityActorSnapshot,
} from './actionContract'
import { remember } from './memory'
import { applyRealityRelationshipChange } from './relationships'
import { resolveRealityTargetResponse, type RealityResponseResolution } from './response'
import { scoreRealityAction, type RealityScoreBreakdown } from './scoring'
import { addRealityFact, learnRealityFact } from './knowledge'
import {
  applyRealityApology,
  createRealityAlliance,
  createRealityGrievance,
  holdRealityAllianceMeeting,
  signalRealityRomance,
} from './relationshipForms'
import { upsertRealityPromise, upsertRealityThread } from './commitments'
import { createRealityContestantState } from './state'
import type {
  RealityContext,
  RealityDirection,
  RealityDomainState,
  RealityInteraction,
  RealityMemory,
  RealitySocialEvent,
} from './types'

export interface RealityOpportunityCandidate {
  action: RealityActionContract
  targetIds: string[]
  subjectId?: string
  /**
   * Optional human-action repetition odds. When present, the target response
   * uses this exact acceptance chance instead of the generic relationship roll.
   */
  acceptanceChanceOverride?: number
}

export interface RealityOpportunity {
  actorId: string
  direction: RealityDirection
  context: RealityContext
  actors: Record<string, RealityActorSnapshot>
  candidates: RealityOpportunityCandidate[]
}

export interface RealityOrchestrationResult {
  domain: RealityDomainState
  simulation: RealitySimulationState
  interaction: RealityInteraction | null
  event: RealitySocialEvent | null
  selectedActionId: string | null
  response: RealityResponseResolution | null
  score?: RealityScoreBreakdown
}

function cloneDomain(domain: RealityDomainState): RealityDomainState {
  return structuredClone(domain)
}

function selectWeighted<T extends { weight: number; id: string }>(
  candidates: readonly T[],
  draw: number
): T | null {
  const stable = [...candidates]
    .filter((candidate) => candidate.weight > 0)
    .sort((left, right) => left.id.localeCompare(right.id))
  const total = stable.reduce((sum, candidate) => sum + candidate.weight, 0)
  if (total <= 0) return null
  let cursor = draw * total
  for (const candidate of stable) {
    cursor -= candidate.weight
    if (cursor < 0) return candidate
  }
  return stable.at(-1) ?? null
}

function relationshipDeltas(action: RealityActionContract, response: RealityResponseResolution) {
  if (action.purposes.includes('CONFLICT')) {
    return response.kind === 'DE_ESCALATE'
      ? action.relationshipEffects.deEscalated
      : action.relationshipEffects.escalated
  }
  return response.accepted
    ? action.relationshipEffects.accepted
    : action.relationshipEffects.rejected
}

function makeMemory(input: {
  ownerId: string
  event: RealitySocialEvent
  sourceType: RealityMemory['sourceType']
  sourceChain: string[]
}): RealityMemory {
  const publicEvent =
    input.event.visibility === 'HOUSE_PUBLIC' || input.event.visibility === 'CEREMONY_PUBLIC'
  return {
    id: `memory:${input.ownerId}:${input.event.id}`,
    ownerId: input.ownerId,
    eventId: input.event.id,
    day: input.event.day,
    phase: input.event.phase,
    participantIds: [...input.event.participantIds],
    sourceType: input.sourceType,
    sourceChain: input.sourceChain,
    confidence: input.sourceType === 'HEARSAY' ? 0.58 : 0.95,
    importance: input.event.publicEligible ? 0.82 : 0.55,
    surprise: input.event.outcome === 'COUNTERED' ? 0.65 : 0.3,
    emotionalValence: input.event.outcome === 'SUCCESS' ? 0.45 : -0.45,
    emotionalIntensity: input.event.publicEligible ? 0.75 : 0.45,
    secrecy: publicEvent ? 0 : 0.75,
    strategicRelevance: input.event.relatedPromiseIds.length > 0 ? 0.9 : 0.55,
    visibility: input.event.visibility,
    tags: [...input.event.tags],
    relatedPromiseIds: [...input.event.relatedPromiseIds],
    relatedSecretIds: [],
    recallStrength: 1,
  }
}

function applyRealityLifecycle(input: {
  domain: RealityDomainState
  interaction: RealityInteraction
  event: RealitySocialEvent
  action: RealityActionContract
  subjectId?: string
  responses: Array<{ targetId: string; response: RealityResponseResolution }>
}): void {
  const { domain, interaction, event, action, subjectId, responses } = input
  const acceptedTargets = responses
    .filter((entry) => entry.response.accepted)
    .map((entry) => entry.targetId)
  const at = { day: event.day, phase: event.phase }

  if (action.purposes.includes('COMMITMENT') && ['proposeAlliance', 'ally'].includes(action.id)) {
    for (const targetId of acceptedTargets) {
      const existing = Object.values(domain.alliances).find(
        (alliance) =>
          alliance.status !== 'DISSOLVED' &&
          alliance.memberIds.includes(interaction.actorId) &&
          alliance.memberIds.includes(targetId)
      )
      if (existing) {
        holdRealityAllianceMeeting(domain, {
          allianceId: existing.id,
          attendeeIds: [interaction.actorId, targetId],
          targetIds: subjectId ? [subjectId] : existing.currentTargetIds,
          planIds: subjectId ? [`watch:${subjectId}`] : [`maintain:${existing.id}`],
          at,
        })
      } else {
        const alliance = createRealityAlliance(domain, {
          id: `alliance:${[interaction.actorId, targetId].sort().join('~')}:${interaction.id}`,
          founderIds: [interaction.actorId],
          memberIds: [targetId],
          purpose: subjectId ? `Coordinate around ${subjectId}` : 'Mutual protection',
          at,
        })
        holdRealityAllianceMeeting(domain, {
          allianceId: alliance.id,
          attendeeIds: [interaction.actorId, targetId],
          targetIds: subjectId ? [subjectId] : [],
          planIds: subjectId ? [`watch:${subjectId}`] : [`protect:${alliance.id}`],
          at,
        })
      }
    }
  } else if (action.purposes.includes('COMMITMENT') && acceptedTargets.length > 0) {
    const promiseId = `promise:${interaction.id}`
    upsertRealityPromise(domain, {
      id: promiseId,
      kind: action.id,
      promisorId: interaction.actorId,
      beneficiaryIds: acceptedTargets,
      witnessIds: event.witnessIds,
      createdAt: at,
      deadline: action.purposes.includes('PROTECT')
        ? { day: event.day, phase: 'eviction_results' }
        : undefined,
      stakes: Math.min(1, 0.45 + (action.baseWeight ?? 0) * 0.1),
      scope: {
        actionId: action.id,
        ...(subjectId ? { targetId: subjectId } : {}),
      },
      status: 'ACTIVE',
    })
    event.relatedPromiseIds.push(promiseId)
  }

  if (action.purposes.includes('ROMANCE')) {
    for (const { targetId, response } of responses) {
      signalRealityRomance(domain, {
        actorId: interaction.actorId,
        targetId,
        at,
        acceptedByTarget: response.accepted,
        settings: { enabled: interaction.contextSnapshot.romanceEnabled !== false },
      })
    }
  }

  if (action.purposes.includes('CONFLICT')) {
    for (const { targetId, response } of responses) {
      const grievanceId = `grievance:${targetId}:${event.id}`
      if (!domain.grievances[grievanceId]) {
        createRealityGrievance(domain, {
          id: grievanceId,
          holderId: targetId,
          againstId: interaction.actorId,
          causeEventId: event.id,
          severity: response.kind === 'ESCALATE' ? 68 : 38,
          at,
        })
      }
    }
  }

  if (action.purposes.includes('REPAIR')) {
    for (const { targetId, response } of responses) {
      const grievance = Object.values(domain.grievances)
        .filter(
          (entry) =>
            entry.holderId === targetId &&
            entry.againstId === interaction.actorId &&
            entry.status !== 'RESOLVED'
        )
        .sort((left, right) => right.repairDebt - left.repairDebt)[0]
      if (grievance) {
        applyRealityApology(domain, {
          grievanceId: grievance.id,
          apologyEventId: event.id,
          sincerity: response.accepted ? 1 : 0.35,
          accountability: response.accepted ? 1 : 0.25,
          at,
        })
      }
    }
  }

  if (action.purposes.includes('INFORMATION') && subjectId) {
    const factId = `fact:claim:${event.id}`
    addRealityFact(domain, {
      id: factId,
      propositionType: action.id === 'rumor' ? 'RUMOUR_CLAIM' : 'SHARED_CLAIM',
      subjectIds: [subjectId],
      objectId: interaction.actorId,
      value: action.id,
      day: event.day,
      phase: event.phase,
      visibility: action.visibility,
      participantIds: event.participantIds,
      witnessIds: event.witnessIds,
      viewerVisible: action.visibility === 'HOUSE_PUBLIC',
      publicVisible: action.visibility === 'HOUSE_PUBLIC',
      juryVisible: false,
      sourceEventId: event.id,
    })
    event.relatedFactIds.push(factId)
    for (const targetId of event.targetIds) {
      learnRealityFact(domain, {
        ownerId: targetId,
        factId,
        confidence: action.id === 'rumor' ? 0.48 : 0.76,
        memory: {
          ...makeMemory({
            ownerId: targetId,
            event,
            sourceType: 'DIRECT',
            sourceChain: [interaction.actorId],
          }),
          confidence: action.id === 'rumor' ? 0.48 : 0.76,
          tags: [...event.tags, action.id === 'rumor' ? 'rumour' : 'claim'],
        },
      })
    }
  }

  for (const { targetId, response } of responses) {
    if (response.kind !== 'COUNTER' && response.kind !== 'QUESTION') continue
    const threadId = `thread:${interaction.id}:${targetId}`
    upsertRealityThread(domain, {
      id: threadId,
      type: response.kind === 'COUNTER' ? 'COUNTEROFFER' : 'FOLLOW_UP_QUESTION',
      participantIds: [interaction.actorId, targetId],
      observerIds: [],
      triggerEventId: event.id,
      stage: 'AWAITING_FOLLOW_UP',
      importance: 0.65,
      urgency: 0.7,
      earliest: at,
      deadline: { day: event.day, phase: 'eviction_results' },
      continuationActionIds: [action.id],
      relatedPromiseIds: [...event.relatedPromiseIds],
      relatedSecretIds: [],
      status: 'OPEN',
    })
    event.relatedThreadIds.push(threadId)
  }
}

function updateRealityExperience(
  domain: RealityDomainState,
  actorId: string,
  action: RealityActionContract,
  event: RealitySocialEvent
): void {
  const actor =
    domain.contestants[actorId] ??
    (domain.contestants[actorId] = createRealityContestantState(actorId))
  const experience = actor.actionExperience[action.id] ?? {
    attempts: 0,
    successes: 0,
    lastDay: event.day,
  }
  experience.attempts += 1
  if (event.outcome !== 'FAILURE' && event.outcome !== 'IGNORED') experience.successes += 1
  experience.lastDay = event.day
  actor.actionExperience[action.id] = experience
  actor.recentActionFamilies = [...actor.recentActionFamilies, ...action.purposes].slice(-8)
  actor.mood.valence = Math.max(
    -100,
    Math.min(100, actor.mood.valence + (event.outcome === 'SUCCESS' ? 4 : -3))
  )
  actor.confidence = Math.max(
    -100,
    Math.min(100, actor.confidence + (event.outcome === 'SUCCESS' ? 3 : -2))
  )
}

export function runRealityOpportunity(input: {
  domain: RealityDomainState
  simulation: RealitySimulationState
  opportunity: RealityOpportunity
}): RealityOrchestrationResult {
  const domain = cloneDomain(input.domain)
  let simulation = input.simulation
  const rng = simulation.rng
  if (!rng) throw new Error('Reality simulation must be initialized before orchestration')
  const actor = input.opportunity.actors[input.opportunity.actorId]
  if (!actor) throw new Error(`Unknown Reality actor ${input.opportunity.actorId}`)
  const evaluated = input.opportunity.candidates.map((candidate) => {
    const evaluation = evaluateRealityCandidate({
      action: candidate.action,
      actor,
      targetIds: candidate.targetIds,
      actors: input.opportunity.actors,
      context: input.opportunity.context,
      reality: domain,
      direction: input.opportunity.direction,
    })
    const score = evaluation.eligible
      ? scoreRealityAction({
          action: candidate.action,
          actor,
          targetIds: candidate.targetIds,
          context: input.opportunity.context,
          reality: domain,
        })
      : undefined
    return {
      ...candidate,
      id: `${candidate.action.id}:${candidate.targetIds.join(',')}`,
      evaluation,
      score,
      weight: score?.weight ?? 0,
    }
  })
  const candidateTrace: RealityCandidateTrace[] = evaluated.map((candidate) => ({
    id: candidate.id,
    eligible: candidate.evaluation.eligible,
    weight: candidate.weight,
    score: candidate.score?.total,
    blockedReasons: candidate.evaluation.blockedReasons,
  }))
  const viable = evaluated.filter((candidate) => candidate.evaluation.eligible)
  if (viable.length === 0) {
    simulation = appendRealitySimulationTrace(simulation, {
      day: input.opportunity.context.day,
      phase: input.opportunity.context.phase,
      stage: 'blocked',
      actorId: actor.id,
      reason: 'no_eligible_candidate',
      candidates: candidateTrace,
      rngCursor: rng.cursor,
    })
    return {
      domain,
      simulation,
      interaction: null,
      event: null,
      selectedActionId: null,
      response: null,
    }
  }
  const selectionDraw = drawRealityRandom(rng)
  simulation = { ...simulation, rng: selectionDraw.next }
  const selected = selectWeighted(viable, selectionDraw.value)
  if (!selected) throw new Error('Eligible Reality candidates had no selectable weight')
  simulation = appendRealitySimulationTrace(simulation, {
    day: input.opportunity.context.day,
    phase: input.opportunity.context.phase,
    stage: 'selected',
    actorId: actor.id,
    targetIds: selected.targetIds,
    actionId: selected.action.id,
    reason: 'bounded_rational_selection',
    candidates: candidateTrace,
    randomDraw: selectionDraw.value,
    rngCursor: selectionDraw.next.cursor,
  })
  const sequence = domain.nextSequence
  domain.nextSequence += 1
  const interactionId = `reality-interaction-${sequence}`
  const awaitingHuman =
    input.opportunity.direction === 'AI_TO_HUMAN' ||
    (input.opportunity.direction === 'GROUP' &&
      selected.targetIds.some((targetId) => input.opportunity.actors[targetId]?.isHuman))
  const interaction: RealityInteraction = {
    id: interactionId,
    actionId: selected.action.id,
    actorId: actor.id,
    targetIds: [...selected.targetIds],
    direction: input.opportunity.direction,
    contextSnapshot: structuredClone(input.opportunity.context),
    intentTags: [...selected.action.purposes],
    visibility: selected.action.visibility,
    witnessIds: [],
    status: awaitingHuman ? 'AWAITING_HUMAN' : 'PENDING',
    responseOptions: awaitingHuman
      ? input.opportunity.direction === 'GROUP'
        ? ['JOIN', 'OBSERVE', 'INTERVENE', 'IGNORE', 'LAY_LOW']
        : ['ACCEPT', 'QUESTION', 'COUNTER', 'REJECT', 'IGNORE', 'DEFER']
      : [],
    outcomeEventIds: [],
    createdSequence: sequence,
  }
  domain.interactions[interaction.id] = interaction
  if (awaitingHuman) {
    return {
      domain,
      simulation,
      interaction,
      event: null,
      selectedActionId: selected.action.id,
      response: null,
      score: selected.score,
    }
  }
  const responses: Array<{ targetId: string; response: RealityResponseResolution }> = []
  let responseCursor = simulation.rng?.cursor ?? selectionDraw.next.cursor
  if (input.opportunity.direction === 'SELF') {
    responses.push({
      targetId: actor.id,
      response: {
        kind: 'ACCEPT',
        utility: 1,
        reason: 'self_directed_action',
        accepted: true,
      },
    })
  } else {
    for (const targetId of selected.targetIds) {
      const responseDraw = drawRealityRandom(simulation.rng ?? selectionDraw.next)
      simulation = { ...simulation, rng: responseDraw.next }
      responseCursor = responseDraw.next.cursor
      const targetResponse = resolveRealityTargetResponse({
        action: selected.action,
        actorId: actor.id,
        targetId,
        reality: domain,
        draw: responseDraw.value,
        acceptanceChanceOverride: selected.acceptanceChanceOverride,
      })
      responses.push({ targetId, response: targetResponse })
      simulation = appendRealitySimulationTrace(simulation, {
        day: input.opportunity.context.day,
        phase: input.opportunity.context.phase,
        stage: 'response',
        actorId: targetId,
        targetIds: [actor.id],
        actionId: selected.action.id,
        reason: targetResponse.reason,
        randomDraw: responseDraw.value,
        rngCursor: responseDraw.next.cursor,
      })
    }
  }
  const acceptedCount = responses.filter((entry) => entry.response.accepted).length
  const response: RealityResponseResolution =
    responses.length === 1
      ? responses[0].response
      : acceptedCount === responses.length
        ? {
            kind: 'ACCEPT',
            utility: 1,
            reason: 'group_accepted',
            accepted: true,
          }
        : acceptedCount > 0
          ? {
              kind: 'COUNTER',
              utility: acceptedCount / Math.max(1, responses.length),
              reason: `group_partial_acceptance:${acceptedCount}/${responses.length}`,
              accepted: false,
            }
          : {
              kind: 'REJECT',
              utility: 0,
              reason: 'group_rejected',
              accepted: false,
            }
  const eventSequence = domain.nextSequence
  domain.nextSequence += 1
  const outcome =
    responses.length > 1 && acceptedCount > 0 && acceptedCount < responses.length
      ? 'PARTIAL'
      : response.kind === 'COUNTER'
        ? 'COUNTERED'
        : selected.action.purposes.includes('INFORMATION') &&
            (response.kind === 'QUESTION' || response.kind === 'LIE')
          ? 'PARTIAL'
          : response.accepted || selected.action.purposes.includes('CONFLICT')
            ? 'SUCCESS'
            : 'FAILURE'
  const event: RealitySocialEvent = {
    id: `reality-event-${eventSequence}`,
    sequence: eventSequence,
    day: input.opportunity.context.day,
    phase: input.opportunity.context.phase,
    type: 'SOCIAL_INTERACTION_RESOLVED',
    actionId: selected.action.id,
    interactionId,
    actorId: actor.id,
    targetIds: [...selected.targetIds],
    participantIds: [...new Set([actor.id, ...selected.targetIds])],
    witnessIds: [],
    visibility: selected.action.visibility,
    outcome,
    reason: response.reason,
    tags: [...selected.action.purposes, response.kind],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible:
      selected.action.visibility === 'HOUSE_PUBLIC' ||
      selected.action.visibility === 'CEREMONY_PUBLIC',
    juryEligible: selected.action.purposes.includes('COMMITMENT'),
  }
  if (input.opportunity.direction !== 'SELF') {
    for (const { targetId, response: targetResponse } of responses) {
      const deltas = relationshipDeltas(selected.action, targetResponse)
      applyRealityRelationshipChange(domain, {
        sourceId: actor.id,
        targetId,
        deltas,
        day: event.day,
        phase: event.phase,
        eventId: event.id,
        anchor:
          selected.action.purposes.includes('COMMITMENT') && targetResponse.accepted
            ? 'positive'
            : selected.action.purposes.includes('CONFLICT')
              ? 'negative'
              : undefined,
      })
      applyRealityRelationshipChange(domain, {
        sourceId: targetId,
        targetId: actor.id,
        deltas:
          targetResponse.kind === 'ESCALATE'
            ? { warmth: -8, trust: -7, resentment: 12, perceivedThreat: 5 }
            : targetResponse.accepted
              ? { warmth: 4, trust: 4, familiarity: 3 }
              : selected.acceptanceChanceOverride !== undefined &&
                  selected.acceptanceChanceOverride <= 0.02
                ? { warmth: -5, trust: -4, suspicion: 7, resentment: 3, familiarity: 2 }
                : selected.acceptanceChanceOverride !== undefined &&
                    selected.acceptanceChanceOverride <= 0.25
                  ? { warmth: -3, trust: -2, suspicion: 4, familiarity: 2 }
                  : { suspicion: 2, familiarity: 1 },
        day: event.day,
        phase: event.phase,
        eventId: event.id,
        anchor:
          targetResponse.accepted && selected.action.purposes.includes('COMMITMENT')
            ? 'positive'
            : targetResponse.kind === 'ESCALATE'
              ? 'negative'
              : undefined,
      })
    }
  }
  domain.events.push(event)
  domain.events = domain.events.slice(-500)
  applyRealityLifecycle({
    domain,
    interaction,
    event,
    action: selected.action,
    subjectId: selected.subjectId,
    responses,
  })
  interaction.status = 'RESOLVED'
  interaction.selectedResponseId = response.kind
  interaction.outcomeEventIds.push(event.id)
  for (const participantId of event.participantIds) {
    remember(
      domain,
      makeMemory({
        ownerId: participantId,
        event,
        sourceType: 'DIRECT',
        sourceChain: [actor.id],
      })
    )
  }
  for (const witnessId of event.witnessIds) {
    remember(
      domain,
      makeMemory({
        ownerId: witnessId,
        event,
        sourceType: 'WITNESSED',
        sourceChain: [actor.id],
      })
    )
  }
  domain.cooldowns[actor.id] ??= {}
  domain.cooldowns[actor.id][selected.action.id] = {
    day: event.day,
    phase: event.phase,
  }
  updateRealityExperience(domain, actor.id, selected.action, event)
  simulation = appendRealitySimulationTrace(simulation, {
    day: event.day,
    phase: event.phase,
    stage: 'outcome',
    actorId: actor.id,
    targetIds: selected.targetIds,
    actionId: selected.action.id,
    reason: event.reason,
    witnessIds: event.witnessIds,
    rngCursor: responseCursor,
  })
  return {
    domain,
    simulation,
    interaction,
    event,
    selectedActionId: selected.action.id,
    response,
    score: selected.score,
  }
}

function explicitHumanResponse(responseType: string): RealityResponseResolution {
  if (responseType === 'accept' || responseType === 'positive') {
    return {
      kind: 'ACCEPT',
      utility: 1,
      reason: 'human_accepted',
      accepted: true,
    }
  }
  if (responseType === 'neutral') {
    return {
      kind: 'QUESTION',
      utility: 0.4,
      reason: 'human_kept_options_open',
      accepted: false,
    }
  }
  if (responseType === 'dismiss' || responseType === 'ignore') {
    return {
      kind: 'WALK_AWAY',
      utility: 0,
      reason: responseType === 'ignore' ? 'human_did_not_respond' : 'human_walked_away',
      accepted: false,
    }
  }
  return {
    kind: 'REJECT',
    utility: -0.25,
    reason: 'human_rejected',
    accepted: false,
  }
}

export function resolvePendingHumanRealityInteraction(input: {
  domain: RealityDomainState
  interactionId: string
  humanId: string
  responseType: string
  day: number
  phase: string
  subjectId?: string
}): { domain: RealityDomainState; event: RealitySocialEvent | null } {
  const domain = cloneDomain(input.domain)
  const interaction = domain.interactions[input.interactionId]
  if (!interaction || interaction.status !== 'AWAITING_HUMAN') {
    return { domain, event: null }
  }
  const action = getRealityActionContract(interaction.actionId)
  if (!action) {
    interaction.status = 'INVALIDATED'
    return { domain, event: null }
  }
  const humanResponse = explicitHumanResponse(input.responseType)
  const sequence = domain.nextSequence
  domain.nextSequence += 1
  const event: RealitySocialEvent = {
    id: `reality-event-${sequence}`,
    sequence,
    day: input.day,
    phase: input.phase,
    type: 'SOCIAL_INTERACTION_RESOLVED',
    actionId: action.id,
    interactionId: interaction.id,
    actorId: interaction.actorId,
    targetIds: [...interaction.targetIds],
    participantIds: [...new Set([interaction.actorId, ...interaction.targetIds])],
    witnessIds: [...interaction.witnessIds],
    visibility: interaction.visibility,
    outcome: humanResponse.accepted
      ? 'SUCCESS'
      : humanResponse.kind === 'QUESTION'
        ? 'COUNTERED'
        : humanResponse.kind === 'WALK_AWAY'
          ? 'IGNORED'
          : 'FAILURE',
    reason: humanResponse.reason,
    tags: [...action.purposes, humanResponse.kind, 'HUMAN_RESPONSE'],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible:
      interaction.visibility === 'HOUSE_PUBLIC' || interaction.visibility === 'CEREMONY_PUBLIC',
    juryEligible: action.purposes.includes('COMMITMENT'),
  }
  const actorId = interaction.actorId
  if (actorId !== input.humanId) {
    applyRealityRelationshipChange(domain, {
      sourceId: actorId,
      targetId: input.humanId,
      deltas: relationshipDeltas(action, humanResponse),
      day: input.day,
      phase: input.phase,
      eventId: event.id,
      anchor:
        humanResponse.accepted && action.purposes.includes('COMMITMENT')
          ? 'positive'
          : action.purposes.includes('CONFLICT')
            ? 'negative'
            : undefined,
    })
    applyRealityRelationshipChange(domain, {
      sourceId: input.humanId,
      targetId: actorId,
      deltas: humanResponse.accepted
        ? { warmth: 5, trust: 5, familiarity: 3 }
        : humanResponse.kind === 'WALK_AWAY'
          ? { warmth: -2, suspicion: 2, familiarity: 1 }
          : { trust: -3, suspicion: 3, familiarity: 2 },
      day: input.day,
      phase: input.phase,
      eventId: event.id,
      anchor:
        humanResponse.accepted && action.purposes.includes('COMMITMENT') ? 'positive' : undefined,
    })
  }
  domain.events.push(event)
  domain.events = domain.events.slice(-500)
  applyRealityLifecycle({
    domain,
    interaction,
    event,
    action,
    subjectId: input.subjectId,
    responses: [{ targetId: input.humanId, response: humanResponse }],
  })
  interaction.status = 'RESOLVED'
  interaction.selectedResponseId = humanResponse.kind
  interaction.outcomeEventIds.push(event.id)
  for (const participantId of event.participantIds) {
    remember(
      domain,
      makeMemory({
        ownerId: participantId,
        event,
        sourceType: 'DIRECT',
        sourceChain: [actorId],
      })
    )
  }
  updateRealityExperience(domain, actorId, action, event)
  return { domain, event }
}
