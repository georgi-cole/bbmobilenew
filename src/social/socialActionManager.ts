import { socialConfig } from './socialConfig'
import { SOCIAL_ACTIONS, isRealityExclusiveAction } from './socialActions'
import type {
  ActionCategory,
  SocialActionDefinition,
  SocialActionKind,
  SubjectPool,
  TargetMode,
} from './socialActions'

type MutableActionField<T> = T extends readonly (infer Item)[] ? Item[] : T
export type SocialActionOverride = {
  [Key in keyof Omit<SocialActionDefinition, 'id'>]?: MutableActionField<
    Omit<SocialActionDefinition, 'id'>[Key]
  >
}
export type SocialActionOverrides = Record<string, SocialActionOverride>

export type SocialActionLayer = 'basic' | 'reality' | 'vox' | 'ai'
export type SocialActionSubtype =
  | 'friendly'
  | 'strategy'
  | 'conflict'
  | 'alliances'
  | 'romance'
  | 'bromance'
  | 'intel'
  | 'vox_populi'
  | 'automation'

export interface SocialActionGrouping {
  layer: SocialActionLayer
  subtype: SocialActionSubtype
  layerLabel: string
  subtypeLabel: string
}

export const REALITY_RELATIONSHIP_DIMENSIONS = [
  'warmth',
  'trust',
  'loyalty',
  'respect',
  'attraction',
  'intimacy',
  'gratitude',
  'resentment',
  'fear',
  'envy',
  'suspicion',
  'strategicValue',
  'perceivedThreat',
  'reliability',
  'familiarity',
  'publicCloseness',
  'secretCloseness',
] as const

type RealityRelationshipDimension = (typeof REALITY_RELATIONSHIP_DIMENSIONS)[number]
export type RealityRelationshipEffects = Partial<Record<RealityRelationshipDimension, number>>

export interface EffectiveRealityEffects {
  accepted: RealityRelationshipEffects
  rejected: RealityRelationshipEffects
  escalated: RealityRelationshipEffects
  deEscalated: RealityRelationshipEffects
}

const CATEGORIES = new Set<ActionCategory>(['friendly', 'strategic', 'aggressive', 'alliance'])
const KINDS = new Set<SocialActionKind>([
  'rapport',
  'intel_gain',
  'intel_spend',
  'political_spend',
  'aggressive',
])
const TARGET_MODES = new Set<TargetMode>(['none', 'primary', 'primaryPlusSubject', 'multi'])
const SUBJECT_POOLS = new Set<SubjectPool>([
  'houseguests',
  'nominees',
  'non_nominees',
  'allies',
  'voters',
])
const KNOWN_ACTION_IDS = new Set(SOCIAL_ACTIONS.map((action) => action.id))
const REALITY_DIMENSIONS = new Set<string>(REALITY_RELATIONSHIP_DIMENSIONS)
const REALITY_PRESETS = ['casual', 'tv', 'adult'] as const
const ADULT_REALITY_ACTION_IDS = new Set([
  'kiss_under_covers',
  'pool_makeout',
  'spend_night',
  'skinny_dip',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function safeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined
}

function safeNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(min, Math.min(max, value))
}

function safeInteger(value: unknown, min: number, max: number): number | undefined {
  const valueInRange = safeNumber(value, min, max)
  return valueInRange === undefined ? undefined : Math.round(valueInRange)
}

function safeStringArray(value: unknown, maxEntries = 32): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .slice(0, maxEntries)
    .map((entry) => safeString(entry, 80))
    .filter((entry): entry is string => Boolean(entry))
}

function sanitiseCost(value: unknown): SocialActionDefinition['baseCost'] | undefined {
  const scalar = safeNumber(value, 0, 1_000)
  if (scalar !== undefined) return scalar
  if (!isRecord(value)) return undefined
  const result: { energy?: number; influence?: number; info?: number } = {}
  const energy = safeNumber(value.energy, 0, 100)
  const influence = safeNumber(value.influence, 0, 1_000)
  const info = safeNumber(value.info, 0, 1_000)
  if (energy !== undefined) result.energy = energy
  if (influence !== undefined) result.influence = influence
  if (info !== undefined) result.info = info
  return result
}

