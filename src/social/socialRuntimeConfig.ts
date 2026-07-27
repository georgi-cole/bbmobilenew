import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  IncomingInteractionType,
} from './types'

export type SocialMode = 'normal' | 'drama'
export type IncomingInteractionResponsePolicy = 'required' | 'optional' | 'readOnly'

export interface SocialActionPresentationOverride {
  title?: string
  description?: string
  icon?: string
}

export interface SocialResponseChoiceOverride {
  label: string
  responseType: IncomingInteractionResponseType
  description?: string
  style?: 'positive' | 'neutral' | 'negative' | 'dismiss'
}

export interface SocialRuntimeConfig {
  schemaVersion: 1
  revision: string
  economy: {
    normal: {
      weeklyEnergy: number
      carryOver: false
      energyCap: number
    }
    drama: {
      weeklyEnergy: number
      carryOver: true
      energyCap: number
    }
    influenceCap: number
    infoCap: number
  }
  history: {
    maxActionHistory: number
  }
  ai: {
    outcomeAffinityBiasWeight: number
    outcomeJitterMagnitude: number
    repetitionPenalty: number
    noveltyWeight: number
    basicActionWeights: Record<string, number>
  }
  incoming: {
    defaultPolicies: Record<IncomingInteractionType, IncomingInteractionResponsePolicy>
    scenarioPolicies: Record<string, IncomingInteractionResponsePolicy>
  }
  content: {
    scenarioLines: Record<string, string[]>
    actionPresentation: Record<string, SocialActionPresentationOverride>
    responseSets: Record<string, SocialResponseChoiceOverride[]>
  }
  familyGroups: Record<string, string>
}

export interface SocialRuntimeOverride {
  schemaVersion?: number
  revision?: string
  economy?: {
    normal?: Partial<SocialRuntimeConfig['economy']['normal']>
    drama?: Partial<SocialRuntimeConfig['economy']['drama']>
    influenceCap?: number
    infoCap?: number
  }
  history?: Partial<SocialRuntimeConfig['history']>
  ai?: Partial<Omit<SocialRuntimeConfig['ai'], 'basicActionWeights'>> & {
    basicActionWeights?: Record<string, number>
  }
  incoming?: {
    defaultPolicies?: Partial<Record<IncomingInteractionType, IncomingInteractionResponsePolicy>>
    scenarioPolicies?: Record<string, IncomingInteractionResponsePolicy>
  }
  content?: {
    scenarioLines?: Record<string, string[]>
    actionPresentation?: Record<string, SocialActionPresentationOverride>
    responseSets?: Record<string, SocialResponseChoiceOverride[]>
  }
  familyGroups?: Record<string, string>
}

const DEFAULT_RESPONSE_POLICIES: Record<
  IncomingInteractionType,
  IncomingInteractionResponsePolicy
> = {
  compliment: 'optional',
  gossip: 'optional',
  warning: 'optional',
  alliance_proposal: 'required',
  deal_offer: 'required',
  nomination_plea: 'required',
  check_in: 'optional',
  snide_remark: 'optional',
  other: 'optional',
}

/**
 * Bundled, JSON-compatible fallback. The same shape may be hosted in live config;
 * only validated scalar and content fields are merged at runtime.
 */
