import type { RealityActionContract } from './actionContract'
import type { RealityDomainState } from './types'

export type RealityResponseKind =
  | 'ACCEPT'
  | 'REJECT'
  | 'QUESTION'
  | 'LIE'
  | 'COUNTER'
  | 'DE_ESCALATE'
  | 'ESCALATE'
  | 'WALK_AWAY'

export interface RealityResponseResolution {
  kind: RealityResponseKind
  utility: number
  reason: string
  accepted: boolean
}

export function resolveRealityTargetResponse(input: {
  action: RealityActionContract
  actorId: string
  targetId: string
  reality: RealityDomainState
  draw: number
  acceptanceChanceOverride?: number
}): RealityResponseResolution {
  const edge = input.reality.relationships[input.targetId]?.[input.actorId]
  const trust = edge?.trust ?? 0
  const warmth = edge?.warmth ?? 0
  const loyalty = edge?.loyalty ?? 0
  const suspicion = edge?.suspicion ?? 0
  const resentment = edge?.resentment ?? 0
  const threat = edge?.perceivedThreat ?? 0
  if (input.action.purposes.includes('CONFLICT')) {
    const escalation = (resentment + threat - trust) / 240
    if (input.draw < Math.max(0.08, escalation)) {
      return {
        kind: 'ESCALATE',
        utility: escalation,
        reason: 'target_resentment_and_threat',
        accepted: false,
      }
    }
    if (input.draw > 0.82) {
      return { kind: 'WALK_AWAY', utility: 0.2, reason: 'target_avoids_conflict', accepted: false }
    }
    return {
      kind: 'DE_ESCALATE',
      utility: 0.35,
      reason: 'target_contains_conflict',
      accepted: false,
    }
  }
  if (input.acceptanceChanceOverride !== undefined) {
    const chance = Math.max(0.02, Math.min(1, input.acceptanceChanceOverride))
    if (input.draw < chance) {
      return {
        kind: 'ACCEPT',
        utility: chance,
        reason: 'phase_scoped_repetition_landed',
        accepted: true,
      }
    }
    return {
      kind: input.draw > 0.96 ? 'QUESTION' : 'REJECT',
      utility: chance - 0.5,
      reason: chance <= 0.02 ? 'repetition_felt_forced' : 'social_approach_did_not_land',
      accepted: false,
    }
  }
  const acceptance =
    0.42 + trust / 260 + warmth / 360 + loyalty / 420 - suspicion / 250 - resentment / 300
  if (input.draw < Math.max(0.04, Math.min(0.92, acceptance))) {
    return {
      kind: 'ACCEPT',
      utility: acceptance,
      reason: 'relationship_supports_acceptance',
      accepted: true,
    }
  }
  if (input.action.purposes.includes('COMMITMENT') || input.action.purposes.includes('PERSUADE')) {
    if (input.draw < Math.min(0.97, acceptance + 0.22)) {
      return {
        kind: 'COUNTER',
        utility: acceptance - 0.05,
        reason: 'target_demands_better_terms',
        accepted: false,
      }
    }
    if (suspicion > 45 && input.draw > 0.88) {
      return { kind: 'LIE', utility: 0.1, reason: 'target_conceals_intent', accepted: false }
    }
  }
  if (input.action.purposes.includes('INFORMATION')) {
    return suspicion > 45 && input.draw > 0.72
      ? { kind: 'LIE', utility: 0.1, reason: 'target_conceals_intent', accepted: false }
      : {
          kind: 'QUESTION',
          utility: acceptance,
          reason: 'target_gives_an_uncertain_answer',
          accepted: false,
        }
  }
  return {
    kind: input.draw > 0.9 ? 'QUESTION' : 'REJECT',
    utility: acceptance,
    reason: input.draw > 0.9 ? 'target_requests_evidence' : 'target_rejects_risk',
    accepted: false,
  }
}
