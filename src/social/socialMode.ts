import type { IncomingInteraction } from './types'
import type { SocialMode } from './socialRuntimeConfig'

interface SocialModeState {
  game?: {
    dramaSocialMode?: boolean
  }
  settings?: {
    gameUX?: {
      dramaMode?: boolean
      dramaModeAdminOverride?: boolean
    }
  }
  vip?: {
    isActive?: boolean
    entitlements?: {
      dramaMode?: boolean
    }
  }
}

/**
 * Resolve the running season's Social ruleset. A stored game snapshot is
 * authoritative once present; Settings are consulted only for legacy saves and
 * before a new season has captured its mode. Production still requires a valid
 * entitlement. Minimal test stores that omit the VIP slice preserve their
 * historical settings-only behavior.
 */
export function getEffectiveSocialMode(state: SocialModeState): SocialMode {
  const adminOverride = state.settings?.gameUX?.dramaModeAdminOverride === true
  const selected = adminOverride
    ? state.settings?.gameUX?.dramaMode === true
    : state.game?.dramaSocialMode !== undefined
      ? state.game.dramaSocialMode
      : state.settings?.gameUX?.dramaMode === true
  if (!selected) return 'normal'

  if (adminOverride || state.vip === undefined) return 'drama'
  const entitled = state.vip.isActive === true || state.vip.entitlements?.dramaMode === true
  return entitled ? 'drama' : 'normal'
}

export function isDramaModeEffective(state: SocialModeState): boolean {
  return getEffectiveSocialMode(state) === 'drama'
}

/** Pending conversations remain on the ruleset under which they were authored. */
export function getInteractionSocialMode(
  interaction: Pick<IncomingInteraction, 'payload'>,
  state: SocialModeState
): SocialMode {
  const authoredMode = interaction.payload?.modeAtCreation
  if (authoredMode === 'normal' || authoredMode === 'drama') return authoredMode
  if (interaction.payload?.dramaMode === true) return 'drama'
  return getEffectiveSocialMode(state)
}
