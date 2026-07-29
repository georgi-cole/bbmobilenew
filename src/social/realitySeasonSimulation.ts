import {
  REALITY_ACTION_CONTRACTS,
  createInitialRealityDomainState,
  ensureRealityActors,
  recordRealityCeremonyOutcome,
  runRealityOpportunity,
  type RealityActorSnapshot,
  type RealityContext,
  type RealityDomainState,
} from './reality'
import {
  createInitialRealitySimulationState,
  type RealitySimulationState,
} from './realitySimulation'

export interface RealitySeasonSimulationOptions {
  days?: number
  castSize?: number
}

export interface RealitySeasonSimulationReport {
  seed: number
  daysSimulated: number
  resolvedInteractions: number
  ceremonies: number
  evictions: number
  invalidSelections: number
  humanAutonomyViolations: number
  deadlockDays: number
  memoryOverflows: number
  eventOverflow: number
  maxConsecutiveAction: number
  relationshipLabels: Record<string, number>
  replayDigest: string
  domain: RealityDomainState
  simulation: RealitySimulationState
}

export interface RealitySeasonBatchReport {
  seasons: number
  replayDivergences: number
  invalidSelections: number
  humanAutonomyViolations: number
  deadlockDays: number
  memoryOverflows: number
  eventOverflows: number
  maximumConsecutiveAction: number
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function activeSnapshots(
  actorIds: readonly string[],
  humanId: string,
  inactiveIds: ReadonlySet<string>
): Record<string, RealityActorSnapshot> {
  return Object.fromEntries(
    actorIds.map((actorId) => [
      actorId,
      {
        id: actorId,
        isHuman: actorId === humanId,
        active: !inactiveIds.has(actorId),
        roles: [inactiveIds.has(actorId) ? 'evicted' : 'active'],
        resources: { energy: 100, influence: 10_000, info: 10_000 },
      },
    ])
  )
}

function maxConsecutive(values: readonly string[]): number {
  let maximum = 0
  let current = 0
  let previous = ''
  for (const value of values) {
    current = value === previous ? current + 1 : 1
    previous = value
    maximum = Math.max(maximum, current)
  }
  return maximum
}

function relationshipLabelCounts(state: RealityDomainState): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const targets of Object.values(state.relationships)) {
    for (const edge of Object.values(targets)) {
      counts[edge.perceivedLabel] = (counts[edge.perceivedLabel] ?? 0) + 1
    }
  }
  return counts
}