function sanitiseYields(value: unknown): SocialActionDefinition['yields'] | undefined {
  if (!isRecord(value)) return undefined
  const result: NonNullable<SocialActionDefinition['yields']> = {}
  const influence = safeNumber(value.influence, -1_000, 1_000)
  const info = safeNumber(value.info, -1_000, 1_000)
  if (influence !== undefined) result.influence = influence
  if (info !== undefined) result.info = info
  return result
}

function sanitisePair(
  value: unknown,
  min: number,
  max: number
): { success: number; failure: number } | undefined {
  if (!isRecord(value)) return undefined
  const success = safeNumber(value.success, min, max)
  const failure = safeNumber(value.failure, min, max)
  if (success === undefined || failure === undefined) return undefined
  return { success, failure }
}

function sanitiseRealityVector(value: unknown): RealityRelationshipEffects | undefined {
  if (!isRecord(value)) return undefined
  const result: RealityRelationshipEffects = {}
  for (const [key, rawDelta] of Object.entries(value)) {
    if (!REALITY_DIMENSIONS.has(key)) continue
    const delta = safeNumber(rawDelta, -100, 100)
    if (delta !== undefined) result[key as RealityRelationshipDimension] = delta
  }
  return result
}

function sanitiseRealityEffects(
  value: unknown
): SocialActionDefinition['realityEffects'] | undefined {
  if (!isRecord(value)) return undefined
  const result: NonNullable<SocialActionDefinition['realityEffects']> = {}
  for (const key of ['accepted', 'rejected', 'escalated', 'deEscalated'] as const) {
    const vector = sanitiseRealityVector(value[key])
    if (vector) result[key] = vector
  }
  return result
}

