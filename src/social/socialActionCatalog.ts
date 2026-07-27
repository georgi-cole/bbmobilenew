import type { SocialActionDefinition } from './socialActions'
import type { SocialMode } from './socialRuntimeConfig'

/**
 * Normal Mode deliberately exposes a compact, understandable social toolkit.
 * Drama Mode may expose the complete non-AI catalogue when its contextual
 * requirements are met.
 */
export const NORMAL_HUMAN_SOCIAL_ACTION_IDS = new Set<string>([
  'compliment',
  'reassure',
  'whisper',
  'observe',
  'group_chat',
  'proposeAlliance',
  'protect',
  'confront',
  'ask_loh_target',
  'ask_safety_plan',
  'ask_why_nominated',
  'ask_use_safety',
  'pitch_target',
])

/** Compact legal policy surface used by the Normal Mode AI. */
export const NORMAL_AI_SOCIAL_ACTION_IDS = new Set<string>([
  'idle',
  'compliment',
  'reassure',
  'whisper',
  'protect',
  'confront',
  'ally',
  'proposeAlliance',
  'ask_use_safety',
  'nominate',
  'group_chat',
])

export function isHumanSocialActionVisible(
  action: SocialActionDefinition,
  mode: SocialMode
): boolean {
  if (action.aiOnly) return false
  if (mode === 'drama') return true
  return NORMAL_HUMAN_SOCIAL_ACTION_IDS.has(action.id)
}

export function isAISocialActionVisible(actionId: string, mode: SocialMode): boolean {
  return mode === 'drama' || NORMAL_AI_SOCIAL_ACTION_IDS.has(actionId)
}
