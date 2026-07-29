import {
  getIncomingInteractionResponsePolicy,
  getSocialRuntimeConfig,
  type IncomingInteractionResponsePolicy,
  type SocialMode,
} from './socialRuntimeConfig'
import type { IncomingInteraction, IncomingInteractionType } from './types'
import { deriveIncomingDeadline, getIncomingDeadline } from './incomingInteractionDeadline'

export interface IncomingInteractionFactoryInput {
  id: string
  fromId: string
  type: IncomingInteractionType
  text: string
  week: number
  phase: string
  mode: SocialMode
  expiresAtWeek?: number
  createdAt?: number
  deadlinePhase?: string
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
  const isLegacyClock = interaction.createdDay === undefined && interaction.deadline === undefined
  const deadline = isLegacyClock
    ? getIncomingDeadline(interaction)
    : (interaction.deadline ??
      deriveIncomingDeadline({
        day: interaction.createdDay ?? interaction.createdWeek,
        phase:
          interaction.createdPhase ??
          (typeof interaction.payload?.phase === 'string' ? interaction.payload.phase : 'social_1'),
        type: interaction.type,
        payload: interaction.payload,
        required: responsePolicy === 'required',
      }) ??
      getIncomingDeadline(interaction))

  return {
    ...interaction,
    createdDay: interaction.createdDay ?? interaction.createdWeek,
    createdPhase:
      interaction.createdPhase ??
      (typeof interaction.payload?.phase === 'string' ? interaction.payload.phase : 'social_1'),
    deadline,
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
  const stableTimestamp =
    input.week * 1_000_000 +
    (Math.abs(
      [...input.id].reduce(
        (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0,
        0
      )
    ) %
      1_000_000)
  const draft: IncomingInteraction = {
    id: input.id,
    fromId: input.fromId,
    type: input.type,
    text: input.text,
    payload: {
      ...input.payload,
      phase: input.phase,
      ...(input.deadlinePhase ? { deadlinePhase: input.deadlinePhase } : {}),
      ...(input.responsePolicy ? { responsePolicy: input.responsePolicy } : {}),
    },
    createdAt: input.createdAt ?? stableTimestamp,
    createdWeek: input.week,
    expiresAtWeek: input.expiresAtWeek ?? input.week + 1,
    createdDay: input.week,
    createdPhase: input.phase,
    read: false,
    requiresResponse: false,
    resolved: false,
  }

  const normalized = normalizeIncomingInteractionContract(draft, input.mode)
  // Passive house notes close at the next week boundary and never linger long
  // enough to crowd out conversations. Explicit expiries remain authoritative.
  if (
    input.expiresAtWeek === undefined &&
    getIncomingInteractionResponsePolicy(normalized) === 'readOnly'
  ) {
    normalized.expiresAtWeek = input.week
  }
  return normalized
}