export function sanitiseSocialActionOverrides(raw: unknown): SocialActionOverrides {
  if (!isRecord(raw)) return {}
  const result: SocialActionOverrides = {}

  for (const [id, value] of Object.entries(raw)) {
    if (!KNOWN_ACTION_IDS.has(id) || !isRecord(value)) continue
    const override: SocialActionOverride = {}

    const title = safeString(value.title, 80)
    const description = safeString(value.description, 300)
    const icon = safeString(value.icon, 16)
    const availabilityHint = safeString(value.availabilityHint, 160)
    const outcomeTag = safeString(value.outcomeTag, 80)
    const realityVisibility = safeString(value.realityVisibility, 40)
    const responseSetId = safeString(value.responseSetId, 80)
    const outcomeResolverId = safeString(value.outcomeResolverId, 80)
    const memoryTemplateId = safeString(value.memoryTemplateId, 80)
    const dialogueSetId = safeString(value.dialogueSetId, 80)
    if (title) override.title = title
    if (description) override.description = description
    if (icon) override.icon = icon
    if (availabilityHint) override.availabilityHint = availabilityHint
    if (outcomeTag) override.outcomeTag = outcomeTag
    if (realityVisibility) override.realityVisibility = realityVisibility
    if (responseSetId) override.responseSetId = responseSetId
    if (outcomeResolverId) override.outcomeResolverId = outcomeResolverId
    if (memoryTemplateId) override.memoryTemplateId = memoryTemplateId
    if (dialogueSetId) override.dialogueSetId = dialogueSetId

    if (typeof value.enabled === 'boolean') override.enabled = value.enabled
    if (typeof value.aiOnly === 'boolean') override.aiOnly = value.aiOnly
    if (typeof value.needsTargets === 'boolean') override.needsTargets = value.needsTargets
    if (typeof value.allowActorAsSubject === 'boolean') {
      override.allowActorAsSubject = value.allowActorAsSubject
    }
    if (typeof value.dramaOnly === 'boolean') override.dramaOnly = value.dramaOnly
    if (typeof value.realityExclusive === 'boolean') {
      override.realityExclusive = value.realityExclusive
    }
    if (typeof value.voxOnly === 'boolean') override.voxOnly = value.voxOnly
    if (typeof value.requiresKnownSecret === 'boolean') {
      override.requiresKnownSecret = value.requiresKnownSecret
    }
    if (typeof value.requiredArcPublic === 'boolean') {
      override.requiredArcPublic = value.requiredArcPublic
    }

    if (CATEGORIES.has(value.category as ActionCategory)) {
      override.category = value.category as ActionCategory
    }
    if (KINDS.has(value.kind as SocialActionKind)) override.kind = value.kind as SocialActionKind
    if (TARGET_MODES.has(value.targetMode as TargetMode)) {
      override.targetMode = value.targetMode as TargetMode
    }
    if (TARGET_MODES.has(value.dramaTargetMode as TargetMode)) {
      override.dramaTargetMode = value.dramaTargetMode as TargetMode
    }
    if (SUBJECT_POOLS.has(value.subjectPool as SubjectPool)) {
      override.subjectPool = value.subjectPool as SubjectPool
    }

    const baseCost = sanitiseCost(value.baseCost)
    const dramaCost = sanitiseCost(value.dramaCost)
    const yields = sanitiseYields(value.yields)
    const affinityEffects = sanitisePair(value.affinityEffects, -100, 100)
    const scoreEffects = sanitisePair(value.scoreEffects, -1, 1)
    const realityEffects = sanitiseRealityEffects(value.realityEffects)
    if (baseCost !== undefined) override.baseCost = baseCost
    if (dramaCost !== undefined) override.dramaCost = dramaCost
    if (yields !== undefined) override.yields = yields
    if (affinityEffects) override.affinityEffects = affinityEffects
    if (scoreEffects) override.scoreEffects = scoreEffects
    if (realityEffects) override.realityEffects = realityEffects

    for (const [key, min, max, integer] of [
      ['successWeight', 0, 100, false],
      ['aiWeight', 0, 100, false],
      ['minTargets', 0, 32, true],
      ['maxTargets', 0, 32, true],
      ['energyPerTarget', 0, 100, false],
      ['minAffinity', -100, 100, false],
      ['maxAffinity', -100, 100, false],
      ['dramaMinAffinity', -100, 100, false],
      ['dramaMaxAffinity', -100, 100, false],
      ['realityCooldownPhases', 0, 100, true],
    ] as const) {
      const parsed = integer ? safeInteger(value[key], min, max) : safeNumber(value[key], min, max)
      if (parsed !== undefined) Object.assign(override, { [key]: parsed })
    }

    for (const key of [
      'allowedPhases',
      'dramaAllowedPhases',
      'requiredActorStatus',
      'requiredTargetStatus',
      'dramaRequiredActorStatus',
      'dramaRequiredTargetStatus',
      'requiredRelationshipTags',
      'excludedRelationshipTags',
      'dramaRequiredRelationshipTags',
      'dramaExcludedRelationshipTags',
      'requiredArcTypes',
      'excludedArcTypes',
      'requiredArcStages',
      'realityPurposes',
      'realityAllowedDirections',
      'realityAllowedGameModes',
      'allowedRealityPresets',
    ] as const) {
      const values = safeStringArray(value[key])
      if (values !== undefined) Object.assign(override, { [key]: values })
    }

    result[id] = override
  }
  return result
}

export function applySocialActionOverride(
  action: SocialActionDefinition,
  override?: SocialActionOverride
): SocialActionDefinition {
  if (!override) return action
  return {
    ...action,
    ...override,
    baseCost: override.baseCost ?? action.baseCost,
    yields: override.yields ? { ...override.yields } : action.yields,
    affinityEffects: override.affinityEffects
      ? { ...override.affinityEffects }
      : action.affinityEffects,
    scoreEffects: override.scoreEffects ? { ...override.scoreEffects } : action.scoreEffects,
    realityEffects: override.realityEffects
      ? {
          ...action.realityEffects,
          ...override.realityEffects,
        }
      : action.realityEffects,
  }
}