export const DEFAULT_SOCIAL_RUNTIME_CONFIG: SocialRuntimeConfig = {
  schemaVersion: 1,
  revision: 'bundled-1',
  economy: {
    normal: { weeklyEnergy: 5, carryOver: false, energyCap: 5 },
    drama: { weeklyEnergy: 10, carryOver: true, energyCap: 30 },
    influenceCap: 10_000,
    infoCap: 10_000,
  },
  history: {
    maxActionHistory: 500,
  },
  ai: {
    outcomeAffinityBiasWeight: 0.2,
    outcomeJitterMagnitude: 0.08,
    repetitionPenalty: 0.28,
    noveltyWeight: 0.12,
    basicActionWeights: {
      ally: 3,
      protect: 2,
      betray: 0.15,
      nominate: 2,
      idle: 1,
      compliment: 3,
      whisper: 2,
      rumor: 2,
      proposeAlliance: 1,
      group_chat: 2,
      startFight: 1,
      reassure: 2,
      share_intel: 1,
      ask_use_safety: 1,
      confront: 1,
    },
  },
  incoming: {
    defaultPolicies: DEFAULT_RESPONSE_POLICIES,
    scenarioPolicies: {
      safety_holder_consults_loh: 'required',
      nominee_hoh_plea: 'required',
      nominee_veto_pitch: 'required',
      live_vote_pitch: 'required',
      hoh_safety_request: 'required',
      nomination_aftershock: 'optional',
      post_veto_gratitude: 'readOnly',
      survivor_gratitude: 'readOnly',
      safety_win_congratulations: 'readOnly',
      hoh_congratulations: 'readOnly',
    },
  },
  content: {
    scenarioLines: {},
    actionPresentation: {},
    responseSets: {},
  },
  familyGroups: {
    lia: 'twin-lia-ali',
    ali: 'twin-lia-ali',
  },
}

let runtimeConfig: SocialRuntimeConfig = DEFAULT_SOCIAL_RUNTIME_CONFIG

const RESPONSE_TYPES = new Set<IncomingInteractionResponseType>([
  'positive',
  'neutral',
  'negative',
  'accept',
  'decline',
  'dismiss',
  'ignore',
])
const RESPONSE_POLICIES = new Set<IncomingInteractionResponsePolicy>([
  'required',
  'optional',
  'readOnly',
])
const RESPONSE_STYLES = new Set<NonNullable<SocialResponseChoiceOverride['style']>>([
  'positive',
  'neutral',
  'negative',
  'dismiss',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function safeString(value: unknown, maxLength = 240): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined
}

function safeNumber(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(min, Math.min(max, value))
}

function safeInteger(value: unknown, min: number, max: number): number | undefined {
  const numeric = safeNumber(value, min, max)
  return numeric === undefined ? undefined : Math.round(numeric)
}

function sanitisePolicy(value: unknown): IncomingInteractionResponsePolicy | undefined {
  return typeof value === 'string' && RESPONSE_POLICIES.has(value as IncomingInteractionResponsePolicy)
    ? (value as IncomingInteractionResponsePolicy)
    : undefined
}

function sanitiseStringMap(
  value: unknown,
  maxEntries: number,
  maxValueLength: number,
): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const output: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, maxEntries)) {
    const key = safeString(rawKey, 80)
    const item = safeString(rawValue, maxValueLength)
    if (key && item) output[key] = item
  }
  return Object.keys(output).length > 0 ? output : undefined
}

function sanitiseScenarioLines(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined
  const output: Record<string, string[]> = {}
  for (const [rawKey, rawLines] of Object.entries(value).slice(0, 120)) {
    const key = safeString(rawKey, 80)
    if (!key || !Array.isArray(rawLines)) continue
    const lines = rawLines
      .slice(0, 24)
      .map((line) => safeString(line, 500))
      .filter((line): line is string => Boolean(line))
    if (lines.length > 0) output[key] = lines
  }
  return Object.keys(output).length > 0 ? output : undefined
}

function sanitiseActionPresentation(
  value: unknown,
): Record<string, SocialActionPresentationOverride> | undefined {
  if (!isRecord(value)) return undefined
  const output: Record<string, SocialActionPresentationOverride> = {}
  for (const [rawKey, rawEntry] of Object.entries(value).slice(0, 160)) {
    const key = safeString(rawKey, 80)
    if (!key || !isRecord(rawEntry)) continue
    const entry: SocialActionPresentationOverride = {}
    const title = safeString(rawEntry.title, 80)
    const description = safeString(rawEntry.description, 240)
    const icon = safeString(rawEntry.icon, 12)
    if (title) entry.title = title
    if (description) entry.description = description
    if (icon) entry.icon = icon
    if (Object.keys(entry).length > 0) output[key] = entry
  }
  return Object.keys(output).length > 0 ? output : undefined
}

