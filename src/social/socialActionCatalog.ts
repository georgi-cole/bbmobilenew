import type { SocialActionDefinition } from './socialActions'
import type { SocialMode } from './socialRuntimeConfig'

export function isHumanSocialActionVisible(
  action: SocialActionDefinition,
  mode: SocialMode
): boolean {
  if (action.aiOnly) return false
  return !action.dramaOnly || mode === 'drama'
}

export function isAISocialActionVisible(_actionId: string, _mode: SocialMode): boolean {
  return true
}
