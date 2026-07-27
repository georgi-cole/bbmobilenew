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
 * Canonical constructor for both autonomy and background-social messages. It
 * keeps backward-compatible fields while recording the authored ruleset and
 * policy needed for deterministic response and expiry handling.
 */
export function createIncomingInteraction(
  input: IncomingInteractionFactoryInput,
): IncomingInteraction {
  const runtime = getSocialRuntimeConfig()
  const draft: IncomingInteraction = {
    id: input.id,
    fromId: input.fromId,
    type: input.type,
    text: input.text,
    payload: {
      ...input.payload,
      phase: input.phase,
      modeAtCreation: input.mode,
      dramaMode: input.mode === 'drama',
      rulesetVersion: runtime.schemaVersion,
      scenarioVersion: runtime.revision,
      ...(input.responsePolicy ? { responsePolicy: input.responsePolicy } : {}),
    },
    createdAt: Date.now(),
    createdWeek: input.week,
    expiresAtWeek: input.expiresAtWeek ?? input.week + 1,
    read: false,
    requiresResponse: false,
    resolved: false,
  }

  const responsePolicy =
    input.responsePolicy ?? getIncomingInteractionResponsePolicy(draft)
  draft.payload = { ...draft.payload, responsePolicy }
  // Keep the legacy boolean meaningful for old selectors and saved games.
  draft.requiresResponse = responsePolicy === 'required'
  return draft
}
