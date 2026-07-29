import type { GameMode } from '../../modes/modeTypes'
import type { RealityAudienceMode, RealityContext, RealityGameMode } from './types'

export interface RealityModeAdapter {
  gameMode: RealityGameMode
  audienceMode: RealityAudienceMode
  socialDensityMultiplier: number
  ceremonyPressureMultiplier: number
  entrantTrustPenalty: number
  publicConsequencesEnabled: boolean
  replacementEntrantsEnabled: boolean
}

const CLASSIC_ADAPTER: RealityModeAdapter = {
  gameMode: 'CLASSIC',
  audienceMode: 'PUBLIC',
  socialDensityMultiplier: 1,
  ceremonyPressureMultiplier: 1,
  entrantTrustPenalty: 0,
  publicConsequencesEnabled: true,
  replacementEntrantsEnabled: false,
}

const SURVIVAL_ADAPTER: RealityModeAdapter = {
  gameMode: 'SURVIVAL',
  audienceMode: 'OFF',
  socialDensityMultiplier: 1.15,
  ceremonyPressureMultiplier: 1.2,
  entrantTrustPenalty: 18,
  publicConsequencesEnabled: false,
  replacementEntrantsEnabled: true,
}

export function getRealityModeAdapter(
  mode: GameMode | 'survivor' | undefined,
  publicModeEnabled = false
): RealityModeAdapter {
  if (mode === 'survival' || mode === 'survivor') return SURVIVAL_ADAPTER
  return {
    ...CLASSIC_ADAPTER,
    audienceMode: publicModeEnabled ? 'PUBLIC' : 'OFF',
    publicConsequencesEnabled: publicModeEnabled,
  }
}

export function applyRealityModeToContext(
  context: RealityContext,
  mode: GameMode | 'survivor' | undefined,
  publicModeEnabled = false
): RealityContext {
  const adapter = getRealityModeAdapter(mode, publicModeEnabled)
  return {
    ...context,
    gameMode: adapter.gameMode,
    audienceMode: adapter.audienceMode,
  }
}
