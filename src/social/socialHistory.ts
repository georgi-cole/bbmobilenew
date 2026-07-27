import type { SocialActionLogEntry, SocialState } from './types'
import { getSocialRuntimeConfig } from './socialRuntimeConfig'

export const SOCIAL_STATE_VERSION = 2

export type SocialStateWithHistory = SocialState & {
  socialStateVersion?: number
  actionHistory?: SocialActionLogEntry[]
}

export function getPersistentSocialHistory(
  state: Pick<SocialState, 'sessionLogs'> & { actionHistory?: SocialActionLogEntry[] },
): SocialActionLogEntry[] {
  return state.actionHistory ?? state.sessionLogs ?? []
}

export function appendPersistentSocialHistory(
  state: SocialStateWithHistory,
  entry: SocialActionLogEntry,
): void {
  const limit = getSocialRuntimeConfig().history.maxActionHistory
  const history = state.actionHistory ?? []
  state.actionHistory = [...history, entry].slice(-limit)
  state.socialStateVersion = SOCIAL_STATE_VERSION
}
