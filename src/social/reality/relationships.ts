import { createDirectedRelationship } from './state'
import type {
  DirectedRelationship,
  RealityDomainState,
  RealityRelationshipLabel,
  RelationshipDimension,
} from './types'

const clamp = (value: number, minimum = -100, maximum = 100) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0))

const NON_NEGATIVE_DIMENSIONS = new Set<RelationshipDimension>([
  'gratitude',
  'resentment',
  'fear',
  'envy',
  'suspicion',
  'strategicValue',
  'perceivedThreat',
  'familiarity',
])

export interface RealityRelationshipChange {
  sourceId: string
  targetId: string
  deltas: Partial<Record<RelationshipDimension, number>>
  day: number
  phase: string
  eventId: string
  anchor?: 'positive' | 'negative'
  grievanceId?: string
  meaningful?: boolean
}

export function getRealityRelationship(
  state: RealityDomainState,
  sourceId: string,
  targetId: string
): DirectedRelationship {
  state.relationships[sourceId] ??= {}
  state.relationships[sourceId][targetId] ??= createDirectedRelationship(sourceId, targetId)
  return state.relationships[sourceId][targetId]
}

export function deriveRelationshipLabel(
  edge: DirectedRelationship,
  previous: RealityRelationshipLabel = edge.perceivedLabel
): RealityRelationshipLabel {
  const positiveAnchors = edge.positiveAnchorEventIds.length
  const negativeAnchors = edge.negativeAnchorEventIds.length
  const severeConflict =
    edge.resentment >= 70 && edge.trust <= -45 && edge.suspicion >= 45 && negativeAnchors > 0
  if (severeConflict) return 'ENEMY'
  if (
    edge.resentment >= 42 &&
    edge.perceivedThreat >= 38 &&
    negativeAnchors > 0 &&
    previous !== 'ENEMY'
  ) {
    return 'RIVAL'
  }
  if (
    (previous === 'ENEMY' || previous === 'RIVAL') &&
    edge.trust >= -15 &&
    edge.resentment >= 25 &&
    positiveAnchors > 0
  ) {
    return 'UNEASY_TRUCE'
  }
  if (edge.attraction >= 58 && edge.intimacy >= 45 && edge.trust >= 20 && positiveAnchors > 0) {
    return edge.loyalty >= 55 && edge.strategicValue >= 45 ? 'POWER_PAIR' : 'ROMANCE'
  }
  if (edge.attraction >= 48 && positiveAnchors === 0) return 'ONE_SIDED_CRUSH'
  if (edge.loyalty >= 65 && edge.trust >= 55 && edge.strategicValue >= 40 && positiveAnchors >= 2) {
    return 'CORE_ALLY'
  }
  if (edge.loyalty >= 35 && edge.trust >= 25 && edge.strategicValue >= 25 && positiveAnchors > 0) {
    return 'ALLY'
  }
  if (edge.warmth >= 62 && edge.trust >= 45 && edge.intimacy >= 42 && positiveAnchors > 0) {
    return 'CLOSE_FRIEND'
  }
  if (edge.warmth >= 38 && edge.trust >= 22 && positiveAnchors > 0) return 'FRIEND'
  if (edge.warmth >= 15) return 'FRIENDLY'
  if (edge.strategicValue >= 35 && Math.abs(edge.warmth) < 20) return 'TRANSACTIONAL'
  if (edge.familiarity >= 8) return 'ACQUAINTANCE'
  return 'UNKNOWN'
}

