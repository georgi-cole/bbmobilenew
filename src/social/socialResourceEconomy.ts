import type { SocialActionDefinition, SocialActionKind } from './socialActions'

export type SocialResourceOutcome = 'success' | 'failure' | 'backfire'

export interface SocialResourceEffect {
  influence: number
  info: number
}

const ZERO: SocialResourceEffect = { influence: 0, info: 0 }

const BY_KIND: Record<SocialActionKind, Record<SocialResourceOutcome, SocialResourceEffect>> = {
  rapport: {
    success: { influence: 3, info: 0 },
    failure: { influence: -1, info: 0 },
    backfire: { influence: -3, info: 0 },
  },
  intel_gain: {
    success: { influence: 1, info: 100 },
    failure: { influence: -1, info: 25 },
    backfire: { influence: -3, info: 0 },
  },
  intel_spend: {
    success: { influence: 6, info: 0 },
    failure: { influence: -3, info: 0 },
    backfire: { influence: -6, info: 0 },
  },
  political_spend: {
    success: { influence: 4, info: 0 },
    failure: { influence: -3, info: 0 },
    backfire: { influence: -6, info: 0 },
  },
  aggressive: {
    success: { influence: 4, info: 0 },
    failure: { influence: -4, info: 0 },
    backfire: { influence: -8, info: 0 },
  },
}

const OVERRIDES: Record<string, Partial<Record<SocialResourceOutcome, SocialResourceEffect>>> = {
  proposeAlliance: {
    success: { influence: 8, info: 0 },
    failure: { influence: -4, info: 0 },
    backfire: { influence: -8, info: 0 },
  },
  ask_loh_target: {
    success: { influence: 0, info: 100 },
    failure: { influence: -1, info: 20 },
    backfire: { influence: -3, info: 0 },
  },
  betray: {
    success: { influence: 6, info: 0 },
    failure: { influence: -6, info: 0 },
    backfire: { influence: -10, info: 0 },
  },
  snoop_around: {
    success: { influence: 0, info: 200 },
    failure: { influence: -2, info: 40 },
    backfire: { influence: -5, info: 0 },
  },
  eavesdrop: {
    success: { influence: 0, info: 200 },
    failure: { influence: -2, info: 40 },
    backfire: { influence: -5, info: 0 },
  },
  expose_secret: {
    success: { influence: 8, info: 0 },
    failure: { influence: -8, info: 0 },
    backfire: { influence: -12, info: 0 },
  },
}

export function getSocialResourceEffect(
  action: SocialActionDefinition,
  outcome: SocialResourceOutcome,
  targetCount = 1
): SocialResourceEffect {
  if (action.id === 'idle') return ZERO
  if (action.id === 'group_chat') {
    if (outcome === 'success') return { influence: Math.min(10, targetCount + 1), info: 0 }
    return outcome === 'failure' ? { influence: -2, info: 0 } : { influence: -5, info: 0 }
  }
  return OVERRIDES[action.id]?.[outcome] ?? BY_KIND[action.kind ?? 'rapport'][outcome]
}

export function nextHumanSocialEnergy(current: number, allowance = 10, cap = 30): number {
  return Math.min(cap, Math.max(0, current) + allowance)
}
