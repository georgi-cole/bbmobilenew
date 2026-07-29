import { SOCIAL_ACTIONS, resolveActionTargetMode } from '../socialActions'
import type { SocialActionDefinition } from '../socialActions'
import { normalizeActionCosts } from '../smExecNormalize'
import { actorHasBelief } from './knowledge'
import type {
  RealityContext,
  RealityDirection,
  RealityDomainState,
  RealityIntensity,
  RealityVisibility,
} from './types'

export type RealityActionPurpose =
  | 'BOND'
  | 'REPAIR'
  | 'INFORMATION'
  | 'PERSUADE'
  | 'COMMITMENT'
  | 'PROTECT'
  | 'CONFLICT'
  | 'ROMANCE'
  | 'PERFORM'
  | 'WITHDRAW'

export interface RealityActionContract {
  id: string
  legacyActionId: string
  title: string
  category: SocialActionDefinition['category']
  purposes: RealityActionPurpose[]
  allowedDirections: RealityDirection[]
  allowedPhases: string[]
  allowedGameModes: Array<'CLASSIC' | 'SURVIVAL'>
  allowedIntensities: RealityIntensity[]
  baseWeight: number
  requiredActorRoles: string[]
  realityRequiredActorRoles: string[]
  requiredTargetRoles: string[]
  realityRequiredTargetRoles: string[]
  requiredKnowledge: string[]
  requiredRelationshipTags: string[]
  realityRequiredRelationshipTags: string[]
  excludedRelationshipTags: string[]
  realityExcludedRelationshipTags: string[]
  minimumAffinity?: number
  realityMinimumAffinity?: number
  maximumAffinity?: number
  realityMaximumAffinity?: number
  costs: {
    NORMAL: { energy: number; influence: number; info: number }
    REALITY: { energy: number; influence: number; info: number }
  }
  cooldownPhases: number
  visibility: RealityVisibility
  responseSetId: string
  outcomeResolverId: string
  memoryTemplateId: string
  dialogueSetId: string
  targetMode: ReturnType<typeof resolveActionTargetMode>
  dramaTargetMode: ReturnType<typeof resolveActionTargetMode>
  aiOnly: boolean
}

export interface RealityActorSnapshot {
  id: string
  isHuman: boolean
  active: boolean
  roles: string[]
  resources: { energy: number; influence: number; info: number }
}

export interface RealityCandidateInput {
  action: RealityActionContract
  actor: RealityActorSnapshot
  targetIds: string[]
  actors: Record<string, RealityActorSnapshot>
  context: RealityContext
  reality: RealityDomainState
  direction: RealityDirection
}

export interface RealityCandidateEvaluation {
  eligible: boolean
  blockedReasons: string[]
}

const BROAD_PHASES = ['*']

function purposesFor(action: SocialActionDefinition): RealityActionPurpose[] {
  if (action.id === 'idle') return ['WITHDRAW']
  if (
    ['flirt', 'private_flirt', 'late_night_talk', 'cuddle', 'kiss_under_covers'].includes(action.id)
  ) {
    return ['ROMANCE', 'BOND']
  }
  if (action.id.includes('repair') || action.id.includes('apolog')) return ['REPAIR', 'BOND']
  if (action.id.includes('protect') || action.id.includes('safety')) {
    return ['PROTECT', 'COMMITMENT']
  }
  if (action.category === 'aggressive') return ['CONFLICT']
  if (action.category === 'alliance') return ['COMMITMENT', 'PROTECT']
  if (action.kind === 'intel_gain' || action.kind === 'intel_spend') {
    return ['INFORMATION', 'PERSUADE']
  }
  if (action.kind === 'political_spend' || action.category === 'strategic') {
    return ['PERSUADE', 'INFORMATION']
  }
  return ['BOND']
}

function responseSetFor(action: SocialActionDefinition): string {
  if (action.category === 'aggressive') return 'conflict_response'
  if (action.category === 'alliance') return 'commitment_response'
  if (purposesFor(action).includes('ROMANCE')) return 'romance_response'
  if (action.category === 'strategic') return 'strategic_response'
  return 'social_response'
}

function visibilityFor(action: SocialActionDefinition): RealityVisibility {
  if (action.id.includes('public') || action.id === 'startFight') return 'HOUSE_PUBLIC'
  if (resolveActionTargetMode(action, true) === 'multi') return 'GROUP_VISIBLE'
  return 'PAIR_ONLY'
}

