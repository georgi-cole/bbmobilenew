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
  const settingEnabled = state.settings?.gameUX?.dramaMode === true
  if (adminOverride) return settingEnabled ? 'drama' : 'normal'

  if (state.vip === undefined) {
    const selected =
      state.game?.dramaSocialMode !== undefined ? state.game.dramaSocialMode : settingEnabled
    return selected ? 'drama' : 'normal'
  }

  const entitled = state.vip.isActive === true || state.vip.entitlements?.dramaMode === true
  if (!entitled) return 'normal'

  // The current toggle is authoritative for presentation and future interactions.
  // A purchase enables the toggle immediately; turning it off must also take effect immediately.
  if (state.settings?.gameUX?.dramaMode !== undefined) {
    return settingEnabled ? 'drama' : 'normal'
  }
  return state.game?.dramaSocialMode === true ? 'drama' : 'normal'
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
