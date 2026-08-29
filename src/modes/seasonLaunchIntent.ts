import type { SeasonRuleset } from './seasonRulesets'

let activeSeasonLaunchIntent: SeasonRuleset | null = null

/**
 * Exposes the user's selected season ruleset only while a new season is being
 * synchronously constructed. This lets reset-time schedulers distinguish a
 * Classic launch from explicit expansion launches without persisting transient
 * menu state into saves.
 */
export function withSeasonLaunchIntent<T>(ruleset: SeasonRuleset, launch: () => T): T {
  const previousIntent = activeSeasonLaunchIntent
  activeSeasonLaunchIntent = ruleset
  try {
    return launch()
  } finally {
    activeSeasonLaunchIntent = previousIntent
  }
}

export function getSeasonLaunchIntent(): SeasonRuleset | null {
  return activeSeasonLaunchIntent
}