export function adaptLegacyActionContract(action: SocialActionDefinition): RealityActionContract {
  const targetMode = resolveActionTargetMode(action, false)
  const dramaTargetMode = resolveActionTargetMode(action, true)
  const directions: RealityDirection[] =
    dramaTargetMode === 'none'
      ? ['SELF']
      : dramaTargetMode === 'multi'
        ? ['GROUP']
        : ['AI_TO_AI', 'AI_TO_HUMAN', 'HUMAN_TO_AI', 'GROUP']
  return {
    id: action.id,
    legacyActionId: action.id,
    title: action.title,
    category: action.category,
    purposes: purposesFor(action),
    allowedDirections: directions,
    allowedPhases: [...(action.dramaAllowedPhases ?? action.allowedPhases ?? BROAD_PHASES)],
    allowedGameModes: ['CLASSIC', 'SURVIVAL'],
    allowedIntensities: action.dramaOnly ? ['REALITY'] : ['NORMAL', 'REALITY'],
    baseWeight: Math.max(0.05, action.successWeight ?? 1),
    requiredActorRoles: [...(action.requiredActorStatus ?? [])],
    realityRequiredActorRoles: [
      ...(action.requiredActorStatus ?? []),
      ...(action.dramaRequiredActorStatus ?? []),
    ],
    requiredTargetRoles: [...(action.requiredTargetStatus ?? [])],
    realityRequiredTargetRoles: [
      ...(action.requiredTargetStatus ?? []),
      ...(action.dramaRequiredTargetStatus ?? []),
    ],
    requiredKnowledge: action.requiresKnownSecret ? ['KNOWN_TARGET_SECRET'] : [],
    requiredRelationshipTags: [...(action.requiredRelationshipTags ?? [])],
    realityRequiredRelationshipTags: [
      ...(action.requiredRelationshipTags ?? []),
      ...(action.dramaRequiredRelationshipTags ?? []),
    ],
    excludedRelationshipTags: [...(action.excludedRelationshipTags ?? [])],
    realityExcludedRelationshipTags: [
      ...(action.excludedRelationshipTags ?? []),
      ...(action.dramaExcludedRelationshipTags ?? []),
    ],
    minimumAffinity: action.minAffinity,
    realityMinimumAffinity: action.dramaMinAffinity ?? action.minAffinity,
    maximumAffinity: action.maxAffinity,
    realityMaximumAffinity: action.dramaMaxAffinity ?? action.maxAffinity,
    costs: {
      NORMAL: normalizeActionCosts(action, 1, false),
      REALITY: normalizeActionCosts(action, 1, true),
    },
    cooldownPhases: action.category === 'aggressive' ? 3 : 1,
    visibility: visibilityFor(action),
    responseSetId: responseSetFor(action),
    outcomeResolverId: `legacy:${action.id}`,
    memoryTemplateId: `memory:${action.category}`,
    dialogueSetId: `dialogue:${action.id}`,
    targetMode,
    dramaTargetMode,
    aiOnly: action.aiOnly === true,
  }
}

export const REALITY_ACTION_CONTRACTS = SOCIAL_ACTIONS.map(adaptLegacyActionContract)
export const REALITY_ACTION_BY_ID = new Map(
  REALITY_ACTION_CONTRACTS.map((action) => [action.id, action])
)

export function validateRealityActionContract(action: RealityActionContract): string[] {
  const errors: string[] = []
  if (!action.id) errors.push('missing id')
  if (action.purposes.length === 0) errors.push('missing purpose')
  if (action.allowedDirections.length === 0) errors.push('missing direction')
  if (action.allowedPhases.length === 0) errors.push('missing phase policy')
  if (action.allowedIntensities.length === 0) errors.push('missing intensity policy')
  if (!action.responseSetId) errors.push('missing response set')
  if (!action.outcomeResolverId) errors.push('missing outcome resolver')
  if (!action.memoryTemplateId) errors.push('missing memory template')
  if (!action.dialogueSetId) errors.push('missing dialogue set')
  for (const intensity of ['NORMAL', 'REALITY'] as const) {
    const costs = action.costs[intensity]
    if (Object.values(costs).some((cost) => !Number.isFinite(cost) || cost < 0)) {
      errors.push(`invalid ${intensity.toLowerCase()} cost`)
    }
  }
  return errors
}

function relationshipTagsForReality(
  reality: RealityDomainState,
  actorId: string,
  targetId: string
): Set<string> {
  const edge = reality.relationships[actorId]?.[targetId]
  const tags = new Set<string>()
  if (!edge) return tags
  if (edge.perceivedLabel === 'ALLY' || edge.perceivedLabel === 'CORE_ALLY') {
    tags.add('alliance')
  }
  if (edge.perceivedLabel === 'ROMANCE' || edge.perceivedLabel === 'POWER_PAIR') {
    tags.add('romance')
  }
  if (edge.perceivedLabel === 'RIVAL') tags.add('rivalry')
  if (edge.perceivedLabel === 'ENEMY') tags.add('betrayal')
  return tags
}

function projectedAffinity(reality: RealityDomainState, actorId: string, targetId: string): number {
  const edge = reality.relationships[actorId]?.[targetId]
  if (!edge) return 0
  return Math.round(
    edge.warmth * 0.42 +
      edge.trust * 0.28 +
      edge.loyalty * 0.12 +
      edge.respect * 0.08 -
      edge.resentment * 0.12 -
      edge.suspicion * 0.08
  )
}

