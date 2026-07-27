import {
  getIncomingInteractionResponsePolicy,
  getSocialRuntimeConfig,
  type IncomingInteractionResponsePolicy,
  type SocialMode,
} from './socialRuntimeConfig'
import type { IncomingInteraction, IncomingInteractionType } from './types'

export interface IncomingInteractionFactoryInput {
  id: string
  fromId: string
  type: IncomingInteractionType
  text: string
  week: number
  phase: string
  mode: SocialMode
  expiresAtWeek?: number
  payload?: Record<string, unknown>
  responsePolicy?: IncomingInteractionResponsePolicy
}

/**
 * Upgrade an interaction authored by an older pipeline or loaded from an old
 * save. The old fields remain readable; the structured policy and ruleset
 * metadata become authoritative for new UI and resolution code.
 */
export function normalizeIncomingInteractionContract(
  interaction: IncomingInteraction,
  fallbackMode: SocialMode = 'normal'
): IncomingInteraction {
  const runtime = getSocialRuntimeConfig()
  const authoredMode = interaction.payload?.modeAtCreation
  const mode: SocialMode =
    authoredMode === 'normal' || authoredMode === 'drama'
      ? authoredMode
      : interaction.payload?.dramaMode === true
        ? 'drama'
        : fallbackMode
  const responsePolicy = getIncomingInteractionResponsePolicy(interaction)

  return {
    ...interaction,
    payload: {
      ...interaction.payload,
      modeAtCreation: mode,
      dramaMode: mode === 'drama',
      responsePolicy,
      rulesetVersion:
        typeof interaction.payload?.rulesetVersion === 'number'
          ? interaction.payload.rulesetVersion
          : runtime.schemaVersion,
      scenarioVersion:
        typeof interaction.payload?.scenarioVersion === 'string'
          ? interaction.payload.scenarioVersion
          : runtime.revision,
    },
    requiresResponse: responsePolicy === 'required',
  }
}

/**
 * Canonical constructor for both autonomy and background-social messages. It
 * keeps backward-compatible fields while recording the authored ruleset and
 * policy needed for deterministic response and expiry handling.
 */
export function createIncomingInteraction(
  input: IncomingInteractionFactoryInput
): IncomingInteraction {
  const draft: IncomingInteraction = {
    id: input.id,
    fromId: input.fromId,
    type: input.type,
    text: input.text,
    payload: {
      ...input.payload,
      phase: input.phase,
      ...(input.responsePolicy ? { responsePolicy: input.responsePolicy } : {}),
    },
    createdAt: Date.now(),
    createdWeek: input.week,
    expiresAtWeek: input.expiresAtWeek ?? input.week + 1,
    read: false,
    requiresResponse: false,
    resolved: false,
  }

  return normalizeIncomingInteractionContract(draft, input.mode)
}
