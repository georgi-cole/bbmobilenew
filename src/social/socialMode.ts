import type { IncomingInteraction } from './types'
import type { SocialMode } from './socialRuntimeConfig'

interface SocialModeState {
  game?: {
    dramaSocialMode?: boolean
  }
  settings?: {
    gameUX?: {
      dramaMode?: boolean
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
 * Resolve the ruleset used by the running season. Production state must have a
 * valid entitlement. Minimal test stores that omit the VIP slice retain their
 * historical settings-only behavior for backward compatibility.
 */
export function getEffectiveSocialMode(state: SocialModeState): SocialMode {
  const selected = state.game?.dramaSocialMode ?? state.settings?.gameUX?.dramaMode === true
  if (!selected) return 'normal'

  if (state.vip === undefined) return 'drama'
  const entitled = state.vip.isActive === true || state.vip.entitlements?.dramaMode === true
  return entitled ? 'drama' : 'normal'
}

export function isDramaModeEffective(state: SocialModeState): boolean {
  return getEffectiveSocialMode(state) === 'drama'
}

/** Pending conversations remain on the ruleset under which they were authored. */
export function getInteractionSocialMode(
  interaction: Pick<IncomingInteraction, 'payload'>,
  state: SocialModeState,
): SocialMode {
  const authoredMode = interaction.payload?.modeAtCreation
  if (authoredMode === 'normal' || authoredMode === 'drama') return authoredMode
  if (interaction.payload?.dramaMode === true) return 'drama'
  return getEffectiveSocialMode(state)
}