export function evaluateRealityCandidate({
  action,
  actor,
  targetIds,
  actors,
  context,
  reality,
  direction,
}: RealityCandidateInput): RealityCandidateEvaluation {
  const blockedReasons: string[] = []
  const realityIntensity = context.socialIntensity === 'REALITY'
  const requiredActorRoles = realityIntensity
    ? action.realityRequiredActorRoles
    : action.requiredActorRoles
  const requiredTargetRoles = realityIntensity
    ? action.realityRequiredTargetRoles
    : action.requiredTargetRoles
  const requiredRelationshipTags = realityIntensity
    ? action.realityRequiredRelationshipTags
    : action.requiredRelationshipTags
  const excludedRelationshipTags = realityIntensity
    ? action.realityExcludedRelationshipTags
    : action.excludedRelationshipTags
  const minimumAffinity = realityIntensity ? action.realityMinimumAffinity : action.minimumAffinity
  const maximumAffinity = realityIntensity ? action.realityMaximumAffinity : action.maximumAffinity
  if (!actor.active) blockedReasons.push('actor_not_active')
  if (!action.allowedDirections.includes(direction)) blockedReasons.push('direction_not_allowed')
  if (!action.allowedGameModes.includes(context.gameMode)) blockedReasons.push('mode_not_allowed')
  if (!action.allowedIntensities.includes(context.socialIntensity)) {
    blockedReasons.push('intensity_not_allowed')
  }
  if (!action.allowedPhases.includes('*') && !action.allowedPhases.includes(context.phase)) {
    blockedReasons.push('phase_not_allowed')
  }
  const mode = context.socialIntensity === 'REALITY' ? action.dramaTargetMode : action.targetMode
  if (mode === 'none' && targetIds.length > 0) blockedReasons.push('unexpected_target')
  if (
    mode === 'primary' &&
    (direction === 'GROUP' ? targetIds.length < 2 : targetIds.length !== 1)
  ) {
    blockedReasons.push(direction === 'GROUP' ? 'multiple_targets_required' : 'one_target_required')
  }
  if (mode === 'primaryPlusSubject' && targetIds.length < 1) {
    blockedReasons.push('target_and_subject_required')
  }
  if (mode === 'multi' && targetIds.length < 2) blockedReasons.push('multiple_targets_required')
  if (targetIds.includes(actor.id)) blockedReasons.push('self_target_not_allowed')
  if (targetIds.some((targetId) => !actors[targetId]?.active)) {
    blockedReasons.push('target_not_active')
  }
  if (
    requiredActorRoles.length > 0 &&
    !requiredActorRoles.some((role) => actor.roles.includes(role))
  ) {
    blockedReasons.push('actor_role_required')
  }
  if (
    requiredTargetRoles.length > 0 &&
    targetIds.some(
      (targetId) => !requiredTargetRoles.some((role) => actors[targetId]?.roles.includes(role))
    )
  ) {
    blockedReasons.push('target_role_required')
  }
  if (
    action.requiredKnowledge.includes('KNOWN_TARGET_SECRET') &&
    targetIds.some(
      (targetId) =>
        !actorHasBelief(
          reality,
          actor.id,
          (belief) =>
            belief.subjectIds.includes(targetId) &&
            belief.propositionType.toLowerCase().includes('secret'),
          0.45
        )
    )
  ) {
    blockedReasons.push('knowledge_required')
  }
  for (const targetId of targetIds) {
    const tags = relationshipTagsForReality(reality, actor.id, targetId)
    const affinity = projectedAffinity(reality, actor.id, targetId)
    if (
      requiredRelationshipTags.length > 0 &&
      !requiredRelationshipTags.some((tag) => tags.has(tag))
    ) {
      blockedReasons.push('relationship_required')
    }
    if (excludedRelationshipTags.some((tag) => tags.has(tag))) {
      blockedReasons.push('relationship_excluded')
    }
    if (minimumAffinity !== undefined && affinity < minimumAffinity) {
      blockedReasons.push('minimum_affinity')
    }
    if (maximumAffinity !== undefined && affinity > maximumAffinity) {
      blockedReasons.push('maximum_affinity')
    }
  }
  const costs = action.costs[context.socialIntensity]
  if (actor.resources.energy < costs.energy) blockedReasons.push('insufficient_energy')
  if (actor.resources.influence < costs.influence) blockedReasons.push('insufficient_influence')
  if (actor.resources.info < costs.info) blockedReasons.push('insufficient_information')
  const cooldown = reality.cooldowns[actor.id]?.[action.id]
  if (
    cooldown &&
    direction !== 'HUMAN_TO_AI' &&
    (cooldown.day > context.day ||
      (cooldown.day === context.day && cooldown.phase === context.phase))
  ) {
    blockedReasons.push('cooldown_active')
  }
  return { eligible: blockedReasons.length === 0, blockedReasons: [...new Set(blockedReasons)] }
}