function sanitiseResponseSets(
  value: unknown,
): Record<string, SocialResponseChoiceOverride[]> | undefined {
  if (!isRecord(value)) return undefined
  const output: Record<string, SocialResponseChoiceOverride[]> = {}
  for (const [rawKey, rawChoices] of Object.entries(value).slice(0, 160)) {
    const key = safeString(rawKey, 100)
    if (!key || !Array.isArray(rawChoices)) continue
    const choices: SocialResponseChoiceOverride[] = []
    for (const rawChoice of rawChoices.slice(0, 6)) {
      if (!isRecord(rawChoice)) continue
      const label = safeString(rawChoice.label, 80)
      const responseType = rawChoice.responseType
      if (
        !label ||
        typeof responseType !== 'string' ||
        !RESPONSE_TYPES.has(responseType as IncomingInteractionResponseType)
      ) {
        continue
      }
      const choice: SocialResponseChoiceOverride = {
        label,
        responseType: responseType as IncomingInteractionResponseType,
      }
      const description = safeString(rawChoice.description, 180)
      const style = rawChoice.style
      if (description) choice.description = description
      if (typeof style === 'string' && RESPONSE_STYLES.has(style as NonNullable<typeof choice.style>)) {
        choice.style = style as NonNullable<typeof choice.style>
      }
      choices.push(choice)
    }
    if (choices.length > 0) output[key] = choices
  }
  return Object.keys(output).length > 0 ? output : undefined
}