export function simulateRealitySeason(
  seed: number,
  options: RealitySeasonSimulationOptions = {}
): RealitySeasonSimulationReport {
  const days = Math.max(4, Math.floor(options.days ?? 12))
  const castSize = Math.max(6, Math.floor(options.castSize ?? 10))
  const humanId = 'human'
  const actorIds = [
    humanId,
    ...Array.from({ length: castSize - 1 }, (_, index) => `ai-${index + 1}`),
  ]
  const inactiveIds = new Set<string>()
  let domain = createInitialRealityDomainState()
  ensureRealityActors(domain, actorIds)
  let simulation = createInitialRealitySimulationState(seed)
  let resolvedInteractions = 0
  let ceremonies = 0
  let evictions = 0
  let invalidSelections = 0
  let humanAutonomyViolations = 0
  let deadlockDays = 0
  const selectedActions: string[] = []

  const candidateActions = REALITY_ACTION_CONTRACTS.filter(
    (action) =>
      action.allowedDirections.includes('AI_TO_AI') &&
      action.dramaTargetMode !== 'multi' &&
      action.dramaTargetMode !== 'none'
  )

  for (let day = 1; day <= days; day += 1) {
    const activeIds = actorIds.filter((actorId) => !inactiveIds.has(actorId))
    const activeAI = activeIds.filter((actorId) => actorId !== humanId)
    if (activeAI.length === 0) break
    const eventCountAtStart = domain.events.length
    const powerHolderId = activeAI[(seed + day * 3) % activeAI.length]
    const eligibleNominees = activeIds.filter(
      (actorId) => actorId !== powerHolderId && actorId !== humanId
    )
    const nominees = [
      eligibleNominees[(seed + day) % eligibleNominees.length],
      eligibleNominees[(seed + day + 3) % eligibleNominees.length],
    ].filter((actorId, index, values) => actorId && values.indexOf(actorId) === index)

    recordRealityCeremonyOutcome(domain, {
      kind: 'POWER_WON',
      day,
      phase: 'loh_results',
      actorId: powerHolderId,
      targetIds: [],
      witnessIds: activeIds,
      publicEligible: true,
    })
    ceremonies += 1
    recordRealityCeremonyOutcome(domain, {
      kind: 'NOMINATIONS_LOCKED',
      day,
      phase: 'nomination_results',
      actorId: powerHolderId,
      targetIds: nominees,
      witnessIds: activeIds,
      publicEligible: true,
    })
    ceremonies += 1

    for (const phase of ['social_1', 'social_2'] as const) {
      for (let actorIndex = 0; actorIndex < activeAI.length; actorIndex += 1) {
        const actorId = activeAI[actorIndex]
        const targetPool = activeAI.filter((targetId) => targetId !== actorId)
        if (targetPool.length === 0) continue
        const targetId = targetPool[(seed + day + actorIndex) % targetPool.length]
        const actors = activeSnapshots(actorIds, humanId, inactiveIds)
        const context: RealityContext = {
          day,
          phase,
          gameMode: 'CLASSIC',
          socialIntensity: 'REALITY',
          audienceMode: 'PUBLIC',
          feedPerspective: 'BROADCAST',
          activeActorIds: activeIds,
          rolesByActor: Object.fromEntries(
            activeIds.map((id) => [id, id === powerHolderId ? ['active', 'loh'] : ['active']])
          ),
          atRiskActorIds: nominees,
          powerHolderIds: [powerHolderId],
        }
        const result = runRealityOpportunity({
          domain,
          simulation,
          opportunity: {
            actorId,
            direction: 'AI_TO_AI',
            context,
            actors,
            candidates: candidateActions.map((action) => ({ action, targetIds: [targetId] })),
          },
        })
        domain = result.domain
        simulation = result.simulation
        if (result.interaction?.actorId === humanId) humanAutonomyViolations += 1
        if (result.selectedActionId) {
          selectedActions.push(result.selectedActionId)
          const selectedTrace = [...simulation.trace]
            .reverse()
            .find((trace) => trace.stage === 'selected')
          const selectedCandidate = selectedTrace?.candidates?.find((candidate) =>
            candidate.id.startsWith(`${result.selectedActionId}:`)
          )
          if (!selectedCandidate?.eligible) invalidSelections += 1
        }
        if (result.event) resolvedInteractions += 1
      }
    }

    if (day % 2 === 0 && activeIds.length > 3 && nominees[0]) {
      recordRealityCeremonyOutcome(domain, {
        kind: 'VOTES_REVEALED',
        day,
        phase: 'eviction_results',
        targetIds: nominees,
        witnessIds: activeIds,
        publicEligible: true,
      })
      ceremonies += 1
      recordRealityCeremonyOutcome(domain, {
        kind: 'EVICTION',
        day,
        phase: 'eviction_results',
        targetIds: [nominees[0]],
        witnessIds: activeIds,
        publicEligible: true,
      })
      ceremonies += 1
      inactiveIds.add(nominees[0])
      evictions += 1
    }

    if (
      domain.events.slice(eventCountAtStart).every((event) => event.type.startsWith('CEREMONY_'))
    ) {
      deadlockDays += 1
    }
  }

  const memoryOverflows = Object.values(domain.memoriesByOwner).filter(
    (memories) => memories.length > 160
  ).length
  const digestPayload = {
    events: domain.events.map((event) => [
      event.day,
      event.type,
      event.actorId,
      event.targetIds,
      event.actionId,
      event.outcome,
    ]),
    selectedActions,
    rng: simulation.rng,
    labels: relationshipLabelCounts(domain),
  }

  return {
    seed,
    daysSimulated: days,
    resolvedInteractions,
    ceremonies,
    evictions,
    invalidSelections,
    humanAutonomyViolations,
    deadlockDays,
    memoryOverflows,
    eventOverflow: domain.events.length > 500 ? 1 : 0,
    maxConsecutiveAction: maxConsecutive(selectedActions),
    relationshipLabels: relationshipLabelCounts(domain),
    replayDigest: stableHash(JSON.stringify(digestPayload)),
    domain,
    simulation,
  }
}

export function validateRealitySeasonBatch(
  seeds: readonly number[],
  options: RealitySeasonSimulationOptions = {}
): RealitySeasonBatchReport {
  let replayDivergences = 0
  let invalidSelections = 0
  let humanAutonomyViolations = 0
  let deadlockDays = 0
  let memoryOverflows = 0
  let eventOverflows = 0
  let maximumConsecutiveAction = 0

  for (const seed of seeds) {
    const first = simulateRealitySeason(seed, options)
    const replay = simulateRealitySeason(seed, options)
    if (first.replayDigest !== replay.replayDigest) replayDivergences += 1
    invalidSelections += first.invalidSelections
    humanAutonomyViolations += first.humanAutonomyViolations
    deadlockDays += first.deadlockDays
    memoryOverflows += first.memoryOverflows
    eventOverflows += first.eventOverflow
    maximumConsecutiveAction = Math.max(maximumConsecutiveAction, first.maxConsecutiveAction)
  }

  return {
    seasons: seeds.length,
    replayDivergences,
    invalidSelections,
    humanAutonomyViolations,
    deadlockDays,
    memoryOverflows,
    eventOverflows,
    maximumConsecutiveAction,
  }
}