export function applyRealityRelationshipChange(
  state: RealityDomainState,
  change: RealityRelationshipChange
): DirectedRelationship {
  const edge = getRealityRelationship(state, change.sourceId, change.targetId)
  const net = Object.values(change.deltas).reduce((sum, value) => sum + (value ?? 0), 0)
  for (const [dimension, rawDelta] of Object.entries(change.deltas) as Array<
    [RelationshipDimension, number]
  >) {
    const current = edge[dimension]
    const minimum = NON_NEGATIVE_DIMENSIONS.has(dimension) ? 0 : -100
    edge[dimension] = clamp(current + rawDelta, minimum, 100)
  }
  edge.trend = clamp(edge.trend * 0.65 + net * 0.35)
  if (change.anchor === 'positive' && !edge.positiveAnchorEventIds.includes(change.eventId)) {
    edge.positiveAnchorEventIds.push(change.eventId)
    edge.positiveAnchorEventIds = edge.positiveAnchorEventIds.slice(-20)
  }
  if (change.anchor === 'negative' && !edge.negativeAnchorEventIds.includes(change.eventId)) {
    edge.negativeAnchorEventIds.push(change.eventId)
    edge.negativeAnchorEventIds = edge.negativeAnchorEventIds.slice(-20)
  }
  if (change.grievanceId && !edge.unresolvedGrievanceIds.includes(change.grievanceId)) {
    edge.unresolvedGrievanceIds.push(change.grievanceId)
  }
  if (change.meaningful !== false) {
    edge.lastMeaningfulInteraction = {
      day: change.day,
      phase: change.phase,
      eventId: change.eventId,
    }
    edge.familiarity = clamp(edge.familiarity + 2, 0, 100)
  }
  const previous = edge.perceivedLabel
  const derived = deriveRelationshipLabel(edge, previous)
  if (derived !== previous) {
    edge.perceivedLabel = derived
    edge.labelConfidence = Math.min(1, 0.45 + edge.positiveAnchorEventIds.length * 0.12)
  }
  return edge
}

export function applyLegacyRelationshipUpdateToReality(
  state: RealityDomainState,
  sourceId: string,
  targetId: string,
  delta: number,
  tags: readonly string[] = [],
  day = 0,
  phase = 'legacy'
): void {
  const sequence = state.nextSequence
  state.nextSequence += 1
  const eventId = `reality-event-${sequence}`
  const positive = delta > 0
  const negative = delta < 0
  const betrayal = tags.includes('betrayal')
  const alliance = tags.includes('alliance')
  const romance = tags.includes('romance')
  const rivalry = tags.includes('rivalry') || tags.includes('conflict')
  applyRealityRelationshipChange(state, {
    sourceId,
    targetId,
    day,
    phase,
    eventId,
    anchor:
      betrayal || rivalry
        ? 'negative'
        : alliance || romance || Math.abs(delta) >= 8
          ? positive
            ? 'positive'
            : negative
              ? 'negative'
              : undefined
          : undefined,
    deltas: {
      warmth: delta * 0.6,
      trust: delta * 0.4 + (alliance ? 8 : 0) - (betrayal ? 35 : 0),
      loyalty: delta * 0.2 + (alliance ? 18 : 0) - (betrayal ? 40 : 0),
      respect: delta * 0.2,
      attraction: romance ? 25 : 0,
      intimacy: romance ? 18 : alliance ? 5 : 0,
      resentment: betrayal ? 45 : negative ? Math.abs(delta) * 0.5 : 0,
      suspicion: betrayal ? 35 : negative ? Math.abs(delta) * 0.35 : 0,
      strategicValue: alliance ? 18 : 0,
      perceivedThreat: rivalry ? 20 : betrayal ? 25 : 0,
      reliability: delta * 0.25 + (alliance ? 10 : 0) - (betrayal ? 45 : 0),
      publicCloseness: tags.length > 0 ? 4 : 0,
      secretCloseness: alliance || romance ? 10 : 0,
    },
  })
}

export function projectRealityAffinity(edge: DirectedRelationship | undefined): number {
  if (!edge) return 0
  return Math.round(
    clamp(
      edge.warmth * 0.38 +
        edge.trust * 0.24 +
        edge.loyalty * 0.12 +
        edge.respect * 0.08 +
        edge.intimacy * 0.06 +
        edge.gratitude * 0.05 -
        edge.resentment * 0.12 -
        edge.suspicion * 0.08 -
        edge.fear * 0.03
    )
  )
}