/** Strictly sanitise the remotely editable subset. Invalid and unknown values are dropped. */
export function sanitiseSocialRuntimeOverride(raw: unknown): SocialRuntimeOverride | null {
  if (!isRecord(raw)) return null
  const output: SocialRuntimeOverride = {}
  const schemaVersion = safeInteger(raw.schemaVersion, 1, 1)
  if (schemaVersion) output.schemaVersion = schemaVersion
  const revision = safeString(raw.revision, 80)
  if (revision) output.revision = revision

  if (isRecord(raw.economy)) {
    const economy: NonNullable<SocialRuntimeOverride['economy']> = {}
    for (const mode of ['normal', 'drama'] as const) {
      if (!isRecord(raw.economy[mode])) continue
      const modeConfig: Record<string, number | boolean> = {}
      const weeklyEnergy = safeInteger(raw.economy[mode].weeklyEnergy, 1, 50)
      const energyCap = safeInteger(raw.economy[mode].energyCap, 1, 100)
      if (weeklyEnergy !== undefined) modeConfig.weeklyEnergy = weeklyEnergy
      if (energyCap !== undefined) modeConfig.energyCap = Math.max(weeklyEnergy ?? 1, energyCap)
      if (mode === 'normal') modeConfig.carryOver = false
      if (mode === 'drama') modeConfig.carryOver = true
      if (Object.keys(modeConfig).length > 0) economy[mode] = modeConfig
    }
    const influenceCap = safeInteger(raw.economy.influenceCap, 100, 100_000)
    const infoCap = safeInteger(raw.economy.infoCap, 100, 100_000)
    if (influenceCap !== undefined) economy.influenceCap = influenceCap
    if (infoCap !== undefined) economy.infoCap = infoCap
    if (Object.keys(economy).length > 0) output.economy = economy
  }

  if (isRecord(raw.history)) {
    const maxActionHistory = safeInteger(raw.history.maxActionHistory, 50, 2_000)
    if (maxActionHistory !== undefined) output.history = { maxActionHistory }
  }

  if (isRecord(raw.ai)) {
    const ai: NonNullable<SocialRuntimeOverride['ai']> = {}
    const outcomeAffinityBiasWeight = safeNumber(raw.ai.outcomeAffinityBiasWeight, 0, 1)
    const outcomeJitterMagnitude = safeNumber(raw.ai.outcomeJitterMagnitude, 0, 0.3)
    const repetitionPenalty = safeNumber(raw.ai.repetitionPenalty, 0, 1)
    const noveltyWeight = safeNumber(raw.ai.noveltyWeight, 0, 1)
    if (outcomeAffinityBiasWeight !== undefined) ai.outcomeAffinityBiasWeight = outcomeAffinityBiasWeight
    if (outcomeJitterMagnitude !== undefined) ai.outcomeJitterMagnitude = outcomeJitterMagnitude
    if (repetitionPenalty !== undefined) ai.repetitionPenalty = repetitionPenalty
    if (noveltyWeight !== undefined) ai.noveltyWeight = noveltyWeight
    if (isRecord(raw.ai.basicActionWeights)) {
      const weights: Record<string, number> = {}
      for (const [rawKey, rawValue] of Object.entries(raw.ai.basicActionWeights).slice(0, 160)) {
        const key = safeString(rawKey, 80)
        const weight = safeNumber(rawValue, 0, 100)
        if (key && weight !== undefined) weights[key] = weight
      }
      if (Object.keys(weights).length > 0) ai.basicActionWeights = weights
    }
    if (Object.keys(ai).length > 0) output.ai = ai
  }

  if (isRecord(raw.incoming)) {
    const incoming: NonNullable<SocialRuntimeOverride['incoming']> = {}
    if (isRecord(raw.incoming.defaultPolicies)) {
      const policies: Partial<Record<IncomingInteractionType, IncomingInteractionResponsePolicy>> = {}
      for (const [type, value] of Object.entries(raw.incoming.defaultPolicies)) {
        const policy = sanitisePolicy(value)
        if (policy && type in DEFAULT_RESPONSE_POLICIES) {
          policies[type as IncomingInteractionType] = policy
        }
      }
      if (Object.keys(policies).length > 0) incoming.defaultPolicies = policies
    }
    if (isRecord(raw.incoming.scenarioPolicies)) {
      const policies: Record<string, IncomingInteractionResponsePolicy> = {}
      for (const [rawKey, rawValue] of Object.entries(raw.incoming.scenarioPolicies).slice(0, 160)) {
        const key = safeString(rawKey, 80)
        const policy = sanitisePolicy(rawValue)
        if (key && policy) policies[key] = policy
      }
      if (Object.keys(policies).length > 0) incoming.scenarioPolicies = policies
    }
    if (Object.keys(incoming).length > 0) output.incoming = incoming
  }

  if (isRecord(raw.content)) {
    const content: NonNullable<SocialRuntimeOverride['content']> = {}
    const scenarioLines = sanitiseScenarioLines(raw.content.scenarioLines)
    const actionPresentation = sanitiseActionPresentation(raw.content.actionPresentation)
    const responseSets = sanitiseResponseSets(raw.content.responseSets)
    if (scenarioLines) content.scenarioLines = scenarioLines
    if (actionPresentation) content.actionPresentation = actionPresentation
    if (responseSets) content.responseSets = responseSets
    if (Object.keys(content).length > 0) output.content = content
  }

  const familyGroups = sanitiseStringMap(raw.familyGroups, 160, 80)
  if (familyGroups) output.familyGroups = familyGroups

  return output
}

