import { publicOpinionConfig } from './publicOpinionConfig'
import type {
  AudienceBreakdown,
  AudienceMetric,
  AudienceMetricChange,
  PlayerPublicProfile,
} from './types'

const METRICS: AudienceMetric[] = ['charisma', 'gameplay', 'integrity']
const MAX_RECEIPTS = 12

export const audienceMetricLabels: Record<AudienceMetric, string> = {
  charisma: 'Charisma',
  gameplay: 'Game',
  integrity: 'Integrity',
}

export const audienceMetricDescriptions: Record<AudienceMetric, string> = {
  charisma: 'Presence, warmth and how naturally people connect with them.',
  gameplay: 'Competition results, smart decisions and command of the game.',
  integrity: 'Loyalty, promises kept and whether their word still carries weight.',
}

export type AudienceArchetype =
  | 'Fan Favourite'
  | 'Mastermind'
  | 'Loyal Heart'
  | 'Chaos Agent'
  | 'Cold Operator'
  | 'Underdog'
  | 'Wildcard'

function clamp(value: number): number {
  return Math.min(publicOpinionConfig.MAX_APPROVAL, Math.max(publicOpinionConfig.MIN_APPROVAL, value))
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function centeredBreakdown(approval: number, values?: Partial<Record<AudienceMetric, number>>): AudienceBreakdown {
  const requested = METRICS.map((metric) => values?.[metric] ?? approval)
  const requestedAverage = requested.reduce((sum, value) => sum + value, 0) / METRICS.length
  const adjustment = approval - requestedAverage
  const [charisma, gameplay, integrity] = requested.map((value) => round(clamp(value + adjustment)))
  return { charisma, gameplay, integrity, recentChanges: [] }
}

/**
 * Gives each contestant a small, identity-led opening texture without changing
 * the overall starting approval. The user starts neutral; their choices write
 * the story from day one.
 */
export function createAudienceBreakdown(
  approval: number,
  identity?: { archetype?: string; audienceFocus?: number; competitionDrive?: number },
): AudienceBreakdown {
  const archetype = identity?.archetype ?? ''
  const focus = identity?.audienceFocus ?? 0.5
  const drive = identity?.competitionDrive ?? 0.5
  let charisma = approval
  let gameplay = approval
  let integrity = approval

  if (['audience_darling', 'social_butterfly', 'public_pleaser', 'audience_chameleon'].includes(archetype)) {
    charisma += 6 + focus * 3
    gameplay -= 2
    integrity -= 2
  } else if (['strategic_operator', 'puppet_master', 'clutch_competitor', 'aggressive_competitor'].includes(archetype)) {
    gameplay += 6 + drive * 3
    charisma -= 2
    integrity -= 2
  } else if (['loyal_anchor', 'romantic_loyalist', 'jury_artisan'].includes(archetype)) {
    integrity += 7
    charisma -= 2.5
    gameplay -= 2.5
  } else if (['chaos_agent', 'double_agent', 'antihero'].includes(archetype)) {
    charisma += 3
    gameplay += 3
    integrity -= 6
  }

  return centeredBreakdown(approval, { charisma, gameplay, integrity })
}

export function getAudienceBreakdown(profile: PlayerPublicProfile): AudienceBreakdown {
  return profile.audienceBreakdown ?? createAudienceBreakdown(profile.approval)
}

export function getAudienceApproval(breakdown: AudienceBreakdown): number {
  return Math.round(
    (breakdown.charisma + breakdown.gameplay + breakdown.integrity) / METRICS.length,
  )
}

function getWeights(reason: string, eventType?: string): Record<AudienceMetric, number> {
  const signal = `${reason} ${eventType ?? ''}`.toLowerCase()

  if (/(hoh|loh|pov|pos|competition|immunity|performance|last_place|quit_early)/.test(signal)) {
    return { charisma: 0, gameplay: 1, integrity: 0 }
  }
  if (/(promise|loyal|betray|break_alliance|double_agent|vote_to_keep)/.test(signal)) {
    return { charisma: 0.15, gameplay: 0.1, integrity: 0.75 }
  }
  if (/(rumor|confront|conflict|drama|negative_social|poor_social|apolog|repair)/.test(signal)) {
    return { charisma: 0.65, gameplay: 0.05, integrity: 0.3 }
  }
  if (/(strategy|influenced|bold_move|nomination_backlash|nominated_target|voted_to_evict)/.test(signal)) {
    return { charisma: 0.15, gameplay: 0.65, integrity: 0.2 }
  }
  if (/(social|warmth|interaction|formed_alliance|public_save|pov_save|saved_from_block)/.test(signal)) {
    return { charisma: 0.7, gameplay: 0.1, integrity: 0.2 }
  }
  return { charisma: 1 / 3, gameplay: 1 / 3, integrity: 1 / 3 }
}

function primaryMetric(weights: Record<AudienceMetric, number>): AudienceMetric {
  return METRICS.reduce((primary, metric) => weights[metric] > weights[primary] ? metric : primary, 'charisma')
}

export function applyAudienceApprovalDelta(
  profile: PlayerPublicProfile,
  input: { delta: number; reason: string; week: number; eventType?: string; timestamp?: number },
): { breakdown: AudienceBreakdown; approval: number; appliedDelta: number } {
  const current = getAudienceBreakdown(profile)
  const weights = getWeights(input.reason, input.eventType)
  const next: AudienceBreakdown = {
    charisma: round(clamp(current.charisma + input.delta * METRICS.length * weights.charisma)),
    gameplay: round(clamp(current.gameplay + input.delta * METRICS.length * weights.gameplay)),
    integrity: round(clamp(current.integrity + input.delta * METRICS.length * weights.integrity)),
    recentChanges: [...current.recentChanges],
  }
  const approval = getAudienceApproval(next)
  const receipt: AudienceMetricChange = {
    id: `${input.week}-${input.timestamp ?? Date.now()}-${next.recentChanges.length}`,
    metric: primaryMetric(weights),
    delta: approval - profile.approval,
    reason: input.reason,
    week: input.week,
    timestamp: input.timestamp ?? Date.now(),
  }
  if (receipt.delta !== 0) {
    next.recentChanges.unshift(receipt)
    next.recentChanges = next.recentChanges.slice(0, MAX_RECEIPTS)
  }
  return { breakdown: next, approval, appliedDelta: approval - profile.approval }
}

export function getAudienceArchetype(profile: PlayerPublicProfile): AudienceArchetype {
  const { charisma, gameplay, integrity } = getAudienceBreakdown(profile)
  if (profile.approval < 40 && charisma >= 46) return 'Underdog'
  if (charisma >= 69 && integrity >= 64) return 'Fan Favourite'
  if (gameplay >= 69 && integrity >= 53) return 'Mastermind'
  if (gameplay >= 66 && integrity <= 43) return 'Cold Operator'
  if (charisma >= 65 && integrity <= 45) return 'Chaos Agent'
  if (integrity >= 69) return 'Loyal Heart'
  return 'Wildcard'
}

export function getAudienceRead(profile: PlayerPublicProfile): string {
  const breakdown = getAudienceBreakdown(profile)
  const strongest = METRICS.reduce((best, metric) => breakdown[metric] > breakdown[best] ? metric : best, 'charisma')
  const weakest = METRICS.reduce((lowest, metric) => breakdown[metric] < breakdown[lowest] ? metric : lowest, 'charisma')
  return `${audienceMetricLabels[strongest]} is carrying the story; ${audienceMetricLabels[weakest].toLowerCase()} is the audience's open question.`
}
