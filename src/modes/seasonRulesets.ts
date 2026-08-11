import type { SeasonRuleset } from './modeTypes'

export interface SeasonRulesetEntitlements {
  cupidArrow: boolean
  voxPopuli: boolean
}

const LABELS: Record<SeasonRuleset, string> = {
  classic: 'Classic',
  cupidArrow: "Cupid's Arrow",
  voxPopuli: 'Vox Populi',
}

export function getSeasonRulesetLabel(ruleset: SeasonRuleset): string {
  return LABELS[ruleset]
}

export function getEligibleSeasonRulesets(
  entitlements: SeasonRulesetEntitlements
): SeasonRuleset[] {
  const rulesets: SeasonRuleset[] = ['classic']
  if (entitlements.cupidArrow) rulesets.push('cupidArrow')
  if (entitlements.voxPopuli) rulesets.push('voxPopuli')
  return rulesets
}

export function canUseSurpriseMe(entitlements: SeasonRulesetEntitlements): boolean {
  return getEligibleSeasonRulesets(entitlements).length >= 2
}

export function pickSurpriseRuleset(
  entitlements: SeasonRulesetEntitlements,
  random: () => number = Math.random
): SeasonRuleset {
  const eligible = getEligibleSeasonRulesets(entitlements)
  const raw = random()
  const normalized = Number.isFinite(raw) ? Math.min(0.999999999999, Math.max(0, raw)) : 0
  return eligible[Math.floor(normalized * eligible.length)] ?? 'classic'
}