export function buildEffectiveSocialActions(
  overrides?: SocialActionOverrides
): SocialActionDefinition[] {
  return SOCIAL_ACTIONS.map((action) => applySocialActionOverride(action, overrides?.[action.id]))
}

let runtimeOverrides: SocialActionOverrides = {}

export function setRuntimeSocialActionOverrides(overrides: unknown): void {
  runtimeOverrides = sanitiseSocialActionOverrides(overrides)
}

export function getRuntimeSocialActions(options?: {
  includeDisabled?: boolean
}): SocialActionDefinition[] {
  const actions = buildEffectiveSocialActions(runtimeOverrides)
  return options?.includeDisabled ? actions : actions.filter((action) => action.enabled !== false)
}

export function getRuntimeSocialActionById(
  id: string,
  options?: { includeDisabled?: boolean }
): SocialActionDefinition | undefined {
  const action = SOCIAL_ACTIONS.find((candidate) => candidate.id === id)
  if (!action) return undefined
  const effective = applySocialActionOverride(action, runtimeOverrides[id])
  return options?.includeDisabled || effective.enabled !== false ? effective : undefined
}

export function getAllowedRealityPresets(action: SocialActionDefinition): string[] {
  const configured = (action.allowedRealityPresets ?? []).filter((preset) =>
    REALITY_PRESETS.includes(preset as (typeof REALITY_PRESETS)[number])
  )
  if (configured.length > 0) return configured
  return ADULT_REALITY_ACTION_IDS.has(action.id) ? ['adult'] : [...REALITY_PRESETS]
}

export function isActionAllowedForRealityPreset(
  action: SocialActionDefinition,
  preset: string | undefined
): boolean {
  return getAllowedRealityPresets(action).includes(preset ?? 'tv')
}

export function getActionAffinityEffects(action: SocialActionDefinition): {
  success: number
  failure: number
} {
  if (action.affinityEffects) return action.affinityEffects
  if (socialConfig.actionCategories.friendlyActions.includes(action.id)) {
    return {
      success: socialConfig.affinityDeltas.friendlySuccess,
      failure: socialConfig.affinityDeltas.friendlyFailure,
    }
  }
  if (socialConfig.actionCategories.aggressiveActions.includes(action.id)) {
    return {
      success: socialConfig.affinityDeltas.aggressiveSuccess,
      failure: socialConfig.affinityDeltas.aggressiveFailure,
    }
  }
  return { success: 0, failure: 0 }
}

export function getActionScoreEffects(action: SocialActionDefinition): {
  success: number
  failure: number
} {
  if (action.scoreEffects) return action.scoreEffects
  if (socialConfig.actionCategories.friendlyActions.includes(action.id)) {
    return {
      success: socialConfig.scoreDeltas.friendlySuccess,
      failure: socialConfig.scoreDeltas.friendlyFailure,
    }
  }
  if (socialConfig.actionCategories.aggressiveActions.includes(action.id)) {
    return {
      success: socialConfig.scoreDeltas.aggressiveSuccess,
      failure: socialConfig.scoreDeltas.aggressiveFailure,
    }
  }
  return { success: 0, failure: 0 }
}

function hasToken(action: SocialActionDefinition, token: string): boolean {
  return (
    action.id.includes(token) ||
    action.outcomeTag?.includes(token) === true ||
    action.requiredArcTypes?.includes(token as never) === true ||
    action.excludedArcTypes?.includes(token as never) === true
  )
}

