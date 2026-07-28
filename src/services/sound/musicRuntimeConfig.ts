import type { RootState } from '../../store/store'
import type { RemoteMusic } from '../../remoteConfig/remoteConfigTypes'
import {
  createEffectiveMusicConfig,
  type MusicConfigDocument,
  type MusicConfigOverrides,
} from './musicConfig'
import type { MusicTrackAssetOverride } from './musicCatalog'

export function buildEffectiveMusicConfig(
  remoteOverrides?: MusicConfigOverrides | null,
  localOverrides?: MusicConfigOverrides | null
): MusicConfigDocument {
  return createEffectiveMusicConfig(remoteOverrides, localOverrides)
}

export function selectEffectiveMusicConfig(state: RootState): MusicConfigDocument {
  return buildEffectiveMusicConfig(
    state.remoteConfig?.config?.season?.music?.assignments,
    state.settings?.audio?.musicConfigOverrides
  )
}

/**
 * Merge precedence is bundled assets < legacy remote main < remote semantic
 * assets < local Advanced Settings assets. The returned array is unique by
 * semantic track and stable for JSON serialization.
 */
export function mergeMusicTrackAssets(
  remoteMusic?: RemoteMusic | null,
  localAssets: readonly MusicTrackAssetOverride[] = []
): MusicTrackAssetOverride[] {
  const merged = new Map<MusicTrackAssetOverride['track'], MusicTrackAssetOverride>()

  if (remoteMusic?.mainTrackUrl) {
    merged.set('competition', {
      track: 'competition',
      src: remoteMusic.mainTrackUrl,
      volume: 0.5,
      loop: true,
    })
  }
  for (const asset of remoteMusic?.tracks ?? []) merged.set(asset.track, asset)
  for (const asset of localAssets) merged.set(asset.track, asset)

  return Array.from(merged.values())
}

export function selectEffectiveMusicTrackAssets(state: RootState): MusicTrackAssetOverride[] {
  return mergeMusicTrackAssets(
    state.remoteConfig?.config?.season?.music,
    state.settings?.audio?.musicTrackAssets ?? []
  )
}