function mergeRuntimeConfig(override: SocialRuntimeOverride | null): SocialRuntimeConfig {
  if (!override) return DEFAULT_SOCIAL_RUNTIME_CONFIG
  return {
    ...DEFAULT_SOCIAL_RUNTIME_CONFIG,
    revision: override.revision ?? DEFAULT_SOCIAL_RUNTIME_CONFIG.revision,
    economy: {
      ...DEFAULT_SOCIAL_RUNTIME_CONFIG.economy,
      ...override.economy,
      normal: {
        ...DEFAULT_SOCIAL_RUNTIME_CONFIG.economy.normal,
        ...override.economy?.normal,
        carryOver: false,
      },
      drama: {
        ...DEFAULT_SOCIAL_RUNTIME_CONFIG.economy.drama,
        ...override.economy?.drama,
        carryOver: true,
      },
    },
    history: {
      ...DEFAULT_SOCIAL_RUNTIME_CONFIG.history,
      ...override.history,
    },
    ai: {
      ...DEFAULT_SOCIAL_RUNTIME_CONFIG.ai,
      ...override.ai,
      basicActionWeights: {
        ...DEFAULT_SOCIAL_RUNTIME_CONFIG.ai.basicActionWeights,
        ...override.ai?.basicActionWeights,
      },
    },
    incoming: {
      defaultPolicies: {
        ...DEFAULT_SOCIAL_RUNTIME_CONFIG.incoming.defaultPolicies,
        ...override.incoming?.defaultPolicies,
      },
      scenarioPolicies: {
        ...DEFAULT_SOCIAL_RUNTIME_CONFIG.incoming.scenarioPolicies,
        ...override.incoming?.scenarioPolicies,
      },
    },
    content: {
      scenarioLines: {
        ...DEFAULT_SOCIAL_RUNTIME_CONFIG.content.scenarioLines,
        ...override.content?.scenarioLines,
      },
      actionPresentation: {
        ...DEFAULT_SOCIAL_RUNTIME_CONFIG.content.actionPresentation,
        ...override.content?.actionPresentation,
      },
      responseSets: {
        ...DEFAULT_SOCIAL_RUNTIME_CONFIG.content.responseSets,
        ...override.content?.responseSets,
      },
    },
    familyGroups: {
      ...DEFAULT_SOCIAL_RUNTIME_CONFIG.familyGroups,
      ...override.familyGroups,
    },
  }
}

export function setRemoteSocialRuntimeConfig(override: SocialRuntimeOverride | null): void {
  runtimeConfig = mergeRuntimeConfig(override)
}

export function getSocialRuntimeConfig(): SocialRuntimeConfig {
  return runtimeConfig
}

export function getSocialModeConfig(mode: SocialMode) {
  return runtimeConfig.economy[mode]
}

export function getSocialActionPresentation(action: {
  id: string
  title: string
  description?: string
  icon?: string
}) {
  const override = runtimeConfig.content.actionPresentation[action.id]
  return {
    title: override?.title ?? action.title,
    description: override?.description ?? action.description,
    icon: override?.icon ?? action.icon,
  }
}

export function getRemoteScenarioLines(scenarioKey: string): readonly string[] | null {
  return runtimeConfig.content.scenarioLines[scenarioKey] ?? null
}

export function getRemoteResponseSet(key: string): readonly SocialResponseChoiceOverride[] | null {
  return runtimeConfig.content.responseSets[key] ?? null
}

export function getIncomingInteractionResponsePolicy(
  interaction: Pick<IncomingInteraction, 'type' | 'payload' | 'requiresResponse'>,
): IncomingInteractionResponsePolicy {
  const explicit = interaction.payload?.responsePolicy
  if (typeof explicit === 'string' && RESPONSE_POLICIES.has(explicit as IncomingInteractionResponsePolicy)) {
    return explicit as IncomingInteractionResponsePolicy
  }
  const scenario = interaction.payload?.scenarioKey
  if (typeof scenario === 'string' && runtimeConfig.incoming.scenarioPolicies[scenario]) {
    return runtimeConfig.incoming.scenarioPolicies[scenario]
  }
  // Backward compatibility for saves created before responsePolicy existed.
  if (interaction.requiresResponse) return 'required'
  return runtimeConfig.incoming.defaultPolicies[interaction.type] ?? 'optional'
}

export function getFamilyGroupId(playerId: string): string | null {
  return runtimeConfig.familyGroups[playerId] ?? null
}

export function areSocialFamilyMembers(leftId: string, rightId: string): boolean {
  const left = getFamilyGroupId(leftId)
  return Boolean(left && left === getFamilyGroupId(rightId))
}