export function getSocialActionGrouping(action: SocialActionDefinition): SocialActionGrouping {
  if (action.aiOnly) {
    return {
      layer: 'ai',
      subtype: 'automation',
      layerLabel: 'AI & system',
      subtypeLabel: 'Automation',
    }
  }
  if (action.voxOnly) {
    return {
      layer: 'vox',
      subtype: 'vox_populi',
      layerLabel: 'Reality campaigns',
      subtypeLabel: 'Vox Populi',
    }
  }

  const layer: SocialActionLayer = isRealityExclusiveAction(action) ? 'reality' : 'basic'
  const layerLabel = layer === 'reality' ? 'Reality Mode' : 'Basic'
  if (
    hasToken(action, 'romance') ||
    ['flirt', 'cuddle', 'kiss_under_covers', 'pool_makeout', 'spend_night', 'go_public'].includes(
      action.id
    )
  ) {
    return { layer, subtype: 'romance', layerLabel, subtypeLabel: 'Romance' }
  }
  if (hasToken(action, 'bromance') || action.id === 'ride_or_die') {
    return { layer, subtype: 'bromance', layerLabel, subtypeLabel: 'Bromance' }
  }
  if (action.category === 'alliance' || hasToken(action, 'alliance') || action.id === 'protect') {
    return { layer, subtype: 'alliances', layerLabel, subtypeLabel: 'Alliances & commitments' }
  }
  if (
    action.kind === 'intel_gain' ||
    action.kind === 'intel_spend' ||
    /secret|snoop|eavesdrop|rumor|rumour/.test(`${action.id} ${action.outcomeTag ?? ''}`)
  ) {
    return { layer, subtype: 'intel', layerLabel, subtypeLabel: 'Information & exposure' }
  }
  if (action.category === 'aggressive') {
    return { layer, subtype: 'conflict', layerLabel, subtypeLabel: 'Conflict & rivalry' }
  }
  if (action.category === 'friendly') {
    return { layer, subtype: 'friendly', layerLabel, subtypeLabel: 'Bonds & rapport' }
  }
  return { layer, subtype: 'strategy', layerLabel, subtypeLabel: 'Strategy & power' }
}

export function getDefaultRealityEffects(action: SocialActionDefinition): EffectiveRealityEffects {
  const grouping = getSocialActionGrouping(action)
  const conflict = grouping.subtype === 'conflict'
  const romance = grouping.subtype === 'romance'
  const commitment = grouping.subtype === 'alliances'
  const information = grouping.subtype === 'intel'

  const defaults: EffectiveRealityEffects = conflict
    ? {
        accepted: { warmth: -8, trust: -9, resentment: 14, suspicion: 6, familiarity: 3 },
        rejected: { warmth: -8, trust: -9, resentment: 14, suspicion: 6, familiarity: 3 },
        escalated: { warmth: -8, trust: -9, resentment: 14, suspicion: 6, familiarity: 3 },
        deEscalated: { warmth: -2, trust: -2, resentment: 3, familiarity: 2 },
      }
    : romance
      ? {
          accepted: { warmth: 6, trust: 3, attraction: 12, intimacy: 9, familiarity: 3 },
          rejected: { warmth: -2, attraction: -3, familiarity: 2 },
          escalated: { warmth: 6, trust: 3, attraction: 12, intimacy: 9, familiarity: 3 },
          deEscalated: { warmth: -2, attraction: -3, familiarity: 2 },
        }
      : commitment
        ? {
            accepted: { trust: 8, loyalty: 10, strategicValue: 7, familiarity: 2 },
            rejected: { trust: -3, suspicion: 4, familiarity: 2 },
            escalated: { trust: 8, loyalty: 10, strategicValue: 7, familiarity: 2 },
            deEscalated: { trust: -3, suspicion: 4, familiarity: 2 },
          }
        : information
          ? {
              accepted: { trust: 4, strategicValue: 4, familiarity: 2 },
              rejected: { suspicion: 3, familiarity: 1 },
              escalated: { trust: 4, strategicValue: 4, familiarity: 2 },
              deEscalated: { suspicion: 3, familiarity: 1 },
            }
          : {
              accepted: { warmth: 6, trust: 3, familiarity: 3 },
              rejected: { warmth: -2, familiarity: 1 },
              escalated: { warmth: 6, trust: 3, familiarity: 3 },
              deEscalated: { warmth: -2, familiarity: 1 },
            }

  return {
    accepted: { ...defaults.accepted, ...action.realityEffects?.accepted },
    rejected: { ...defaults.rejected, ...action.realityEffects?.rejected },
    escalated: { ...defaults.escalated, ...action.realityEffects?.escalated },
    deEscalated: { ...defaults.deEscalated, ...action.realityEffects?.deEscalated },
  }
}
