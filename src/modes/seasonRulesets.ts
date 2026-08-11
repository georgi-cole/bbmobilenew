import type { SeasonExpansionMode } from './modeTypes'
import type { SavedRunProfile, SavedSeasonSnapshot } from '../store/saveStatePersistence'

export type SeasonRuleset = 'classic' | SeasonExpansionMode

export interface SeasonRulesetAccess {
  cupidArrow: boolean
  voxPopuli: boolean
}

export interface ActiveFiniteSeason {
  ruleset: SeasonRuleset
  snapshot: SavedSeasonSnapshot
}

export const FINITE_SEASON_RULESETS: readonly SeasonRuleset[] = [
  'classic',
  'cupidArrow',
  'voxPopuli',
]

function snapshotRunId(snapshot: SavedSeasonSnapshot | undefined): string | null {
  return snapshot?.game.runId ?? snapshot?.game.gameId ?? null
}

function finiteCandidates(profile: SavedRunProfile | null | undefined): ActiveFiniteSeason[] {
  if (!profile) return []

  return FINITE_SEASON_RULESETS.flatMap((ruleset) => {
    const snapshot = profile.runs[ruleset]
    return snapshot ? [{ ruleset, snapshot }] : []
  })
}

/**
 * Resolve exactly one finite season from the legacy multi-slot save profile.
 *
 * We intentionally do not delete any additional legacy slots here. Existing
 * installs can therefore recover old progress, while all new UI flows expose
 * only this canonical season and prevent a second finite season from starting.
 */
export function getActiveFiniteSeason(
  profile: SavedRunProfile | null | undefined
): ActiveFiniteSeason | null {
  const candidates = finiteCandidates(profile)
  if (candidates.length === 0 || !profile) return null

  if (profile.activeRunId) {
    const active = candidates.find(
      ({ snapshot }) => snapshotRunId(snapshot) === profile.activeRunId
    )
    if (active) return active
  }

  if (profile.lastPlayedRunId) {
    const lastPlayed = candidates.find(
      ({ snapshot }) => snapshotRunId(snapshot) === profile.lastPlayedRunId
    )
    if (lastPlayed) return lastPlayed
  }

  return [...candidates].sort(
    (a, b) => Date.parse(b.snapshot.savedAt) - Date.parse(a.snapshot.savedAt)
  )[0] ?? null
}

/**
 * Home/Profile resume should consider only the canonical finite season plus
 * Surveyeval. Hidden grandfathered finite slots must never reappear through a
 * generic "Continue Last" action.
 */
export function getPlayableLastRun(
  profile: SavedRunProfile | null | undefined
): SavedSeasonSnapshot | null {
  if (!profile) return null

  const activeSeason = getActiveFiniteSeason(profile)?.snapshot ?? null
  const survival = profile.runs.survival ?? null
  const candidates = [activeSeason, survival].filter(Boolean) as SavedSeasonSnapshot[]
  if (candidates.length === 0) return null

  if (profile.lastPlayedRunId) {
    const lastPlayed = candidates.find(
      (snapshot) => snapshotRunId(snapshot) === profile.lastPlayedRunId
    )
    if (lastPlayed) return lastPlayed
  }

  return [...candidates].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0] ?? null
}

export function getEligibleSeasonRulesets(access: SeasonRulesetAccess): SeasonRuleset[] {
  return [
    'classic',
    ...(access.cupidArrow ? (['cupidArrow'] as const) : []),
    ...(access.voxPopuli ? (['voxPopuli'] as const) : []),
  ]
}

export function canOfferSurpriseMe(eligibleRulesets: readonly SeasonRuleset[]): boolean {
  return eligibleRulesets.length >= 2
}

export function pickSurpriseRuleset(
  eligibleRulesets: readonly SeasonRuleset[],
  random: () => number = Math.random
): SeasonRuleset | null {
  if (!canOfferSurpriseMe(eligibleRulesets)) return null
  const index = Math.min(
    eligibleRulesets.length - 1,
    Math.max(0, Math.floor(random() * eligibleRulesets.length))
  )
  return eligibleRulesets[index] ?? null
}

export function rulesetLabel(ruleset: SeasonRuleset): string {
  if (ruleset === 'cupidArrow') return "Cupid's Arrow"
  if (ruleset === 'voxPopuli') return 'Vox Populi'
  return 'Classic'
}

export function rulesetExpansion(ruleset: SeasonRuleset): SeasonExpansionMode | null {
  return ruleset === 'classic' ? null : ruleset
}
